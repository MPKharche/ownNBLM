"""In-process SSE event bus (Phase 1); Redis pub/sub in Phase 3."""

from __future__ import annotations

import asyncio
import queue
from collections import defaultdict
from typing import Any

_queues: dict[str, queue.Queue[dict[str, Any]]] = defaultdict(
    lambda: queue.Queue(maxsize=256)
)


def publish(channel: str, event: dict[str, Any]) -> None:
    q = _queues[channel]
    try:
        q.put_nowait(event)
    except queue.Full:
        pass


async def subscribe(channel: str):
    """Yield events published to channel (thread-safe from Huey / background threads)."""
    q = _queues[channel]
    loop = asyncio.get_running_loop()
    while True:
        try:
            event = await loop.run_in_executor(None, lambda: q.get(timeout=90.0))
            yield event
            if event.get("event") in ("ingest_done", "ingest_error"):
                return
        except queue.Empty:
            yield {"event": "heartbeat"}
