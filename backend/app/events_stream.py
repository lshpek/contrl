"""Lightweight Server-Sent Events (SSE) stream for near-real-time UI updates."""
from __future__ import annotations

import asyncio
import json
from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .auth import get_current_user
from .database import SessionLocal
from .models import ActivityEvent, OrderMessage, User

events_router = APIRouter(prefix="/api/v1/events", tags=["events"])


@events_router.get("/stream")
async def stream_updates(request: Request, _user: User = Depends(get_current_user)):
    async def event_generator():
        last_key = ""
        try:
            while True:
                if await request.is_disconnected():
                    break
                with SessionLocal() as db:
                    max_act = db.scalar(select(func.max(ActivityEvent.id))) or 0
                    max_msg = db.scalar(select(func.max(OrderMessage.id))) or 0
                    cur_key = f"{max_act}:{max_msg}"
                if last_key and cur_key != last_key:
                    payload = json.dumps({"activity_id": max_act, "message_id": max_msg})
                    yield f"event: update\ndata: {payload}\n\n"
                else:
                    yield ": keepalive\n\n"
                last_key = cur_key
                await asyncio.sleep(2.5)
        except asyncio.CancelledError:
            return

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
