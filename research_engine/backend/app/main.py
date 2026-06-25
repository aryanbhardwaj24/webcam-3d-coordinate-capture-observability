from __future__ import annotations

import asyncio
import json
from typing import Any

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

from .cv_engine import SessionStore
from .cv_engine.export import rows_to_csv_bytes
from .cv_engine.image_codec import decode_image_bytes
from .telemetry import configure_telemetry

app = FastAPI()
telemetry_enabled = configure_telemetry(app)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def root() -> dict[str, Any]:
    return {
        "service": "cv-engine-local",
        "status": "ok",
        "health": "/healthz",
        "websocket": "/ws/stream",
        "meta": "/meta",
    }


@app.get("/healthz")
def healthz() -> dict[str, Any]:
    return {"ok": True, "telemetry_enabled": telemetry_enabled}


@app.get("/meta")
def meta() -> dict[str, Any]:
    return {
        "service": "cv-engine-local",
        "version": "0.1.0",
        "telemetry_enabled": telemetry_enabled,
    }

session_store = SessionStore()


@app.get("/sessions")
async def list_sessions() -> dict[str, Any]:
    return {"sessions": await session_store.list_sessions()}


@app.get("/sessions/{session_id}")
async def get_session(session_id: str) -> dict[str, Any]:
    if not await session_store.exists(session_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="session_not_found")
    return await session_store.get_summary(session_id)


@app.delete("/sessions/{session_id}")
async def delete_session(session_id: str) -> dict[str, Any]:
    if not await session_store.exists(session_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="session_not_found")
    await session_store.delete(session_id)
    return {"ok": True, "session_id": session_id}


@app.post("/sessions/{session_id}/reset")
async def reset_session(session_id: str) -> dict[str, Any]:
    if not await session_store.exists(session_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="session_not_found")
    await session_store.reset(session_id)
    return {"ok": True, "session_id": session_id}


@app.get("/sessions/{session_id}/export.csv")
async def export_session_csv(
    session_id: str,
    track_id: str | None = None,
    domain: str | None = None,
) -> Response:
    if not await session_store.exists(session_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="session_not_found")
    rows = await session_store.get_rows(session_id)
    if track_id is not None:
        rows = [r for r in rows if r.track_id == track_id]

    if domain is not None:
        if domain not in {"face", "pose", "left_hand", "right_hand"}:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid_domain")
        rows = [r for r in rows if r.domain == domain]

    rows = sorted(rows, key=lambda r: (r.frame_index, r.track_id, r.domain))
    csv_bytes = rows_to_csv_bytes(rows)
    filename_parts = [session_id]
    if track_id is not None:
        filename_parts.append(f"track-{track_id}")
    if domain is not None:
        filename_parts.append(domain)
    filename = "_".join(filename_parts) + ".csv"
    return Response(
        content=csv_bytes,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.get("/sessions/{session_id}/export.zip")
async def export_session_zip(session_id: str) -> Response:
    if not await session_store.exists(session_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="session_not_found")
    zip_bytes = await session_store.export_zip_bytes(session_id)
    return Response(
        content=zip_bytes,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{session_id}.zip"'},
    )


@app.websocket("/ws/stream")
async def ws_stream(websocket: WebSocket) -> None:
    await websocket.accept()
    conf_raw = websocket.query_params.get("conf")
    conf = None
    if conf_raw is not None:
        try:
            conf = float(conf_raw)
        except ValueError:
            conf = None

    session_id = await session_store.create(yolo_conf_threshold=conf)
    await websocket.send_text(json.dumps({"type": "ready", "session_id": session_id}))

    try:
        while True:
            message = await websocket.receive()

            if message.get("type") == "websocket.disconnect":
                return

            if message.get("bytes") is not None:
                data = message["bytes"]
                frame = decode_image_bytes(data)
                if frame is None:
                    await websocket.send_text(json.dumps({"type": "error", "error": "invalid_image"}))
                    continue

                engine = await session_store.get_engine(session_id)
                processed = engine.process_frame(frame)
                await session_store.append_rows(session_id, processed.rows)
                await websocket.send_text(
                    json.dumps(
                        {
                            "type": "frame_result",
                            "session_id": session_id,
                            "frame_index": engine.frame_index - 1,
                            "frame_width": int(frame.shape[1]),
                            "frame_height": int(frame.shape[0]),
                            "boxes": [
                                {
                                    "id": f"track-{box.track_id}",
                                    "track_id": box.track_id,
                                    "x": box.x,
                                    "y": box.y,
                                    "width": box.width,
                                    "height": box.height,
                                    "label": f"Person {box.track_id}",
                                    "confidence": box.confidence,
                                }
                                for box in processed.boxes
                            ],
                            "observations": [r.model_dump() for r in processed.rows],
                        }
                    )
                )
                continue

            if message.get("text") is not None:
                text = message["text"]
                try:
                    payload = json.loads(text)
                except json.JSONDecodeError:
                    await websocket.send_text(json.dumps({"type": "echo", "data": text}))
                    continue

                if payload.get("type") == "reset":
                    await session_store.reset(session_id)
                    await websocket.send_text(json.dumps({"type": "reset_ok", "session_id": session_id}))
                    continue

                if payload.get("type") == "ping":
                    await websocket.send_text(json.dumps({"type": "pong"}))
                    continue

                if payload.get("type") == "close":
                    await websocket.close()
                    return

                if payload.get("type") == "get_summary":
                    summary = await session_store.get_summary(session_id)
                    await websocket.send_text(json.dumps({"type": "summary", **summary}))
                    continue

                await websocket.send_text(json.dumps({"type": "echo", "data": payload}))
    except WebSocketDisconnect:
        await asyncio.sleep(0)
    finally:
        await session_store.delete(session_id)
        return
