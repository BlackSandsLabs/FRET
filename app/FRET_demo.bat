@echo off
cd /d "%~dp0"
REM Make sure FRET's private Python environment exists and has its packages.
if not exist ".venv\Scripts\python.exe" (
  echo First run: setting up FRET. This takes about a minute...
  py -3 -m venv .venv 2>nul || python -m venv .venv
)
if not exist ".venv\Scripts\python.exe" (
  echo Could not create the Python environment. Install Python 3.10+ from python.org
  echo and tick "Add python.exe to PATH", then run this again.
  pause
  exit /b 1
)
".venv\Scripts\python.exe" -c "import serial, webview" 2>nul || (
  echo Installing FRET's Python packages...
  ".venv\Scripts\python.exe" -m pip install -q --upgrade pip
  ".venv\Scripts\python.exe" -m pip install -q -r requirements.txt
)
start "" .venv\Scripts\pythonw.exe run_fret.py --demo
