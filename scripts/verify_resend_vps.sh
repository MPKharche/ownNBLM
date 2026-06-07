#!/bin/bash
set -eu
cd /opt/ownnblm
docker compose -f docker-compose.vps.yml exec -T api python <<'PY'
from app.core.config import get_settings
from app.services.email import send_magic_link_email

s = get_settings()
assert s.resend_api_key, "RESEND_API_KEY missing in container"
ok = send_magic_link_email("delivered@resend.dev", "https://frontend-jet-ten-16.vercel.app/login?magic_token=verify")
print("resend_ok", ok)
PY
