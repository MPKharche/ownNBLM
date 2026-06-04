#!/bin/bash
# Apply Alembic migrations on VPS Postgres (run from /opt/ownnblm)
set -e
cd /opt/ownnblm
docker compose -f docker-compose.vps.yml run --rm --no-deps api python -m alembic upgrade head
echo "VPS migrations complete."
