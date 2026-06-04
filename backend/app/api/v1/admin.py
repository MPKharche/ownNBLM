from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, EmailStr

from app.core.deps import DbSession, OwnerUser
from app.models.org import Org
from app.services.api_keys import create_api_key, list_api_keys, revoke_api_key, rotate_api_key
from app.services.audit import list_audit_events
from app.services.payments import billing_enabled, get_payment_provider
from app.services.invites import (
    create_invite,
    list_org_members,
    list_pending_invites,
    member_storage_breakdown,
    remove_member,
    update_member_role,
)
from app.services.provisioner import provision_dedicated_stack
from app.services.webhooks import create_webhook, delete_webhook, list_webhooks
from app.services.weekly_digest import send_weekly_digest

router = APIRouter()


class InviteRequest(BaseModel):
    email: EmailStr
    role: str = "member"


class MemberRoleUpdate(BaseModel):
    role: str


class ApiKeyCreate(BaseModel):
    name: str
    scope: str = "read_only"


class WebhookCreate(BaseModel):
    url: str
    events: list[str]


@router.get("/members")
def members(db: DbSession, user: OwnerUser):
    return [
        {
            "id": m.id,
            "email": m.email,
            "display_name": m.display_name,
            "role": m.role,
            "created_at": m.created_at.isoformat() if m.created_at else None,
        }
        for m in list_org_members(db, user.org_id)
    ]


@router.get("/members/storage")
def members_storage(db: DbSession, user: OwnerUser):
    return member_storage_breakdown(db, user.org_id)


@router.patch("/members/{member_id}")
def patch_member(member_id: str, body: MemberRoleUpdate, db: DbSession, user: OwnerUser):
    try:
        m = update_member_role(db, user.org_id, member_id, body.role, user.id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return {"id": m.id, "role": m.role}


@router.delete("/members/{member_id}")
def delete_member(member_id: str, db: DbSession, user: OwnerUser):
    try:
        remove_member(db, user.org_id, member_id, user.id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return {"ok": True}


@router.get("/invites")
def invites(db: DbSession, user: OwnerUser):
    return [
        {
            "id": i.id,
            "email": i.email,
            "role": i.role,
            "expires_at": i.expires_at.isoformat(),
        }
        for i in list_pending_invites(db, user.org_id)
    ]


@router.post("/invites")
def post_invite(body: InviteRequest, db: DbSession, user: OwnerUser):
    invite = create_invite(
        db,
        org_id=user.org_id,
        email=str(body.email),
        role=body.role,
        invited_by=user.id,
    )
    from app.core.config import get_settings

    settings = get_settings()
    return {
        "id": invite.id,
        "email": invite.email,
        "invite_url": f"{settings.frontend_url}/invite/{invite.token}",
    }


@router.get("/api-keys")
def api_keys(db: DbSession, user: OwnerUser):
    return [
        {
            "id": k.id,
            "name": k.name,
            "key_prefix": k.key_prefix,
            "scope": k.scope,
            "last_used_at": k.last_used_at.isoformat() if k.last_used_at else None,
            "created_at": k.created_at.isoformat() if k.created_at else None,
        }
        for k in list_api_keys(db, user.org_id)
    ]


@router.post("/api-keys")
def post_api_key(body: ApiKeyCreate, db: DbSession, user: OwnerUser):
    try:
        row, raw = create_api_key(
            db,
            org_id=user.org_id,
            name=body.name,
            scope=body.scope,
            created_by=user.id,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return {"id": row.id, "key_prefix": row.key_prefix, "scope": row.scope, "api_key": raw}


@router.delete("/api-keys/{key_id}")
def del_api_key(key_id: str, db: DbSession, user: OwnerUser):
    try:
        revoke_api_key(db, user.org_id, key_id, user.id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return {"ok": True}


@router.post("/api-keys/{key_id}/rotate")
def rotate_key(key_id: str, db: DbSession, user: OwnerUser):
    try:
        row, raw = rotate_api_key(db, user.org_id, key_id, user.id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return {"id": row.id, "api_key": raw}


@router.get("/audit")
def audit(db: DbSession, user: OwnerUser, limit: int = 100):
    return [
        {
            "id": e.id,
            "action": e.action,
            "resource_type": e.resource_type,
            "resource_id": e.resource_id,
            "user_id": e.user_id,
            "created_at": e.created_at.isoformat() if e.created_at else "",
        }
        for e in list_audit_events(db, user.org_id, limit=limit)
    ]


@router.post("/billing-portal")
def billing_portal(db: DbSession, user: OwnerUser):
    from app.core.config import get_settings

    if not billing_enabled():
        raise HTTPException(status_code=503, detail="Billing not configured (set Razorpay keys)")
    org = db.get(Org, user.org_id)
    if org is None:
        raise HTTPException(status_code=404)
    provider = get_payment_provider()
    if provider is None:
        raise HTTPException(status_code=503, detail="Billing provider unavailable")
    url = provider.create_portal_url(
        org_id=org.id,
        email=user.email,
        subscription_id=org.payment_subscription_id,
    )
    return {"portal_url": url or f"{get_settings().frontend_url}/billing"}


@router.get("/webhooks")
def get_webhooks(db: DbSession, user: OwnerUser):
    import json

    return [
        {
            "id": w.id,
            "url": w.url,
            "events": json.loads(w.events_json or "[]"),
            "enabled": w.enabled,
        }
        for w in list_webhooks(db, user.org_id)
    ]


@router.post("/webhooks")
def post_webhook(body: WebhookCreate, db: DbSession, user: OwnerUser):
    try:
        w = create_webhook(
            db,
            org_id=user.org_id,
            url=body.url,
            events=body.events,
            created_by=user.id,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return {"id": w.id, "url": w.url}


@router.delete("/webhooks/{webhook_id}")
def del_webhook(webhook_id: str, db: DbSession, user: OwnerUser):
    try:
        delete_webhook(db, user.org_id, webhook_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return {"ok": True}


@router.post("/provision-stack")
def provision_stack(db: DbSession, user: OwnerUser):
    org = db.get(Org, user.org_id)
    if org is None:
        raise HTTPException(status_code=404)
    try:
        org = provision_dedicated_stack(db, org, actor_id=user.id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return {
        "deployment_mode": org.deployment_mode,
        "dedicated_url": org.dedicated_url,
    }


@router.post("/digest/send")
def send_digest(db: DbSession, user: OwnerUser):
    count = send_weekly_digest(db, user.org_id)
    return {"sent": count}
