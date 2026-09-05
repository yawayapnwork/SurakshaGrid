import gc
import logging
import threading

from starlette.concurrency import run_in_threadpool

from app.core.config import get_settings

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


class TranslationUnavailableError(RuntimeError):
    """Raised when NLLB-200 cannot be loaded or run (e.g. missing deps or low memory)."""


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


class _NLLBTranslator:
    """Thread-safe lazy singleton wrapping a local NLLB-200 model + tokenizer.

    Loaded once and reused across requests so repeated calls avoid the multi-second
    model load cost and don't fragment GPU/CPU memory with duplicate weight copies.
    """

    def __init__(self) -> None:
        self._model = None
        self._tokenizer = None
        self._device = "cpu"
        self._lock = threading.Lock()

    def _load(self) -> None:
        if self._model is not None:
            return

        with self._lock:
            if self._model is not None:  # re-check now that we hold the lock
                return

            settings = get_settings()
            model_id = settings.NLLB_MODEL_ID

            try:
                import torch
                from transformers import AutoModelForSeq2SeqLM, AutoTokenizer
            except ImportError as exc:
                raise TranslationUnavailableError(
                    "torch/transformers are not installed; report translation is unavailable"
                ) from exc

            device = "cuda" if torch.cuda.is_available() else "cpu"
            # fp16 halves memory on GPU; CPU inference needs fp32 for numerical stability.
            dtype = torch.float16 if device == "cuda" else torch.float32

            try:
                tokenizer = AutoTokenizer.from_pretrained(model_id)
                model = AutoModelForSeq2SeqLM.from_pretrained(
                    model_id,
                    torch_dtype=dtype,
                    low_cpu_mem_usage=True,
                )
                model = model.to(device)
                model.eval()
            except (OSError, ValueError, RuntimeError) as exc:
                logger.error(f"Failed to load NLLB model '{model_id}': {exc}")
                raise TranslationUnavailableError(
                    f"Could not load translation model '{model_id}': {exc}"
                ) from exc

            self._model = model
            self._tokenizer = tokenizer
            self._device = device
            logger.info(f"Loaded NLLB model '{model_id}' on device '{device}' (dtype={dtype})")

    def _target_token_id(self, target_flores_code: str) -> int:
        tokenizer = self._tokenizer
        assert tokenizer is not None

        # Newer tokenizer versions dropped `lang_code_to_id`; fall back to vocab lookup.
        lang_code_to_id = getattr(tokenizer, "lang_code_to_id", None)
        if lang_code_to_id and target_flores_code in lang_code_to_id:
            return lang_code_to_id[target_flores_code]

        token_id = tokenizer.convert_tokens_to_ids(target_flores_code)
        if token_id is None or token_id == tokenizer.unk_token_id:
            raise ValueError(f"Target language '{target_flores_code}' is not known to this NLLB tokenizer")
        return token_id

    def translate(self, text: str, source_flores_code: str, target_flores_code: str) -> str:
        self._load()
        assert self._model is not None and self._tokenizer is not None

        import torch

        try:
            self._tokenizer.src_lang = source_flores_code
            inputs = self._tokenizer(text, return_tensors="pt", truncation=True, max_length=512)
            inputs = {key: value.to(self._device) for key, value in inputs.items()}
            forced_bos_token_id = self._target_token_id(target_flores_code)

            with torch.inference_mode():
                generated_tokens = self._model.generate(
                    **inputs,
                    forced_bos_token_id=forced_bos_token_id,
                    max_new_tokens=512,
                    num_beams=1,  # greedy decoding keeps latency low for dispatcher-facing use
                )

            return self._tokenizer.batch_decode(generated_tokens, skip_special_tokens=True)[0].strip()
        except RuntimeError as exc:
            if "out of memory" in str(exc).lower():
                if torch.cuda.is_available():
                    torch.cuda.empty_cache()
                gc.collect()
                raise TranslationUnavailableError(
                    "The translation model ran out of memory during inference"
                ) from exc
            raise


_translator = _NLLBTranslator()


async def translate_report_text(text: str, source_lang: str, target_lang: str) -> str:
    """Translates citizen report text between Indian regional languages and English

    using NLLB-200. Blocking tokenization/generation runs in a thread pool so the
    async event loop is never blocked by inference.
    """
    stripped_text = (text or "").strip()
    if not stripped_text:
        raise ValueError("Text to translate must not be empty")
    if len(stripped_text) > _MAX_INPUT_CHARS:
        raise ValueError(f"Text exceeds maximum length of {_MAX_INPUT_CHARS} characters")

    source_flores_code = resolve_flores_code(source_lang)
    target_flores_code = resolve_flores_code(target_lang)

    return await run_in_threadpool(_translator.translate, stripped_text, source_flores_code, target_flores_code)
