@echo off
setlocal
set SCRIPT_DIR=%~dp0
set CLI_PATH=%SCRIPT_DIR%..\cli.mjs
node "%CLI_PATH%" %*
exit /b %ERRORLEVEL%
