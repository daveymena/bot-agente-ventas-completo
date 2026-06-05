#!/bin/bash
set -e

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                                                              ║"
echo "║        🚀 Iniciando OpenCode Free API en EasyPanel           ║"
echo "║                                                              ║"
echo "╚══════════════════════════════════════════════════════════════╝"

if [ -z "$OPENCODE_ZEN_API_KEY" ] || [ "$OPENCODE_ZEN_API_KEY" = "your-api-key-here" ]; then
    echo "⚠️  ADVERTENCIA: OPENCODE_ZEN_API_KEY no está configurada o tiene el valor por defecto."
    echo "Asegúrate de configurar esta variable de entorno en el panel de EasyPanel."
else
    echo "✅ OPENCODE_ZEN_API_KEY detectada correctamente."
fi

export OPENCODE_ZEN_BASE_URL="${OPENCODE_ZEN_BASE_URL:-https://opencode.ai/zen/v1}"
case "${OPENCODE_ZEN_BASE_URL}" in
  *provedor-ia*|*tecnovariedades-provedor*)
    echo "❌ ERROR: OPENCODE_ZEN_BASE_URL apunta a ESTE proxy (bucle infinito)."
    echo "   Corrigiendo automáticamente → https://opencode.ai/zen/v1"
    export OPENCODE_ZEN_BASE_URL="https://opencode.ai/zen/v1"
    ;;
esac
echo "🔗 Upstream API: ${OPENCODE_ZEN_BASE_URL}"

if [ "${INSTALL_DEPS_ON_START:-false}" = "true" ]; then
    echo "📦 Instalando dependencias de Python..."
    pip3 install --no-cache-dir -r requirements.txt
else
    echo "📦 Dependencias Python: usando imagen Docker (INSTALL_DEPS_ON_START=true para reinstalar)"
fi

mkdir -p logs

PORT="${PORT:-5000}"
MAX_TIMEOUT="${MAX_TIMEOUT:-180}"
GUNICORN_TIMEOUT="${GUNICORN_TIMEOUT:-$((MAX_TIMEOUT + 60))}"
GUNICORN_WORKERS="${GUNICORN_WORKERS:-2}"
GUNICORN_WORKER_CLASS="${GUNICORN_WORKER_CLASS:-gevent}"
GUNICORN_WORKER_CONNECTIONS="${GUNICORN_WORKER_CONNECTIONS:-100}"

echo "🌐 Iniciando Gunicorn en puerto ${PORT} (timeout=${GUNICORN_TIMEOUT}s, workers=${GUNICORN_WORKERS}, class=${GUNICORN_WORKER_CLASS})..."

exec gunicorn \
    -c gunicorn.conf.py \
    --bind "0.0.0.0:${PORT}" \
    --workers "${GUNICORN_WORKERS}" \
    --worker-class "${GUNICORN_WORKER_CLASS}" \
    --worker-connections "${GUNICORN_WORKER_CONNECTIONS}" \
    --timeout "${GUNICORN_TIMEOUT}" \
    server:app
