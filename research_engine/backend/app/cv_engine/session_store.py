from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from typing import Iterable
from uuid import uuid4

from .engine import StreamEngine
from .export import rows_to_csv_bytes, rows_to_zip_bytes
from .schemas import ObservationRow


@dataclass
class Session:
    engine: StreamEngine
    rows: list[ObservationRow] = field(default_factory=list)


class SessionStore:
    def __init__(self) -> None:
        self._lock = asyncio.Lock()
        self._sessions: dict[str, Session] = {}

    async def create(self, *, yolo_conf_threshold: float | None = None) -> str:
        session_id = uuid4().hex
        engine_kwargs: dict[str, object] = {}
        if yolo_conf_threshold is not None:
            engine_kwargs["yolo_conf_threshold"] = max(0.0, min(1.0, yolo_conf_threshold))
        async with self._lock:
            self._sessions[session_id] = Session(engine=StreamEngine(**engine_kwargs))
        return session_id

    async def reset(self, session_id: str) -> None:
        async with self._lock:
            session = self._sessions[session_id]
            session.engine.reset()
            session.rows.clear()

    async def append_rows(self, session_id: str, rows: Iterable[ObservationRow]) -> None:
        async with self._lock:
            session = self._sessions[session_id]
            session.rows.extend(list(rows))

    async def get_rows(self, session_id: str) -> list[ObservationRow]:
        async with self._lock:
            return list(self._sessions[session_id].rows)

    async def export_csv_bytes(self, session_id: str) -> bytes:
        rows = await self.get_rows(session_id)
        rows = sorted(rows, key=lambda r: (r.frame_index, r.track_id, r.domain))
        return rows_to_csv_bytes(rows)

    async def export_zip_bytes(self, session_id: str) -> bytes:
        rows = await self.get_rows(session_id)
        return rows_to_zip_bytes(rows)

    async def get_engine(self, session_id: str) -> StreamEngine:
        async with self._lock:
            return self._sessions[session_id].engine

    async def get_summary(self, session_id: str) -> dict[str, int | str]:
        async with self._lock:
            session = self._sessions[session_id]
            return {
                "session_id": session_id,
                "rows_count": len(session.rows),
                "frame_index": session.engine.frame_index,
            }

    async def delete(self, session_id: str) -> None:
        async with self._lock:
            self._sessions.pop(session_id, None)

    async def list_sessions(self) -> list[str]:
        async with self._lock:
            return sorted(self._sessions.keys())

    async def exists(self, session_id: str) -> bool:
        async with self._lock:
            return session_id in self._sessions
