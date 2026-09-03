@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
for %%I in ("%SCRIPT_DIR%..") do set "PROJECT_ROOT=%%~fI"
cd /d "%PROJECT_ROOT%"

set "URL=http://127.0.0.1:5173/"
set "LOG_DIR=%PROJECT_ROOT%\logs"
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"
set "LOG_FILE=%LOG_DIR%\commercial-unit-client.log"

set "NODE_EXE="
set "NPM_EXE="

for /f "delims=" %%I in ('where.exe node.exe 2^>nul') do (
    if not defined NODE_EXE set "NODE_EXE=%%I"
)
for /f "delims=" %%I in ('where.exe npm.cmd 2^>nul') do (
    if not defined NPM_EXE set "NPM_EXE=%%I"
)

if not defined NODE_EXE set "NODE_EXE=%ProgramFiles%\nodejs\node.exe"
if not defined NPM_EXE set "NPM_EXE=%ProgramFiles%\nodejs\npm.cmd"

if not exist "%NODE_EXE%" (
    echo ERROR: Node.js was not found.
    exit /b 1
)
if not exist "%NPM_EXE%" (
    echo ERROR: npm was not found.
    exit /b 1
)

echo =====================================
echo Commercial Unit Leasing Management System Client
echo =====================================
echo Using project root: %PROJECT_ROOT%
echo Node: %NODE_EXE%
echo npm: %NPM_EXE%

echo Checking if the client is already running...
curl.exe -s -o nul "%URL%"
if not errorlevel 1 (
    echo Client is already running.
    echo Open: %URL%
    start "" "%URL%"
    exit /b 0
)

if not exist "%PROJECT_ROOT%\node_modules" (
    echo Installing dependencies...
    call "%NPM_EXE%" install
    if errorlevel 1 exit /b 1
)

if not exist "%PROJECT_ROOT%\build\index.html" (
    echo Building frontend...
    call "%NPM_EXE%" run build
    if errorlevel 1 exit /b 1
)

echo Starting client preview in background...
start "Commercial Unit Client" /D "%PROJECT_ROOT%" /B "%ComSpec%" /D /C ""%NPM_EXE%" run preview -- --host 0.0.0.0 --port 5173 >> "%LOG_FILE%" 2>&1"

timeout /t 4 /nobreak >nul
curl.exe -s -o nul "%URL%"
if not errorlevel 1 (
    echo Client started successfully.
    echo Open: %URL%
    start "" "%URL%"
    exit /b 0
)

echo Startup launched in background. Check %LOG_FILE% for details.
exit /b 0
