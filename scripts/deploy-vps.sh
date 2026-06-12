#!/usr/bin/env bash
# deploy-vps.sh — Deploy ownNBLM full stack to VPS at lm.planetfinance.cloud
# Usage: ./scripts/deploy-vps.sh [VPS_USER@VPS_HOST]
# Default host: 195.35.6.159
set -euo pipefail

VPS="${1:-root@195.35.6.159}"
REMOTE_DIR="/opt/ownnblm"
COMPOSE_FILE="docker-compose.full.yml"

echo "==> Deploying to $VPS:$REMOTE_DIR"

# ── 1. Ensure remote directory exists ──
ssh "$VPS" "mkdir -p $REMOTE_DIR"

# ── 2. Sync project files (exclude heavy dev artifacts) ──
rsync -az --progress \
  --exclude='.git' \
  --exclude='node_modules' \
  --exclude='frontend/node_modules' \
  --exclude='frontend/dist' \
  --exclude='backend/__pycache__' \
  --exclude='backend/*.egg-info' \
  --exclude='backend/ownNBLM.db' \
  --exclude='.env' \
  ./ "$VPS:$REMOTE_DIR/"

# ── 3. Ensure .env exists on VPS ──
if ! ssh "$VPS" "test -f $REMOTE_DIR/.env"; then
  echo ""
  echo "ERROR: $REMOTE_DIR/.env not found on the VPS."
  echo "Copy .env.vps to the VPS first:"
  echo "  scp .env.vps $VPS:$REMOTE_DIR/.env"
  echo "  ssh $VPS 'nano $REMOTE_DIR/.env'  # fill in secrets"
  echo ""
  exit 1
fi

# ── 4. Build and restart containers ──
ssh "$VPS" "cd $REMOTE_DIR && docker compose -f $COMPOSE_FILE pull --ignore-buildable && docker compose -f $COMPOSE_FILE build --no-cache && docker compose -f $COMPOSE_FILE up -d --remove-orphans"

# ── 5. Wait for API health ──
echo "==> Waiting for API to become healthy..."
for i in $(seq 1 30); do
  if ssh "$VPS" "curl -sf http://localhost:8000/health > /dev/null 2>&1"; then
    echo "==> API is healthy"
    break
  fi
  echo "   attempt $i/30..."
  sleep 3
done

echo ""
echo "==> Deployment complete!"
echo "    https://lm.planetfinance.cloud"
echo "    API docs: https://lm.planetfinance.cloud/docs"
