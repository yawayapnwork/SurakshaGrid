import logging
import subprocess
from dataclasses import dataclass

import numpy as np
from starlette.concurrency import run_in_threadpool

from app.core.config import get_settings
from app.services.model_registry import LazyModel, ModelUnavailableError, release_memory

logger = logging.getLogger(__name__)

_TARGET_SAMPLE_RATE = 16000


def _decode_audio_to_pcm(audio_bytes: bytes) -> np.ndarray:
    """Decodes arbitrary browser/mobile audio (webm/opus, mp3, wav, ogg, m4a) into 16kHz

    mono float32 PCM via ffmpeg. This mirrors openai-whisper's own audio loading approach,
    so the model always receives audio in the exact format it was trained on regardless
    of which codec `MediaRecorder` (or a phone) produced.
    """
    command = [
        "ffmpeg",
        "-nostdin",
        "-threads", "0",
        "-i", "pipe:0",
        "-f", "s16le",
        "-ac", "1",
        "-acodec", "pcm_s16le",
        "-ar", str(_TARGET_SAMPLE_RATE),
        "pipe:1",
    ]
    try:
        process = subprocess.run(command, input=audio_bytes, capture_output=True, timeout=60)
    except FileNotFoundError as exc:
        raise ModelUnavailableError(
            "ffmpeg is not installed or not on PATH; audio transcription is unavailable"
        ) from exc
    except subprocess.TimeoutExpired as exc:
        raise ValueError("Audio decoding timed out; the file may be corrupt or too long") from exc

    if process.returncode != 0 or not process.stdout:
        stderr_tail = process.stderr.decode("utf-8", errors="ignore")[-500:]
        raise ValueError(f"Could not decode audio: {stderr_tail or 'unknown ffmpeg error'}")

    return np.frombuffer(process.stdout, dtype=np.int16).astype(np.float32) / 32768.0


@dataclass
class WhisperHandle:
    pipeline: object


def _load_whisper() -> WhisperHandle:
    """Blocking loader — only ever called once per LazyModel generation, from inside

    a threadpool (via `get_whisper_model` as a plain FastAPI dependency).
    """
    settings = get_settings()
    model_id = settings.WHISPER_MODEL_ID

    try:
        import torch
        from transformers import pipeline
    except ImportError as exc:
        raise ModelUnavailableError(
            "torch/transformers are not installed; audio transcription is unavailable"
        ) from exc

    device = 0 if torch.cuda.is_available() else -1
    # fp16 halves memory on GPU; CPU inference needs fp32 for stability.
    dtype = torch.float16 if torch.cuda.is_available() else torch.float32

    try:
        asr_pipeline = pipeline(
            task="automatic-speech-recognition",
            model=model_id,
            torch_dtype=dtype,
            device=device,
        )
    except (OSError, ValueError, RuntimeError) as exc:
        raise ModelUnavailableError(f"Could not load speech recognition model '{model_id}': {exc}") from exc

    logger.info(f"Loaded Whisper model '{model_id}' on device={'cuda' if device == 0 else 'cpu'}")
    return WhisperHandle(pipeline=asr_pipeline)


_whisper_model: LazyModel[WhisperHandle] = LazyModel(name="whisper", loader=_load_whisper)


def get_whisper_model() -> WhisperHandle:
    """Plain (sync) FastAPI dependency — `Depends(get_whisper_model)` runs this in

    Starlette's threadpool automatically, so the blocking first-load never blocks
    the event loop.
    """
    return _whisper_model.get()


def _transcribe(handle: WhisperHandle, pcm: np.ndarray) -> dict:
    try:
        # task="translate" makes Whisper transcribe non-English speech (e.g. Hindi,
        # Tamil, Bengali) directly into English text in a single forward pass, using
        # Whisper's own auto language detection to pick the source language.
        return handle.pipeline(
            {"array": pcm, "sampling_rate": _TARGET_SAMPLE_RATE},
            generate_kwargs={"task": "translate"},
            return_timestamps=False,
        )
    except RuntimeError as exc:
        if "out of memory" in str(exc).lower():
            release_memory()
            raise ModelUnavailableError("The speech recognition model ran out of memory during inference") from exc
        raise


class TranscriptionResult:
    __slots__ = ("text", "duration_seconds")

    def __init__(self, text: str, duration_seconds: float) -> None:
        self.text = text
        self.duration_seconds = duration_seconds


async def transcribe_and_translate_audio(handle: WhisperHandle, audio_bytes: bytes) -> TranscriptionResult:
    """Decodes an uploaded audio clip and returns its English-translated transcript.

    Blocking ffmpeg decoding and model inference both run in a thread pool so the
    async event loop is never blocked.
    """
    if not audio_bytes:
        raise ValueError("Empty audio payload")

    pcm = await run_in_threadpool(_decode_audio_to_pcm, audio_bytes)
    if pcm.size == 0:
        raise ValueError("Decoded audio contained no samples")

    duration_seconds = round(len(pcm) / _TARGET_SAMPLE_RATE, 2)
    result = await run_in_threadpool(_transcribe, handle, pcm)
    text = (result.get("text") or "").strip()

    return TranscriptionResult(text=text, duration_seconds=duration_seconds)
