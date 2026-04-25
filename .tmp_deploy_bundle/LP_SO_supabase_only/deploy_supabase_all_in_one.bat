@echo off
setlocal

echo === Supabase all-in-one deploy ===

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js is not installed or not in PATH.
  exit /b 1
)
where npx >nul 2>nul
if errorlevel 1 (
  echo [ERROR] npx is not available.
  exit /b 1
)

npx supabase --version
if errorlevel 1 (
  echo [ERROR] Supabase CLI is not available via npx.
  exit /b 1
)

echo.
echo [STEP] Login to Supabase (if already logged in, this is quick).
npx supabase login
if errorlevel 1 (
  echo [ERROR] supabase login failed.
  exit /b 1
)

echo.
echo [STEP] Link project: vvkjfaxlzlmeobgitxdj
npx supabase link --project-ref vvkjfaxlzlmeobgitxdj
if errorlevel 1 (
  echo [ERROR] supabase link failed.
  exit /b 1
)

echo.
echo [STEP] Make sure secrets are set before deploy:
echo   PAYMENT_PROVIDER=tochka
echo   TOCHKA_API_TOKEN=...
echo   TOCHKA_MERCHANT_ID=...
echo   TOCHKA_INIT_URL=...  (or TOCHKA_API_BASE_URL=...)
echo   FUNCTIONS_BASE_URL=https://vvkjfaxlzlmeobgitxdj.supabase.co/functions/v1
echo.
set /p CONTINUE_DEPLOY=Continue deploy now? (Y/N): 
if /I not "%CONTINUE_DEPLOY%"=="Y" (
  echo Deploy cancelled by user.
  exit /b 0
)

echo.
echo [STEP] Deploy payment-init
npx supabase functions deploy payment-init
if errorlevel 1 (
  echo [ERROR] Deploy failed: payment-init
  exit /b 1
)

echo [STEP] Deploy tbank-notification
npx supabase functions deploy tbank-notification
if errorlevel 1 (
  echo [ERROR] Deploy failed: tbank-notification
  exit /b 1
)

echo [STEP] Deploy tochka-notification
npx supabase functions deploy tochka-notification --no-verify-jwt
if errorlevel 1 (
  echo [ERROR] Deploy failed: tochka-notification
  exit /b 1
)

echo.
echo [OK] All Supabase functions deployed successfully.
exit /b 0
