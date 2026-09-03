import logging
import cv2
import numpy as np

logger = logging.getLogger(__name__)


def estimate_water_confidence(image_bytes: bytes) -> float:
    """Estimates the proportion of pixels corresponding to water (muddy floodwater

    or standing water surfaces) in an image using HSV thresholding.

    Args:
        image_bytes: Raw bytes of the image file.

    Returns:
        float: Normalized confidence score between 0.0 and 1.0. Returns 0.0 on corrupt data.
    """
    if not image_bytes:
        return 0.0

    try:
        # Convert byte buffer to 1D uint8 NumPy array
        np_arr = np.frombuffer(image_bytes, np.uint8)
        if np_arr.size == 0:
            return 0.0

        # Decode image in memory without writing to disk
        img = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
        if img is None or img.size == 0:
            return 0.0

        # Convert BGR to HSV color space
        hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)

        # Calibrated HSV thresholds:
        # 1. Muddy Floodwater (brownish, tan, yellow-brown murky water)
        muddy_lower = np.array([0, 20, 30], dtype=np.uint8)
        muddy_upper = np.array([35, 220, 220], dtype=np.uint8)
        mask_muddy = cv2.inRange(hsv, muddy_lower, muddy_upper)

        # 2. Standing Water (blue/cyan water surfaces)
        standing_blue_lower = np.array([85, 20, 30], dtype=np.uint8)
        standing_blue_upper = np.array([135, 255, 245], dtype=np.uint8)
        mask_standing_blue = cv2.inRange(hsv, standing_blue_lower, standing_blue_upper)

        # 3. Murky / Grayish standing water (low saturation reflections constrained to blue-gray water band H 85-135)
        standing_gray_lower = np.array([85, 10, 30], dtype=np.uint8)
        standing_gray_upper = np.array([135, 45, 190], dtype=np.uint8)
        mask_standing_gray = cv2.inRange(hsv, standing_gray_lower, standing_gray_upper)

        # Combine all masks with bitwise OR
        water_mask = cv2.bitwise_or(mask_muddy, mask_standing_blue)
        water_mask = cv2.bitwise_or(water_mask, mask_standing_gray)

        # Calculate ratio of water pixels to total pixels
        total_pixels = hsv.shape[0] * hsv.shape[1]
        if total_pixels == 0:
            return 0.0

        water_pixels = int(np.count_nonzero(water_mask))
        confidence = float(water_pixels / total_pixels)

        return round(min(max(confidence, 0.0), 1.0), 4)

    except Exception as exc:
        logger.warning(f"Error estimating water confidence: {exc}")
        return 0.0
