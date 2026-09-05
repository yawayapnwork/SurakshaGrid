import logging
import uuid
try:
    import cloudinary
    import cloudinary.uploader
except ImportError:
    cloudinary = None  # type: ignore[assignment]

from starlette.concurrency import run_in_threadpool

from app.core.config import get_settings

logger = logging.getLogger(__name__)


def _sync_cloudinary_upload(image_bytes: bytes, public_id: str) -> str | None:
    """Synchronous worker function to upload image bytes to Cloudinary."""
    if not cloudinary:
        return None
    try:
        response = cloudinary.uploader.upload(
            image_bytes,
            public_id=public_id,
            folder="sos_reports",
            resource_type="image",
        )
        return response.get("secure_url") or response.get("url")
    except Exception as exc:
        logger.warning(f"Cloudinary upload failed: {exc}")
        return None


async def upload_image_to_cloudinary(image_bytes: bytes, filename: str = "sos_image.jpg") -> str:
    """Uploads an image to Cloudinary asynchronously via thread pool.

    Falls back to a formatted demo Cloudinary URL if credentials are not set or upload fails.
    """
    settings = get_settings()
    unique_id = uuid.uuid4().hex

    if (
        settings.CLOUDINARY_CLOUD_NAME
        and settings.CLOUDINARY_API_KEY
        and settings.CLOUDINARY_API_SECRET
    ):
        try:
            cloudinary.config(
                cloud_name=settings.CLOUDINARY_CLOUD_NAME,
                api_key=settings.CLOUDINARY_API_KEY,
                api_secret=settings.CLOUDINARY_API_SECRET,
                secure=True,
            )
            secure_url = await run_in_threadpool(_sync_cloudinary_upload, image_bytes, unique_id)
            if secure_url:
                return secure_url
        except Exception as exc:
            logger.warning(f"Error configuring or running Cloudinary upload: {exc}")

    # Fallback URL when Cloudinary is unconfigured or upload returns None
    demo_cloud_name = settings.CLOUDINARY_CLOUD_NAME or "demo"
    return f"https://res.cloudinary.com/{demo_cloud_name}/image/upload/v1/sos_reports/{unique_id}.jpg"
