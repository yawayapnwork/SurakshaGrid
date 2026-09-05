import logging

from fastapi import APIRouter, File, HTTPException, UploadFile, status
from starlette.concurrency import run_in_threadpool

from app.schemas.photo_verification import PhotoVerificationResult
from app.services.model_registry import ModelUnavailableError
from app.services.vlm_verification_service import get_vlm_model, verify_flood_photo

logger = logging.getLogger(__name__)

router = APIRouter(tags=["photo-verification"])

MAX_IMAGE_SIZE_BYTES = 8 * 1024 * 1024  # 8 MB limit
ALLOWED_IMAGE_CONTENT_TYPES = {"image/jpeg", "image/jpg", "image/png", "image/webp"}


@router.post(
    "/verify-photo",
    response_model=PhotoVerificationResult,
    status_code=status.HTTP_200_OK,
    summary="Verify a citizen-submitted flood photo using a local vision-language model",
)
async def verify_photo(
    image: UploadFile = File(description="Photo evidence to verify"),
) -> PhotoVerificationResult:
    """Runs a local open-source VLM (e.g. Moondream2) against the uploaded photo to judge

    whether it shows active structural flooding, trapped citizens, or heavy debris.

    Deliberately does NOT pull `get_vlm_model` in via `Depends()`: FastAPI resolves every
    dependency before the route body runs, which would load the (multi-GB) model even for
    a request that's about to fail the checks below. Loading it explicitly, after
    validation, means a malformed upload never triggers a model load at all.
    """
    content_type = (image.content_type or "").lower().strip()
    if content_type and content_type not in ALLOWED_IMAGE_CONTENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Unsupported image format '{image.content_type}'. Allowed types: image/jpeg, image/png, image/webp.",
        )

    image_bytes = await image.read()
    if not image_bytes:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Uploaded file is empty.")
    if len(image_bytes) > MAX_IMAGE_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Uploaded image exceeds maximum allowed size of 8MB ({len(image_bytes)} bytes).",
        )

    try:
        # get_vlm_model() is a plain, blocking, singleton-accessor function — it must
        # run off the event loop the same as inference does, since the first call
        # loads the model from disk (or evicts another model first).
        vlm = await run_in_threadpool(get_vlm_model)
        verdict = await verify_flood_photo(vlm, image_bytes)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    except ModelUnavailableError as exc:
        logger.error(f"VLM verification unavailable: {exc}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Photo verification model is temporarily unavailable. Please try again later.",
        ) from exc
    except Exception as exc:  # noqa: BLE001 - never leak internals to the client
        logger.exception(f"Unexpected error during photo verification: {exc}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred while verifying the photo.",
        ) from exc

    return PhotoVerificationResult(
        verified=verdict.verified,
        confidence=verdict.confidence,
        summary=verdict.summary,
    )
