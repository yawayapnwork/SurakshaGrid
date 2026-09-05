import io
import logging

from fastapi import APIRouter, HTTPException, status
from fastapi.responses import StreamingResponse

from app.schemas.speech_synthesis import SpeechSynthesisRequest
from app.services.kokoro_tts_service import SpeechSynthesisUnavailableError, synthesize_speech_wav

logger = logging.getLogger(__name__)

router = APIRouter(tags=["speech-synthesis"])


@router.post(
    "/synthesize-speech",
    status_code=status.HTTP_200_OK,
    summary="Synthesize an emergency broadcast/warning message into spoken audio",
    response_class=StreamingResponse,
)
async def synthesize_speech(payload: SpeechSynthesisRequest) -> StreamingResponse:
    """Runs a local Kokoro-82M TTS pipeline over the given text and streams back a WAV clip

    suitable for emergency broadcast playback or in-app voice feedback.
    """
    try:
        wav_bytes = await synthesize_speech_wav(payload.text, payload.voice, payload.speed)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    except SpeechSynthesisUnavailableError as exc:
        logger.error(f"Kokoro TTS unavailable: {exc}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Speech synthesis model is temporarily unavailable. Please try again later.",
        ) from exc
    except Exception as exc:  # noqa: BLE001 - never leak internals to the client
        logger.exception(f"Unexpected error during speech synthesis: {exc}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred while synthesizing speech.",
        ) from exc

    return StreamingResponse(
        io.BytesIO(wav_bytes),
        media_type="audio/wav",
        headers={"Content-Disposition": 'inline; filename="broadcast.wav"'},
    )
