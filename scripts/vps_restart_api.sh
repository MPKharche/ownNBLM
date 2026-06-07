#!/bin/bash
set -e
cd /opt/ownnblm
git pull origin main
bash scripts/vps_migrate.sh
docker compose -f docker-compose.vps.yml build api
docker compose -f docker-compose.vps.yml up -d --force-recreate api
sleep 90
curl -sf --max-time 30 http://127.0.0.1:8010/health
echo
