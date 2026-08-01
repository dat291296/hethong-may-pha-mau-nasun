@echo off
title CHAY PHAN MEM NASUN AGENT SETUP
echo ========================================================
echo   KHOI DONG PHAN MEM GUI CAU HINH NASUN AGENT CHO NPP
echo ========================================================
echo.

echo [+] Dang tao thu muc lam viec C:\NasunAgent...
if not exist "C:\NasunAgent" mkdir "C:\NasunAgent"
copy /y "NasunAgentSetup.exe" "C:\NasunAgent\NasunAgentSetup.exe"
if not exist "C:\NasunAgent\config.json" copy /y "config.json" "C:\NasunAgent\config.json"

echo [+] Dang mo giao dien cau hinh GUI NasunAgentSetup.exe...
cd /d "C:\NasunAgent"
start "" "C:\NasunAgent\NasunAgentSetup.exe"

echo.
echo ========================================================
echo   Cua so cau hinh giao dien da duoc mo thanh cong!
echo   Vui long nhap cac thong so ket noi, tui file database log
echo   va nhan nut 'CAI DAT CHAY CUNG WINDOWS' de hoan tat.
echo ========================================================
echo.
timeout /t 3
exit /b
