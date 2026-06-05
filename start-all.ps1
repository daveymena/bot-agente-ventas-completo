# Script PowerShell para iniciar Backend y Frontend juntos

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Iniciando Sofia AI Sales" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Verificar que estamos en el directorio correcto
if (-not (Test-Path "artifacts\api-server")) {
    Write-Host "ERROR: No se encuentra el directorio artifacts\api-server" -ForegroundColor Red
    Write-Host "Por favor ejecuta este script desde la raiz del proyecto" -ForegroundColor Red
    Read-Host "Presiona Enter para salir"
    exit 1
}

# ── Bridge NVIDIA NIM ──
$BridgeDir = Join-Path $PSScriptRoot "nvidia-nim-bridge"
if (Test-Path $BridgeDir) {
    Write-Host "[Bridge] Iniciando NVIDIA NIM Bridge (Puerto 3000)..." -ForegroundColor Yellow
    $bridgeJob = Start-Job -ScriptBlock {
        $ErrorActionPreference = "Stop"
        $bd = $using:BridgeDir
        try {
            Set-Location "$bd"
            npx tsx src/index.ts
        } catch {
            Write-Host "ERROR BRIDGE: $_" -ForegroundColor Red
        }
    }
    Start-Sleep -Seconds 3
    Write-Host "  -> Bridge iniciado en http://localhost:3000/v1" -ForegroundColor Green
    Write-Host ""
}

Write-Host "[1/2] Iniciando Backend (Puerto 3002)..." -ForegroundColor Yellow
$backendJob = Start-Job -ScriptBlock {
    $ErrorActionPreference = "Stop"
    $projDir = $using:PWD
    try {
        Set-Location "$projDir\artifacts\api-server"
        pnpm run dev
    } catch {
        Write-Host "ERROR BACKEND: $_" -ForegroundColor Red
        Read-Host "Presiona Enter para salir"
    }
}
Start-Sleep -Seconds 2

Write-Host ""
Write-Host "[2/2] Iniciando Frontend (Puerto 5173)..." -ForegroundColor Yellow
$frontendJob = Start-Job -ScriptBlock {
    $ErrorActionPreference = "Stop"
    $projDir = $using:PWD
    try {
        Set-Location "$projDir\artifacts\ventas-pro"
        pnpm run dev
    } catch {
        Write-Host "ERROR FRONTEND: $_" -ForegroundColor Red
        Read-Host "Presiona Enter para salir"
    }
}

Write-Host "  -> Verificando que los servidores respondan..." -ForegroundColor Gray
Start-Sleep -Seconds 5

$backendOk = $false
$frontendOk = $false
for ($i = 0; $i -lt 15; $i++) {
    if (-not $backendOk) {
        try { $null = Invoke-WebRequest -Uri "http://localhost:3002" -UseBasicParsing -TimeoutSec 2; $backendOk = $true; Write-Host "  -> Backend OK en puerto 3002" -ForegroundColor Green } catch {}
    }
    if (-not $frontendOk) {
        try { $null = Invoke-WebRequest -Uri "http://localhost:5173" -UseBasicParsing -TimeoutSec 2; $frontendOk = $true; Write-Host "  -> Frontend OK en puerto 5173" -ForegroundColor Green } catch {}
    }
    if ($backendOk -and $frontendOk) { break }
    Start-Sleep -Seconds 1
}

if (-not $backendOk) { Write-Host "  ⚠️ Backend no responde aun" -ForegroundColor Yellow }
if (-not $frontendOk) { Write-Host "  ⚠️ Frontend no responde aun" -ForegroundColor Yellow }

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  Servidores Iniciados!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Backend:  " -NoNewline
Write-Host "http://localhost:3002" -ForegroundColor Cyan
Write-Host "Frontend: " -NoNewline
Write-Host "http://localhost:5173" -ForegroundColor Cyan
Write-Host ""
Write-Host "Abre tu navegador en: " -NoNewline
Write-Host "http://localhost:5173" -ForegroundColor Green -BackgroundColor Black
Write-Host ""
Write-Host "Presiona cualquier tecla para cerrar esta ventana" -ForegroundColor Gray
Write-Host "(Los servidores seguiran corriendo en sus propias ventanas)" -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
