"""LLM burn cap unit tests."""

from decimal import Decimal

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import get_settings
from app.core.database import Base
from app.models.llm_spend import LlmSpendEvent
from app.models.org import Org
from app.services.llm_burn import (
    LLMBurnExceeded,
    assert_budget,
    budget_remaining,
    burn_status,
    estimate_chat_usd,
    record_spend,
)


@pytest.fixture
def db():
    get_settings.cache_clear()
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    session.add(Org(id="org-1", name="Test", slug="test", tier="free"))
    session.commit()
    yield session
    session.close()
    get_settings.cache_clear()


@pytest.fixture
def burn_settings(monkeypatch):
    monkeypatch.setenv("LLM_BUDGET_ENABLED", "true")
    monkeypatch.setenv("LLM_BUDGET_USD", "0.005")
    monkeypatch.setenv("LLM_BUDGET_WINDOW_HOURS", "48")
    monkeypatch.setenv("LLM_BUDGET_SCOPE", "global")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def test_estimate_chat_usd():
    cost = estimate_chat_usd(1000, 500)
    assert cost > Decimal("0")
    assert cost < Decimal("0.01")


def test_budget_blocks_when_exceeded(db, burn_settings):
    record_spend(
        db,
        "org-1",
        Decimal("0.0049"),
        kind="chat",
        model="openai/gpt-4o-mini",
    )
    db.commit()
    assert budget_remaining(db, "org-1") < Decimal("0.001")
    with pytest.raises(LLMBurnExceeded):
        assert_budget(db, "org-1", Decimal("0.002"))


def test_burn_status_shape(db, burn_settings):
    record_spend(db, "org-1", Decimal("0.001"), kind="embed", model="embed")
    db.commit()
    status = burn_status(db, "org-1")
    assert status["enabled"] is True
    assert status["budget_usd"] == "0.005"
    assert Decimal(status["spent_usd"]) == Decimal("0.001")
    assert status["usage_percent"] == 20
