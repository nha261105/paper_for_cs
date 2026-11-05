<#
.SYNOPSIS
  Windows replacement for `make`: install what is missing, start the backend,
  wait for its API, then start the frontend.

.EXAMPLE
  .\dev.ps1                 # backend (:8000) then frontend (:5173) -> open http://localhost:5173
  .\dev.ps1 backend         # only the backend
  .\dev.ps1 frontend        # only the frontend
  .\dev.ps1 serve           # build the frontend once, serve everything on http://localhost:8000
  .\dev.ps1 install         # only install (.venv in backend\, node_modules in frontend\)
  .\dev.ps1 cli -p rag      # the terminal tool (backend\fetcher.py)
  .\dev.ps1 clean           # delete .venv, node_modules and the frontend build

  If scripts are blocked ("running scripts is disabled on this system"),
  double-click dev.bat or run:  .\dev.bat
#>
# Kept a "simple" script on purpose (no [Parameter()] attributes): then extra
# arguments such as "-p rag" for the CLI land in $args instead of being
# rejected as unknown parameters of this script.
param(
    [ValidateSet('dev', 'backend', 'frontend', 'serve', 'install', 'cli', 'clean')]
    [string]$Task = 'dev'
)
$Rest = @($args)

# Native commands report failure through $LASTEXITCODE, checked by Invoke-Native.
$ErrorActionPreference = 'Continue'

$OnWindows = $env:OS -eq 'Windows_NT'
$Root      = $PSScriptRoot
$Backend   = Join-Path $Root 'backend'
$Frontend  = Join-Path $Root 'frontend'
$Venv      = Join-Path $Backend '.venv'
if ($OnWindows) { $VenvPy = Join-Path $Venv 'Scripts\python.exe'; $Npm = 'npm.cmd' }
else            { $VenvPy = Join-Path $Venv 'bin/python';        $Npm = 'npm' }
if ($env:API_PORT) { $ApiPort = [int]$env:API_PORT } else { $ApiPort = 8000 }

function Fail([string]$Message) {
    Write-Host ""
    Write-Host "ERROR: $Message" -ForegroundColor Red
    exit 1
}

function Invoke-Native([string]$Exe, [string[]]$ArgList) {
    & $Exe @ArgList
    if ($LASTEXITCODE -ne 0) { Fail "'$Exe $($ArgList -join ' ')' failed (exit code $LASTEXITCODE)." }
}

function Get-Python {
    # The "python" in ...\WindowsApps is a Microsoft Store stub, not a real Python.
    foreach ($candidate in @('py -3', 'python', 'python3')) {
        $parts = @($candidate -split ' ')
        $cmd = Get-Command $parts[0] -ErrorAction SilentlyContinue
        if (-not $cmd -or $cmd.Source -like '*WindowsApps*') { continue }
        $pre = @($parts | Select-Object -Skip 1)
        & $parts[0] @pre -c "import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)"
        if ($LASTEXITCODE -eq 0) { return $parts }
    }
    Fail "Python 3.10+ not found. Install it from https://www.python.org/downloads/ (tick 'Add python.exe to PATH'), then open a new terminal."
}

function Test-Newer([string]$Source, [string]$Stamp) {
    return (-not (Test-Path $Stamp)) -or ((Get-Item $Source).LastWriteTime -gt (Get-Item $Stamp).LastWriteTime)
}

function Install-Backend {
    if (-not (Test-Path $VenvPy)) {
        $py = @(Get-Python)
        $pre = @($py | Select-Object -Skip 1)
        Write-Host "Creating backend\.venv ..." -ForegroundColor Cyan
        Invoke-Native $py[0] ($pre + @('-m', 'venv', $Venv))
    }
    $req = Join-Path $Backend 'requirements.txt'
    $stamp = Join-Path $Venv '.installed'
    if (Test-Newer $req $stamp) {
        Write-Host "Installing Python packages ..." -ForegroundColor Cyan
        Invoke-Native $VenvPy @('-m', 'pip', 'install', '--upgrade', 'pip')
        Invoke-Native $VenvPy @('-m', 'pip', 'install', '-U', '-r', $req)
        New-Item -ItemType File -Force -Path $stamp | Out-Null
    }
}

