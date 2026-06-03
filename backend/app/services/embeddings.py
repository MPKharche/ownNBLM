"""Embedding via LiteLLM → OpenRouter."""

from __future__ import annotations

import json
import os

import litellm

from app.core.config import get_settings


def embed_texts(texts: list[str]) -> list[list[float]]:
    settings = get_settings()
    if not settings.openrouter_api_key:
        raise ValueError("OPENROUTER_API_KEY is required for embeddings")
    os.environ["OPENROUTER_API_KEY"] = settings.openrouter_api_key
    batch_size = settings.embed_batch_size
    all_vectors: list[list[float]] = []
    for i in range(0, len(texts), batch_size):
        batch = texts[i : i + batch_size]
        resp = litellm.embedding(
            model=settings.default_embed_model,
            input=batch,
            api_key=settings.openrouter_api_key,
            api_base="https://openrouter.ai/api/v1",
            encoding_format="float",
        )
        for item in resp.data:
            all_vectors.append(list(item["embedding"]))
    return all_vectors


def embedding_to_json(vec: list[float]) -> str:
    return json.dumps(vec)


def embedding_from_json(raw: str | None) -> list[float] | None:
    if not raw:
        return None
    return json.loads(raw)
