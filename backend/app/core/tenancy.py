"""Hybrid tenancy resolver — shared vs dedicated deployment."""

from __future__ import annotations

from dataclasses import dataclass

from app.models.org import Org


@dataclass
class TenantContext:
    org_id: str
    mode: str
    database_url: str | None
    storage_prefix: str
    public_url: str | None


def resolve_tenant(org: Org, *, default_database_url: str) -> TenantContext:
    mode = org.deployment_mode or "shared"
    if mode == "dedicated" and org.dedicated_url:
        return TenantContext(
            org_id=org.id,
            mode="dedicated",
            database_url=None,
            storage_prefix=f"tenant/{org.slug}/",
            public_url=org.dedicated_url,
        )
    return TenantContext(
        org_id=org.id,
        mode="shared",
        database_url=default_database_url,
        storage_prefix=f"org/{org.id}/",
        public_url=None,
    )
