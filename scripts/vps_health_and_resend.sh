#!/bin/bash
set -eu
cd /opt/ownnblm
docker compose -f docker-compose.vps.yml restart api
sleep 30
curl -sf --max-time 45 http://127.0.0.1:8010/health | head -c 300
echo ""
docker compose -f docker-compose.vps.yml exec -T api python -c "
from app.core.config import get_settings
from app.services.email import send_magic_link_email
s = get_settings()
print('resend_loaded', bool(s.resend_api_key))
ok = send_magic_link_email('delivered@resend.dev', 'https://frontend-jet-ten-16.vercel.app/login?magic_token=prod-test')
print('email_sent', ok)
"
