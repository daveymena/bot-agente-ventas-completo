#!/bin/bash

echo "🚀 Iniciando Sofía SaaS en modo Local..."

# 1. Instalar dependencias si faltan
echo "📦 Verificando dependencias..."
pnpm install

# 2. Compilar el proyecto
echo "🏗️ Construyendo Backend y Frontend..."
pnpm run build

# 3. Arrancar el servidor
echo "✨ ¡Listo! El sistema estará disponible en http://localhost:3002"
echo "Recuerda que para el Bot de WhatsApp debes escanear el QR desde el dashboard."

pnpm --filter @workspace/api-server run start
