"""LiteLLM router — managed OpenRouter pool; BYOK enterprise-only."""

from __future__ import annotations

import os
from collections.abc import AsyncIterator
from decimal import Decimal
from typing import Any

import litellm
import structlog

from app.core.config import PREMIUM_MODELS, get_settings

logger = structlog.get_logger()

# OpenRouter rejects requests when max_tokens exceeds affordable credits
DEFAULT_MAX_TOKENS = 512


class LLMRouterError(Exception):
    pass


class LLMBudgetError(LLMRouterError):
    pass


def _credit_multiplier(model: str) -> Decimal:
    return Decimal("5") if model in PREMIUM_MODELS else Decimal("1")


def chat_completion(
    messages: list[dict[str, str]],
    *,
    org_tier: str,
    model: str | None = None,
    user_api_key: str | None = None,
    stream: bool = False,
    max_tokens: int = DEFAULT_MAX_TOKENS,
) -> Any:
    settings = get_settings()
    model = model or settings.default_llm_model

    if user_api_key and org_tier != "enterprise":
        raise LLMRouterError("BYOK is only available on Enterprise tier")

    api_key = user_api_key or settings.openrouter_api_key
    if not api_key:
        raise LLMRouterError("No LLM API key configured")

    os.environ["OPENROUTER_API_KEY"] = api_key
    return litellm.completion(
        model=model,
        messages=messages,
        api_key=api_key,
        api_base="https://openrouter.ai/api/v1",
        stream=stream,
        max_tokens=max_tokens,
    )


async def stream_chat(
    messages: list[dict[str, str]],
    *,
    org_tier: str,
    model: str | None = None,
    max_tokens: int | None = None,
) -> AsyncIterator[str]:
    settings = get_settings()
    model = model or settings.default_llm_model
    max_tokens = max_tokens if max_tokens is not None else settings.llm_max_output_tokens
    api_key = settings.openrouter_api_key
    if not api_key:
        raise LLMRouterError("No LLM API key configured")

    response = await litellm.acompletion(
        model=model,
        messages=messages,
        api_key=api_key,
        api_base="https://openrouter.ai/api/v1",
        stream=True,
        max_tokens=max_tokens,
    )
    async for chunk in response:
        delta = chunk.choices[0].delta.content or ""
        if delta:
            yield delta


def estimate_credit_cost(model: str, prompt_tokens: int, completion_tokens: int) -> Decimal:
    base = Decimal(prompt_tokens + completion_tokens) / Decimal(1000)
    return (base * _credit_multiplier(model)).quantize(Decimal("0.0001"))
