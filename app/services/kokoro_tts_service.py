import gc
import io
import logging
import threading

import numpy as np
from starlette.concurrency import run_in_threadpool

from app.core.config import get_settings

logger = logging.getLogger(__name__)

_SAMPLE_RATE_HZ = 24000  # fixed output rate of the Kokoro-82M vocoder


class SpeechSynthesisUnavailableError(RuntimeError):
    """Raised when Kokoro-82M cannot be loaded or run (e.g. missing deps or low memory)."""


class _KokoroSynthesizer:
    """Thread-safe lazy singleton wrapping a local Kokoro-82M TTS pipeline.

    Kokoro-82M (hexgrad/Kokoro-82M on Hugging Face) is a StyleTTS2-based model shipped
    through the `kokoro` package rather than a generic `transformers.AutoModel` — the
    package pulls the weights and voice packs from the HF Hub the first time it runs
    and wraps grapheme-to-phoneme conversion (via `misaki`) plus vocoding into one call.
    Loaded once and reused across requests to avoid repaying model-load cost.
    """

    def __init__(self) -> None:
        self._pipeline = None
        self._device = "cpu"
        self._lock = threading.Lock()

    def _load(self):
        if self._pipeline is not None:
            return self._pipeline

        with self._lock:
            if self._pipeline is not None:  # re-check now that we hold the lock
                return self._pipeline

            settings = get_settings()

            try:
                import torch
                from kokoro import KPipeline
            except ImportError as exc:
                raise SpeechSynthesisUnavailableError(
                    "the 'kokoro' package (and torch) is not installed; speech synthesis is unavailable"
                ) from exc

            device = "cuda" if torch.cuda.is_available() else "cpu"

            try:
                pipeline = KPipeline(lang_code=settings.KOKORO_LANG_CODE, device=device)
            except Exception as exc:  # noqa: BLE001 - covers missing espeak-ng, HF download failures, etc.
                logger.error(f"Failed to load Kokoro-82M pipeline: {exc}")
                raise SpeechSynthesisUnavailableError(f"Could not load Kokoro-82M TTS pipeline: {exc}") from exc

            self._pipeline = pipeline
            self._device = device
            logger.info(f"Loaded Kokoro-82M TTS pipeline on device '{device}'")
            return self._pipeline

    def synthesize(self, text: str, voice: str, speed: float) -> np.ndarray:
        pipeline = self._load()

        try:
            # KPipeline yields one (graphemes, phonemes, audio) tuple per internally
            # chunked sentence/clause; concatenate so long broadcast text plays as one clip.
            segments = [audio for _, _, audio in pipeline(text, voice=voice, speed=speed)]
        except RuntimeError as exc:
            if "out of memory" in str(exc).lower():
                import torch

                if torch.cuda.is_available():
                    torch.cuda.empty_cache()
                gc.collect()
                raise SpeechSynthesisUnavailableError(
                    "The speech synthesis model ran out of memory during inference"
                ) from exc
            raise
        except Exception as exc:  # noqa: BLE001 - unknown voice preset, bad phonemization input, etc.
            raise ValueError(f"Speech synthesis failed for the given text/voice: {exc}") from exc

        if not segments:
            raise ValueError("Synthesis produced no audio for the given text")

        return np.concatenate([np.asarray(segment) for segment in segments])


_synthesizer = _KokoroSynthesizer()


def _encode_wav(pcm: np.ndarray) -> bytes:
    try:
        import soundfile as sf
    except ImportError as exc:
        raise SpeechSynthesisUnavailableError("the 'soundfile' package is not installed") from exc

    buffer = io.BytesIO()
    sf.write(buffer, pcm, _SAMPLE_RATE_HZ, format="WAV", subtype="PCM_16")
    return buffer.getvalue()


async def synthesize_speech_wav(text: str, voice: str | None = None, speed: float = 1.0) -> bytes:
    """Synthesizes `text` into a WAV audio clip using Kokoro-82M and returns the raw

    WAV bytes. Blocking model inference and audio encoding both run in a thread pool
    so the async event loop is never blocked.
    """
    stripped_text = (text or "").strip()
    if not stripped_text:
        raise ValueError("Text to synthesize must not be empty")

    settings = get_settings()
    resolved_voice = voice or settings.KOKORO_VOICE

    pcm = await run_in_threadpool(_synthesizer.synthesize, stripped_text, resolved_voice, speed)
    return await run_in_threadpool(_encode_wav, pcm)
