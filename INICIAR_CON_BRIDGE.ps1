# ============================================================
# INICIAR AGENT-SALES-BOT CON NVIDIA NIM BRIDGE
# ============================================================
# 1. Verifica/instala dependencias del bridge
# 2. Inicia el bridge (NVIDIA NIM Proxy) en puerto 3000
# 3. Inicia el bot (api-server) en puerto 3002
# ============================================================

$BridgeDir = Join-Path $PSScriptRoot "nvidia-nim-bridge"
$BotDir = Join-Path $PSScriptRoot "artifacts/api-server"

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  INICIANDO AGENT-SALES-BOT + NVIDIA NIM BRIDGE" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

# ── Paso 1: Verificar dependencias del bridge ──
Write-Host "[1/3] Verificando dependencias del bridge..." -ForegroundColor Yellow
Set-Location -LiteralPath $BridgeDir
if (-not (Test-Path "node_modules")) {
    Write-Host "  Instalando dependencias..." -ForegroundColor Yellow
    npm install
    if (-not $?) { Write-Host "  ERROR: npm install falló" -ForegroundColor Red; exit 1 }
}
Write-Host "  ✓ Dependencias listas" -ForegroundColor Green
Write-Host ""

# ── Paso 2: Iniciar el bridge ──
Write-Host "[2/3] Iniciando NVIDIA NIM Bridge en puerto 3000..." -ForegroundColor Yellow
$BridgeProcess = Start-Process -FilePath "npx" -ArgumentList "tsx src/index.ts" -WorkingDirectory $BridgeDir -NoNewWindow -PassThru
Write-Host "  ✓ Bridge iniciado (PID: $($BridgeProcess.Id))" -ForegroundColor Green
Write-Host "  → http://localhost:3000/v1" -ForegroundColor Gray
Write-Host ""

# ── Paso 3: Iniciar el bot ──
Write-Host "[3/3] Iniciando Agent-Sales-Bot en puerto 3002..." -ForegroundColor Yellow
Set-Location -LiteralPath $BotDir
$BotProcess = Start-Process -FilePath "npx" -ArgumentList "tsx src/index.ts" -WorkingDirectory $BotDir -NoNewWindow -PassThru
Write-Host "  ✓ Bot iniciado (PID: $($BotProcess.Id))" -ForegroundColor Green
Write-Host "  → http://localhost:3002" -ForegroundColor Gray
Write-Host ""

Set-Location -LiteralPath $PSScriptRoot

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  SISTEMA INICIADO CORRECTAMENTE" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Bridge:     http://localhost:3000/v1" -ForegroundColor White
Write-Host "  Modelo:     moonshotai/kimi-k2.6" -ForegroundColor White
Write-Host "  WhatsApp:   http://localhost:3002/whatsapp/status" -ForegroundColor White
Write-Host "  QR:         http://localhost:3002/whatsapp/qr" -ForegroundColor White
Write-Host ""
Write-Host "  Presiona Ctrl+C en cada ventana para detener" -ForegroundColor DarkYellow
Write-Host ""

# Mantener el script vivo
Wait-Process -Id $BridgeProcess.Id, $BotProcess.Id
