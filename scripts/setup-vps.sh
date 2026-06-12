#!/usr/bin/env bash
# setup-vps.sh — One-time VPS bootstrap (Docker, firewall, swap)
# Run as root on the VPS: bash setup-vps.sh
set -euo pipefail

echo "==> Installing Docker..."
if ! command -v docker &>/dev/null; then
  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker
fi

echo "==> Installing Docker Compose plugin..."
docker compose version 2>/dev/null || apt-get install -y docker-compose-plugin

echo "==> Configuring firewall (ufw)..."
if command -v ufw &>/dev/null; then
  ufw allow 22/tcp   comment 'SSH'
  ufw allow 80/tcp   comment 'HTTP (Caddy redirect)'
  ufw allow 443/tcp  comment 'HTTPS'
  ufw --force enable
fi

echo "==> Adding 2 GB swap (skip if already present)..."
if [ ! -f /swapfile ]; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo "==> Creating app directory..."
mkdir -p /opt/ownnblm

echo ""
echo "==> VPS ready. Next steps:"
echo "   1. scp .env.vps root@<VPS>:/opt/ownnblm/.env"
echo "   2. Edit /opt/ownnblm/.env — fill in SECRET_KEY, POSTGRES_PASSWORD, API keys"
echo "   3. Run ./scripts/deploy-vps.sh from your local machine"
