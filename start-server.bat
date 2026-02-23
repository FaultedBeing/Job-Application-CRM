@echo off
echo Starting Job Tracker Backend Server...
echo.
cd /d "%~dp0server"
call npm run dev
pause
