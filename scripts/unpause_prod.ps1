# Resume production: restore app vercel.json + start VPS stack
$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot

Write-Host "=== Resuming ownNBLM production ===" -ForegroundColor Cyan
Write-Host "Copy saved app config, then deploy:"
Write-Host "  Copy-Item vercel.app.json vercel.json"
Write-Host "  ssh root@195.35.6.159 'bash /opt/ownnblm/scripts/vps_restart_api.sh'"
Write-Host "  cd frontend && npx vercel deploy --prod"
Write-Host "  powershell -File scripts/e2e_prod_smoke.ps1"
