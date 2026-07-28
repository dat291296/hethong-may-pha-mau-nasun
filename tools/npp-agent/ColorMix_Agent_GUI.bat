@echo off
cd /d "%~dp0"
title COLORMIX AGENT DESKTOP GUI CONTROL PANEL
color 0B
echo ===================================================================
echo   PHAN MEM AGENT DANG MO GIAO DIEN DESKTOP GUI TRUC QUAN...
echo   Vui long cho trong giay lat, trinh duyet se tu dong mo len!
echo ===================================================================
echo.
node agent_gui_server.cjs
