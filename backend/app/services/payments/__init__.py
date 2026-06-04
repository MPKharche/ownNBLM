"""Payment providers — Razorpay (default, India + global cards), Stripe optional."""

from app.core.config import get_settings
from app.services.payments.base import PaymentProvider
from app.services.payments.razorpay_provider import RazorpayProvider
from app.services.payments.stripe_provider import StripeProvider


def get_payment_provider() -> PaymentProvider | None:
    settings = get_settings()
    if settings.payment_provider == "razorpay" and settings.razorpay_key_id:
        return RazorpayProvider()
    if settings.payment_provider == "stripe" and settings.stripe_secret_key:
        return StripeProvider()
    if settings.razorpay_key_id:
        return RazorpayProvider()
    if settings.stripe_secret_key:
        return StripeProvider()
    return None


def billing_enabled() -> bool:
    return get_payment_provider() is not None
