# Resume production: restore app vercel.json + start VPS stack
$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot

Write-Host "=== Resuming ownNBLM production ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "Full checklist: docs/PROD_RESUME.md"
Write-Host ""
Write-Host "1. Local migrate (optional sanity):  powershell -File scripts/migrate.ps1"
Write-Host "2. Commit/push hardening to main, then on VPS:"
Write-Host "     ssh root@195.35.6.159 'bash /opt/ownnblm/scripts/vps_restart_api.sh'"
Write-Host "   (pull + alembic upgrade + restart API)"
Write-Host "3. Vercel app (not maintenance):"
Write-Host "     Copy-Item vercel.app.json vercel.json"
Write-Host "     cd frontend; npx vercel deploy --prod"
Write-Host "4. VPS .env: set RESEND_API_KEY (magic link email). Razorpay: PENDING — see docs/BILLING_RAZORPAY.md"
Write-Host "5. Smoke: powershell -File scripts/e2e_prod_smoke.ps1"
