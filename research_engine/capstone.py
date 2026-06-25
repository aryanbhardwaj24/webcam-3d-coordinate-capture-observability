from __future__ import annotations

import argparse
from pathlib import Path

import cv2 as cv

from backend.app.cv_engine.engine import StreamEngine
from backend.app.cv_engine.export import rows_to_csv_bytes, rows_to_zip_bytes
from backend.app.cv_engine.schemas import ObservationRow


def get_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--video",
        type=str,
        default="./calibration_input_videos/test_2person.mp4",
    )
    parser.add_argument(
        "--output",
        type=str,
        default="./artifacts",
    )
    parser.add_argument("--max-frames", type=int, default=0)
    return parser.parse_args()


def run_video_to_zip(video_path: str, output_dir: str, max_frames: int = 0) -> Path:
    out_dir = Path(output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    video_stem = Path(video_path).stem

    cap = cv.VideoCapture(video_path)
    if not cap.isOpened():
        raise RuntimeError(f"failed_to_open_video: {video_path}")

    engine = StreamEngine()
    rows: list[ObservationRow] = []
    frames_seen = 0

    try:
        while True:
            ret, frame = cap.read()
            if not ret:
                break
            rows.extend(engine.process_frame(frame).rows)
            frames_seen += 1
            if max_frames and frames_seen >= max_frames:
                break
    finally:
        cap.release()

    (out_dir / f"{video_stem}.csv").write_bytes(rows_to_csv_bytes(rows))

    zip_path = out_dir / f"{video_stem}.zip"
    zip_path.write_bytes(rows_to_zip_bytes(rows))
    return zip_path


def main() -> None:
    args = get_args()
    zip_path = run_video_to_zip(args.video, args.output, args.max_frames)
    print(str(zip_path))


if __name__ == "__main__":
    main()
