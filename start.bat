@echo off
chcp 65001 >nul
echo ========================================
echo   Chaozhou Woodcarving - Local Server
echo ========================================
echo.
where py >nul 2>nul
if %errorlevel% equ 0 (
  py -3 -c "import sys" >nul 2>nul
  if %errorlevel% equ 0 (
    echo  Full server starting at http://localhost:8124
    echo  AI chat uses SiliconFlow Qwen/Qwen3-8B after setting SILICONFLOW_API_KEY.
    echo  Press Ctrl+C to stop.
    echo.
    py -3 server\start_server.py
    pause
    exit /b
  )
)

where python >nul 2>nul
if %errorlevel% equ 0 (
  echo  Full server starting at http://localhost:8124
  echo  AI chat uses SiliconFlow Qwen/Qwen3-8B after setting SILICONFLOW_API_KEY.
  echo  Press Ctrl+C to stop.
  echo.
  python server\start_server.py
  pause
  exit /b
)

where npm >nul 2>nul
if %errorlevel% equ 0 (
  echo  Python was not found. Starting static preview instead.
  echo  Preview URL: http://localhost:8125
  echo  Note: AI chat needs Python or EdgeOne Pages Functions.
  echo  Press Ctrl+C to stop.
  echo.
  npm run preview
  pause
  exit /b
)

echo  Python and Node.js were not found.
echo  Install Python 3.10+ for the full AI server, or Node.js for static preview.
pause
