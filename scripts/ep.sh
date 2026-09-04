#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# ep.sh — Control de Easypanel por API (sin navegador)
#
# El panel web se volvió el cuello de botella: los clics en "Implementar" a
# veces no registraban, la pantalla mostraba "Algo salió mal" aunque el deploy
# sí corriera, y editar variables en el editor de código era propenso a que el
# texto cayera fuera del textarea. Por API todo eso es una sola llamada.
#
# La API de Easypanel es tRPC: TODAS las llamadas son POST (un GET devuelve
# 405 METHOD_NOT_SUPPORTED aunque la ruta exista) y el cuerpo va envuelto en
# {"json": ...}. El servidor usa certificado autofirmado sobre IP → -k.
#
# El token NO vive aquí: se lee de EP_TOKEN o de un archivo fuera del repo,
# para que no termine commiteado.
#
# Uso:
#   export EP_TOKEN=...           (o crear ~/.easypanel.env con EP_TOKEN=...)
#   ./scripts/ep.sh services      → lista proyectos y servicios
#   ./scripts/ep.sh info          → commit desplegado, fuente git, montajes
#   ./scripts/ep.sh deploy        → dispara un despliegue
#   ./scripts/ep.sh wait          → espera a que el contenedor nuevo levante
#   ./scripts/ep.sh redeploy      → deploy + wait + verifica el commit
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

EP_HOST="${EP_HOST:-https://144.91.112.79}"
PROJECT="${EP_PROJECT:-tecnoia}"
SERVICE="${EP_SERVICE:-bot-agenwhatsapp}"
# La app se sirve por el dominio propio. El subdominio *.easypanel.host NO esta
# ruteado: devuelve el 404 de Easypanel, no la app. Si se apunta ahi, uptime_now
# no encuentra ningun "uptime" y wait_new gira hasta el timeout de 15 minutos
# aunque el deploy haya salido bien.
APP_URL="${EP_APP_URL:-https://ventasproia.com}"

# Token: variable de entorno, o archivo fuera del repo. Nunca hardcodeado.
if [ -z "${EP_TOKEN:-}" ] && [ -f "$HOME/.easypanel.env" ]; then
  # shellcheck disable=SC1091
  source "$HOME/.easypanel.env"
fi
# El archivo de la maquina usa EASYPANEL_TOKEN/EASYPANEL_URL (los nombres que
# muestra el panel); el script nacio usando EP_*. Se aceptan los dos para que
# el deploy no falle por el nombre de la variable.
EP_TOKEN="${EP_TOKEN:-${EASYPANEL_TOKEN:-}}"
if [ -n "${EASYPANEL_URL:-}" ] && [ -z "${EP_HOST_EXPLICITO:-}" ]; then
  EP_HOST="${EASYPANEL_URL%/}"
fi
if [ -z "${EP_TOKEN:-}" ]; then
  echo "Falta EP_TOKEN (exportalo o ponelo en ~/.easypanel.env)" >&2
  exit 1
fi

# Llama a un procedimiento tRPC. $1 = ruta, $2 = payload interno (def: null)
trpc() {
  curl -sk --max-time 60 -X POST \
    -H "Authorization: Bearer $EP_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"json\":${2:-null}}" \
    "$EP_HOST/api/trpc/$1"
}

svc_payload="{\"projectName\":\"$PROJECT\",\"serviceName\":\"$SERVICE\"}"

# Uptime del contenedor. Sirve para detectar que reinició: si baja, es nuevo.
uptime_now() {
  curl -s --max-time 15 "$APP_URL/api/health" 2>/dev/null \
    | grep -o '"uptime":[0-9]*' | cut -d: -f2
}

# Espera a que arranque un contenedor nuevo (uptime por debajo del umbral).
wait_new() {
  echo "esperando contenedor nuevo..."
  local t=0
  until [ "$(uptime_now || echo 99999)" -lt 150 ] 2>/dev/null; do
    sleep 15; t=$((t+15))
    [ "$t" -gt 900 ] && { echo "timeout a los 15 min" >&2; return 1; }
  done
  echo "arriba: $(curl -s --max-time 15 "$APP_URL/api/health")"
}

case "${1:-}" in
  services)
    trpc "projects.listProjectsAndServices" | node -e "
let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{
  const s=JSON.parse(d).json.services||[];
  s.forEach(x=>console.log('  '+x.projectName+' / '+x.name+'  ['+x.type+']'));
})"
    ;;
  info)
    trpc "services.app.inspectService" "$svc_payload" | node -e "
let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{
  const j=JSON.parse(d).json;
  console.log('servicio :', j.projectName+'/'+j.name);
  console.log('repo     :', j.source?.repo, '('+j.source?.ref+')');
  console.log('commit   :', j.commit?.hash?.slice(0,7), '-', j.commit?.message?.split('\n')[0]);
  console.log('montajes :', JSON.stringify(j.mounts));
})"
    ;;
  deploy)
    echo "desplegando $PROJECT/$SERVICE..."
    trpc "services.app.deployService" "$svc_payload" >/dev/null
    echo "deploy disparado"
    ;;
  wait)  wait_new ;;
  redeploy)
    "$0" deploy && wait_new && "$0" info
    ;;
  *)
    sed -n '2,30p' "$0" | sed 's/^# \{0,1\}//'
    ;;
esac
