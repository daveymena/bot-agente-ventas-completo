import { Router } from "express";
import crypto from "node:crypto";
import { db, tenants } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";
import { estadoCanva, CANVA_SCOPES, canvaRequest } from "../lib/canva-connector";
import { encryptSecret } from "../lib/credentials-vault";

export const canvaRouter = Router();

function tenantIdDe(req: any): number | null {
  // Solo cookie FIRMADA: el fallback a req.cookies (no firmado) permitía fijar
  // el tenant con un valor controlado por el cliente.
  const raw = req.signedCookies?.tenant_id;
  const id = Number(raw);
  if (Number.isSafeInteger(id) && id > 0) return id;
  const tid = Number((req as any).tenant?.id);
  return Number.isSafeInteger(tid) && tid > 0 ? tid : null;
}

// PKCE store en memoria (single container). Para multi-instancia debería ser DB, pero Easypanel es 1.
const PKCE_STORE = new Map<string, { tenantId: number; verifier: string; redirectUri: string; expires: number }>();
const PKCE_TTL_MS = 10 * 60 * 1000;

function baseUrl(): string {
  return String(process.env.APP_URL || "https://ventasproia.com").replace(/\/+$/, "");
}
function redirectUri(): string {
  return String(process.env.CANVA_REDIRECT_URI || `${baseUrl()}/api/canva/callback`).trim();
}
function canvaAuthorizeUrl(clientId: string, challenge: string, state: string): string {
  // Nombres exactos según OpenAPI oficial Canva: brandtemplate SIN guion bajo (brand_template da invalid_scope).
  // design:meta:read es obligatorio para LISTAR diseños (el endpoint lo exige aunque solo leas contenido).
  const scopes = CANVA_SCOPES.join(" ");
  const params = new URLSearchParams({
    code_challenge: challenge,
    code_challenge_method: "S256",
    scope: scopes,
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri(),
    state,
  });
  return `https://www.canva.com/api/oauth/authorize?${params.toString()}`;
}

