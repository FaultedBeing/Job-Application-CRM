@echo off
REM Change to script directory to ensure we're in the right place
cd /d "%~dp0"
echo ========================================
echo Job Application Tracker - Build Script
echo ========================================
echo.

REM Check for Node.js
where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Node.js is not installed!
    echo Please install Node.js from https://nodejs.org/
    echo.
    pause
    exit /b 1
)

echo [1/4] Checking Node.js version...
node --version
echo.

echo [2/4] Installing dependencies...
echo Installing server dependencies...
cd server
call npm install
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Failed to install server dependencies
    pause
    exit /b 1
)

echo Installing client dependencies...
cd ..\client
call npm install
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Failed to install client dependencies
    pause
    exit /b 1
)

echo Installing desktop dependencies...
cd ..\desktop
call npm install
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Failed to install desktop dependencies
    pause
    exit /b 1
)
cd ..
echo.

echo [3/4] Building server and client...
echo Building server...
cd server
call npm run build
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Failed to build server
    pause
    exit /b 1
)

echo Building client...
cd ..\client
call npm run build
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Failed to build client
    pause
    exit /b 1
)
cd ..
echo.

echo [4/4] Creating executable...
echo.
echo NOTE: Make sure the .exe is not currently running!
echo Close any open instances of "Job Application Tracker" before building.
echo.
timeout /t 3 /nobreak >nul

REM Clean up old installer versions from root folder
echo Cleaning up old installer versions...
for %%f in ("Job Application Tracker Setup*.exe") do (
    echo Removing old installer: %%f
    del /q "%%f" 2>nul
)
for %%f in ("Job Application Tracker Setup*.exe.blockmap") do (
    del /q "%%f" 2>nul
)

REM Try to clean the dist folder (ignore errors if files are locked)
cd desktop
if exist dist\win-unpacked (
    echo Cleaning old build files...
    rmdir /s /q dist\win-unpacked 2>nul
    del /q dist\*.exe 2>nul
    del /q dist\*.blockmap 2>nul
)

call npm run build
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ERROR: Failed to build executable
    echo.
    echo Common causes:
    echo - The .exe file is currently running (close it first)
    echo - Windows Explorer has the dist folder open (close it)
    echo - Antivirus is blocking the build (temporarily disable)
    echo.
    pause
    exit /b 1
)
cd ..
echo.

echo ========================================
echo Build Complete!
echo ========================================
echo.
echo.
echo Your installer is located in the root folder:
echo   Job Application Tracker Setup [version].exe
echo.
echo.
echo Run the installer to install the application!
echo It will create shortcuts in Start Menu and Desktop.
echo.
pause
