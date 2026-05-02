@echo off
setlocal enabledelayedexpansion

REM Всё уходит в main: коммит (если есть), merge текущей ветки ^-> main, push origin main, возврат на ветку.
REM Запуск из корня репозитория.
REM   git-push-main.bat          ^(спросит комментарий к версии в консоли^)
REM   git-push-main.bat "сообщение коммита"  ^(без запроса^)

set "MSG=%~1"
if "%MSG%"=="" (
  set /p "MSG=Комментарий к версии ^(commit message^): "
  if "!MSG!"=="" set "MSG=Update project files"
)

git rev-parse --is-inside-work-tree >nul 2>&1
if errorlevel 1 (
  echo Не git-репозиторий.
  exit /b 1
)

for /f "delims=" %%B in ('git rev-parse --abbrev-ref HEAD 2^>nul') do set "START=%%B"
set "HAD_CHANGES=0"

echo [1/5] git add...
git add -A
if errorlevel 1 exit /b 1

git diff --cached --quiet
if errorlevel 1 (
  set "HAD_CHANGES=1"
  echo [2/5] commit: %MSG%
  git commit -m "%MSG%"
  if errorlevel 1 (
    echo Commit failed.
    exit /b 1
  )
) else (
  echo [2/5] Нет незакоммиченных изменений, пропускаю commit.
)

if /i "!START!"=="main" (
  echo [3/5] pull main, затем push origin main ^(GitHub Pages^)...
  git pull origin main
  if errorlevel 1 ( echo pull failed. & exit /b 1 )
  git push -u origin main
  if errorlevel 1 ( echo Push failed. & exit /b 1 )
  echo.
  echo OK: origin/main обновлён.
  exit /b 0
)

echo [3/5] fetch...
git fetch origin
if errorlevel 1 exit /b 1

echo [4/5] merge !START! -^> main...
git checkout main
if errorlevel 1 exit /b 1
git pull origin main
if errorlevel 1 (
  git checkout "!START!"
  exit /b 1
)
git merge "!START!" -m "Merge !START! into main"
if errorlevel 1 (
  echo.
  echo Конфликт merge. Откат и возврат на !START!
  git merge --abort 2>nul
  git checkout "!START!"
  exit /b 1
)

echo [5/5] push origin main...
git push origin main
if errorlevel 1 (
  git checkout "!START!"
  exit /b 1
)

git checkout "!START!"

echo.
if "!HAD_CHANGES!"=="1" (
  echo Пушните ветку !START! при необходимости: git push -u origin !START!
) else (
  echo Ветка !START! вроде смержена в main. При необходимости: git push -u origin !START!
)
echo OK: main на origin обновлён, GitHub Pages должен собрать main.
echo Текущая ветка: !START!
exit /b 0
