"""Org-scoped API keys for public API access."""

from __future__ import annotations

import hashlib
import secrets
import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.api_key import ApiKey
from app.services.audit import log_audit

VALID_SCOPES = frozenset({"read_only", "ingest", "full"})
API_KEY_PREFIX = "onblm_"


def _hash_key(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


def create_api_key(
    db: Session,
    *,
    org_id: str,
    name: str,
    scope: str,
    created_by: str,
) -> tuple[ApiKey, str]:
    if scope not in VALID_SCOPES:
        raise ValueError(f"Invalid scope: {scope}")
    secret = secrets.token_urlsafe(32)
    raw = f"{API_KEY_PREFIX}{secret}"
    prefix = raw[:12]
    row = ApiKey(
        id=str(uuid.uuid4()),
        org_id=org_id,
        name=name,
        key_prefix=prefix,
        key_hash=_hash_key(raw),
        scope=scope,
        created_by=created_by,
    )
    db.add(row)
    db.commit()
    log_audit(
        db,
        org_id=org_id,
        user_id=created_by,
        action="api_key.created",
        resource_type="api_key",
        resource_id=row.id,
        metadata={"name": name, "scope": scope},
    )
    return row, raw


def list_api_keys(db: Session, org_id: str) -> list[ApiKey]:
    return list(
        db.execute(
            select(ApiKey)
            .where(ApiKey.org_id == org_id, ApiKey.revoked_at.is_(None))
            .order_by(ApiKey.created_at.desc())
        ).scalars()
    )


def revoke_api_key(db: Session, org_id: str, key_id: str, actor_id: str) -> None:
    row = db.get(ApiKey, key_id)
    if row is None or row.org_id != org_id:
        raise ValueError("API key not found")
    row.revoked_at = datetime.now(UTC)
    db.commit()
    log_audit(
        db,
        org_id=org_id,
        user_id=actor_id,
        action="api_key.revoked",
        resource_type="api_key",
        resource_id=key_id,
    )


def rotate_api_key(
    db: Session, org_id: str, key_id: str, actor_id: str
) -> tuple[ApiKey, str]:
    revoke_api_key(db, org_id, key_id, actor_id)
    old = db.get(ApiKey, key_id)
    if old is None:
        raise ValueError("API key not found")
    return create_api_key(
        db,
        org_id=org_id,
        name=f"{old.name} (rotated)",
        scope=old.scope,
        created_by=actor_id,
    )


def verify_api_key(db: Session, raw_key: str) -> ApiKey | None:
    if not raw_key.startswith(API_KEY_PREFIX):
        return None
    prefix = raw_key[:12]
    candidates = db.execute(
        select(ApiKey).where(
            ApiKey.key_prefix == prefix,
            ApiKey.revoked_at.is_(None),
        )
    ).scalars()
    digest = _hash_key(raw_key)
    for row in candidates:
        if row.key_hash == digest:
            row.last_used_at = datetime.now(UTC)
            db.commit()
            return row
    return None


def scope_allows(scope: str, action: str) -> bool:
    if scope == "full":
        return True
    if scope == "ingest":
        return action in ("read", "ingest")
    if scope == "read_only":
        return action == "read"
    return False
