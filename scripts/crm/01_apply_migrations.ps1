$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
Set-Location $repoRoot

Write-Host "==> Проверка Supabase CLI"
npx supabase --version | Out-Host

Write-Host "==> Применение миграций в linked проект"
npx supabase db push | Out-Host

Write-Host "==> Готово"
