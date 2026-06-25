from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


Domain = Literal["face", "pose", "left_hand", "right_hand"]


class ObservationRow(BaseModel):
    frame_index: int = Field(ge=0)
    track_id: str
    domain: Domain
    landmark_index: int = Field(ge=0)
    x: float
    y: float
    z: float
    visibility: float | None = None
