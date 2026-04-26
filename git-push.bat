@echo off
setlocal enabledelayedexpansion

REM Usage:
REM   git-push.bat "your commit message"
REM If message is omitted, default one will be used.
REM GitHub Pages собирает только main. Пока вы на dev-crm — пуш идёт в dev-crm.
REM Чтобы выложить на сайт: git-merge-to-main.bat (создаёт main с merge dev-crm).
REM Коммит всегда в ТЕКУЩУЮ ветку. На main — пуш в origin/main; иначе — пуш ветки + подсказка.

set "MSG=%~1"
if "%MSG%"=="" set "MSG=Update project files"

echo [1/4] Checking git...
git rev-parse --is-inside-work-tree >nul 2>&1
if errorlevel 1 (
  echo This folder is not a git repository.
  exit /b 1
)

echo [2/4] Staging changes...
git add .
if errorlevel 1 (
  echo Failed to stage files.
  exit /b 1
)

git diff --cached --quiet
if not errorlevel 1 (
  echo No staged changes to commit.
  exit /b 0
)

echo [3/4] Creating commit...
git commit -m "%MSG%"
if errorlevel 1 (
  echo Commit failed.
  exit /b 1
)

echo [4/4] Pushing to remote...
for /f "delims=" %%B in ('git rev-parse --abbrev-ref HEAD 2^>nul') do set "GBR=%%B"
if /i "!GBR!"=="main" (
  echo Current branch: main -^> origin/main ^(GitHub Pages deploy^)
  git push -u origin main
) else (
  echo.
  echo WARNING: You are on branch: !GBR!  ^(not main^)
  echo Your commit is on !GBR! only.  "git push origin main" would push OLD main, not this commit.
  echo Pushing this branch: origin/!GBR!
  echo For GitHub Pages: merge !GBR! into main ^(GitHub PR or: checkout main, merge, push^)
  echo.
  git push -u origin !GBR!
)
if errorlevel 1 (
  echo Push failed.
  exit /b 1
)

echo Done: committed and pushed successfully.
exit /b 0
