import logging
from dataclasses import dataclass

from starlette.concurrency import run_in_threadpool

from app.core.config import get_settings
from app.services.model_registry import LazyModel, ModelUnavailableError, release_memory

logger = logging.getLogger(__name__)

# Maps short, dispatcher-facing language codes to their FLORES-200 tags (the codes
# NLLB-200 was trained on). A caller may also pass a FLORES-200 tag directly (e.g.
# "hin_Deva") and it is used as-is, so this list is a convenience, not an allowlist.
SUPPORTED_LANGUAGES: dict[str, str] = {
    "en": "eng_Latn",
    "hi": "hin_Deva",
    "bn": "ben_Beng",
    "ta": "tam_Taml",
    "te": "tel_Telu",
    "mr": "mar_Deva",
    "gu": "guj_Gujr",
    "pa": "pan_Guru",
    "ur": "urd_Arab",
    "kn": "kan_Knda",
    "ml": "mal_Mlym",
    "or": "ory_Orya",
    "as": "asm_Beng",
}

_MAX_INPUT_CHARS = 2000


def resolve_flores_code(language_code: str) -> str:
    """Resolves a short code (e.g. "hi") or a raw FLORES-200 tag (e.g. "hin_Deva")

    to the FLORES-200 tag NLLB-200 expects. Raises ValueError for anything else.
    """
    normalized = (language_code or "").strip()
    if normalized in SUPPORTED_LANGUAGES:
        return SUPPORTED_LANGUAGES[normalized]

    # A raw FLORES-200 tag looks like "xxx_Yyyy" (3-letter language + 4-letter script).
    parts = normalized.split("_")
    if len(parts) == 2 and len(parts[0]) == 3 and len(parts[1]) == 4 and parts[1][0].isupper():
        return normalized

    raise ValueError(
        f"Unsupported language code '{language_code}'. Use one of {sorted(SUPPORTED_LANGUAGES)} "
        "or a raw FLORES-200 tag (e.g. 'hin_Deva')."
    )


@dataclass
class NLLBHandle:
    model: object
    tokenizer: object
    device: str


def _load_nllb() -> NLLBHandle:
    """Blocking loader — only ever called once per LazyModel generation, from inside

    a threadpool (via `get_nllb_model` as a plain FastAPI dependency).
    """
    settings = get_settings()
    model_id = settings.NLLB_MODEL_ID

    try:
        import torch
        from transformers import AutoModelForSeq2SeqLM, AutoTokenizer
    except ImportError as exc:
        raise ModelUnavailableError(
            "torch/transformers are not installed; report translation is unavailable"
        ) from exc

    device = "cuda" if torch.cuda.is_available() else "cpu"
    # fp16 halves memory on GPU; CPU inference needs fp32 for numerical stability.
    dtype = torch.float16 if device == "cuda" else torch.float32

    try:
        tokenizer = AutoTokenizer.from_pretrained(model_id)
        model = AutoModelForSeq2SeqLM.from_pretrained(model_id, torch_dtype=dtype, low_cpu_mem_usage=True)
        model = model.to(device)
        model.eval()
    except (OSError, ValueError, RuntimeError) as exc:
        raise ModelUnavailableError(f"Could not load translation model '{model_id}': {exc}") from exc

    logger.info(f"Loaded NLLB model '{model_id}' on device '{device}' (dtype={dtype})")
    return NLLBHandle(model=model, tokenizer=tokenizer, device=device)


_nllb_model: LazyModel[NLLBHandle] = LazyModel(name="nllb", loader=_load_nllb)


def get_nllb_model() -> NLLBHandle:
    """Plain (sync) FastAPI dependency — `Depends(get_nllb_model)` runs this in

    Starlette's threadpool automatically, so the blocking first-load never blocks
    the event loop.
    """
    return _nllb_model.get()


def _target_token_id(handle: NLLBHandle, target_flores_code: str) -> int:
    tokenizer = handle.tokenizer

    # Newer tokenizer versions dropped `lang_code_to_id`; fall back to vocab lookup.
    lang_code_to_id = getattr(tokenizer, "lang_code_to_id", None)
    if lang_code_to_id and target_flores_code in lang_code_to_id:
        return lang_code_to_id[target_flores_code]

    token_id = tokenizer.convert_tokens_to_ids(target_flores_code)
    if token_id is None or token_id == tokenizer.unk_token_id:
        raise ValueError(f"Target language '{target_flores_code}' is not known to this NLLB tokenizer")
    return token_id


def _translate(handle: NLLBHandle, text: str, source_flores_code: str, target_flores_code: str) -> str:
    import torch

    try:
        handle.tokenizer.src_lang = source_flores_code
        inputs = handle.tokenizer(text, return_tensors="pt", truncation=True, max_length=512)
        inputs = {key: value.to(handle.device) for key, value in inputs.items()}
        forced_bos_token_id = _target_token_id(handle, target_flores_code)

        with torch.inference_mode():
            generated_tokens = handle.model.generate(
                **inputs,
                forced_bos_token_id=forced_bos_token_id,
                max_new_tokens=512,
                num_beams=1,  # greedy decoding keeps latency low for dispatcher-facing use
            )

        return handle.tokenizer.batch_decode(generated_tokens, skip_special_tokens=True)[0].strip()
    except RuntimeError as exc:
        if "out of memory" in str(exc).lower():
            release_memory()
            raise ModelUnavailableError("The translation model ran out of memory during inference") from exc
        raise


async def translate_report_text(handle: NLLBHandle, text: str, source_lang: str, target_lang: str) -> str:
    """Translates citizen report text between Indian regional languages and English

    using NLLB-200. Blocking tokenization/generation runs in a thread pool so the
    async event loop is never blocked.
    """
    stripped_text = (text or "").strip()
    if not stripped_text:
        raise ValueError("Text to translate must not be empty")
    if len(stripped_text) > _MAX_INPUT_CHARS:
        raise ValueError(f"Text exceeds maximum length of {_MAX_INPUT_CHARS} characters")

    source_flores_code = resolve_flores_code(source_lang)
    target_flores_code = resolve_flores_code(target_lang)

    return await run_in_threadpool(_translate, handle, stripped_text, source_flores_code, target_flores_code)
