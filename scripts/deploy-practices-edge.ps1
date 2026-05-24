# Деплой Edge Functions для сборника «Свобода от долгов».
# Один раз: npx supabase@2.101.0 login
# Затем: .\scripts\deploy-practices-edge.ps1

$ErrorActionPreference = "Stop"
$ProjectRef = "vvkjfaxlzlmeobgitxdj"
# 2.20.x не парсит актуальный supabase/config.toml в репозитории
$SupabasePkg = "supabase@2.101.0"

Set-Location (Join-Path $PSScriptRoot "..")

function Invoke-SupabaseCli {
  param([Parameter(Mandatory = $true)][string[]]$Command)
  # Не использовать имя $args — в PowerShell это встроенная переменная скрипта.
  & npx $SupabasePkg @Command
  if ($LASTEXITCODE -ne 0) {
    throw "supabase $($Command -join ' ') failed (exit $LASTEXITCODE)"
  }
}

Write-Host "=== Deploy practices edge functions (project $ProjectRef) ===" -ForegroundColor Cyan

Invoke-SupabaseCli @("--version")

Write-Host "[1/4] practices-config (no JWT)" -ForegroundColor Yellow
Invoke-SupabaseCli @(
  "functions", "deploy", "practices-config",
  "--project-ref", $ProjectRef,
  "--no-verify-jwt"
)

Write-Host "[2/4] practices-channel-invite (no JWT)" -ForegroundColor Yellow
Invoke-SupabaseCli @(
  "functions", "deploy", "practices-channel-invite",
  "--project-ref", $ProjectRef,
  "--no-verify-jwt"
)

Write-Host "[3/4] telegram-webhook (no JWT)" -ForegroundColor Yellow
Invoke-SupabaseCli @(
  "functions", "deploy", "telegram-webhook",
  "--project-ref", $ProjectRef,
  "--no-verify-jwt"
)

Write-Host "[4/4] payment-init" -ForegroundColor Yellow
Invoke-SupabaseCli @(
  "functions", "deploy", "payment-init",
  "--project-ref", $ProjectRef
)

Write-Host ""
Write-Host "OK. Проверьте Secrets в Dashboard:" -ForegroundColor Green
Write-Host "  TELEGRAM_BOT_TOKEN"
Write-Host "  TELEGRAM_PRACTICES_CHANNEL_ID=-1003454870164"
Write-Host "  PUBLIC_SITE_URL=https://<ваш-домен>"
Write-Host "  PRACTICES_AMOUNT_KOPECKS=500   # тест 5 ₽; прод: 499000"
Write-Host "  TOCHKA_* / PAYMENT_PROVIDER (как раньше)"
