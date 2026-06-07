#!/bin/bash
# Repair partial prod schema + stamp Alembic to head (run on VPS: bash scripts/vps_repair_schema.sh)
set -e
cd /opt/ownnblm
COMPOSE="docker compose -f docker-compose.vps.yml"
PSQL="$COMPOSE exec -T postgres psql -U ownnblm -d ownnblm -v ON_ERROR_STOP=1"

run_sql() {
  $PSQL -c "$1"
}

has_column() {
  local table=$1 col=$2
  $PSQL -t -A -c \
    "SELECT 1 FROM information_schema.columns WHERE table_name='$table' AND column_name='$col' LIMIT 1;" \
    | grep -q 1
}

has_table() {
  local table=$1
  $PSQL -t -A -c \
    "SELECT 1 FROM information_schema.tables WHERE table_name='$table' LIMIT 1;" \
    | grep -q 1
}

echo "=== Repair orgs / sources columns ==="
has_column orgs stripe_customer_id || run_sql "ALTER TABLE orgs ADD COLUMN stripe_customer_id VARCHAR(255);"
has_column orgs deployment_mode || run_sql "ALTER TABLE orgs ADD COLUMN deployment_mode VARCHAR(32) NOT NULL DEFAULT 'shared';"
has_column orgs dedicated_url || run_sql "ALTER TABLE orgs ADD COLUMN dedicated_url VARCHAR(512);"
has_column orgs payment_provider || run_sql "ALTER TABLE orgs ADD COLUMN payment_provider VARCHAR(32);"
has_column orgs razorpay_customer_id || run_sql "ALTER TABLE orgs ADD COLUMN razorpay_customer_id VARCHAR(64);"
has_column orgs payment_subscription_id || run_sql "ALTER TABLE orgs ADD COLUMN payment_subscription_id VARCHAR(64);"
has_column sources is_private || run_sql "ALTER TABLE sources ADD COLUMN is_private BOOLEAN NOT NULL DEFAULT false;"
has_column sources uploaded_by_user_id || run_sql "ALTER TABLE sources ADD COLUMN uploaded_by_user_id VARCHAR(36) REFERENCES users(id);"

has_table watched_folders || run_sql "CREATE TABLE watched_folders (
  id VARCHAR(36) PRIMARY KEY,
  org_id VARCHAR(36) NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  path VARCHAR(1024) NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_by VARCHAR(36) REFERENCES users(id),
  last_scan_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);"
has_table watched_folders && run_sql "CREATE INDEX IF NOT EXISTS ix_watched_folders_org_id ON watched_folders(org_id);" || true

echo "=== Stamp Alembic 006 ==="
$COMPOSE exec -T api python -m alembic stamp 006

echo "=== Verify upgrade head (no-op expected) ==="
bash scripts/vps_migrate.sh

echo "=== Restart API ==="
$COMPOSE up -d --force-recreate api
sleep 20
curl -sf --max-time 30 http://127.0.0.1:8010/health
echo
echo "Repair complete."
