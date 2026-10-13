/**
 * Canva Connect API — conector seguro (solo lectura/estado, no OAuth activo sin credenciales)
 * Basado en https://www.canva.com/developers/docs/connect/ (2024-26)
 * - No ejecuta OAuth si CANVA_ENABLED!=true o faltan CLIENT_ID/SECRET
 * - Estado es lectura pura, no toca Canva ni gasta
 * - Cuando esté habilitado, usará PKCE + state anti-CSRF, scopes mínimos
 */
import { readFile } from "node:fs/promises";
import path from "node:path";

export interface CanvaEstado {
  enabled: boolean;
  motivo: string;
  docs: string; // ruta relativa doc
  redirectUri: string;
  scopes: string[];
  endpoints: string[];
  limitaciones: string;
  env: { CANVA_ENABLED: string; tieneClientId: boolean; tieneSecret: boolean; redirectUri: string };
}

const SCOPES = ["design:content:read","design:content:write","asset:read","asset:write","brandtemplate:content:read","profile:read"];
const ENDPOINTS = ["POST /rest/oauth/token","POST /rest/designs","POST /rest/autofills","POST /rest/exports","GET /rest/exports/{id}","POST /rest/assets"];

export async function estadoCanva(): Promise<CanvaEstado> {
  const enabled = process.env.CANVA_ENABLED === "true";
  const cid = String(process.env.CANVA_CLIENT_ID || "").trim();
  const sec = String(process.env.CANVA_CLIENT_SECRET || "").trim();
  const redirect = String(process.env.CANVA_REDIRECT_URI || "https://ventasproia.com/api/canva/callback").trim();
  let motivo = "";
  if (!enabled) motivo = "Canva desactivado: CANVA_ENABLED!=true (modo gratuito FFmpeg activo, costo 0). Para activar: crea App en developers.canva.com y pon CANVA_CLIENT_ID/SECRET.";
  else if (!cid || !sec) motivo = "Canva habilitado pero faltan CANVA_CLIENT_ID o CANVA_CLIENT_SECRET — no se inicia OAuth.";
  else motivo = "Canva listo: credenciales presentes. OAuth PKCE disponible en GET /api/canva/auth → callback valida state anti-CSRF.";
  // intenta confirmar que el doc existe
  let docs = "docs/CANVA_INTEGRATION.md";
  try {
    const p = path.resolve(process.cwd(), docs);
    await readFile(p, "utf8");
  } catch { docs = "docs/CANVA_INTEGRATION.md (no encontrado en este deploy)"; }
  return {
    enabled: enabled && !!cid && !!sec,
    motivo,
    docs,
    redirectUri: redirect,
    scopes: SCOPES,
    endpoints: ENDPOINTS,
    limitaciones: "Autofill video = Enterprise (Free/Pro solo imagen, 403). Diseño debe partir de template con placeholders. Export MP4 consume 1 diseño. Rate ~50/min. Review obligatoria.",
    env: { CANVA_ENABLED: String(process.env.CANVA_ENABLED || "false"), tieneClientId: !!cid, tieneSecret: !!sec, redirectUri: redirect },
  };
}

export async function hayCanvaSeguro(): Promise<boolean> {
  const e = await estadoCanva();
  return e.enabled;
}
