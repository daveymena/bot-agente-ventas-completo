#!/bin/sh
set -e

if [ "$USE_SQLITE" = "true" ] && [ ! -f "$SQLITE_PATH" ]; then
  DEFAULT_DB="/app/default-db/tecnovariedades.db"
  mkdir -p "$(dirname "$SQLITE_PATH")"
  if [ -f "$DEFAULT_DB" ]; then
    echo "📦 Copiando base de datos SQLite por defecto..."
    cp "$DEFAULT_DB" "$SQLITE_PATH"
    echo "✅ Base de datos copiada a $SQLITE_PATH"
  fi
fi

exec node --enable-source-maps artifacts/api-server/dist/index.mjs "$@"
