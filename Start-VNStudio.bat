@echo off
setlocal enabledelayedexpansion
title VN Builder Studio
cd /d "%~dp0"

set "EXE=dist-electron\VNStudio-win32-x64\VNStudio.exe"
if exist "dist-electron\LATEST.txt" (
    set /p LATEST=<"dist-electron\LATEST.txt"
    set "EXE=dist-electron\!LATEST!\VNStudio.exe"
)

if not exist "!EXE!" (
    echo VNStudio.exe not found at:
    echo   !EXE!
    echo.
    echo Run Install-VNStudio.bat first to build the app.
    echo.
    pause
    exit /b 1
)

echo Launching VN Builder Studio...
echo   !EXE!
start "" "!EXE!"
endlocal
