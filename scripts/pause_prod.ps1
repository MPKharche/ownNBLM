# Pause production: maintenance page on Vercel + stop VPS stack (data kept)
$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot

Write-Host "=== Pausing ownNBLM production ===" -ForegroundColor Cyan

Set-Location $RepoRoot
if (Get-Command git -ErrorAction SilentlyContinue) {
    git add vercel.json pause-site ROADMAP.md scripts/pause_prod.ps1 scripts/unpause_prod.ps1 2>$null
}

Write-Host "Deploy maintenance page to Vercel (root vercel.json -> pause-site)..."
Set-Location $RepoRoot
if (-not (Get-Command npx -ErrorAction SilentlyContinue)) {
    Write-Warning "npx not found; push to main for GitHub-linked Vercel deploy instead."
} else {
    npx vercel deploy --prod --yes 2>&1 | Out-Host
}

Write-Host "Stopping VPS docker stack (volumes preserved)..."
ssh -o BatchMode=yes root@195.35.6.159 "cd /opt/ownnblm && docker compose -f docker-compose.vps.yml down 2>&1"

Write-Host "Done. Site should show maintenance; API on 195.35.6.159:8010 is stopped." -ForegroundColor Green