async function leerMetadataCanva(tenantId: number): Promise<any> {
  const [row] = await db.select({ metadata: tenants.metadata }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  const meta = row?.metadata as any;
  if (!meta) return {};
  if (typeof meta === "string") { try { return JSON.parse(meta); } catch { return {}; } }
  return meta;
}

/** GET /api/canva/estado — estado sin secretos (para dashboard). */
canvaRouter.get("/estado", async (req, res) => {
  const tid = tenantIdDe(req);
  if (!tid) return res.status(401).json({ success: false, error: "No autenticado" });
  const base = await estadoCanva();
  const meta = await leerMetadataCanva(tid);
  const canva = meta.canva || {};
  const tieneToken = !!canva.accessToken;
  // nunca devolver el token
  return res.json({
    success: true,
    canva: {
      ...base,
      tieneToken,
      conectado: base.enabled && tieneToken && canva.verificado === true,
      requiereRevision: tieneToken && canva.verificado !== true,
      actualizadoEn: canva.actualizadoEn || null,
    },
  });
});

/** GET /api/canva/auth — inicia OAuth PKCE, redirige a Canva. */
canvaRouter.get("/auth", async (req, res) => {
  const tid = tenantIdDe(req);
  if (!tid) return res.status(401).json({ success: false, error: "No autenticado" });
  const cid = String(process.env.CANVA_CLIENT_ID || "").trim();
  const sec = String(process.env.CANVA_CLIENT_SECRET || "").trim();
  const enabled = process.env.CANVA_ENABLED === "true";
  if (!enabled) return res.status(400).json({ success: false, error: "Canva desactivado: pon CANVA_ENABLED=true y CANVA_CLIENT_ID/SECRET en el entorno." });
  if (!cid || !sec) return res.status(400).json({ success: false, error: "Faltan CANVA_CLIENT_ID o CANVA_CLIENT_SECRET." });

  const verifier = crypto.randomBytes(32).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  const state = crypto.randomBytes(16).toString("base64url") + "." + Buffer.from(JSON.stringify({ t: tid, ts: Date.now() })).toString("base64url");
  PKCE_STORE.set(state, { tenantId: tid, verifier, redirectUri: redirectUri(), expires: Date.now() + PKCE_TTL_MS });
  // limpia expirados
  for (const [k, v] of PKCE_STORE) if (v.expires < Date.now()) PKCE_STORE.delete(k);
  const url = canvaAuthorizeUrl(cid, challenge, state);
  logger.info({ tenantId: tid }, "[Canva] redirect a authorize");
  return res.redirect(url);
});

/** GET /api/canva/callback?code=...&state=... — Canva vuelve acá (PÚBLICO, debe estar en publicRoutes). */
canvaRouter.get("/callback", async (req, res) => {
  const code = String(req.query.code || "").trim();
  const state = String(req.query.state || "").trim();
  const error = String(req.query.error || "").trim();
  if (error) return res.status(400).send(`Canva devolvió error: ${error} — ${String(req.query.error_description || "")}`);
  if (!code || !state) return res.status(400).send("Falta code o state de Canva.");
  const entry = PKCE_STORE.get(state);
  if (!entry) return res.status(400).send("State inválido o expirado: vuelve al panel e inicia de nuevo.");
  PKCE_STORE.delete(state);
  if (entry.expires < Date.now()) return res.status(400).send("State expirado.");
  const tid = entry.tenantId;
  const cid = String(process.env.CANVA_CLIENT_ID || "").trim();
  const sec = String(process.env.CANVA_CLIENT_SECRET || "").trim();
  if (!cid || !sec) return res.status(400).send("Faltan credenciales en el servidor.");
  try {
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      code_verifier: entry.verifier,
      client_id: cid,
      client_secret: sec,
      redirect_uri: entry.redirectUri,
    });
    // Base oficial Connect API: /rest/v1 (sin /v1/ Canva devuelve 404).
    const r = await fetch("https://api.canva.com/rest/v1/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      signal: AbortSignal.timeout(20_000),
    });
    const j: any = await r.json().catch(() => ({}));
    if (!r.ok || !j.access_token) {
      logger.warn({ status: r.status, body: j }, "[Canva] token exchange falló");
      return res.status(400).send(`No se pudo canjear el código: ${j.error || j.error_description || r.status}`);
    }
    const meta = await leerMetadataCanva(tid);
    meta.canva = {
      accessToken: encryptSecret(String(j.access_token)),
      refreshToken: j.refresh_token ? encryptSecret(String(j.refresh_token)) : null,
      expiraEn: Date.now() + (Number(j.expires_in) || 14_400) * 1000,
      tokenType: j.token_type || "Bearer",
      scope: j.scope || "",
      actualizadoEn: new Date().toISOString(),
    };
    await db.update(tenants).set({ metadata: meta as any }).where(eq(tenants.id, tid));
    logger.info({ tenantId: tid }, "[Canva] conectado");
    return res.redirect("/integraciones?canva=conectado");
  } catch (e: any) {
    logger.warn({ err: e?.message }, "[Canva] callback falló");
    return res.status(400).send(`Error al conectar Canva: ${e?.message || e}`);
  }
});

/** DELETE /api/canva/desconectar — borra token. */
canvaRouter.delete("/desconectar", async (req, res) => {
  const tid = tenantIdDe(req);
  if (!tid) return res.status(401).json({ success: false, error: "No autenticado" });
  const meta = await leerMetadataCanva(tid);
  delete meta.canva;
  delete meta.canva_pkce;
  await db.update(tenants).set({ metadata: meta as any }).where(eq(tenants.id, tid));
  return res.json({ success: true });
});

/** Verifica acceso real, renovando tokens vencidos; no crea diseños. */
canvaRouter.post("/probar", async (req, res) => {
  const tid = tenantIdDe(req);
  if (!tid) return res.status(401).json({ success: false, error: "No autenticado" });
  try {
    const listado = await canvaRequest(tid, "/designs?limit=1");
    const caps = await canvaRequest(tid, "/users/me/capabilities").catch(() => null);
    const meta = await leerMetadataCanva(tid);
    meta.canva = { ...meta.canva, verificado: true, verificadoEn: new Date().toISOString() };
    await db.update(tenants).set({ metadata: meta as any }).where(eq(tenants.id, tid));
    return res.json({ success: true, disenosVisibles: listado.items?.length || 0, capacidades: caps?.capabilities || null });
  } catch (e: any) {
    const meta = await leerMetadataCanva(tid);
    if (meta.canva) { meta.canva.verificado = false; await db.update(tenants).set({ metadata: meta as any }).where(eq(tenants.id, tid)); }
    return res.status(e.status === 401 ? 409 : 502).json({ success: false, error: e.message || "No se pudo comprobar Canva", reconnect: e.status === 401 });
  }
});

// Studio comparte las mismas credenciales del negocio y el mismo control de sesión.
import { canvaStudioRouter } from "./canva-studio";
canvaRouter.use("/studio", canvaStudioRouter);

export default canvaRouter;
