#!/bin/bash
set -e
TOKEN="${GITHUB_PERSONAL_ACCESS_TOKEN:-$GITHUB_TOKEN}"
REPO="https://daveymena:${TOKEN}@github.com/daveymena/bot-agente-ventas-completo.git"
git remote remove github 2>/dev/null || true
git remote add github "$REPO"
git push github main
echo "✅ Push exitoso a GitHub"
