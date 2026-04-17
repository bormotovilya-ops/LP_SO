@echo off
setlocal enabledelayedexpansion

REM Usage:
REM   git-push.bat "your commit message"
REM If message is omitted, default one will be used.

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

echo [4/4] Pushing to origin/main...
git push -u origin main
if errorlevel 1 (
  echo Push failed.
  exit /b 1
)

echo Done: committed and pushed successfully.
exit /b 0
