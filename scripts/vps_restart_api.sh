#!/bin/bash
set -e
cd /opt/ownnblm
git pull origin main
docker rm -f ownnblm-api-1 2>/dev/null || true
docker compose -f docker-compose.vps.yml up -d api
sleep 90
curl -sf --max-time 30 http://127.0.0.1:8010/health
echo
