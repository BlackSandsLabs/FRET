@echo off
setlocal
REM Builds the FRET firmware and flashes it to the stick connected by USB-C.
REM Needs app\setup_windows.bat to have been run once (it reuses that Python).
cd /d "%~dp0"
set PY=..\app\.venv\Scripts\python.exe
if not exist "%PY%" (
  echo Run app\setup_windows.bat first, then try again.
  pause
  exit /b 1
)
echo Which stick is connected?
echo   1 = M5StickC Plus2  (ESP32)
echo   2 = M5Stack StickS3 (ESP32-S3)
set B=
set /p B=Enter 1 or 2: 
set ENV=m5stickc-plus2
if "%B%"=="2" set ENV=m5stack-sticks3
echo Checking PlatformIO...
"%PY%" -m pip install -q -U platformio
echo.
echo Serial devices on this PC:
echo ------------------------------------------------------------
"%PY%" -m platformio device list --serial
echo ------------------------------------------------------------
echo Unplug any other ESP32 gadgets so the right device is flashed.
set PORT=
set /p PORT=Type the stick's COM port (e.g. COM5), or press Enter to auto-detect: 
set UP=
if not "%PORT%"=="" set UP=--upload-port %PORT%
echo.
echo Building and uploading %ENV% ...
"%PY%" -m platformio run -e %ENV% -t upload %UP%
if errorlevel 1 goto fail
echo.
echo Done - the stick should now show FRET on its screen. Run app\FRET.bat next.
pause
exit /b 0
:fail
echo.
echo FAILED - copy the error text above and send it to Claude.
pause
exit /b 1
