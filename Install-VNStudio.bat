@echo off
setlocal enabledelayedexpansion
title VN Builder Studio - Installer

echo ============================================================
echo   VN Builder Studio - One-Click Installer (Windows x64)
echo ============================================================
echo.
echo This will:
echo   1. Check for Bun (install if missing)
echo   2. Install project dependencies
echo   3. Build the app
echo   4. Package VNStudio.exe into dist-electron\
echo.
echo Working folder: %~dp0
echo.
pause

cd /d "%~dp0"

REM --- Stop any running instance so files aren't locked ---
echo.
echo [1/5] Closing any running VNStudio instances...
taskkill /F /IM VNStudio.exe >nul 2>&1
taskkill /F /IM electron.exe >nul 2>&1

REM --- Check for bun ---
echo.
echo [2/5] Checking for Bun...
where bun >nul 2>&1
if errorlevel 1 (
    echo Bun not found. Installing Bun via PowerShell...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "irm bun.sh/install.ps1 | iex"
    if errorlevel 1 (
        echo.
        echo ERROR: Bun install failed. Install manually from https://bun.sh and re-run.
        pause
        exit /b 1
    )
    REM Add bun to PATH for this session
    set "PATH=%USERPROFILE%\.bun\bin;%PATH%"
    where bun >nul 2>&1
    if errorlevel 1 (
        echo.
        echo ERROR: Bun installed but not on PATH. Close and reopen this window, then re-run.
        pause
        exit /b 1
    )
) else (
    echo Bun is installed.
)

REM --- Clean old build artifacts (ignore locked files) ---
echo.
echo [3/5] Cleaning previous build output...
if exist dist rmdir /s /q dist 2>nul
if exist dist-electron rmdir /s /q dist-electron 2>nul

REM --- Install dependencies ---
echo.
echo [4/5] Installing dependencies (this may take a few minutes)...
call bun install
if errorlevel 1 (
    echo.
    echo ERROR: bun install failed.
    pause
    exit /b 1
)

REM --- Build & package ---
echo.
echo [5/5] Building and packaging VNStudio.exe...
call bun run package:portable
if errorlevel 1 (
    echo.
    echo ERROR: Packaging failed. See messages above.
    pause
    exit /b 1
)

echo.
echo ============================================================
echo   DONE!
echo ============================================================
echo.
echo Launch the app from:
echo   Start-VNStudio.bat
echo.
echo The installer records the newest packaged build automatically.
echo.
pause
endlocal
