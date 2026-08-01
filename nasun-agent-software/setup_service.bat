@echo off
title NASUN AGENT SERVICE INSTALLER
echo ========================================================
echo   BO CAI DAT VA DANG KY CONG CU NASUN AGENT CHO MAY NPP
echo ========================================================
echo.

:: Check Admin privileges
openfiles >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Vui long chay file BAT nay bang quyen Admin (Run as Administrator)!
    echo.
    pause
    exit /b
)

:: Ensure Python is installed
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Khong tim thay Python tren he thong!
    echo Vui long tai va cai dat Python 3.9+ truoc (tich chon 'Add Python to PATH').
    echo.
    pause
    exit /b
)

echo [1/4] Dang cai dat cac thu vien can thiet...
python -m pip install --upgrade pip
python -m pip install pyinstaller requests

echo.
echo [2/4] Dang bien dich agent.py thanh file exe doc lap (NasunAgentService.exe)...
pyinstaller --onefile --name=NasunAgentService agent.py

if not exist "dist\NasunAgentService.exe" (
    echo.
    echo [ERROR] Bien dich file EXE that bai! Vui long kiem tra log loi phia tren.
    pause
    exit /b
)

echo.
echo [3/4] Dang copy cac file can thiet vao thu muc lam viec C:\NasunAgent...
if not exist "C:\NasunAgent" mkdir "C:\NasunAgent"
copy /y "dist\NasunAgentService.exe" "C:\NasunAgent\NasunAgentService.exe"
if not exist "C:\NasunAgent\config.json" copy /y "config.json" "C:\NasunAgent\config.json"

echo.
echo [4/4] Dang dang ky chuong trinh chay ngam cung Windows (Task Scheduler)...
schtasks /create /tn "NasunAgentService" /tr "C:\NasunAgent\NasunAgentService.exe" /sc onstart /ru "SYSTEM" /f

echo.
echo ========================================================
echo   CAI DAT HOAN TAT!
echo   - Chuong trinh da duoc copy vao: C:\NasunAgent
echo   - Da thiet lap chay an cung he thong (Windows Startup)
echo   - Log hoat dong ghi tai file: C:\NasunAgent\agent.log
echo ========================================================
echo.
pause
