# 🚀 Script de REINICIO MAESTRO - VentasPro AI
# Este script detiene todos los procesos y reinicia el sistema limpiamente.

$ErrorActionPreference = "SilentlyContinue"

Write-Host "====================================================" -ForegroundColor Cyan
Write-Host "   SISTEMA DE REINICIO AUTOMÁTICO - VENTASPRO AI   " -ForegroundColor White -BackgroundColor DarkCyan
Write-Host "====================================================" -ForegroundColor Cyan
Write-Host ""

# 1. DETENER PROCESOS EXISTENTES
Write-Host "[1/4] Deteniendo procesos en puertos 3002 y 5173..." -ForegroundColor Yellow

# Función para matar procesos en un puerto
function Stop-ProcessOnPort($port) {
    $processId = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -First 1
    if ($processId) {
        Write-Host "  -> Matando proceso en puerto $port (PID: $processId)..." -ForegroundColor Gray
        Stop-Process -Id $processId -Force
        Start-Sleep -Milliseconds 500
    } else {
        Write-Host "  -> Puerto $port ya está libre." -ForegroundColor DarkGray
    }
}

Stop-ProcessOnPort 3002
Stop-ProcessOnPort 5173

# También matar cualquier proceso de node.js huérfano (opcional pero recomendado)
# Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force

Write-Host ""
Write-Host "[2/4] Limpiando archivos temporales..." -ForegroundColor Yellow
if (Test-Path "artifacts\api-server\dist") { Remove-Item -Path "artifacts\api-server\dist" -Recurse -Force }
Write-Host "  -> Limpieza completada." -ForegroundColor Gray

Write-Host ""
Write-Host "[3/4] Iniciando BACKEND (Puerto 3002)..." -ForegroundColor Yellow
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

Write-Host "  -> Esperando a que el backend se estabilice..." -ForegroundColor Gray
Start-Sleep -Seconds 4

Write-Host ""
Write-Host "[4/4] Iniciando FRONTEND (Puerto 5173)..." -ForegroundColor Yellow
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

Write-Host "  -> Verificando servidores..." -ForegroundColor Gray
Start-Sleep -Seconds 5
$backendOk = $false; $frontendOk = $false
for ($i = 0; $i -lt 15; $i++) {
    if (-not $backendOk) { try { $null = Invoke-WebRequest -Uri "http://localhost:3002" -UseBasicParsing -TimeoutSec 2; $backendOk = $true; Write-Host "  -> Backend OK" -ForegroundColor Green } catch {} }
    if (-not $frontendOk) { try { $null = Invoke-WebRequest -Uri "http://localhost:5173" -UseBasicParsing -TimeoutSec 2; $frontendOk = $true; Write-Host "  -> Frontend OK" -ForegroundColor Green } catch {} }
    if ($backendOk -and $frontendOk) { break }
    Start-Sleep -Seconds 1
}
if (-not $backendOk) { Write-Host "  ⚠️ Backend no responde" -ForegroundColor Yellow }
if (-not $frontendOk) { Write-Host "  ⚠️ Frontend no responde" -ForegroundColor Yellow }

Write-Host ""
Write-Host "====================================================" -ForegroundColor Green
Write-Host "   ✨ ¡SISTEMA REINICIADO EXITOSAMENTE! ✨   " -ForegroundColor Black -BackgroundColor Green
Write-Host "====================================================" -ForegroundColor Green
Write-Host ""
Write-Host "Backend:  http://localhost:3002" -ForegroundColor Cyan
Write-Host "Frontend: http://localhost:5173" -ForegroundColor Cyan
Write-Host ""
Write-Host "Se han abierto 2 nuevas ventanas de terminal."
Write-Host "Por favor, NO las cierres mientras uses el sistema."
Write-Host ""
Write-Host "Presiona cualquier tecla para finalizar este script..." -ForegroundColor Gray

$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
