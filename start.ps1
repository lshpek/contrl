param(
    [switch]$Tunnel,
    [switch]$WithOllama
)

$ErrorActionPreference = "Stop"
Push-Location $PSScriptRoot
try {
$pidsFile = Join-Path $PSScriptRoot ".botvex_pids.json"

if (-not (Test-Path ".venv")) {
    Write-Host "[BOTVEX] Creating Python venv..." -ForegroundColor Cyan
    py -m venv .venv
}

$pyExe = Join-Path $PSScriptRoot ".venv\Scripts\python.exe"
if (-not (Test-Path ".env") -and (Test-Path ".env.example")) {
    Copy-Item ".env.example" ".env"
}

Write-Host "[BOTVEX] Running Alembic migrations (upgrade head)..." -ForegroundColor Cyan
& $pyExe -m alembic -c backend\alembic.ini upgrade head

if (-not (Test-Path "frontend\node_modules")) {
    Write-Host "[BOTVEX] Installing Frontend dependencies..." -ForegroundColor Cyan
    Push-Location frontend
    npm install --no-audit --no-fund
    Pop-Location
}

if ($WithOllama) {
    $env:OLLAMA_MAX_LOADED_MODELS = "1"
    $env:OLLAMA_KEEP_ALIVE = "2m"
    Write-Host "[BOTVEX] Ollama GTX 1650 profile active (MAX_LOADED_MODELS=1, KEEP_ALIVE=2m)" -ForegroundColor Yellow
}

$pids = @{}

if ($Tunnel) {
    Write-Host "[BOTVEX] Building frontend/dist for single-port tunnel..." -ForegroundColor Cyan
    Push-Location frontend
    npm run build
    Pop-Location

    $env:SERVE_FRONTEND_DIST = "true"
    $backendProc = Start-Process -FilePath $pyExe -ArgumentList "-m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000" -PassThru -WindowStyle Minimized
    $pids.backend = $backendProc.Id

    if (Get-Command cloudflared -ErrorAction SilentlyContinue) {
        $tunnelProc = Start-Process -FilePath "cloudflared" -ArgumentList "tunnel --url http://127.0.0.1:8000" -PassThru
        $pids.tunnel = $tunnelProc.Id
        Write-Host "[BOTVEX] Backend (8000) + Cloudflare Tunnel started." -ForegroundColor Green
    } else {
        Write-Host "[BOTVEX] cloudflared not found. Install: winget install Cloudflare.cloudflared" -ForegroundColor Yellow
    }
} else {
    $backendProc = Start-Process -FilePath $pyExe -ArgumentList "-m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000 --reload" -PassThru -WindowStyle Minimized
    $pids.backend = $backendProc.Id

    $frontendProc = Start-Process -FilePath "npm.cmd" -ArgumentList "run dev" -WorkingDirectory (Join-Path $PSScriptRoot "frontend") -PassThru -WindowStyle Minimized
    $pids.frontend = $frontendProc.Id

    Start-Sleep -Seconds 2
    Start-Process "http://127.0.0.1:5173"
    Write-Host "[BOTVEX] Started: Frontend http://127.0.0.1:5173 | Backend http://127.0.0.1:8000" -ForegroundColor Green
}

$pids | ConvertTo-Json | Set-Content -Path $pidsFile -Encoding UTF8
Write-Host "[BOTVEX] To stop all processes run: .\stop.ps1" -ForegroundColor DarkGray
} finally {
    Pop-Location
}
