@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Rental Manager
echo ============================================
echo   Rental Manager is starting...
echo   Local:  http://localhost:3000
echo   Close the "Rental Manager Server" window to stop.
echo ============================================
start "Rental Manager Server" node guard.js
timeout /t 2 /nobreak >nul
start http://localhost:3000
