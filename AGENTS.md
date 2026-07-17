# AGENTS.md — Agent-Sales-Bot (VentasPro)

WhatsApp AI sales bot + SaaS platform. Express backend, React dashboard, SQLite/PostgreSQL dual-mode DB, Baileys WhatsApp integration, 10 AI agent personas.

## Quick Start

```bash
# Install
pnpm install

# Dev (API server with nodemon hot-reload)
pnpm run dev

# Production build
pnpm run build    # typecheck libs, then build api-server + ventas-pro

# Start production
pnpm --filter @workspace/api-server run start

# Run from WSL (Windows server)
/mnt/c/Windows/System32/cmd.exe /c "cd /d C:\Users\ADMIN\Videos\Agent-Sales-Bot && npx tsx artifacts/api-server/src/index.ts"
```

## Architecture

```
artifacts/
  api-server/     → Express backend (port 3002), ESM, esbuild bundle
  ventas-pro/     → Admin dashboard (React + Vite + Radix + Tailwind)
lib/
  db/             → Drizzle ORM, dual SQLite/PG schema
  api-zod/        → Zod validation schemas
  api-client-react/ → React Query hooks (auto-generated from api-spec)
  integrations-openai-ai-server/ → 30+ AI provider abstraction
packages/
  tienda/         → Public storefront (React + Vite, separate app)
scripts/
  migrate.mjs     → Pure SQL migration (runs before server start)
```

## Database: SQLite vs PostgreSQL

Set `USE_SQLITE=true` for local dev (SQLite). Production uses PostgreSQL (`DATABASE_URL`).

- **SQLite**: tables auto-created via raw SQL in `lib/db/src/index.ts`. No drizzle-kit needed. Auto-saves every 15s.
- **PG**: schema managed by `drizzle-kit push`. Two parallel schema files must stay in sync: `lib/db/src/sqlite-schema.ts` and `lib/db/src/schema/`.
- **DB Proxy pattern**: `lib/db` exports a `Proxy` that delays operations until async `initDb()` completes. Import `db` anywhere — it waits for readiness.

## Key Gotchas

- **ESM `__dirname`**: Use `fileURLToPath(import.meta.url)` + `path.dirname()`. The esbuild build injects CJS polyfills for bundled deps.
- **Baileys auth**: Stored in `artifacts/api-server/.baileys-auth/` (gitignored). Path calculated via `import.meta.url` with WSL fix: `path.replace(/^\/([A-Za-z]:)/, '$1')`.
- **Baileys version**: `@whiskeysockets/baileys` 7.0.0-rc13 (api-server MUST match root). rc.9 has outdated WhatsApp protocol `appVersion` (1027934701) causing error 405. rc13 uses 1035194821.
- **SQLite rejects Date objects** in WHERE clauses — convert to ISO string before `gte()`.
- **SQLite lacks PG functions**: no `to_char()`, `date_trunc()`, `::int`. Do grouping in JS.
- **`printQRInTerminal` is deprecated** in Baileys 7.x — QR must be handled via `connection.update` event.
- **WhatsApp auto-start commented out** in `app.ts` for dev. Uncomment for production.
- **`exec node` in Docker CMD** is critical — pnpm doesn't forward SIGTERM. Use `exec node --enable-source-maps`.
- **Build order**: `lib/db` → `lib/api-zod` → `lib/api-spec` → `lib/api-client-react` → `lib/integrations-openai-ai-server` → `artifacts/api-server`.
- **Frontend build**: `artifacts/ventas-pro` uses `vite build` → `dist/public/`. The api-server serves this as static files.
- **WSL**: `import.meta.url` returns `/C:/...` paths — must strip leading slash.

## AI Providers

Configured via env vars. Fallback chain: `opencode` → `nvidia_nim_bridge` → `nvidia` → `openrouter` → `github`.

- **OpenCode/FreeModel**: Primary. Key in `.env` as `OPENCODE_API_KEY`.
- **AI response time**: ~10s per message (gpt-5.5 via freemodel.dev).
- **Agent routing**: `lib/api-server/src/lib/agent-router.ts` selects agent by keyword scoring.

## WhatsApp

- Uses Baileys library. Auth in `.baileys-auth/` directory.
- Auto-start disabled in dev. Connect via `POST /api/whatsapp/connect`.
- Phone pairing available: `POST /api/whatsapp/pair-phone` with `{"phoneNumber":"..."}`.
- After Logout (401), must scan new QR. Cooldown ~10-15 min after repeated failures.
- Human typing simulation: 280 WPM, 800-4500ms delay.

## Testing

```bash
pnpm run test                           # All tests
npx vitest run artifacts/api-server/src/routes/auth.test.ts  # Single file
curl -X POST localhost:3002/api/whatsapp/test-ia -H "Content-Type: application/json" -d '{"message":"Hola"}'
```

## Env Vars (minimum for local)

```
USE_SQLITE=true
PORT=3002
OPENCODE_API_KEY=...    # or any AI provider key
```

## Git

Repo: `https://github.com/daveymena/bot-agente-ventas-completo.git`