function Install-Frontend {
    if (-not (Get-Command $Npm -ErrorAction SilentlyContinue)) {
        Fail "npm not found. Install Node.js 18+ from https://nodejs.org/ then open a new terminal."
    }
    $pkg = Join-Path $Frontend 'package.json'
    $stamp = Join-Path $Frontend 'node_modules\.installed'
    if (Test-Newer $pkg $stamp) {
        Write-Host "Installing frontend packages (npm install) ..." -ForegroundColor Cyan
        Push-Location $Frontend
        try { Invoke-Native $Npm @('install', '--no-fund', '--no-audit') } finally { Pop-Location }
        New-Item -ItemType File -Force -Path $stamp | Out-Null
    }
}

function Stop-Tree($Proc) {
    if (-not $Proc -or $Proc.HasExited) { return }
    # uvicorn --reload runs a worker child process; stop the whole tree so port 8000 is freed.
    if ($OnWindows) { & taskkill.exe /PID $Proc.Id /T /F *> $null }
    else { Stop-Process -Id $Proc.Id -Force -ErrorAction SilentlyContinue }
}

function Start-Frontend {
    Push-Location $Frontend
    try { & $Npm run dev } finally { Pop-Location }
}

function Start-Dev {
    Install-Backend
    Install-Frontend

    Write-Host "[1/2] Backend  -> http://localhost:$ApiPort  (API docs: /docs)" -ForegroundColor Green
    $backendProc = Start-Process -FilePath $VenvPy -WorkingDirectory $Backend -NoNewWindow -PassThru `
        -ArgumentList @('-m', 'uvicorn', 'server:app', '--reload', '--port', "$ApiPort")
    try {
        Write-Host -NoNewline "      waiting for the backend"
        $ready = $false
        for ($i = 0; $i -lt 60; $i++) {
            if ($backendProc.HasExited) {
                Fail "Backend failed to start (see the error above). Is port $ApiPort already in use?"
            }
            try {
                Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 "http://127.0.0.1:$ApiPort/api/meta" | Out-Null
                $ready = $true
                break
            } catch {
                Write-Host -NoNewline "."
                Start-Sleep -Milliseconds 500
            }
        }
        if (-not $ready) { Fail "Backend did not answer on port $ApiPort after 30 seconds." }
        Write-Host " ready"
        Write-Host "[2/2] Frontend -> http://localhost:5173   (Ctrl+C stops both)" -ForegroundColor Green
        Start-Frontend
    } finally {
        Stop-Tree $backendProc
    }
}

switch ($Task) {
    'dev'      { Start-Dev }
    'install'  { Install-Backend; Install-Frontend; Write-Host "Done." -ForegroundColor Green }
    'backend'  {
        Install-Backend
        Push-Location $Backend
        try { & $VenvPy -m uvicorn server:app --reload --port $ApiPort } finally { Pop-Location }
    }
    'frontend' { Install-Frontend; Start-Frontend }
    'serve'    {
        Install-Backend
        Install-Frontend
        Push-Location $Frontend
        try { Invoke-Native $Npm @('run', 'build') } finally { Pop-Location }
        Write-Host "App: http://localhost:$ApiPort" -ForegroundColor Green
        Push-Location $Backend
        try { & $VenvPy -m uvicorn server:app --port $ApiPort } finally { Pop-Location }
    }
    'cli'      {
        Install-Backend
        Push-Location $Backend
        try { & $VenvPy fetcher.py @Rest } finally { Pop-Location }
    }
    'clean'    {
        foreach ($p in @($Venv, (Join-Path $Frontend 'node_modules'), (Join-Path $Frontend 'dist'))) {
            if (Test-Path $p) { Remove-Item -Recurse -Force $p; Write-Host "Removed $p" }
        }
    }
}
