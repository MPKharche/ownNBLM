#!/bin/bash
set -e
API=http://127.0.0.1:8010
TOKEN=$(curl -sf -X POST "$API/api/v1/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@ownnblm.local","password":"admin123"}' \
  | python3 -c 'import sys,json; print(json.load(sys.stdin)["access_token"])')
printf 'Sample corpus line for ingest smoke test.\n' > /tmp/ownnblm-ingest.txt
UPLOAD=$(curl -sf -X POST "$API/api/v1/sources" \
  -H "Authorization: Bearer $TOKEN" \
  -F 'file=@/tmp/ownnblm-ingest.txt')
echo "upload: $UPLOAD"
SID=$(echo "$UPLOAD" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])')
for _ in $(seq 1 20); do
  ROW=$(curl -sf "$API/api/v1/sources" -H "Authorization: Bearer $TOKEN" \
    | python3 -c "import sys,json; d=json.load(sys.stdin); s=[x for x in d if x['id']=='$SID'][0]; print(s['status'])")
  echo "status=$ROW"
  if [ "$ROW" = indexed ]; then
    echo "INGEST_OK"
    exit 0
  fi
  if [ "$ROW" = error ]; then
    echo "INGEST_ERROR"
    curl -sf "$API/api/v1/sources" -H "Authorization: Bearer $TOKEN"
    exit 1
  fi
  sleep 3
done
echo "INGEST_TIMEOUT"
exit 1
