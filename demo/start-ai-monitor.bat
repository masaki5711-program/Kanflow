@echo off
REM =====================================================================
REM  Kanflow AI Monitor - demo console
REM  Double-click this file. A black console opens and shows, in real
REM  time, what the local AI is doing behind the Kanflow screen:
REM    question received -> context injected -> AI thinking ->
REM    tool (analysis script) executed -> result fed back -> answer done
REM  Use it side-by-side with the Kanflow browser window during demos.
REM =====================================================================

chcp 65001 >nul
title Kanflow AI Monitor - LIVE
color 0F
mode con: cols=118 lines=42

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0ai-monitor.ps1"

echo.
echo  Monitor stopped. Press any key to close.
pause >nul
