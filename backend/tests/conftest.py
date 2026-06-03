"""Load repo-root .env before tests."""

import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[2] / ".env", override=False)
# Integration tests call live OpenRouter — disable burn cap unless test opts in.
os.environ.setdefault("LLM_BUDGET_ENABLED", "false")
