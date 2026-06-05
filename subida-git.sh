#!/bin/bash

# ====================================================================
#      🚀 AUTO-SUBIDA LIMPIA Y DESPLIEGUE SEGURO A GITHUB (VENTASPRO)
# ====================================================================

echo -e "\033[36m====================================================\033[0m"
echo -e "\033[36m   PREPARANDO SUBIDA PARA DESPLIEGUE EN EASYPANEL   \033[0m"
echo -e "\033[36m====================================================\033[0m"

# 1. Verificar si hay cambios en git
status=$(git status --porcelain)
if [ -z "$status" ]; then
    echo -e "\033[32m✅ No hay cambios para subir. El repositorio está limpio.\033[0m"
    exit 0
fi

echo -e "\033[33m🔍 Detectando archivos y preparando ignorados...\033[0m"

# Asegurar que .gitignore esté al día
cat << 'EOF' > .gitignore

node_modules/
.env
artifacts/api-server/.env
*.db
tecnovariedades.db
.baileys-auth/
dist/
build/
.venv/
venv/
.local/
.agents/
.replit
.replitignore
replit.md
EOF

echo -e "\033[32m✅ Archivo .gitignore configurado de forma estricta.\033[0m"

# 2. Agregar todos los archivos necesarios
echo -e "\033[33m📦 Agregando archivos de código fuente a Git...\033[0m"

# Agregar selectivamente las carpetas y archivos críticos
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

echo -e "\033[32m✅ Archivos agregados a escena.\033[0m"

# 3. Mostrar resumen de lo que se va a subir
echo -e "\033[36m📋 Resumen de cambios preparados para commit:\033[0m"
git status --short

# 4. Crear commit
commitMessage="feat: implementacion completa de modulo onboarding SaaS, panel de admin de tenants y seguridad de despliegue"
echo -e "\033[33m✍️ Creando commit con mensaje: '$commitMessage'...\033[0m"
git commit -m "$commitMessage"

# 5. Hacer push a GitHub
echo -e "\033[33m🚀 Subiendo cambios a GitHub (rama: main)...\033[0m"
git push origin main

if [ $? -eq 0 ]; then
    echo -e "\n\033[32m====================================================\033[0m"
    echo -e "\033[32m   🎉 ¡SUBIDA COMPLETADA CON ÉXITO! 🎉\033[0m"
    echo -e "\033[32m   Tus cambios ya están en GitHub.\033[0m"
    echo -e "\033[32m   EasyPanel detectará el commit e iniciará el build.\033[0m"
    echo -e "\033[32m====================================================\033[0m"
else
    echo -e "\n\033[31m❌ Error al subir cambios a GitHub. Por favor verifica tus credenciales o conexión.\033[0m"
fi
