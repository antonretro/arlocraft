$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $projectRoot

$port = 5173
$url = "http://localhost:$port/"

function Test-LocalUrl {
    param([string]$TargetUrl)
    try {
        Invoke-WebRequest -Uri $TargetUrl -UseBasicParsing -TimeoutSec 2 | Out-Null
        return $true
    } catch {
        return $false
    }
}

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Host "npm is not installed or not in PATH." -ForegroundColor Red
    Write-Host "Install Node.js from https://nodejs.org and run this launcher again." -ForegroundColor Yellow
    Read-Host "Press Enter to close"
    exit 1
}

if (-not (Test-Path (Join-Path $projectRoot 'node_modules'))) {
    Write-Host "Installing dependencies..." -ForegroundColor Cyan
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Dependency install failed." -ForegroundColor Red
        Read-Host "Press Enter to close"
        exit 1
    }
}

if (-not (Test-LocalUrl -TargetUrl $url)) {
    Write-Host "Starting ArloCraft server on $url" -ForegroundColor Cyan
    Start-Process -FilePath "cmd.exe" -ArgumentList "/k", "cd /d `"$projectRoot`" && npm run dev -- --host localhost --port $port"
    Start-Sleep -Seconds 3
}

Start-Process $url
Write-Host "ArloCraft launched: $url" -ForegroundColor Green
