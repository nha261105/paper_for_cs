@echo off
rem Windows: double-click, or run "dev" / "dev backend" / "dev serve" ... (same tasks as dev.ps1)
rem -ExecutionPolicy Bypass only applies to this one run; it does not change system settings.
where pwsh >nul 2>nul
if %errorlevel%==0 (set "PS=pwsh") else (set "PS=powershell")
%PS% -NoProfile -ExecutionPolicy Bypass -File "%~dp0dev.ps1" %*
if errorlevel 1 pause
