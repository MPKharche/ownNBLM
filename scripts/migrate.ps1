# Run Alembic migrations (local or same DB as DATABASE_URL in .env)
$ErrorActionPreference = "Stop"
$Backend = Join-Path (Split-Path -Parent $PSScriptRoot) "backend"
Push-Location $Backend
try {
    python -m alembic upgrade head
    Write-Host "Migrations applied (revision head)." -ForegroundColor Green
} finally {
    Pop-Location
}
