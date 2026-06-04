#!/bin/bash
# Apply Alembic migrations on VPS Postgres (run from /opt/ownnblm)
set -e
cd /opt/ownnblm
docker compose -f docker-compose.vps.yml up -d postgres
echo "Waiting for Postgres..."
for i in $(seq 1 30); do
  if docker compose -f docker-compose.vps.yml exec -T postgres pg_isready -U ownnblm >/dev/null 2>&1; then
    break
  fi
  sleep 2
done
docker compose -f docker-compose.vps.yml run --rm api python -m alembic upgrade head
echo "VPS migrations complete."
