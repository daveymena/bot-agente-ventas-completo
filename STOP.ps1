# 🛑 Script para DETENER TODO - VentasPro AI

$ErrorActionPreference = "SilentlyContinue"

Write-Host "========================================" -ForegroundColor Red
Write-Host "   DETENIENDO SERVIDORES VENTASPRO AI   " -ForegroundColor White -BackgroundColor DarkRed
Write-Host "========================================" -ForegroundColor Red
Write-Host ""

function Stop-ProcessOnPort($port) {
    $processId = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -First 1
    if ($processId) {
        Write-Host "Matando proceso en puerto $port (PID: $processId)..." -ForegroundColor Yellow
        Stop-Process -Id $processId -Force
    } else {
        Write-Host "Puerto $port ya esta libre." -ForegroundColor Gray
    }
}

Stop-ProcessOnPort 3002
Stop-ProcessOnPort 5173

Write-Host ""
Write-Host "Todos los servicios han sido detenidos." -ForegroundColor Green
Write-Host "Presiona cualquier tecla para salir..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
