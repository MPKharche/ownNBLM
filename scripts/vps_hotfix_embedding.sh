#!/bin/bash
set -e
docker exec ownnblm-postgres-1 psql -U ownnblm -d ownnblm -c "ALTER TABLE chunks ALTER COLUMN embedding_ref TYPE TEXT;"
docker exec ownnblm-postgres-1 psql -U ownnblm -d ownnblm -c "UPDATE alembic_version SET version_num='003' WHERE version_num='002';"
docker cp /tmp/chunk.py ownnblm-api-1:/app/app/models/chunk.py 2>/dev/null || true
docker cp /tmp/ingest_runner.py ownnblm-api-1:/app/app/services/ingest_runner.py 2>/dev/null || true
docker compose -f /opt/ownnblm/docker-compose.vps.yml restart api
sleep 25
curl -sf http://127.0.0.1:8010/health | head -c 80
echo
