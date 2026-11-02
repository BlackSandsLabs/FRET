@echo off
cd /d "%~dp0"
set PORT=
set /p PORT=Stick COM port (e.g. COM5), or press Enter to auto-detect: 
..\app\.venv\Scripts\python.exe capture_log.py %PORT%
pause
