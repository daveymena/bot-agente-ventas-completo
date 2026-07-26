/**
 * Claves de proveedores de IA guardadas desde la pantalla de Configuración.
 *
 * Dos problemas que resuelve:
 *
 * 1. QUE FUNCIONEN. Todo el código de proveedores lee `process.env`. Una clave
 *    guardada en la base no serviría de nada por sí sola, así que al arrancar
 *    (y tras cada guardado) se vuelcan al entorno del proceso. Así los
 *    proveedores existentes funcionan sin tocarlos.
 *
 * 2. QUE ESTÉN PROTEGIDAS. No se guardan en claro: se cifran con AES-256-GCM
 *    usando una clave derivada de COOKIE_SECRET. Si alguien lee la base, no
 *    obtiene las claves. Y nunca se devuelven al frontend (solo "tiene clave:
 *    sí/no").
 */
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { db, settings } from "@workspace/db";
import { logger } from "./logger";

const PREFIJO = "enc:v1:";

/** Variable de entorno que espera cada proveedor. */
export const ENV_POR_PROVEEDOR: Record<string, string> = {
  opencode: "OPENCODE_API_KEY",
  groq: "GROQ_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  google_ai_studio: "GOOGLE_API_KEY",
  cerebras: "CEREBRAS_API_KEY",
  cohere: "COHERE_API_KEY",
  nvidia_nim: "NVIDIA_API_KEY",
  github: "GITHUB_TOKEN",
  mimo: "MIMO_API_KEY",
};

/** Variable del MODELO de cada proveedor (para que la elección también aplique). */
export const ENV_MODELO_POR_PROVEEDOR: Record<string, string> = {
  opencode: "OPENCODE_MODEL",
  groq: "GROQ_MODEL",
  openrouter: "OPENROUTER_MODEL",
  google_ai_studio: "GOOGLE_MODEL",
  cerebras: "CEREBRAS_MODEL",
  cohere: "COHERE_MODEL",
  nvidia_nim: "NVIDIA_NIM_MODEL",
  github: "GITHUB_MODEL",
  mimo: "MIMO_MODEL",
};

function claveMaestra(): Buffer {
  // COOKIE_SECRET ya es obligatorio para las sesiones; se reutiliza como raíz.
  const secreto = process.env.COOKIE_SECRET || "clave-de-desarrollo-no-usar-en-produccion";
  return scryptSync(secreto, "ai-keys-v1", 32);
}

export function cifrar(texto: string): string {
  try {
    const iv = randomBytes(12);
    const c = createCipheriv("aes-256-gcm", claveMaestra(), iv);
    const dato = Buffer.concat([c.update(texto, "utf8"), c.final()]);
    const tag = c.getAuthTag();
    return PREFIJO + Buffer.concat([iv, tag, dato]).toString("base64");
  } catch (e: any) {
    logger.error({ err: e?.message }, "[AIKeys] no se pudo cifrar");
    return texto;
  }
}

export function descifrar(valor: string): string | null {
  if (!valor) return null;
  if (!valor.startsWith(PREFIJO)) return valor; // guardada antes de cifrar
  try {
    const buf = Buffer.from(valor.slice(PREFIJO.length), "base64");
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const dato = buf.subarray(28);
    const d = createDecipheriv("aes-256-gcm", claveMaestra(), iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(dato), d.final()]).toString("utf8");
  } catch {
    // Ocurre si cambió COOKIE_SECRET: la clave guardada ya no se puede leer.
    logger.warn("[AIKeys] no se pudo descifrar una clave (¿cambió COOKIE_SECRET?)");
    return null;
  }
}

/** Lee las claves guardadas y las expone al proceso para que los proveedores las usen. */
export async function cargarClavesEnEntorno(): Promise<number> {
  try {
    const [row] = await db.select().from(settings).limit(1);
    if (!row) return 0;
    const bc: any = row.businessConfig;
    const cfg = typeof bc === "string" ? JSON.parse(bc || "{}") : bc || {};
    const guardados = cfg.aiProviders || {};

    let aplicadas = 0;
    for (const [proveedor, datos] of Object.entries<any>(guardados)) {
      const envKey = ENV_POR_PROVEEDOR[proveedor];
      if (envKey && datos?.apiKey) {
        const plana = descifrar(datos.apiKey);
        // El entorno manda: si el .env ya trae la clave, no se pisa.
        if (plana && !process.env[envKey]) {
          process.env[envKey] = plana;
          aplicadas++;
        }
      }
      const envModelo = ENV_MODELO_POR_PROVEEDOR[proveedor];
      if (envModelo && datos?.model) process.env[envModelo] = datos.model;
    }
    if (aplicadas > 0) logger.info({ aplicadas }, "[AIKeys] claves guardadas cargadas al entorno");
    return aplicadas;
  } catch (e: any) {
    logger.error({ err: e?.message }, "[AIKeys] error cargando claves guardadas");
    return 0;
  }
}
