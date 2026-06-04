"""Payment provider interface."""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any


class PaymentProvider(ABC):
    name: str

    @abstractmethod
    def create_checkout(self, *, org_id: str, plan: str, email: str, org_name: str) -> str:
        """Return URL to redirect user for payment."""

    @abstractmethod
    def create_portal_url(self, *, org_id: str, email: str, subscription_id: str | None) -> str | None:
        """Return URL for subscription management, or None if in-app only."""

    @abstractmethod
    def verify_webhook(self, body: bytes, signature: str) -> dict[str, Any]:
        """Verify webhook signature and return parsed event payload."""

    @abstractmethod
    def handle_webhook_event(self, db, event: dict[str, Any]) -> None:
        """Apply subscription tier changes from webhook."""
