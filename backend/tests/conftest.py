"""Load repo-root .env before tests."""

import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[2] / ".env", override=False)
# Integration tests call live OpenRouter — disable burn cap unless test opts in.
os.environ.setdefault("LLM_BUDGET_ENABLED", "false")
os.environ.setdefault("ENVIRONMENT", "development")

# Avoid flaky 429s when the phase4 suite exercises many auth endpoints in one minute.
from app.core import rate_limit as _rate_limit  # noqa: E402

_rate_limit.AUTH_LIMIT = 500
_rate_limit._hits.clear()
