# Test Resend + prod magic-link. Set $env:RESEND_TEST_TO to your Resend account email.
$ErrorActionPreference = "Stop"
$To = $env:RESEND_TEST_TO
if (-not $To) {
  Write-Host "Set RESEND_TEST_TO to the inbox Resend allows (your Resend signup email)." -ForegroundColor Yellow
  exit 1
}

$Base = $env:PROD_BASE_URL
if (-not $Base) { $Base = "https://frontend-jet-ten-16.vercel.app" }

Write-Host "=== Magic link via $Base ===" -ForegroundColor Cyan
$body = @{ email = $To } | ConvertTo-Json
$r = Invoke-RestMethod -Uri "$Base/api/v1/auth/magic-link" -Method POST -ContentType "application/json" -Body $body -TimeoutSec 60
if ($r.sent) {
  Write-Host "OK: Resend accepted send to $To — check inbox (and spam)." -ForegroundColor Green
} else {
  Write-Host "FAIL: sent=false — $($r.detail)" -ForegroundColor Red
  exit 1
}
