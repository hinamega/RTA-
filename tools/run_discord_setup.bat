@echo off
setlocal
cd /d "%~dp0"

echo ===================================================
echo   Discord Server Auto Setup Tool
echo ===================================================
echo.

echo [1/2] Installing required libraries...
pip install discord.py
if errorlevel 1 (
    echo.
    echo [ERROR] Failed to install dependencies.
    pause
    exit /b 1
)

echo.
echo [2/2] Running Discord setup script...
echo.
python setup_discord_server.py

echo.
echo Setup script finished.
pause
