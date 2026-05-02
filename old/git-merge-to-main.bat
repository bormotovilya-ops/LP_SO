@echo off
setlocal enabledelayedexpansion

REM Сливает dev-crm в main и пушит origin main (для GitHub Pages).
REM Запуск из корня репо. При конфликте — ручной merge.

for /f "delims=" %%B in ('git rev-parse --abbrev-ref HEAD 2^>nul') do set "H=%%B"

if /i not "!H!"=="dev-crm" (
  echo Сейчас ветка: !H!  — переключитесь на dev-crm или поправьте скрипт.
  exit /b 1
)

echo [1/4] fetch...
git fetch origin
if errorlevel 1 exit /b 1

echo [2/4] checkout main и pull...
git checkout main
if errorlevel 1 exit /b 1
git pull origin main
if errorlevel 1 exit /b 1

echo [3/4] merge dev-crm -^> main...
git merge dev-crm -m "Merge dev-crm into main (GitHub Pages)"
if errorlevel 1 (
  echo Merge failed — разрешите конфликты вручную.
  exit /b 1
)

echo [4/4] push origin main...
git push origin main
if errorlevel 1 exit /b 1

echo.
echo OK: main обновлён, должен пойти Deploy to GitHub Pages.
echo Вернуться на dev-crm: git checkout dev-crm

git checkout dev-crm
if errorlevel 1 (
  echo Вернитесь вручную: git checkout dev-crm
  exit /b 1
)

exit /b 0
