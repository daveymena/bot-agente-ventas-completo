#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Helper SEGURO para controlar EasyPanel vía su API.
#
# El secreto (API key) NUNCA se guarda en el repo ni se escribe aquí:
# se lee de variables de entorno. Este script jamás imprime el valor de la key.
#
# Provee la key de forma segura (elige UNA):
#   1) Variable de entorno del entorno de Claude Code / tu shell:
#        export EASYPANEL_URL="https://panel.tudominio.com"
#        export EASYPANEL_API_KEY="********"
#   2) Un archivo local NO versionado (ya ignorado por .gitignore):
#        scripts/easypanel/.easypanel.env   (KEY=VALOR, una por línea)
#      El script lo carga automáticamente si existe.
#
# Uso:
#   ./easypanel.sh check                 # valida conexión (sin exponer la key)
#   ./easypanel.sh services              # lista proyectos/servicios (raw JSON)
#   ./easypanel.sh deploy <servicio>     # dispara un redeploy
#   ./easypanel.sh raw GET /api/...      # llamada cruda a un endpoint
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/.easypanel.env"

usage() { sed -n '2,32p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; }

# 'help' no requiere credenciales.
if [[ "${1:-help}" == "help" || "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage; exit 0
fi

# Cargar el archivo local de secretos si existe (no versionado).
if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  set -a; source "$ENV_FILE"; set +a
fi

: "${EASYPANEL_URL:?Falta EASYPANEL_URL (ej: https://panel.tudominio.com). Defínela como variable de entorno o en scripts/easypanel/.easypanel.env}"
: "${EASYPANEL_API_KEY:?Falta EASYPANEL_API_KEY. Defínela como variable de entorno o en scripts/easypanel/.easypanel.env — NUNCA en el chat ni en git}"

# Quita una posible barra final de la URL.
BASE="${EASYPANEL_URL%/}"

# curl autenticado. --fail para propagar errores HTTP. La key va en el header,
# nunca en la línea de comandos visible ni en la salida.
_api() {
  local method="$1"; shift
  local path="$1"; shift
  curl -fsS -X "$method" \
    -H "Authorization: Bearer ${EASYPANEL_API_KEY}" \
    -H "Content-Type: application/json" \
    "${BASE}${path}" "$@"
}

cmd="${1:-help}"; shift || true

case "$cmd" in
  check)
    # Verifica conectividad/credenciales sin revelar la key.
    echo "→ Probando conexión a ${BASE} ..."
    if _api GET "/api/trpc/projects.listProjectsAndServices" >/dev/null 2>&1 \
       || _api GET "/api/health" >/dev/null 2>&1; then
      echo "✅ Conexión y credenciales OK"
    else
      echo "❌ No se pudo autenticar/conectar. Revisa EASYPANEL_URL y la API key (sin pegarla aquí)."
      exit 1
    fi
    ;;

  services)
    # Ajusta el endpoint a tu versión de EasyPanel si difiere.
    _api GET "/api/trpc/projects.listProjectsAndServices"
    ;;

  deploy)
    svc="${1:?Uso: easypanel.sh deploy <servicio>}"
    echo "→ Disparando redeploy de '${svc}' ..."
    _api POST "/api/trpc/services.deploy" \
      --data "$(printf '{"json":{"serviceName":"%s"}}' "$svc")"
    echo; echo "✅ Petición de deploy enviada (verifica en el panel)."
    ;;

  raw)
    method="${1:?Uso: easypanel.sh raw <GET|POST> <path> [curl-args...]}"; shift
    path="${1:?Falta el path, ej: /api/trpc/...}"; shift
    _api "$method" "$path" "$@"
    ;;

  *)
    usage
    ;;
esac
