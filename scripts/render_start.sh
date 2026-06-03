#!/bin/sh
set -e
cd "$(dirname "$0")/../backend"
python -m alembic upgrade head
python -m app.seed || true
exec python -m uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"
