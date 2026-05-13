# Script de verificación del build para Easypanel (PowerShell)
# Este script verifica que todo esté listo para desplegar

Write-Host "🔍 Verificando build del proyecto..." -ForegroundColor Cyan
Write-Host ""

# Contador de errores
$ERRORS = 0

# 1. Verificar que exista el directorio del frontend compilado
Write-Host "1️⃣ Verificando frontend compilado..." -ForegroundColor Yellow

if (Test-Path "ventas-pro\dist\public") {
    Write-Host "✅ Directorio ventas-pro\dist\public existe" -ForegroundColor Green
    
    # Verificar archivos críticos
    if (Test-Path "ventas-pro\dist\public\index.html") {
        Write-Host "✅ index.html encontrado" -ForegroundColor Green
    } else {
        Write-Host "❌ index.html NO encontrado" -ForegroundColor Red
        $ERRORS++
    }
    
    if (Test-Path "ventas-pro\dist\public\assets") {
        Write-Host "✅ Directorio assets\ encontrado" -ForegroundColor Green
        $assetCount = (Get-ChildItem "ventas-pro\dist\public\assets").Count
        Write-Host "   📦 $assetCount archivos en assets\" -ForegroundColor Green
    } else {
        Write-Host "❌ Directorio assets\ NO encontrado" -ForegroundColor Red
        $ERRORS++
    }
} else {
    Write-Host "❌ Directorio ventas-pro\dist\public NO existe" -ForegroundColor Red
    Write-Host "💡 Ejecuta: pnpm --filter @workspace/ventas-pro run build" -ForegroundColor Yellow
    $ERRORS++
}

Write-Host ""

# 2. Verificar que exista el backend compilado
Write-Host "2️⃣ Verificando backend compilado..." -ForegroundColor Yellow

if (Test-Path "api-server\dist") {
    Write-Host "✅ Directorio api-server\dist existe" -ForegroundColor Green
    
    if (Test-Path "api-server\dist\index.mjs") {
        Write-Host "✅ index.mjs encontrado" -ForegroundColor Green
    } else {
        Write-Host "❌ index.mjs NO encontrado" -ForegroundColor Red
        $ERRORS++
    }
} else {
    Write-Host "❌ Directorio api-server\dist NO existe" -ForegroundColor Red
    Write-Host "💡 Ejecuta: pnpm --filter @workspace/api-server run build" -ForegroundColor Yellow
    $ERRORS++
}

Write-Host ""

# 3. Verificar Dockerfile
Write-Host "3️⃣ Verificando Dockerfile..." -ForegroundColor Yellow

if (Test-Path "Dockerfile") {
    Write-Host "✅ Dockerfile existe" -ForegroundColor Green
    
    # Verificar que tenga la línea correcta de copia del frontend
    $dockerfileContent = Get-Content "Dockerfile" -Raw
    if ($dockerfileContent -match "COPY --from=builder /app/artifacts/ventas-pro/dist/public /app/artifacts/ventas-pro/dist/public") {
        Write-Host "✅ Dockerfile tiene la ruta correcta del frontend" -ForegroundColor Green
    } else {
        Write-Host "❌ Dockerfile NO tiene la ruta correcta del frontend" -ForegroundColor Red
        Write-Host "💡 Verifica que la línea COPY del frontend sea correcta" -ForegroundColor Yellow
        $ERRORS++
    }
} else {
    Write-Host "❌ Dockerfile NO existe" -ForegroundColor Red
    $ERRORS++
}

Write-Host ""

# 4. Verificar package.json
Write-Host "4️⃣ Verificando configuración de pnpm..." -ForegroundColor Yellow

if (Test-Path "..\pnpm-workspace.yaml") {
    Write-Host "✅ pnpm-workspace.yaml existe" -ForegroundColor Green
} else {
    Write-Host "❌ pnpm-workspace.yaml NO existe" -ForegroundColor Red
    $ERRORS++
}

Write-Host ""

# 5. Verificar variables de entorno
Write-Host "5️⃣ Verificando variables de entorno..." -ForegroundColor Yellow

if (Test-Path "api-server\.env") {
    Write-Host "✅ .env existe" -ForegroundColor Green
    
    # Verificar variables críticas
    $envContent = Get-Content "api-server\.env" -Raw
    if ($envContent -match "NODE_ENV") {
        Write-Host "✅ NODE_ENV configurado" -ForegroundColor Green
    } else {
        Write-Host "⚠️  NODE_ENV no encontrado en .env" -ForegroundColor Yellow
    }
} else {
    Write-Host "⚠️  .env NO existe (puede estar en Easypanel)" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan

# Resumen
if ($ERRORS -eq 0) {
    Write-Host "✅ ¡Todo listo para desplegar!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Próximos pasos:" -ForegroundColor Cyan
    Write-Host "1. docker build -t ventas-pro:latest ." -ForegroundColor White
    Write-Host "2. docker push tu-registry/ventas-pro:latest" -ForegroundColor White
    Write-Host "3. Desplegar en Easypanel" -ForegroundColor White
    exit 0
} else {
    Write-Host "❌ Se encontraron $ERRORS errores" -ForegroundColor Red
    Write-Host ""
    Write-Host "Por favor, corrige los errores antes de desplegar." -ForegroundColor Yellow
    exit 1
}
