# Script para compilar todo el proyecto
# Ejecutar desde la raíz del proyecto

Write-Host "🚀 Compilando proyecto completo..." -ForegroundColor Cyan
Write-Host ""

# 1. Instalar dependencias
Write-Host "📦 Instalando dependencias..." -ForegroundColor Yellow
pnpm install
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Error instalando dependencias" -ForegroundColor Red
    exit 1
}
Write-Host "✅ Dependencias instaladas" -ForegroundColor Green
Write-Host ""

# 2. Compilar backend
Write-Host "🔧 Compilando backend..." -ForegroundColor Yellow
pnpm --filter @workspace/api-server run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Error compilando backend" -ForegroundColor Red
    exit 1
}
Write-Host "✅ Backend compilado" -ForegroundColor Green
Write-Host ""

# 3. Compilar frontend
Write-Host "🎨 Compilando frontend..." -ForegroundColor Yellow
$env:NODE_ENV = "production"
pnpm --filter @workspace/ventas-pro run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Error compilando frontend" -ForegroundColor Red
    exit 1
}
Write-Host "✅ Frontend compilado" -ForegroundColor Green
Write-Host ""

# 4. Compilar tienda pública
Write-Host "🏪 Compilando tienda pública..." -ForegroundColor Yellow
pnpm --filter @workspace/tienda run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Error compilando tienda pública" -ForegroundColor Red
    exit 1
}
Write-Host "✅ Tienda pública compilada" -ForegroundColor Green
Write-Host ""

# 5. Verificar build
Write-Host "🔍 Verificando build..." -ForegroundColor Yellow
cd artifacts
.\verify-build.ps1
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Verificación falló" -ForegroundColor Red
    cd ..
    exit 1
}
cd ..

Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host "✅ ¡Compilación completada exitosamente!" -ForegroundColor Green
Write-Host ""
Write-Host "Próximos pasos:" -ForegroundColor Cyan
Write-Host "1. cd artifacts" -ForegroundColor White
Write-Host "2. docker build -t ventas-pro:latest ." -ForegroundColor White
Write-Host "3. docker push tu-registry/ventas-pro:latest" -ForegroundColor White
Write-Host "4. Desplegar en Easypanel" -ForegroundColor White
