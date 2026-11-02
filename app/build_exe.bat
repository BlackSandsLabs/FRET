@echo off
REM Builds a standalone dist\FRET\FRET.exe (run setup_windows.bat first).
cd /d "%~dp0"
call .venv\Scripts\activate.bat
python -m pip install pyinstaller
pyinstaller --noconfirm --windowed --name FRET ^
  --add-data "fret\ui;fret\ui" --add-data "fret\data;fret\data" ^
  --hidden-import serial.tools.list_ports ^
  run_fret.py
echo.
echo Built: dist\FRET\FRET.exe  (copy the whole dist\FRET folder)
pause
