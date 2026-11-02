@echo off
REM One-time setup: creates a virtual environment and installs FRET's dependencies.
REM Requires Python 3.10+ from python.org (tick "Add python.exe to PATH").
cd /d "%~dp0"
py -3 -m venv .venv || python -m venv .venv
call .venv\Scripts\activate.bat
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
echo.
echo Setup complete. Run FRET.bat (live) or FRET_demo.bat (simulated devices).
pause
