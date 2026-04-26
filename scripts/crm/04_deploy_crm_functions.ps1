$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
Set-Location $repoRoot

function Invoke-FunctionDeploy {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [int]$Attempts = 3
  )
  for ($i = 1; $i -le $Attempts; $i++) {
    npx supabase functions deploy $Name
    if ($LASTEXITCODE -eq 0) { return }
    if ($i -lt $Attempts) {
      Write-Host "==> Retrying deploy $Name ($($i + 1)/$Attempts) after network error..." -ForegroundColor Yellow
      Start-Sleep -Seconds 8
    }
  }
  throw "supabase functions deploy $Name failed after $Attempts attempt(s) (last exit: $LASTEXITCODE)"
}

Write-Host "==> Deploy crm-lead-upsert"
Invoke-FunctionDeploy "crm-lead-upsert"

Write-Host "==> Deploy crm-bot-event"
Invoke-FunctionDeploy "crm-bot-event"

Write-Host "==> Deploy updated telegram-webhook"
Invoke-FunctionDeploy "telegram-webhook"

Write-Host "==> Function deploy: OK"
