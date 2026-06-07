#!/bin/bash
# Wipe all corpus rows and reset session source links (run on VPS from /opt/ownnblm)
set -e
cd /opt/ownnblm
COMPOSE="docker compose -f docker-compose.vps.yml"

echo "Sources before:"
$COMPOSE exec -T postgres psql -U ownnblm -d ownnblm -t -c "SELECT count(*) FROM sources;"

$COMPOSE exec -T postgres psql -U ownnblm -d ownnblm -v ON_ERROR_STOP=1 <<'SQL'
DELETE FROM chunks;
DELETE FROM documents;
DELETE FROM sources;
DELETE FROM watched_folders;
UPDATE workspace_usage SET storage_bytes = 0;
UPDATE sessions SET source_ids_json = '[]' WHERE source_ids_json IS NOT NULL AND source_ids_json <> '[]';
SQL

echo "Sources after:"
$COMPOSE exec -T postgres psql -U ownnblm -d ownnblm -t -c "SELECT count(*) FROM sources;"

$COMPOSE exec -T api sh -c 'rm -rf /app/data/uploads/* 2>/dev/null || true'
echo "Corpus wipe done."
