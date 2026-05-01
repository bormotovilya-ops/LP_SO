$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
Set-Location $repoRoot

Write-Host "==> Supabase CLI version"
npx supabase --version | Out-Host

Write-Host "==> Pushing migrations to linked project (non-interactive, may take several minutes)"
npx supabase db push --yes | Out-Host

Write-Host "==> Done"
