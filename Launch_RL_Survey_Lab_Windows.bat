@echo off
setlocal
cd /d "%~dp0"
where py >nul 2>&1
if %errorlevel% EQU 0 (
  start "RL Survey Lab server" cmd /k "py -m http.server 8000"
) else (
  where python >nul 2>&1
  if %errorlevel% NEQ 0 (
    echo Python is required to launch the local server.
    echo Install Python or open index.html directly, then read README.md.
    pause
    exit /b 1
  )
  start "RL Survey Lab server" cmd /k "python -m http.server 8000"
)
timeout /t 3 /nobreak >nul
start "" "http://localhost:8000"
echo RL Survey Lab is opening in your browser.
echo Keep the separate server window open while using the site.
exit /b 0
