# Agent-Sales-Bot (VentasPro)

WhatsApp AI sales bot + SaaS platform. Express backend, React dashboard, SQLite/PostgreSQL dual-mode DB, Baileys WhatsApp integration, 10 AI agent personas.

## Quick Start

```bash
# 1. Install dependencies
pnpm install

# 2. Copy environment config
cp .env.example .env
# Edit .env with your AI provider key (at minimum OPENCODE_API_KEY)

# 3. Start development servers
pnpm run dev
```

The backend runs on http://localhost:3002 and the frontend dev server on http://localhost:5173.

### Default login (auto-seeded on first run)

Set `ADMIN_EMAIL` and `ADMIN_PASSWORD` in `.env` before the first run to control
the seeded admin account. If unset, `app.ts` falls back to a fixed placeholder
that is **not safe for a real deployment** — always set these explicitly in
production and rotate the password if a placeholder value was ever used live.

## Project Structure

```
artifacts/
  api-server/     → Express backend (port 3002), ESM, esbuild bundle
  ventas-pro/     → Admin dashboard (React 19 + Vite + Tailwind + shadcn/ui)
lib/
  db/             → Drizzle ORM, dual SQLite/PG schema (24 tables)
  api-zod/        → Zod validation schemas
  api-client-react/ → React Query hooks (auto-generated)
  integrations-openai-ai-server/ → 30+ AI provider abstraction
packages/
  tienda/         → Public storefront (React + Vite, separate app)
scripts/
  migrate.mjs     → PostgreSQL schema creation
  migrate-to-pg.mjs → Full SQLite → PostgreSQL data migration
```

## Database: SQLite (Dev) vs PostgreSQL (Production)

Set `USE_SQLITE=true` in `.env` for local development (no database server needed).

To migrate from SQLite to PostgreSQL:

```bash
# 1. Set DATABASE_URL in .env
# 2. Run the migration script
DATABASE_URL=postgres://user:pass@host:5432/db node scripts/migrate-to-pg.mjs
```

This will create all 24 tables in PostgreSQL and copy all data from SQLite.

## AI Providers

Configure one or more in `.env`. Fallback chain: `opencode` → `groq` → `github` → `openrouter`.

- **OpenCode** (free): `OPENCODE_API_KEY=sk-...` via `api.freemodel.dev`
- **Groq** (free tier): `GROQ_API_KEY=gsk_...`
- **GitHub Models**: `GITHUB_TOKEN=ghp_...`

## WhatsApp

- Connect via the admin dashboard at `/whatsapp`
- Or use the API: `POST /api/whatsapp/connect`
- Phone pairing: `POST /api/whatsapp/pair-phone` with `{"phoneNumber":"..."}`
- Auth session saved in `artifacts/api-server/.baileys-auth/`

## Commands

```bash
pnpm install          # Install all dependencies
pnpm run dev           # Start backend + frontend dev servers
pnpm run build         # Typecheck + build for production
pnpm run test          # Run tests
```

## Architecture

- Monorepo managed with pnpm workspaces
- ESM throughout (Node 22+)
- Dual database: SQLite (sql.js WASM) locally, PostgreSQL in production
- AI fallback chain with 30+ provider support
- Baileys for WhatsApp Web integration
- SaaS multi-tenant with subscription management
- Mercado Pago, PayPal, and bank transfer payments

## Environment Variables (minimum)

```
USE_SQLITE=true
PORT=3002
OPENCODE_API_KEY=...   # or another AI provider key
```
