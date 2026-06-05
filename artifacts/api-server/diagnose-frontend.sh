#!/bin/bash

echo "🔍 DIAGNÓSTICO DE FRONTEND EN EASYPANEL"
echo "========================================"
echo ""

echo "📍 1. Verificando NODE_ENV:"
echo "NODE_ENV: $NODE_ENV"
echo ""

echo "📍 2. Verificando estructura de directorios:"
echo "Directorio actual:"
pwd
echo ""

echo "Contenido de /app:"
ls -la /app/ 2>/dev/null || echo "❌ /app no existe"
echo ""

echo "Contenido de /app/artifacts:"
ls -la /app/artifacts/ 2>/dev/null || echo "❌ /app/artifacts no existe"
echo ""

echo "Contenido de /app/artifacts/ventas-pro:"
ls -la /app/artifacts/ventas-pro/ 2>/dev/null || echo "❌ /app/artifacts/ventas-pro no existe"
echo ""

echo "Contenido de /app/artifacts/ventas-pro/dist:"
ls -la /app/artifacts/ventas-pro/dist/ 2>/dev/null || echo "❌ /app/artifacts/ventas-pro/dist no existe"
echo ""

echo "Contenido de /app/artifacts/ventas-pro/dist/public:"
ls -la /app/artifacts/ventas-pro/dist/public/ 2>/dev/null || echo "❌ /app/artifacts/ventas-pro/dist/public no existe"
echo ""

echo "📍 3. Verificando index.html:"
if [ -f "/app/artifacts/ventas-pro/dist/public/index.html" ]; then
    echo "✅ index.html existe"
    echo "Tamaño: $(stat -f%z /app/artifacts/ventas-pro/dist/public/index.html 2>/dev/null || stat -c%s /app/artifacts/ventas-pro/dist/public/index.html)"
    echo "Primeras líneas:"
    head -10 /app/artifacts/ventas-pro/dist/public/index.html
else
    echo "❌ index.html NO existe"
fi
echo ""

echo "📍 4. Verificando API server:"
if [ -f "/app/artifacts/api-server/dist/index.mjs" ]; then
    echo "✅ API server compilado existe"
else
    echo "❌ API server NO existe"
fi
echo ""

echo "📍 5. Verificando proceso Node:"
ps aux | grep node || echo "❌ No hay procesos Node corriendo"
echo ""

echo "📍 6. Verificando puerto 3002:"
netstat -tuln | grep 3002 || ss -tuln | grep 3002 || echo "❌ Puerto 3002 no está escuchando"
echo ""

echo "========================================"
echo "✅ Diagnóstico completado"
