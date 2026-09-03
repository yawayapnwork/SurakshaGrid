import pytest
import cv2
import numpy as np
from starlette.concurrency import run_in_threadpool

from app.services.cv_service import estimate_water_confidence


def create_synthetic_image_bytes(b: int, g: int, r: int, width: int = 100, height: int = 100) -> bytes:
    """Helper to generate encoded JPEG image bytes of a uniform color."""
    img = np.full((height, width, 3), (b, g, r), dtype=np.uint8)
    success, encoded = cv2.imencode(".jpg", img)
    assert success
    return encoded.tobytes()


def test_estimate_water_confidence_corrupt_data():
    """Corrupt or invalid image bytes should return 0.0 without throwing exceptions."""
    assert estimate_water_confidence(b"invalid_corrupt_bytes") == 0.0
    assert estimate_water_confidence(b"") == 0.0


def test_estimate_water_confidence_muddy_water():
    """Synthetic brown/muddy floodwater image should yield a high water confidence score."""
    # BGR for brown/tan muddy floodwater: B=40, G=100, R=160
    muddy_bytes = create_synthetic_image_bytes(b=40, g=100, r=160)
    confidence = estimate_water_confidence(muddy_bytes)
    assert 0.0 <= confidence <= 1.0
    assert confidence > 0.5


def test_estimate_water_confidence_standing_water():
    """Synthetic blue standing water image should yield a high water confidence score."""
    # BGR for blue standing water: B=200, G=120, R=40
    standing_blue_bytes = create_synthetic_image_bytes(b=200, g=120, r=40)
    confidence = estimate_water_confidence(standing_blue_bytes)
    assert 0.0 <= confidence <= 1.0
    assert confidence > 0.5


def test_estimate_water_confidence_non_water():
    """Synthetic bright green foliage image should yield a low water confidence score."""
    # BGR for bright green: B=30, G=220, R=30
    green_bytes = create_synthetic_image_bytes(b=30, g=220, r=30)
    confidence = estimate_water_confidence(green_bytes)
    assert 0.0 <= confidence <= 0.2


@pytest.mark.asyncio
async def test_cv_service_threadpool_execution():
    """Ensure run_in_threadpool executes estimate_water_confidence off the event loop."""
    image_bytes = create_synthetic_image_bytes(b=40, g=100, r=160)
    confidence = await run_in_threadpool(estimate_water_confidence, image_bytes)
    assert isinstance(confidence, float)
    assert 0.0 <= confidence <= 1.0


def test_estimate_water_confidence_solid_gray():
    """Solid neutral gray square (concrete/pavement) should NOT score above ~0.3 confidence."""
    gray_bytes = create_synthetic_image_bytes(b=128, g=128, r=128)
    confidence = estimate_water_confidence(gray_bytes)
    assert confidence <= 0.3


def test_estimate_water_confidence_concrete_tan():
    """Solid light sandy concrete-tan square (BGR 195, 202, 210 with warm hue H=14, S=18) should NOT score above ~0.3 confidence."""
    concrete_bytes = create_synthetic_image_bytes(b=195, g=202, r=210)
    confidence = estimate_water_confidence(concrete_bytes)
    assert confidence <= 0.3


def test_estimate_water_confidence_solid_blue_and_brown():
    """Solid blue or muddy-brown image SHOULD score above 0.3 confidence."""
    blue_bytes = create_synthetic_image_bytes(b=200, g=120, r=40)
    muddy_bytes = create_synthetic_image_bytes(b=40, g=100, r=160)
    assert estimate_water_confidence(blue_bytes) > 0.3
    assert estimate_water_confidence(muddy_bytes) > 0.3

