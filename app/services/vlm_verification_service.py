import gc
import json
import logging
import re
import threading
from dataclasses import dataclass
from io import BytesIO

from PIL import Image, UnidentifiedImageError
from starlette.concurrency import run_in_threadpool

from app.core.config import get_settings

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


class ModelUnavailableError(RuntimeError):
    """Raised when the local VLM cannot be loaded or run (e.g. missing deps or low memory)."""


@dataclass
class VerificationVerdict:
    verified: bool
    confidence: float
    summary: str


class _VisionLanguageVerifier:
    """Thread-safe lazy singleton around a locally loaded vision-language model.

    Loading happens once, on first use, and is reused for every request so that
    repeated calls do not repay the (multi-second) model load cost or fragment
    GPU/CPU memory with duplicate copies of the weights.
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
                logger.error(f"Failed to load VLM '{model_id}' (revision={revision}): {exc}")
                raise ModelUnavailableError(
                    f"Could not load vision-language model '{model_id}': {exc}"
                ) from exc

            self._model = model
            self._tokenizer = tokenizer
            self._device = device
            logger.info(f"Loaded VLM '{model_id}' on device '{device}' (dtype={dtype})")

    def _generate(self, image: Image.Image) -> str:
        self._load()
        assert self._model is not None and self._tokenizer is not None

        import torch

        try:
            with torch.inference_mode():
                if hasattr(self._model, "query"):
                    # Newer moondream2 / similar checkpoints expose a single-call API.
                    return self._model.query(image, _PROMPT)["answer"]
                # Older moondream2 revisions split encoding and question-answering.
                encoded_image = self._model.encode_image(image)
                return self._model.answer_question(encoded_image, _PROMPT, self._tokenizer)
        except RuntimeError as exc:
            if "out of memory" in str(exc).lower():
                if torch.cuda.is_available():
                    torch.cuda.empty_cache()
                gc.collect()
                raise ModelUnavailableError(
                    "The vision-language model ran out of memory during inference"
                ) from exc
            raise

    def verify(self, image: Image.Image) -> str:
        return self._generate(image)


_verifier = _VisionLanguageVerifier()


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


async def verify_flood_photo(image_bytes: bytes) -> VerificationVerdict:
    """Runs the local vision-language model against an uploaded photo and returns

    a structured hazard verification verdict. Blocking model work runs in a thread
    pool so the async event loop is never blocked by inference.
    """
    image = await run_in_threadpool(_load_image, image_bytes)
    raw_output = await run_in_threadpool(_verifier.verify, image)
    return _parse_model_output(raw_output)
