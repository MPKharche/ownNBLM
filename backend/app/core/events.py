"""In-memory SSE event bus (Phase 1); Redis pub/sub in Phase 3."""

from __future__ import annotations

import asyncio
from collections import defaultdict
from typing import Any

_queues: dict[str, asyncio.Queue[dict[str, Any]]] = defaultdict(asyncio.Queue)


def publish(channel: str, event: dict[str, Any]) -> None:
    q = _queues[channel]
    try:
        q.put_nowait(event)
    except asyncio.QueueFull:
        pass


async def subscribe(channel: str):
    q = _queues[channel]
    while True:
        try:
            event = await asyncio.wait_for(q.get(), timeout=120.0)
            yield event
        except TimeoutError:
            yield {"event": "heartbeat"}
            continue
