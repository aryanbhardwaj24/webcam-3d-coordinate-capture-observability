from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable

import cv2 as cv
import numpy as np
import mediapipe as mp
from deep_sort_realtime.deepsort_tracker import DeepSort
from ultralytics import YOLO

from .schemas import ObservationRow


@dataclass(frozen=True)
class Detection:
    xyxy: tuple[int, int, int, int]
    confidence: float


@dataclass(frozen=True)
class TrackBox:
    track_id: str
    x: int
    y: int
    width: int
    height: int
    confidence: float


@dataclass(frozen=True)
class ProcessedFrame:
    rows: list[ObservationRow]
    boxes: list[TrackBox]


class StreamEngine:
    def __init__(
        self,
        *,
        yolo_weights_path: str = "yolo11n.pt",
        yolo_conf_threshold: float = 0.35,
        min_detection_confidence: float = 0.5,
        min_tracking_confidence: float = 0.5,
    ) -> None:
        self._frame_index = 0
        self._yolo_conf_threshold = yolo_conf_threshold

        self._yolo = YOLO(yolo_weights_path)
        self._tracker = DeepSort(
            max_age=30,
            n_init=1,
            max_cosine_distance=0.3,
            nn_budget=100,
            override_track_class=None,
            embedder="mobilenet",
            half=False,
        )

        self._holistic = mp.solutions.holistic.Holistic(
            static_image_mode=True,
            model_complexity=1,
            smooth_landmarks=False,
            min_detection_confidence=min_detection_confidence,
            min_tracking_confidence=min_tracking_confidence,
        )
        self._hands = mp.solutions.hands.Hands(
            static_image_mode=True,
            max_num_hands=2,
            min_detection_confidence=min_detection_confidence,
            min_tracking_confidence=min_tracking_confidence,
        )

    @property
    def frame_index(self) -> int:
        return self._frame_index

    def reset(self) -> None:
        self._frame_index = 0
        self._tracker = DeepSort(
            max_age=30,
            n_init=1,
            max_cosine_distance=0.3,
            nn_budget=100,
            override_track_class=None,
            embedder="mobilenet",
            half=False,
        )

    def process_frame(self, frame_bgr: np.ndarray) -> ProcessedFrame:
        detections = list(self._detect_persons(frame_bgr))
        raw_detections = [
            (np.array(det.xyxy, dtype=float), float(det.confidence), 0) for det in detections
        ]

        tracks = self._tracker.update_tracks(raw_detections=raw_detections, frame=frame_bgr)

        rows: list[ObservationRow] = []
        track_boxes: list[TrackBox] = []
        frame_index = self._frame_index
        self._frame_index += 1

        active_targets: list[tuple[str, int, int, int, int, float]] = []
        for track in tracks:
            if track.time_since_update > 1:
                continue

            track_id = str(track.track_id)
            x1, y1, x2, y2 = map(int, track.to_ltrb())
            confidence = float(getattr(track, "det_conf", 0.0) or 0.0)
            active_targets.append((track_id, x1, y1, x2, y2, confidence))

        if not active_targets:
            for detection_index, detection in enumerate(detections, start=1):
                x1, y1, x2, y2 = detection.xyxy
                active_targets.append((f"candidate-{detection_index}", x1, y1, x2, y2, detection.confidence))

        for track_id, x1, y1, x2, y2, confidence in active_targets:
            x1 = max(0, x1)
            y1 = max(0, y1)
            x2 = min(frame_bgr.shape[1], x2)
            y2 = min(frame_bgr.shape[0], y2)
            if x2 <= x1 or y2 <= y1:
                continue

            track_boxes.append(
                TrackBox(
                    track_id=track_id,
                    x=x1,
                    y=y1,
                    width=x2 - x1,
                    height=y2 - y1,
                    confidence=confidence,
                )
            )

        frame_rgb = cv.cvtColor(frame_bgr, cv.COLOR_BGR2RGB)
        frame_rgb.flags.writeable = False
        holistic_result = self._holistic.process(frame_rgb)
        frame_rgb.flags.writeable = True

        hands_result = self._hands.process(frame_rgb)
        left_hand_landmarks = None
        right_hand_landmarks = None

        if hands_result and hands_result.multi_hand_landmarks and hands_result.multi_handedness:
            for hand_landmarks, handedness in zip(
                hands_result.multi_hand_landmarks,
                hands_result.multi_handedness,
            ):
                label = handedness.classification[0].label
                if label == "Left" and left_hand_landmarks is None:
                    left_hand_landmarks = hand_landmarks.landmark
                elif label == "Right" and right_hand_landmarks is None:
                    right_hand_landmarks = hand_landmarks.landmark

        primary_track_id = self._select_primary_track_id(
            boxes=track_boxes,
            holistic_result=holistic_result,
            frame_width=frame_bgr.shape[1],
            frame_height=frame_bgr.shape[0],
        )

        if primary_track_id is not None:
            rows.extend(
                self._build_landmark_rows(
                    frame_index=frame_index,
                    track_id=primary_track_id,
                    domain="face",
                    frame_width=frame_bgr.shape[1],
                    frame_height=frame_bgr.shape[0],
                    landmarks=holistic_result.face_landmarks.landmark if holistic_result.face_landmarks else None,
                )
            )
            rows.extend(
                self._build_landmark_rows(
                    frame_index=frame_index,
                    track_id=primary_track_id,
                    domain="pose",
                    frame_width=frame_bgr.shape[1],
                    frame_height=frame_bgr.shape[0],
                    landmarks=holistic_result.pose_landmarks.landmark if holistic_result.pose_landmarks else None,
                )
            )
            rows.extend(
                self._build_landmark_rows(
                    frame_index=frame_index,
                    track_id=primary_track_id,
                    domain="left_hand",
                    frame_width=frame_bgr.shape[1],
                    frame_height=frame_bgr.shape[0],
                    landmarks=left_hand_landmarks,
                )
            )
            rows.extend(
                self._build_landmark_rows(
                    frame_index=frame_index,
                    track_id=primary_track_id,
                    domain="right_hand",
                    frame_width=frame_bgr.shape[1],
                    frame_height=frame_bgr.shape[0],
                    landmarks=right_hand_landmarks,
                )
            )

        return ProcessedFrame(rows=rows, boxes=track_boxes)

    def _detect_persons(self, frame_bgr: np.ndarray) -> Iterable[Detection]:
        results = self._yolo(frame_bgr)
        if not results:
            return []

        boxes = results[0].boxes
        if boxes is None or len(boxes) == 0:
            return []

        detections: list[Detection] = []
        for box in boxes:
            cls = int(box.cls.cpu().numpy()[0])
            confidence = float(box.conf.cpu().numpy()[0])
            if cls != 0 or confidence < self._yolo_conf_threshold:
                continue

            x1, y1, x2, y2 = map(int, box.xyxy.cpu().numpy()[0])
            detections.append(Detection(xyxy=(x1, y1, x2, y2), confidence=confidence))

        return detections

    def _build_landmark_rows(
        self,
        *,
        frame_index: int,
        track_id: str,
        domain: str,
        frame_width: int,
        frame_height: int,
        landmarks: Iterable[object] | None,
    ) -> list[ObservationRow]:
        if not landmarks or frame_width <= 0 or frame_height <= 0:
            return []

        rows: list[ObservationRow] = []
        for landmark_index, lm in enumerate(landmarks):
            rows.append(
                ObservationRow(
                    frame_index=frame_index,
                    track_id=track_id,
                    domain=domain,  # type: ignore[arg-type]
                    landmark_index=landmark_index,
                    x=float(lm.x) * frame_width,
                    y=float(lm.y) * frame_height,
                    z=float(lm.z),
                    visibility=float(getattr(lm, "visibility", 1.0)),
                )
            )
        return rows

    def _select_primary_track_id(
        self,
        *,
        boxes: list[TrackBox],
        holistic_result: object,
        frame_width: int,
        frame_height: int,
    ) -> str | None:
        if not boxes:
            return None

        if len(boxes) == 1:
            return boxes[0].track_id

        pose_landmarks = getattr(holistic_result, "pose_landmarks", None)
        if pose_landmarks and getattr(pose_landmarks, "landmark", None):
            landmarks = pose_landmarks.landmark
            candidate_indices = [0, 11, 12, 23, 24]
            candidate_points = [
                (float(landmarks[index].x) * frame_width, float(landmarks[index].y) * frame_height)
                for index in candidate_indices
                if index < len(landmarks)
            ]

            if candidate_points:
                center_x = sum(point[0] for point in candidate_points) / len(candidate_points)
                center_y = sum(point[1] for point in candidate_points) / len(candidate_points)

                containing_box = next(
                    (
                        box
                        for box in boxes
                        if box.x <= center_x <= box.x + box.width and box.y <= center_y <= box.y + box.height
                    ),
                    None,
                )
                if containing_box is not None:
                    return containing_box.track_id

                nearest_box = min(
                    boxes,
                    key=lambda box: (box.x + box.width / 2 - center_x) ** 2 + (box.y + box.height / 2 - center_y) ** 2,
                )
                return nearest_box.track_id

        return max(boxes, key=lambda box: (box.confidence, box.width * box.height)).track_id
