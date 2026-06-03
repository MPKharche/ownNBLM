"""Rate limit enforcement."""

import pytest
from fastapi import HTTPException

from app.core import rate_limit as rl


@pytest.fixture(autouse=True)
def clear_rate_buckets():
    rl._hits.clear()
    yield
    rl._hits.clear()


def test_enforce_blocks_after_limit():
    key = "auth:test-ip"
    for _ in range(rl.AUTH_LIMIT):
        rl._enforce(key, rl.AUTH_LIMIT)
    with pytest.raises(HTTPException) as exc:
        rl._enforce(key, rl.AUTH_LIMIT)
    assert exc.value.status_code == 429
