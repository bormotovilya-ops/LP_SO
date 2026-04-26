# Mini-CRM: remote Supabase - migrations, optional deploy/seed/smoke.
# Prereq: npx supabase login, then npx supabase link --project-ref YOUR_PROJECT_REF
# If db query/push --linked fails with "IPv6 is not supported": direct host db.<ref>.supabase.co
# is IPv6-only; set SUPABASE_DB_URL to the pooler URI from Dashboard (Connect).
# Transaction pooler (port 6543) and db push: need statement_cache_mode=describe (appended below if missing;
# see https://github.com/supabase/cli/pull/162 ) — otherwise "prepared statement already exists" (42P05).
# Or use Session pooler (port 5432) in Connect for migrations. Password in URL may need percent-encoding.
# In PowerShell always pass "...\?a=1&b=2" in double quotes — bare & splits the command.
# Edge functions need: npx supabase secrets set SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=...
# Seed (02) needs at least one public.crm_profiles row (admin or manager). See docs/mini-crm-structure.md
#
# Examples:
#   .\00_run_crm_in_supabase.ps1
#   .\00_run_crm_in_supabase.ps1 -All
#   .\00_run_crm_in_supabase.ps1 -SkipMigrations -DeployFunctions
param(
  [switch]$All,
  [switch]$SkipMigrations,
  [switch]$DeployFunctions,
  [switch]$Seed,
  [switch]$Smoke
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
Set-Location $repoRoot

if ($All) {
  $DeployFunctions = $true
  $Seed = $true
  $Smoke = $true
}

Write-Host "==> Supabase CLI" -ForegroundColor Cyan
npx supabase --version | Out-Host

$poolerUrl = $env:SUPABASE_DB_URL
$poolerUrlForDb = $poolerUrl
if ($poolerUrlForDb -and
    $poolerUrlForDb -match 'pooler\.supabase\.com' -and
    $poolerUrlForDb -notmatch 'statement_cache_mode=') {
  $sep = $(if ($poolerUrlForDb -match '\?') { '&' } else { '?' })
  $poolerUrlForDb = $poolerUrlForDb + $sep + 'statement_cache_mode=describe'
  Write-Host "==> Appended statement_cache_mode=describe for pooler+CLI" -ForegroundColor DarkGray
}
if ($poolerUrl) {
  Write-Host "==> DB: using SUPABASE_DB_URL (pooler, IPv4-friendly)" -ForegroundColor Cyan
} else {
  Write-Host "==> DB: using supabase link / --linked (direct db.* host, IPv6; may fail on some networks)" -ForegroundColor Yellow
}

if (-not $SkipMigrations) {
  if ($poolerUrlForDb) {
    Write-Host "==> Migrations: db push --db-url" -ForegroundColor Cyan
    npx supabase db push --db-url "$poolerUrlForDb" --yes | Out-Host
  } else {
    Write-Host "==> Migrations: db push (linked remote)" -ForegroundColor Cyan
    npx supabase db push --yes | Out-Host
  }
} else {
  Write-Host "==> Migrations skipped (-SkipMigrations)" -ForegroundColor Yellow
}

if ($DeployFunctions) {
  & (Join-Path $PSScriptRoot "04_deploy_crm_functions.ps1")
}

if ($Seed) {
  $seedFile = Join-Path $PSScriptRoot "02_seed_demo_data.sql"
  Write-Host "==> Seed demo: $seedFile" -ForegroundColor Cyan
  if ($poolerUrlForDb) {
    npx supabase db query --db-url "$poolerUrlForDb" -f $seedFile --agent no -o table | Out-Host
  } else {
    npx supabase db query --linked -f $seedFile --agent no -o table | Out-Host
  }
}

if ($Smoke) {
  $smokeFile = Join-Path $PSScriptRoot "03_smoke_checks.sql"
  Write-Host "==> Smoke checks: $smokeFile" -ForegroundColor Cyan
  if ($poolerUrlForDb) {
    npx supabase db query --db-url "$poolerUrlForDb" -f $smokeFile --agent no -o table | Out-Host
  } else {
    npx supabase db query --linked -f $smokeFile --agent no -o table | Out-Host
  }
}

Write-Host "==> Done" -ForegroundColor Green
