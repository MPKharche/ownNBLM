# Validate Portainer connectivity for Business-tier dedicated stacks
$ErrorActionPreference = "Stop"
$envFile = Join-Path (Split-Path $PSScriptRoot -Parent) ".env"
if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
        if ($_ -match '^\s*([^#][^=]+)=(.*)$') {
            [Environment]::SetEnvironmentVariable($matches[1].Trim(), $matches[2].Trim(), "Process")
        }
    }
}
$url = $env:PORTAINER_URL
$key = $env:PORTAINER_API_KEY
if (-not $url -or -not $key) {
    Write-Host "SKIP: PORTAINER_URL or PORTAINER_API_KEY not set in .env"
    exit 0
}
$headers = @{ "X-API-Key" = $key }
try {
    $status = Invoke-RestMethod -Uri "$($url.TrimEnd('/'))/api/status" -Headers $headers -TimeoutSec 15
    Write-Host "OK: Portainer reachable — version $($status.Version)"
    exit 0
} catch {
    Write-Host "FAIL: $($_.Exception.Message)"
    exit 1
}
