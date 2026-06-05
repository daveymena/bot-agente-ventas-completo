# 🚀 Script de INICIO - OpenCode Bridge IA
# Detiene instancias previas e inicia el servidor de OpenCode + Proxy compatible con OpenAI.

$ErrorActionPreference = "SilentlyContinue"

Write-Host "====================================================" -ForegroundColor Cyan
Write-Host "      INICIANDO PUENTE DE IA GRATUITA (OPENCODE)    " -ForegroundColor White -BackgroundColor DarkCyan
Write-Host "====================================================" -ForegroundColor Cyan
Write-Host ""

# 1. DETENER INSTANCIAS PREVIAS
Write-Host "[1/3] Limpiando puertos 4096 (OpenCode) y 8000 (Proxy)..." -ForegroundColor Yellow

function Stop-ProcessOnPort($port) {
    $processId = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -First 1
    if ($processId) {
        Write-Host "  -> Deteniendo proceso en puerto $port (PID: $processId)..." -ForegroundColor Gray
        Stop-Process -Id $processId -Force
        Start-Sleep -Milliseconds 500
    } else {
        Write-Host "  -> Puerto $port ya esta libre." -ForegroundColor DarkGray
    }
}

Stop-ProcessOnPort 4096
Stop-ProcessOnPort 8000

# 2. INICIAR OPENCODE SERVE
Write-Host ""
Write-Host "[2/3] Iniciando OpenCode Serve (Puerto 4096)..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "opencode serve" -WindowStyle Normal

Write-Host "  -> Esperando a que OpenCode inicialice..." -ForegroundColor Gray
Start-Sleep -Seconds 3

# 3. INICIAR PROXY COMPATIBLE CON OPENAI
Write-Host ""
Write-Host "[3/3] Iniciando Proxy OpenAI-Compatible (Puerto 8000)..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PWD\OpenCode-puete-ia'; python method2-proxy/proxy_server.py" -WindowStyle Normal

Write-Host ""
Write-Host "====================================================" -ForegroundColor Green
Write-Host "    ✨ ¡PUENTE OPENCODE ACTIVADO CON EXITO! ✨    " -ForegroundColor Black -BackgroundColor Green
Write-Host "====================================================" -ForegroundColor Green
Write-Host ""
Write-Host "OpenCode Server: http://localhost:4096" -ForegroundColor Cyan
Write-Host "OpenAI Proxy:    http://localhost:8000/v1" -ForegroundColor Cyan
Write-Host ""
Write-Host "Se han abierto 2 nuevas ventanas de terminal."
Write-Host "Por favor, NO las cierres para mantener la IA activa de forma gratuita."
Write-Host ""
Write-Host "Presiona cualquier tecla para finalizar este script..." -ForegroundColor Gray

$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
