"""Shared lazy-loading and memory-management infrastructure for local ML models.

Render's smaller instance sizes can't hold Moondream2 (vision-language), Whisper
(speech), and NLLB-200 (translation) resident in memory at the same time. Loading
them all eagerly at startup — or even lazily but never releasing them — will OOM
the process once all three endpoints have been hit at least once.

This module gives every model:
  1. Lazy initialization: nothing is imported or loaded into memory until the first
     request that actually needs it calls `.get()`.
  2. A shared eviction policy (`ModelMemoryManager`): when `MAX_RESIDENT_MODELS` is
     set, loading a new model first evicts whichever *other* loaded model has sat
     idle longest, freeing its memory before the new one is initialized.
  3. Explicit memory release on eviction/unload: `gc.collect()` always, plus
     `torch.cuda.empty_cache()` when a GPU is present.
"""

import gc
import logging
import threading
import time
from typing import Callable, Generic, TypeVar

from app.core.config import get_settings

logger = logging.getLogger(__name__)

T = TypeVar("T")


class ModelUnavailableError(RuntimeError):
    """Raised when a lazily-loaded model cannot be loaded or run (missing deps,

    OOM during load/inference, or the checkpoint failing to download/parse).
    """


def release_memory() -> None:
    """Best-effort memory reclamation. Safe to call even when torch isn't installed,

    and even when nothing was actually using the GPU.
    """
    gc.collect()
    try:
        import torch

        if torch.cuda.is_available():
            torch.cuda.empty_cache()
    except ImportError:
        pass


class LazyModel(Generic[T]):
    """Thread-safe, lazily-initialized holder for one heavy ML model.

    `loader` is called at most once per "generation" — after an eviction, the next
    `.get()` call transparently reloads it. Every instance registers itself with the
    shared `ModelMemoryManager` so the manager can evict it to make room for others.
    """

    def __init__(self, name: str, loader: Callable[[], T]) -> None:
        self.name = name
        self._loader = loader
        self._instance: T | None = None
        self._lock = threading.Lock()
        self.last_used_at: float = 0.0
        ModelMemoryManager.instance().register(self)

    @property
    def is_loaded(self) -> bool:
        return self._instance is not None

    def get(self) -> T:
        """Returns the loaded model, loading it now if this is the first call (or

        if it was previously evicted). Intended to be called from a plain `def`
        FastAPI dependency or from inside a threadpool-run function — never
        directly from an `async def` route body, since loading is blocking.
        """
        if self._instance is not None:
            self.last_used_at = time.monotonic()
            return self._instance

        with self._lock:
            if self._instance is not None:  # re-check now that we hold the lock
                self.last_used_at = time.monotonic()
                return self._instance

            # Free up room BEFORE loading, so peak memory is (old model freed) then
            # (new model loaded) rather than briefly holding both at once.
            ModelMemoryManager.instance().make_room_for(self)

            logger.info(f"Loading model '{self.name}' (first use since startup/eviction)...")
            try:
                self._instance = self._loader()
            except ModelUnavailableError:
                raise
            except Exception as exc:  # noqa: BLE001 — normalize every load failure to one type
                raise ModelUnavailableError(f"Could not load model '{self.name}': {exc}") from exc

            self.last_used_at = time.monotonic()
            logger.info(f"Model '{self.name}' loaded and ready.")
            return self._instance

    def unload(self) -> None:
        """Drops this model's reference and releases GPU/CPU memory back to the OS.

        Any request already mid-flight with its own reference to the returned
        instance keeps it alive until that request finishes — this only stops
        *new* requests from reusing it, it doesn't yank memory out from under work
        in progress.
        """
        with self._lock:
            if self._instance is None:
                return
            self._instance = None

        release_memory()
        logger.info(f"Model '{self.name}' unloaded, memory released.")


class ModelMemoryManager:
    """Process-wide policy for how many heavy models may be resident at once.

    `MAX_RESIDENT_MODELS` (env var, via Settings):
      - `0` (default): eviction disabled — every model that's ever used stays
        cached for the life of the process. Fine on a host with enough RAM for
        all of them.
      - `1`: strict "only the most recently used model stays loaded" — the safest
        setting for small Render instances running Moondream2 + Whisper + NLLB-200,
        at the cost of a reload (a few seconds, from local disk cache — not a
        re-download) whenever a request switches to a different model.
      - `2`: room for two models resident at once, if your instance has enough
        headroom for that but not all three.
    """

    _singleton: "ModelMemoryManager | None" = None
    _singleton_lock = threading.Lock()

    def __init__(self) -> None:
        self._models: list[LazyModel] = []
        self._lock = threading.Lock()

    @classmethod
    def instance(cls) -> "ModelMemoryManager":
        if cls._singleton is None:
            with cls._singleton_lock:
                if cls._singleton is None:
                    cls._singleton = cls()
        return cls._singleton

    def register(self, model: LazyModel) -> None:
        with self._lock:
            self._models.append(model)

    def make_room_for(self, requested: LazyModel) -> None:
        max_resident = get_settings().MAX_RESIDENT_MODELS
        if max_resident <= 0:
            return  # eviction disabled

        with self._lock:
            loaded = [m for m in self._models if m.is_loaded and m is not requested]
            while len(loaded) >= max_resident:
                victim = min(loaded, key=lambda m: m.last_used_at)
                logger.info(
                    f"MAX_RESIDENT_MODELS={max_resident} reached; evicting least-recently-used "
                    f"model '{victim.name}' to make room for '{requested.name}'"
                )
                victim.unload()
                loaded.remove(victim)
