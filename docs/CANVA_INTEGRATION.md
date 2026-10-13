# Canva Connect API — Integración Oficial (documentada, desactivada hasta autorizar)

> No simulada. Basada en https://www.canva.com/developers/docs/connect/ (2024-26)

## Resumen
Canva no expone API key directa. Es OAuth 2.0 `authorization_code + PKCE`. Sin app creada y sin consent del admin, el conector queda `enabled:false`.

## Requisitos
1. Crear App en https://www.canva.com/developers → Create an App → Connect API → Team mínimo para producción.
2. Redirect URI exacta: `https://ventasproia.com/api/canva/callback` (dev: `http://localhost:3002/api/canva/callback`)
3. Scopes: `design:content:read`, `design:content:write`, `asset:read`, `asset:write`, `brandtemplate:content:read`, `profile:read` (+ `offline_access` si quieres refresh)
4. Endpoints: `POST /rest/oauth/token`, `POST /rest/designs`, `POST /rest/autofills`, `POST /rest/exports`, `GET /rest/exports/{id}`, `POST /rest/assets`
5. Limitaciones reales 2026: `Autofill` video = Enterprise (Free/Pro solo imagen, 403), diseño debe partir de template tuyo con placeholders, export `MP4` consume 1 diseño, rate ~50/min, review obligatoria.

## Variables (.env)
```
CANVA_CLIENT_ID=
CANVA_CLIENT_SECRET=
CANVA_REDIRECT_URI=https://ventasproia.com/api/canva/callback
CANVA_ENABLED=false
```

## Flujo
1. `GET /api/canva/auth` → 302 a `https://www.canva.com/api/oauth/authorize?client_id&scope&redirect_uri&code_challenge`
2. Callback valida `state` anti-CSRF → intercambia `code` → guarda `access_token` cifrado vía `ai-keys.ts` (AES-GCM con COOKIE_SECRET)
3. `atlas_canva_create_design` solo si `CANVA_ENABLED=true` y token válido; si no, responde `Canva desactivado: falta CANVA_CLIENT_ID, sigue con FFmpeg local`.

## Estado actual
`src/lib/canva-connector.ts` no existe → conector desactivado. Producción local FFmpeg es prioritaria (costo 0).
