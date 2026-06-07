# Pause production: maintenance page on Vercel + stop VPS stack (data kept)
$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot

Write-Host "=== Pausing ownNBLM production (local-only mode) ===" -ForegroundColor Cyan

Set-Location $RepoRoot

# Keep live app config for resume
if (Test-Path "vercel.json") {
    $current = Get-Content "vercel.json" -Raw
    if ($current -match "195\.35\.6\.159|frontend/dist") {
        Copy-Item -Force vercel.json vercel.app.json
        Write-Host "Saved live config -> vercel.app.json"
    }
}

Copy-Item -Force vercel.pause.json vercel.json
Write-Host "Using vercel.pause.json (maintenance static site, no VPS proxy)"

if (-not (Get-Command npx -ErrorAction SilentlyContinue)) {
    Write-Warning "npx not found; commit vercel.json and push for Git-linked Vercel deploy."
} else {
    Write-Host "Deploying maintenance page to Vercel..."
    npx vercel deploy --prod --yes 2>&1 | Out-Host
}

Write-Host "Stopping VPS docker stack (volumes preserved)..."
ssh -o ConnectTimeout=20 -o BatchMode=yes root@195.35.6.159 "cd /opt/ownnblm 2>/dev/null && docker compose -f docker-compose.vps.yml down 2>&1 || echo 'VPS stack already stopped or path missing'"

Write-Host ""
Write-Host "Done." -ForegroundColor Green
Write-Host "  Public URL: maintenance page (no API)"
Write-Host "  Local dev:  README.md Quick start"
Write-Host "  Why:        docs/HOSTING.md"
