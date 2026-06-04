# Production smoke test — Vercel frontend + proxied API
$Base = "https://frontend-jet-ten-16.vercel.app"
$Email = "admin@ownnblm.local"
$Password = "admin123"
$Failed = 0

function Assert-Ok($cond, $msg) {
  if (-not $cond) { Write-Host "FAIL: $msg" -ForegroundColor Red; $script:Failed++ }
  else { Write-Host "OK: $msg" -ForegroundColor Green }
}

Write-Host "=== ownNBLM prod smoke ===" 
$health = Invoke-RestMethod -Uri "$Base/health" -TimeoutSec 90
Assert-Ok ($health.status -eq "ok") "GET /health"
Assert-Ok ($health.checks.database -eq "ok") "health.database"

$loginBody = @{ email = $Email; password = $Password } | ConvertTo-Json
$auth = Invoke-RestMethod -Uri "$Base/api/v1/auth/login" -Method POST -ContentType "application/json" -Body $loginBody -TimeoutSec 30
Assert-Ok ($auth.access_token) "POST /auth/login"
$hdr = @{ Authorization = "Bearer $($auth.access_token)" }

$sessions = Invoke-RestMethod -Uri "$Base/api/v1/sessions" -Headers $hdr -TimeoutSec 30
Assert-Ok ($null -ne $sessions) "GET /sessions"

$sources = Invoke-RestMethod -Uri "$Base/api/v1/sources" -Headers $hdr -TimeoutSec 30
Assert-Ok ($null -ne $sources) "GET /sources"

$usage = Invoke-RestMethod -Uri "$Base/api/v1/usage/dashboard" -Headers $hdr -TimeoutSec 30
Assert-Ok ($usage.query_limit -gt 0) "GET /usage/dashboard"

$plans = Invoke-RestMethod -Uri "$Base/api/v1/billing/plans" -Headers $hdr -TimeoutSec 30
Assert-Ok ($plans.plans.Count -ge 1) "GET /billing/plans"

$session = Invoke-RestMethod -Uri "$Base/api/v1/sessions" -Method POST -Headers $hdr -ContentType "application/json" -Body '{"title":"Smoke test","source_ids":[]}' -TimeoutSec 30
Assert-Ok ($session.id) "POST /sessions"

$chat = Invoke-WebRequest -Uri "$Base/api/v1/sessions/$($session.id)/chat" -Method POST -Headers $hdr -ContentType "application/json" -Body '{"message":"Hi"}' -TimeoutSec 180
Assert-Ok ($chat.StatusCode -eq 200) "POST /sessions/{id}/chat (SSE)"

if ($Failed -gt 0) { exit 1 }
Write-Host "All smoke checks passed."
