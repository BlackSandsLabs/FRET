@echo off
cd /d "%~dp0"
if not exist "..\app\.venv\Scripts\python.exe" (
  echo Run app\setup_windows.bat first, then try again.
  pause
  exit /b 1
)
"..\app\.venv\Scripts\python.exe" -c "import serial" 2>nul || "..\app\.venv\Scripts\python.exe" -m pip install -q -r ..\app\requirements.txt
set PORT=
set /p PORT=Stick COM port (e.g. COM5), or press Enter to auto-detect: 
"..\app\.venv\Scripts\python.exe" capture_log.py %PORT%
pause
