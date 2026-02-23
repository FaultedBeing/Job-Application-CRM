@echo off
echo Starting Job Tracker Frontend...
echo.
cd /d "%~dp0client"
call npm run dev
pause
