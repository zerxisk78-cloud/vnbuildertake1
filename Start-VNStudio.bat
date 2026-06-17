@echo off
title VN Builder Studio
cd /d "%~dp0"

set "EXE=dist-electron\VNStudio-win32-x64\VNStudio.exe"

if not exist "%EXE%" (
    echo VNStudio.exe not found.
    echo.
    echo Run Install-VNStudio.bat first to build the app.
    echo.
    pause
    exit /b 1
)

echo Launching VN Builder Studio...
start "" "%EXE%"
