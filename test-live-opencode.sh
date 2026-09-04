#!/usr/bin/env bash
# ============================================================
# test-live-opencode.sh — Prueba en vivo del agente con IA real vía OpenCode
# ============================================================
# Correr en TU máquina o servidor (donde haya salida a opencode.ai).
# El sandbox de desarrollo bloquea el tráfico saliente a proveedores de IA
# (verificado: opencode.ai, groq, anthropic, etc. → sin conexión), por eso
# esta prueba se ejecuta del lado tuyo con las mismas claves del .env.
#
# Uso:  bash test-live-opencode.sh
# Requiere: opencode CLI instalado (npm i -g opencode-ai) y .env en la raíz.
set -euo pipefail
cd "$(dirname "$0")"

echo "════════════════════════════════════════════════════"
echo " 1) Cargando .env y verificando OpenCode CLI"
echo "════════════════════════════════════════════════════"
set -a; source .env; set +a
export OPENCODE_ZEN_API_KEY="${OPENCODE_API_KEY:-}"
export ZEN_API_KEY="${OPENCODE_API_KEY:-}"

opencode --version || { echo "❌ opencode no está instalado: npm i -g opencode-ai"; exit 1; }
opencode auth list 2>&1 | grep -E "OpenCode|Groq|Copilot" || true

echo
echo "════════════════════════════════════════════════════"
echo " 2) Probando OpenCode free (deepseek-v4-flash-free)"
echo "════════════════════════════════════════════════════"
opencode run --model opencode/deepseek-v4-flash-free \
  "Respondé en una sola línea y en español: ¿estás listo para probar el agente de ventas?" \
  || echo "⚠️ Si falla con 'certificate', revisá que tu red llegue a opencode.ai (el sandbox de Arena lo bloquea)."

echo
echo "════════════════════════════════════════════════════"
echo " 3) Prueba en vivo del CICLO DE APRENDIZAJE del agente"
echo "    (motor real runAgentReply + conversation-learning)"
echo "════════════════════════════════════════════════════"
cd artifacts/api-server
# USE_SQLITE=true: la prueba crea su propio negocio/producto en SQLite local,
# NO toca tu base de producción (postgres) aunque el .env apunte a ella.
USE_SQLITE=true npx tsx test-live-learning.ts

echo
echo "✅ Listo. Con IA real, el paso 6 mostrará la respuesta del LLM"
echo "   (no el fallback técnico) y la lección de confusión guardada."
