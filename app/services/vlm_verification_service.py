import json
import logging
import re
from dataclasses import dataclass
from io import BytesIO

from PIL import Image, UnidentifiedImageError
from starlette.concurrency import run_in_threadpool

from app.core.config import get_settings
from app.services.model_registry import LazyModel, ModelUnavailableError, release_memory

logger = logging.getLogger(__name__)

# Downscaling large uploads before inference keeps peak memory bounded on small hosts.
_MAX_IMAGE_DIMENSION = 768

_PROMPT = (
    "You are a flood-response triage assistant analyzing a photo submitted by a citizen. "
    "Determine whether the image shows clear evidence of ANY of: active structural flooding "
    "(water inside or around buildings, submerged roads or vehicles), trapped or stranded people, "
    "or heavy storm debris blocking access. "
    "Respond with ONLY a compact JSON object and no other text, in this exact shape: "
    '{"hazard_detected": true|false, "confidence": <number 0.0-1.0>, "summary": "<one short sentence>"}. '
    "If the image is unrelated to flooding or the scene is unclear, set hazard_detected to false "
    "and use a low confidence."
)

_JSON_OBJECT_RE = re.compile(r"\{.*\}", re.DOTALL)


@dataclass
class VerificationVerdict:
    verified: bool
    confidence: float
    summary: str


@dataclass
class VLMHandle:
    """Everything a request needs to run one VLM inference call."""

    model: object
    tokenizer: object
    device: str


def _load_vlm() -> VLMHandle:
    """Blocking loader — only ever called once per LazyModel generation, from inside

    a threadpool (via `get_vlm_model` as a plain FastAPI dependency).
    """
    settings = get_settings()
    model_id = settings.VLM_MODEL_ID
    revision = settings.VLM_MODEL_REVISION

    try:
        import torch
        from transformers import AutoModelForCausalLM, AutoTokenizer
    except ImportError as exc:
        raise ModelUnavailableError(
            "torch/transformers are not installed; photo verification is unavailable"
        ) from exc

    device = "cuda" if torch.cuda.is_available() else "cpu"
    # fp16 halves memory on GPU; CPU inference needs fp32 for numerical stability.
    dtype = torch.float16 if device == "cuda" else torch.float32

    try:
        model = AutoModelForCausalLM.from_pretrained(
            model_id,
            revision=revision,
            trust_remote_code=True,
            torch_dtype=dtype,
            low_cpu_mem_usage=True,
        )
        model = model.to(device)
        model.eval()
        tokenizer = AutoTokenizer.from_pretrained(model_id, revision=revision)
    except (OSError, ValueError, RuntimeError) as exc:
        raise ModelUnavailableError(f"Could not load vision-language model '{model_id}': {exc}") from exc

    logger.info(f"Loaded VLM '{model_id}' on device '{device}' (dtype={dtype})")
    return VLMHandle(model=model, tokenizer=tokenizer, device=device)


_vlm_model: LazyModel[VLMHandle] = LazyModel(name="vlm", loader=_load_vlm)


def get_vlm_model() -> VLMHandle:
    """Plain (sync) FastAPI dependency — `Depends(get_vlm_model)` runs this in

    Starlette's threadpool automatically, so the blocking first-load never blocks
    the event loop. Loads once, then returns the cached instance on every
    subsequent call until/unless it's evicted by `ModelMemoryManager`.
    """
    return _vlm_model.get()


def _generate(handle: VLMHandle, image: Image.Image) -> str:
    import torch

    try:
        with torch.inference_mode():
            if hasattr(handle.model, "query"):
                # Newer moondream2 / similar checkpoints expose a single-call API.
                return handle.model.query(image, _PROMPT)["answer"]
            # Older moondream2 revisions split encoding and question-answering.
            encoded_image = handle.model.encode_image(image)
            return handle.model.answer_question(encoded_image, _PROMPT, handle.tokenizer)
    except RuntimeError as exc:
        if "out of memory" in str(exc).lower():
            release_memory()
            raise ModelUnavailableError("The vision-language model ran out of memory during inference") from exc
        raise


def _parse_model_output(raw_text: str) -> VerificationVerdict:
    """Extracts the structured verdict from the model's free-text response.

    Small local VLMs occasionally wrap valid JSON in prose or truncate it, so this
    falls back to conservative keyword matching rather than failing the request.
    """
    match = _JSON_OBJECT_RE.search(raw_text or "")
    if match:
        try:
            payload = json.loads(match.group(0))
            confidence = min(max(float(payload.get("confidence", 0.5)), 0.0), 1.0)
            summary = str(payload.get("summary", "")).strip() or "No summary provided by model."
            return VerificationVerdict(
                verified=bool(payload.get("hazard_detected", False)),
                confidence=confidence,
                summary=summary,
            )
        except (ValueError, TypeError, json.JSONDecodeError):
            logger.warning(f"VLM returned malformed JSON, falling back to keyword parsing: {raw_text!r}")

    lowered = (raw_text or "").lower()
    hazard_keywords = ("flood", "trapped", "debris", "submerged", "stranded")
    verified = any(keyword in lowered for keyword in hazard_keywords)
    summary = raw_text.strip()[:280] if raw_text else "Model returned no usable output."
    return VerificationVerdict(verified=verified, confidence=0.4 if verified else 0.1, summary=summary)


def _load_image(image_bytes: bytes) -> Image.Image:
    if not image_bytes:
        raise ValueError("Empty image payload")

    try:
        image = Image.open(BytesIO(image_bytes))
        image.load()
    except (UnidentifiedImageError, OSError) as exc:
        raise ValueError(f"Could not decode image: {exc}") from exc

    image = image.convert("RGB")
    if max(image.size) > _MAX_IMAGE_DIMENSION:
        image.thumbnail((_MAX_IMAGE_DIMENSION, _MAX_IMAGE_DIMENSION), Image.LANCZOS)

    return image


async def verify_flood_photo(handle: VLMHandle, image_bytes: bytes) -> VerificationVerdict:
    """Runs the local vision-language model against an uploaded photo and returns

    a structured hazard verification verdict. Blocking model work runs in a thread
    pool so the async event loop is never blocked by inference.
    """
    image = await run_in_threadpool(_load_image, image_bytes)
    raw_output = await run_in_threadpool(_generate, handle, image)
    return _parse_model_output(raw_output)
