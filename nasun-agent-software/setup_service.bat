@echo off
title NASUN AGENT SERVICE INSTALLER & RUNNER
echo ========================================================
echo   KHOI DONG TRINH CAU HINH GUI NASUN AGENT CHO NPP
echo ========================================================
echo.

:: Ensure Python is installed
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Khong tim thay Python tren he thong!
    echo Vui long tai va cai dat Python 3.9+ truoc (tich chon 'Add Python to PATH').
    echo.
    pause
    exit /b
)

echo [+] Dang chuan bi thu muc lam viec C:\NasunAgent...
if not exist "C:\NasunAgent" mkdir "C:\NasunAgent"
copy /y "agent_gui.py" "C:\NasunAgent\agent_gui.py"
if not exist "C:\NasunAgent\config.json" copy /y "config.json" "C:\NasunAgent\config.json"

echo [+] Dang mo giao dien cau hinh GUI...
cd /d "C:\NasunAgent"
start "" pythonw.exe agent_gui.py

echo.
echo ========================================================
echo   Cua so cau hinh giao dien da duoc mo!
echo   Vui long nhap cac thong so ket noi, file database log
echo   va nhan nut 'CAI DAT CHAY CUNG WINDOWS' de hoan tat.
echo ========================================================
echo.
timeout /t 5
exit /b
