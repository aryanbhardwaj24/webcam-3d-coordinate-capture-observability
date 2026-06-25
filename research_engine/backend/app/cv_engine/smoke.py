from __future__ import annotations

import numpy as np

from .engine import StreamEngine


def main() -> None:
    engine = StreamEngine()
    frame = np.zeros((480, 640, 3), dtype=np.uint8)
    rows = engine.process_frame(frame)
    print(len(rows))


if __name__ == "__main__":
    main()

