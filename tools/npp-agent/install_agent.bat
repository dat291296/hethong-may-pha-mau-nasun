@echo off
cd /d "%~dp0"
title COLORMIX AGENT SETUP WIZARD
color 0A
echo ===================================================================
echo   PHAN MEM AGENT CAP NHAT CONG THUC VA TRICH XUAT LOG DONG BO
echo   Phan mem ho tro: ColorExpert 2, ColorExpert 3, CorobTINT
echo ===================================================================
echo.
node setup_wizard.cjs
if errorlevel 1 (
    echo.
    echo [LOI] Khong the kich hoat Node.js. Vui long kiem tra Node.js.
)
echo.
pause
