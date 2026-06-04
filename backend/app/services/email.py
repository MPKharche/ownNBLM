"""Transactional email — Resend in production, dev log fallback."""

from __future__ import annotations

import structlog
import httpx

from app.core.config import get_settings

logger = structlog.get_logger()


def send_email(*, to: str, subject: str, html: str) -> bool:
    settings = get_settings()
    if settings.resend_api_key:
        try:
            resp = httpx.post(
                "https://api.resend.com/emails",
                headers={"Authorization": f"Bearer {settings.resend_api_key}"},
                json={
                    "from": settings.digest_from_email,
                    "to": [to],
                    "subject": subject,
                    "html": html,
                },
                timeout=15.0,
            )
            resp.raise_for_status()
            return True
        except Exception as exc:
            logger.warning("resend_failed", to=to, error=str(exc))
            return False
    logger.info("email_dev", to=to, subject=subject)
    return True


def send_magic_link_email(to: str, link: str) -> bool:
    return send_email(
        to=to,
        subject="Sign in to ownNBLM",
        html=f'<p>Click to sign in (expires in 15 minutes):</p><p><a href="{link}">{link}</a></p>',
    )
