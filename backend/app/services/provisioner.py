"""Business-tier dedicated stack provisioner (Portainer + Traefik)."""

from __future__ import annotations

import uuid

import httpx
import structlog
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.org import Org
from app.services.audit import log_audit

logger = structlog.get_logger()


def provision_dedicated_stack(db: Session, org: Org, *, actor_id: str) -> Org:
    if org.tier != "business":
        raise ValueError("Dedicated stacks require Business tier")
    settings = get_settings()
    subdomain = f"{org.slug}.ownnblm.com"
    dedicated_url = f"https://{subdomain}"

    if settings.portainer_url and settings.portainer_api_key:
        stack_name = f"ownnblm-{org.slug}"
        try:
            httpx.post(
                f"{settings.portainer_url.rstrip('/')}/api/stacks",
                headers={"X-API-Key": settings.portainer_api_key},
                json={
                    "name": stack_name,
                    "stackFileContent": _compose_template(org.id, org.slug),
                },
                timeout=30.0,
            )
            logger.info("portainer_stack_requested", org_id=org.id, stack=stack_name)
        except Exception as exc:
            logger.warning("portainer_provision_failed", error=str(exc))

    org.deployment_mode = "dedicated"
    org.dedicated_url = dedicated_url
    db.commit()
    log_audit(
        db,
        org_id=org.id,
        user_id=actor_id,
        action="stack.provisioned",
        resource_type="org",
        resource_id=org.id,
        metadata={"subdomain": subdomain, "url": dedicated_url},
    )
    return org


def _compose_template(org_id: str, slug: str) -> str:
    return f"""services:
  api:
    image: ownnblm-api:latest
    environment:
      OWNNBLM_ORG_ID: "{org_id}"
      DATABASE_URL: postgresql://ownnblm:secret@postgres:5432/ownnblm_{slug}
    labels:
      - traefik.http.routers.{slug}.rule=Host(`{slug}.ownnblm.com`)
  postgres:
    image: postgres:16-alpine
    volumes:
      - pgdata_{slug}:/var/lib/postgresql/data
volumes:
  pgdata_{slug}:
"""
