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

Write-Host "[1/2] Iniciando Backend (Puerto 3002)..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PWD\artifacts\api-server'; npm run dev" -WindowStyle Normal

Write-Host ""
Write-Host "Esperando 3 segundos para que el backend inicie..." -ForegroundColor Gray
Start-Sleep -Seconds 3

Write-Host ""
Write-Host "[2/2] Iniciando Frontend (Puerto 5173)..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PWD\artifacts\ventas-pro'; npm run dev" -WindowStyle Normal

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
