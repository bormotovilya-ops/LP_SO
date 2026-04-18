@echo off
setlocal
cd /d "%~dp0"

echo LP_SO — локальный запуск (Vite)
echo.

if not exist "node_modules\" (
  echo node_modules не найден — ставлю зависимости...
  call npm install
  if errorlevel 1 (
    echo Ошибка npm install.
    pause
    exit /b 1
  )
  echo.
)

echo Запуск dev-сервера (порт из vite.config — обычно 8080)...
echo Остановить: Ctrl+C
echo.
call npm run dev
exit /b %errorlevel%
