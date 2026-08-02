import * as nodemailer from "nodemailer";
import { logger } from "./logger";
import type { TenantContext } from "./tenantManager";

/**
 * Credenciales SMTP POR NEGOCIO.
 *
 * Igual que los cobros (tenant-payment-credentials.ts) y Facebook
 * (tenant-facebook-credentials.ts): email.ts leía `process.env.SMTP_*`
 * directo, así que los correos de TODOS los negocios salían de la cuenta del
 * dueño del servidor. Con un negocio funciona por casualidad; con dos, cada
 * negocio debería mandar los suyos desde SU cuenta de correo.
 *
 * Acá resolvemos el SMTP efectivo del negocio (guardado cifrado en
 * metadata.email, same shape que el resto) cayendo al .env solo si el negocio
 * todavía no cargó el suyo. `propias` distingue un caso del otro.
 *
 * Los secretos se guardan CIFRADOS: la password SMTP permite leer y enviar
 * correo en nombre del cliente. Nunca vuelve al navegador en claro.
 */

export interface CredencialesEmail {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
  enabled: boolean;
  /** true si salieron de la config del negocio; false si son las del .env */
  propias: boolean;
}

export function cifrarEmailPass(texto: string): string {
  // Reusa el cifrado de credentials-vault (mismo que usa Facebook).
  const { encryptSecret } = require("./credentials-vault");
  return texto ? encryptSecret(texto) : "";
}

function leerSecreto(valor: unknown): string {
  if (!valor) return "";
  if (typeof valor === "string") {
    // Cifrado legacy con credentials-vault tiene prefijo enc:v1: — se descifra.
    if (valor.startsWith("enc:v1:")) {
      const { decryptSecret } = require("./credentials-vault");
      try { return decryptSecret(valor); } catch { return ""; }
    }
    return valor;
  }
  return "";
}

export function enmascararEmailPass(valor: string): string {
  return valor ? "••••" + valor.slice(-4) : "";
}

/**
 * Credenciales SMTP efectivas de un negocio. Cae al .env solo si el negocio
 * no configuró las suyas.
 */
export function credencialesEmailDe(tenant: TenantContext | null | undefined): CredencialesEmail {
  const em: any = tenant?.emailCredentials || {};
  const host = em.host || process.env.SMTP_HOST || "smtp.gmail.com";
  const port = Number(em.port || process.env.SMTP_PORT || "587");
  const secure = em.secure ?? process.env.SMTP_SECURE === "true";
  const user = em.user || process.env.SMTP_USER || "";
  const pass = leerSecreto(em.pass) || process.env.SMTP_PASS || "";
  const from = em.from || `"${tenant?.brandName || "VentasPro"}" <${user}>`;

  const tienePropias = !!em.host || !!em.user || !!em.pass;

  return {
    host,
    port,
    secure,
    user,
    pass,
    from,
    enabled: tienePropias ? em.enabled !== false : !!(process.env.SMTP_USER && process.env.SMTP_PASS),
    propias: tienePropias,
  };
}

/**
 * Crea un transporter nodemailer con las credenciales dadas.
 */
export function crearTransporter(creds: Pick<CredencialesEmail, "host" | "port" | "secure" | "user" | "pass">) {
  if (!creds.user || !creds.pass) return null;
  return nodemailer.createTransport({
    host: creds.host,
    port: creds.port,
    secure: creds.secure,
    auth: { user: creds.user, pass: creds.pass },
  });
}

/**
 * Verifica las credenciales SMTP conectando al servidor (nodemailer verify).
 * No envía nada, solo abre una conexión.
 */
export async function probarSMTP(creds: Pick<CredencialesEmail, "host" | "port" | "secure" | "user" | "pass">):
  Promise<{ ok: boolean; detalle: string }> {
  if (!creds.user || !creds.pass) return { ok: false, detalle: "Faltan usuario y contraseña SMTP" };
  const tr = crearTransporter(creds);
  if (!tr) return { ok: false, detalle: "No se pudo crear el transporte SMTP" };
  try {
    await tr.verify();
    return { ok: true, detalle: `Conectado a ${creds.host}:${creds.port} como ${creds.user}` };
  } catch (err: any) {
    return { ok: false, detalle: err?.message || "No se pudo conectar al servidor SMTP" };
  } finally {
    tr.close?.();
  }
}
