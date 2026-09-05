import logging

from fastapi import APIRouter, File, HTTPException, UploadFile, status
from starlette.concurrency import run_in_threadpool

from app.schemas.audio_transcription import AudioTranscriptionResult
from app.services.model_registry import ModelUnavailableError
from app.services.whisper_transcription_service import get_whisper_model, transcribe_and_translate_audio

logger = logging.getLogger(__name__)

router = APIRouter(tags=["audio-transcription"])

MAX_AUDIO_SIZE_BYTES = 20 * 1024 * 1024  # 20 MB limit — a few minutes of compressed voice audio
ALLOWED_AUDIO_CONTENT_TYPES = {
    "audio/wav",
    "audio/x-wav",
    "audio/wave",
    "audio/mpeg",
    "audio/mp3",
    "audio/webm",
    "audio/ogg",
    "audio/mp4",
    "audio/m4a",
    "audio/x-m4a",
}


@router.post(
    "/transcribe-audio",
    response_model=AudioTranscriptionResult,
    status_code=status.HTTP_200_OK,
    summary="Transcribe and translate a citizen's voice SOS recording into English text",
)
async def transcribe_audio(
    audio: UploadFile = File(description="Voice recording to transcribe (WAV, MP3, WebM, OGG, M4A)"),
) -> AudioTranscriptionResult:
    """Runs a local open-source Whisper model against the uploaded recording. Whisper's

    built-in translate task auto-detects the spoken language (e.g. Hindi, Tamil, Bengali)
    and produces an English transcript directly, without a separate translation step.

    `get_whisper_model` is called explicitly (not via `Depends()`) so a malformed upload
    fails validation below before any model load is attempted.
    """
    # UploadFile.content_type may include codec parameters, e.g. "audio/webm;codecs=opus"
    content_type = (audio.content_type or "").split(";")[0].strip().lower()
    if content_type and content_type not in ALLOWED_AUDIO_CONTENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Unsupported audio format '{audio.content_type}'. Allowed types: "
            "audio/wav, audio/mpeg, audio/webm, audio/ogg, audio/mp4.",
        )

    audio_bytes = await audio.read()
    if not audio_bytes:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Uploaded file is empty.")
    if len(audio_bytes) > MAX_AUDIO_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Uploaded audio exceeds maximum allowed size of 20MB ({len(audio_bytes)} bytes).",
        )

    try:
        whisper = await run_in_threadpool(get_whisper_model)
        result = await transcribe_and_translate_audio(whisper, audio_bytes)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    except ModelUnavailableError as exc:
        logger.error(f"Whisper transcription unavailable: {exc}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Audio transcription model is temporarily unavailable. Please try again later.",
        ) from exc
    except Exception as exc:  # noqa: BLE001 - never leak internals to the client
        logger.exception(f"Unexpected error during audio transcription: {exc}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred while transcribing the audio.",
        ) from exc

    return AudioTranscriptionResult(
        text=result.text,
        detected_language=None,
        duration_seconds=result.duration_seconds,
    )
