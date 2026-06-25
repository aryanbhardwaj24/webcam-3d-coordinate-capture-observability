from __future__ import annotations

import cv2 as cv
import numpy as np


def decode_image_bytes(data: bytes) -> np.ndarray | None:
    np_arr = np.frombuffer(data, dtype=np.uint8)
    if np_arr.size == 0:
        return None
    return cv.imdecode(np_arr, cv.IMREAD_COLOR)

