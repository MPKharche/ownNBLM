"""Application settings loaded from environment."""

from functools import lru_cache
from pathlib import Path

from decimal import Decimal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_REPO_ROOT = Path(__file__).resolve().parents[3]
_ENV_FILES = (
    _REPO_ROOT / ".env",
    Path(".env"),
    Path("../.env"),
)

TIER_QUERY_LIMITS: dict[str, int] = {
    "free": 30,
    "personal": 500,
    "team": 2000,
    "business": 10000,
    "enterprise": 10000,
}

TIER_STORAGE_BYTES: dict[str, int] = {
    "free": 1 * 1024**3,
    "personal": 10 * 1024**3,
    "team": 50 * 1024**3,
    "business": 200 * 1024**3,
    "enterprise": 200 * 1024**3,
}

PREMIUM_MODELS = frozenset(
    {
        "openai/gpt-4o",
        "anthropic/claude-3.5-sonnet",
        "openai/gpt-4o-2024-08-06",
    }
)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=[str(p) for p in _ENV_FILES if p.exists()] or ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    openrouter_api_key: str = ""
    # Chat provider: openrouter (default) or anthropic (e.g. cc-vibe.com proxy).
    # Use OWNNBLM_* names so global Claude Code env vars do not override .env.
    llm_provider: str = Field(default="openrouter", validation_alias="OWNNBLM_LLM_PROVIDER")
    anthropic_api_key: str = Field(default="", validation_alias="OWNNBLM_ANTHROPIC_API_KEY")
    anthropic_base_url: str = Field(
        default="https://api.anthropic.com",
        validation_alias="OWNNBLM_ANTHROPIC_BASE_URL",
    )
    database_url: str = "sqlite:///./ownNBLM.db"
    redis_url: str = ""
    storage_backend: str = "local"
    storage_local_path: str = "./data/files"
    storage_s3_bucket: str = ""
    storage_s3_endpoint: str = ""
    pageindex_workspace: str = "./data/pageindex"
    default_llm_model: str = "openai/gpt-4o-mini"
    default_embed_model: str = "openai/text-embedding-3-small"
    chunk_size_tokens: int = 512
    chunk_overlap_tokens: int = 64
    embed_batch_size: int = 32
    # LLM burn control (USD, Decimal) — default: $0.005 (0.5¢) per 48h
    llm_budget_enabled: bool = True
    llm_budget_usd: Decimal = Decimal("0.005")
    llm_budget_window_hours: int = 48
    llm_budget_scope: str = "global"  # global | org
    llm_max_output_tokens: int = 1024
    llm_retrieval_top_k: int = 5
    llm_max_chunk_chars: int = 800
    # OpenRouter list prices per 1M tokens (USD) for burn estimation
    llm_price_input_per_mtok: Decimal = Decimal("0.15")
    llm_price_output_per_mtok: Decimal = Decimal("0.60")
    llm_price_embed_per_mtok: Decimal = Decimal("0.02")
    max_concurrent_ingest: int = 3
    max_file_size_mb: int = 50
    max_files_per_batch: int = 10
    log_level: str = "INFO"
    environment: str = "development"
    secret_key: str = "change-me-in-production"
    jwt_expire_minutes: int = 60 * 24 * 7
    refresh_token_days: int = 30
    google_client_id: str = ""
    google_client_secret: str = ""
    portainer_url: str = ""
    portainer_api_key: str = ""
    resend_api_key: str = ""
    digest_from_email: str = "ownNBLM <onboarding@resend.dev>"
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    # Optional regex for additional CORS origins (e.g. *.vercel.app during migration).
    # Leave empty in VPS-only deployments — CORS_ORIGINS covers the single domain.
    cors_origin_regex: str = ""
    payment_provider: str = "razorpay"
    billing_currency: str = "INR"
    razorpay_key_id: str = ""
    razorpay_key_secret: str = ""
    razorpay_webhook_secret: str = ""
    razorpay_plan_personal: str = ""
    razorpay_plan_team: str = ""
    razorpay_plan_business: str = ""
    stripe_secret_key: str = ""
    stripe_webhook_secret: str = ""
    stripe_price_personal: str = ""
    stripe_price_team: str = ""
    stripe_price_business: str = ""
    folder_watch_enabled: bool = True
    sentry_dsn: str = ""
    frontend_url: str = "http://localhost:5173"
    # Private preview: only allowlisted emails may sign in; sign-up/OAuth/magic disabled
    auth_restricted: bool = True
    auth_allowlist_emails: str = "admin@ownnblm.local"
    auth_rate_limit_per_minute: int = 5
    auth_refresh_rate_limit_per_minute: int = 20
    auth_login_max_failures: int = 5
    auth_login_lockout_minutes: int = 15
    chat_rate_limit_per_minute: int = 60
    ingest_rate_limit_per_minute: int = 10
    api_global_rate_limit_per_minute: int = 120

    @field_validator(
        "llm_budget_usd",
        "llm_price_input_per_mtok",
        "llm_price_output_per_mtok",
        "llm_price_embed_per_mtok",
        mode="before",
    )
    @classmethod
    def _decimal_fields(cls, v: object) -> Decimal:
        if isinstance(v, Decimal):
            return v
        return Decimal(str(v))

    @property
    def is_development(self) -> bool:
        return self.environment == "development"

    @property
    def is_production(self) -> bool:
        return self.environment == "production"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def max_file_size_bytes(self) -> int:
        return self.max_file_size_mb * 1024 * 1024

    def query_limit_for_tier(self, tier: str) -> int:
        return TIER_QUERY_LIMITS.get(tier, TIER_QUERY_LIMITS["free"])

    def storage_limit_for_tier(self, tier: str) -> int:
        return TIER_STORAGE_BYTES.get(tier, TIER_STORAGE_BYTES["free"])


@lru_cache
def get_settings() -> Settings:
    return Settings()
