@echo off
setlocal

echo ============================================================
echo   PROJECT STRUCTURE GENERATOR
echo ============================================================
echo.
pause

:: AUTO DETECT CURRENT FOLDER
set "ROOT=%~dp0"
set "SCRIPT=%~dp0gen_struct.ps1"
set "OUTFILE=%ROOT%structure.txt"

echo [STEP 1] Configuration
echo ROOT   = %ROOT%
echo SCRIPT = %SCRIPT%
echo OUTPUT = %OUTFILE%
echo.
pause

:: CHECK ROOT
if not exist "%ROOT%" (
    echo [ERROR] Root folder not found
    pause
    exit /b
)

:: CHECK SCRIPT
if not exist "%SCRIPT%" (
    echo [ERROR] gen_struct.ps1 not found in this folder
    pause
    exit /b
)

echo [STEP 2] Running PowerShell script
echo.
pause

:: 🔥 FIXED LINE (important)
powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT%" -root "%ROOT:~0,-1%" -outfile "%OUTFILE%"

echo.
echo [STEP 3] PowerShell finished with code %errorlevel%
echo.
pause

echo [STEP 4] Checking output file...

if exist "%OUTFILE%" (
    echo SUCCESS: structure.txt created
) else (
    echo ERROR: structure.txt NOT created
)

echo.
pause

echo ============================================================
echo   PROCESS COMPLETE
echo ============================================================
pause