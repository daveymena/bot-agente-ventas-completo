import * as nodemailer from "nodemailer";
import { logger } from "./logger";
import { tenantManager, type TenantContext } from "./tenantManager";

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
 * Credenciales SMTP efectivas de un negocio.
 *
 * El SMTP del .env es la casilla del DUEÑO del servidor (29-09-2026). Antes
 * caía a ella para CUALQUIER negocio sin correo propio: el acceso de un
 * producto digital le llegaba a su cliente desde la casilla del dueño, y la
 * lectura de avisos del banco (IMAP, whatsapp.ts) revisaba la bandeja del
 * dueño para confirmar pagos de OTRO negocio. Ahora el .env solo vale para
 * el negocio dueño, salvo `sistema: true`: los correos de la PLATAFORMA a
 * sus usuarios (recuperar/cambiar contraseña), que sí salen de su casilla.
 */
export function credencialesEmailDe(tenant: TenantContext | null | undefined, opts: { sistema?: boolean } = {}): CredencialesEmail {
  const em: any = tenant?.emailCredentials || {};
  const usaEnv = !!opts.sistema || !tenant?.id || tenant.id === tenantManager.getDefaultTenant().id;
  const envUser = usaEnv ? process.env.SMTP_USER : "";
  const envPass = usaEnv ? process.env.SMTP_PASS : "";
  const host = em.host || process.env.SMTP_HOST || "smtp.gmail.com";
  const port = Number(em.port || process.env.SMTP_PORT || "587");
  const secure = em.secure ?? process.env.SMTP_SECURE === "true";
  const user = (em.user || envUser || "").trim();
  // Los espacios se van SIEMPRE, y no es cosmética.
  //
  // Google muestra la clave de aplicación agrupada de a cuatro
  // ("abcd efgh ijkl mnop") y eso es lo que uno copia. La clave real son 16
  // caracteres sin espacios; con ellos, Gmail rechaza la autenticación y el
  // correo no sale -- sin ningún error visible en la pantalla de
  // configuración, porque ahí solo se guarda.
  //
  // Medido el 2026-08-25: SMTP_PASS llegó con 19 caracteres, o sea los 16 más
  // los 3 espacios de la agrupación.
  const pass = (leerSecreto(em.pass) || envPass || "").replace(/\s+/g, "");
  const from = em.from || `"${tenant?.brandName || "VentasPro"}" <${user}>`;

  const tienePropias = !!em.host || !!em.user || !!em.pass;

  return {
    host,
    port,
    secure,
    user,
    pass,
    from,
    enabled: tienePropias ? em.enabled !== false : !!(envUser && envPass),
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
