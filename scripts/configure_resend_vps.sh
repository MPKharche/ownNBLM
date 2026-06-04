#!/bin/bash
# One-time: set Resend on VPS .env (pass key as first argument). Do not commit keys.
set -eu
KEY="${1:?Usage: configure_resend_vps.sh re_...}"
cd /opt/ownnblm
touch .env
if grep -q '^RESEND_API_KEY=' .env; then
  sed -i "s|^RESEND_API_KEY=.*|RESEND_API_KEY=${KEY}|" .env
else
  printf 'RESEND_API_KEY=%s\n' "$KEY" >> .env
fi
if grep -q '^DIGEST_FROM_EMAIL=' .env; then
  sed -i 's|^DIGEST_FROM_EMAIL=.*|DIGEST_FROM_EMAIL=ownNBLM <onboarding@resend.dev>|' .env
else
  echo 'DIGEST_FROM_EMAIL=ownNBLM <onboarding@resend.dev>' >> .env
fi
docker compose -f docker-compose.vps.yml up -d api --force-recreate
sleep 15
docker compose -f docker-compose.vps.yml exec -T api python -c "
from app.core.config import get_settings
s = get_settings()
assert s.resend_api_key, 'RESEND_API_KEY not loaded'
print('ok resend configured, from=', s.digest_from_email)
"
