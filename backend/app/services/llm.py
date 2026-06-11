"""LiteLLM router — OpenRouter or Anthropic-compatible endpoints; BYOK enterprise-only."""

from __future__ import annotations

import os
from collections.abc import AsyncIterator
from decimal import Decimal
from typing import Any

import litellm
import structlog

from app.core.config import PREMIUM_MODELS, Settings, get_settings

logger = structlog.get_logger()

# OpenRouter rejects requests when max_tokens exceeds affordable credits
DEFAULT_MAX_TOKENS = 512

OPENROUTER_API_BASE = "https://openrouter.ai/api/v1"


class LLMRouterError(Exception):
    pass


class LLMBudgetError(LLMRouterError):
    pass


def _credit_multiplier(model: str) -> Decimal:
    return Decimal("5") if model in PREMIUM_MODELS else Decimal("1")


def _resolve_llm_route(
    settings: Settings,
    *,
    model: str | None,
    user_api_key: str | None = None,
) -> tuple[str, str, str]:
    """Return (model, api_key, api_base) for LiteLLM."""
    provider = settings.llm_provider.lower()
    resolved_model = model or settings.default_llm_model

    if provider == "anthropic":
        api_key = user_api_key or settings.anthropic_api_key
        if not api_key:
            raise LLMRouterError("No Anthropic API key configured")
        if resolved_model.startswith("openai/") or resolved_model.startswith("openrouter/"):
            resolved_model = "claude-sonnet-4-20250514"
        elif resolved_model.startswith("anthropic/"):
            resolved_model = resolved_model.removeprefix("anthropic/")
        return resolved_model, api_key, settings.anthropic_base_url.rstrip("/")

    api_key = user_api_key or settings.openrouter_api_key
    if not api_key:
        raise LLMRouterError("No LLM API key configured")
    os.environ["OPENROUTER_API_KEY"] = api_key
    return resolved_model, api_key, OPENROUTER_API_BASE


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

    if user_api_key and org_tier != "enterprise":
        raise LLMRouterError("BYOK is only available on Enterprise tier")

    resolved_model, api_key, api_base = _resolve_llm_route(
        settings, model=model, user_api_key=user_api_key
    )
    return litellm.completion(
        model=resolved_model,
        messages=messages,
        api_key=api_key,
        api_base=api_base,
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
    max_tokens = max_tokens if max_tokens is not None else settings.llm_max_output_tokens
    resolved_model, api_key, api_base = _resolve_llm_route(settings, model=model)

    response = await litellm.acompletion(
        model=resolved_model,
        messages=messages,
        api_key=api_key,
        api_base=api_base,
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
