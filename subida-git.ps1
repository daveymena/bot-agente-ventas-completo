# ====================================================================
#      AUTO-SUBIDA LIMPIA Y DESPLIEGUE SEGURO A GITHUB (VENTASPRO)
# ====================================================================

Write-Host "====================================================" -ForegroundColor Cyan
Write-Host "   PREPARANDO SUBIDA PARA DESPLIEGUE EN EASYPANEL   " -ForegroundColor Cyan
Write-Host "====================================================" -ForegroundColor Cyan

# 1. Verificar si hay cambios en git
$status = git status --porcelain
if ([string]::IsNullOrEmpty($status)) {
    Write-Host "No hay cambios para subir. El repositorio esta limpio." -ForegroundColor Green
    Exit 0
}

Write-Host "Detectando archivos y preparando ignorados..." -ForegroundColor Yellow

# Asegurar que .gitignore este al dia para no subir base de datos local ni tokens de WhatsApp
$gitignoreContent = "node_modules/`n.env`nartifacts/api-server/.env`n*.db`ntecnovariedades.db`n.baileys-auth/`ndist/`nbuild/`n.venv/`nvenv/`n.local/`n.agents/`n.replit`n.replitignore`nreplit.md"
Set-Content -Path ".gitignore" -Value $gitignoreContent
Write-Host "Archivo .gitignore configurado de forma estricta." -ForegroundColor Green

# 2. Agregar todos los archivos necesarios
Write-Host "Agregando archivos de codigo fuente a Git..." -ForegroundColor Yellow

# Agregar selectivamente las carpetas y archivos criticos
git add artifacts/ventas-pro/src/pages/onboarding.tsx
git add artifacts/ventas-pro/src/pages/admin-tenants.tsx
git add artifacts/ventas-pro/src/pages/activate.tsx
git add artifacts/ventas-pro/src/App.tsx
git add artifacts/ventas-pro/src/components/layout.tsx
git add artifacts/api-server/src/routes/tenants.ts
git add artifacts/api-server/src/routes/auth.ts
git add artifacts/api-server/src/lib/tenantManager.ts
git add artifacts/api-server/src/middleware/saasValidation.ts
git add INICIAR_OPENCODE.ps1
git add OpenCode-puete-ia/

# Agregar el resto de archivos modificados generales que cumplan .gitignore
git add -u

Write-Host "Archivos agregados a escena." -ForegroundColor Green

# 3. Mostrar resumen de lo que se va a subir
Write-Host "Resumen de cambios preparados para commit:" -ForegroundColor Cyan
git status --short

# 4. Crear commit
$commitMessage = "feat: implementacion completa de modulo onboarding SaaS, panel de admin de tenants y seguridad de despliegue"
Write-Host "Creando commit con mensaje: '$commitMessage'..." -ForegroundColor Yellow
git commit -m $commitMessage

# 5. Hacer push a GitHub
Write-Host "Subiendo cambios a GitHub (rama: main)..." -ForegroundColor Yellow
git push origin main

if ($LASTEXITCODE -eq 0) {
    Write-Host "====================================================" -ForegroundColor Green
    Write-Host "   SUBIDA COMPLETADA CON EXITO!" -ForegroundColor Green
    Write-Host "   Tus cambios ya estan en GitHub." -ForegroundColor Green
    Write-Host "   EasyPanel detectara el commit e iniciara el build." -ForegroundColor Green
    Write-Host "====================================================" -ForegroundColor Green
} else {
    Write-Host "Error al subir cambios a GitHub. Por favor verifica tus credenciales o conexion." -ForegroundColor Red
}
