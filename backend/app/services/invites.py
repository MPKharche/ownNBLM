"""Workspace invite flow."""

from __future__ import annotations

import secrets
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.org import Org
from app.models.user import User
from app.models.workspace_invite import WorkspaceInvite
from app.services.audit import log_audit


def create_invite(
    db: Session,
    *,
    org_id: str,
    email: str,
    role: str,
    invited_by: str,
) -> WorkspaceInvite:
    invite = WorkspaceInvite(
        id=str(uuid.uuid4()),
        org_id=org_id,
        email=email.lower().strip(),
        role=role if role in ("owner", "member") else "member",
        token=secrets.token_urlsafe(32),
        invited_by=invited_by,
        expires_at=datetime.now(UTC) + timedelta(days=7),
    )
    db.add(invite)
    db.commit()
    log_audit(
        db,
        org_id=org_id,
        user_id=invited_by,
        action="invite.created",
        resource_type="workspace_invite",
        resource_id=invite.id,
        metadata={"email": invite.email, "role": invite.role},
    )
    return invite


def list_pending_invites(db: Session, org_id: str) -> list[WorkspaceInvite]:
    now = datetime.now(UTC)
    rows = db.execute(
        select(WorkspaceInvite)
        .where(
            WorkspaceInvite.org_id == org_id,
            WorkspaceInvite.accepted_at.is_(None),
        )
        .order_by(WorkspaceInvite.created_at.desc())
    ).scalars()
    return [r for r in rows if r.expires_at.replace(tzinfo=UTC if r.expires_at.tzinfo is None else r.expires_at.tzinfo) >= now]


def accept_invite(db: Session, token: str, *, password_hash: str | None, display_name: str) -> User:
    invite = db.execute(
        select(WorkspaceInvite).where(WorkspaceInvite.token == token)
    ).scalar_one_or_none()
    if invite is None:
        raise ValueError("Invalid invite token")
    if invite.accepted_at is not None:
        raise ValueError("Invite already accepted")
    expires = invite.expires_at
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=UTC)
    if expires < datetime.now(UTC):
        raise ValueError("Invite expired")

    existing = db.execute(select(User).where(User.email == invite.email)).scalar_one_or_none()
    if existing:
        if existing.org_id != invite.org_id:
            raise ValueError("Email already registered in another workspace")
        user = existing
    else:
        user = User(
            id=str(uuid.uuid4()),
            org_id=invite.org_id,
            email=invite.email,
            password_hash=password_hash,
            display_name=display_name or invite.email.split("@")[0],
            role=invite.role,
        )
        db.add(user)

    invite.accepted_at = datetime.now(UTC)
    db.commit()
    log_audit(
        db,
        org_id=invite.org_id,
        user_id=user.id,
        action="invite.accepted",
        resource_type="workspace_invite",
        resource_id=invite.id,
    )
    return user


def list_org_members(db: Session, org_id: str) -> list[User]:
    return list(
        db.execute(select(User).where(User.org_id == org_id).order_by(User.created_at)).scalars()
    )


def remove_member(db: Session, org_id: str, member_id: str, actor_id: str) -> None:
    member = db.get(User, member_id)
    if member is None or member.org_id != org_id:
        raise ValueError("Member not found")
    if member.id == actor_id:
        raise ValueError("Cannot remove yourself")
    owners = db.execute(
        select(User).where(User.org_id == org_id, User.role == "owner")
    ).scalars()
    owner_list = list(owners)
    if member.role == "owner" and len(owner_list) <= 1:
        raise ValueError("Cannot remove the last owner")
    db.delete(member)
    db.commit()
    log_audit(
        db,
        org_id=org_id,
        user_id=actor_id,
        action="member.removed",
        resource_type="user",
        resource_id=member_id,
    )


def update_member_role(db: Session, org_id: str, member_id: str, role: str, actor_id: str) -> User:
    if role not in ("owner", "member"):
        raise ValueError("Invalid role")
    member = db.get(User, member_id)
    if member is None or member.org_id != org_id:
        raise ValueError("Member not found")
    member.role = role
    db.commit()
    log_audit(
        db,
        org_id=org_id,
        user_id=actor_id,
        action="member.role_changed",
        resource_type="user",
        resource_id=member_id,
        metadata={"role": role},
    )
    return member


def member_storage_breakdown(db: Session, org_id: str) -> list[dict]:
    from sqlalchemy import func

    from app.models.source import Source

    rows = db.execute(
        select(
            Source.uploaded_by_user_id,
            func.coalesce(func.sum(Source.byte_size), 0),
            func.count(Source.id),
        )
        .where(Source.org_id == org_id)
        .group_by(Source.uploaded_by_user_id)
    ).all()
    members = {u.id: u for u in list_org_members(db, org_id)}
    out = []
    for user_id, total_bytes, count in rows:
        user = members.get(user_id)
        out.append(
            {
                "user_id": user_id,
                "email": user.email if user else None,
                "display_name": user.display_name if user else "Unknown",
                "storage_bytes": int(total_bytes or 0),
                "source_count": int(count or 0),
            }
        )
    return out
