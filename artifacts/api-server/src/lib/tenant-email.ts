import nodemailer from "nodemailer";
import { logger } from "./logger";
import { encryptSecret, decryptSecret } from "./credentials-vault";
import { tenantManager } from "./tenantManager";
import { secretoNuevo } from "./secretos";

/**
 * Correo saliente POR NEGOCIO.
 *
 * Hasta acá TODO el correo salía de las variables SMTP_* del servidor y
 * firmado como "VentasPro", hardcodeado en cinco lugares. Para el cliente
 * final eso significa que la confirmación de su compra le llega de una marca
 * que no reconoce -- va directo a spam o se lee como estafa.
 *
 * DÓNDE SÍ Y DÓNDE NO
 *
 * No todo el correo debe salir del negocio, y meter todo en la misma bolsa
 * rompería cosas:
 *
 *   Correo de PLATAFORMA (código de verificación al registrarse, recuperar
 *   contraseña, token de activación) -> sigue saliendo del servidor. Alguien
 *   que recién se registra todavía no configuró su SMTP, y "recuperar
 *   contraseña" tiene que funcionar aunque el cliente haya roto el suyo. Si
 *   dependiera de su config, un error ahí lo deja afuera sin salida.
 *
 *   Correo del NEGOCIO a SUS clientes (confirmación de compra, entrega) ->
 *   sale del correo del negocio. Ese es el que tiene que llevar su marca.
 *
 * La contraseña se guarda cifrada con el mismo vault que Facebook.
 */

export interface ConfigCorreoNegocio {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  fromName: string;
  enabled: boolean;
  /** true si es del negocio; false si cayó al SMTP del servidor */
  propio: boolean;
}

function leerMeta(metadata: unknown): any {
  if (!metadata) return {};
  try {
    return typeof metadata === "string" ? JSON.parse(metadata) : (metadata as any);
  } catch {
    return {};
  }
}

/**
 * Config efectiva de correo de un negocio. Cae al SMTP del servidor si el
 * negocio no configuró el suyo, para no romper la instalación actual.
 */
export function configCorreoDe(tenant: any): ConfigCorreoNegocio {
  const meta = leerMeta(tenant?.metadata);
  const e = meta?.email || {};
  // Sin espacios: Google muestra la clave de aplicación agrupada de a cuatro
  // ("abcd efgh ijkl mnop") y así se copia, pero la clave real son 16
  // caracteres seguidos. Con los espacios, Gmail rechaza la autenticación y el
  // correo no sale -- y la pantalla no lo delata, porque ahí solo se guarda.
  const pass = decryptSecret(e.pass).replace(/\s+/g, "");
  const propio = !!(e.user && pass);

  // El respaldo del .env vale SOLO para el negocio dueño del servidor.
  //
  // Para otro negocio significaría mandar correos a SUS clientes desde la
  // casilla del dueño de la plataforma: las respuestas le llegan a él, y el
  // comprador ve una dirección que no tiene nada que ver con quien le vendió.
  const esDuenoDelServidor = !tenant?.id || tenant.id === tenantManager.getDefaultTenant().id;
  const envUser = esDuenoDelServidor ? (process.env.SMTP_USER || "") : "";
  const envPass = esDuenoDelServidor ? (process.env.SMTP_PASS || "") : "";

  return {
    host: e.host || process.env.SMTP_HOST || "smtp.gmail.com",
    // Gmail: 465 va con TLS directo, 587 con STARTTLS. Elegir mal deja el
    // envío colgado hasta timeout en vez de dar un error claro.
    port: Number(e.port) || Number(process.env.SMTP_PORT) || 587,
    secure: e.port ? Number(e.port) === 465 : Number(process.env.SMTP_PORT) === 465,
    user: propio ? e.user : envUser,
    pass: propio ? pass : envPass,
    fromName: e.fromName || tenant?.brandName || tenant?.name || "VentasPro",
    enabled: propio ? e.enabled !== false : !!envUser,
    propio,
  };
}

/** Guarda la contraseña cifrada, igual que las credenciales de Facebook. */
export function cifrarPassCorreo(plain: string): string {
  return encryptSecret(plain);
}

export function construirMetaCorreo(
  metadataActual: unknown,
  datos: { host?: string; port?: number; user?: string; pass?: string; fromName?: string; enabled?: boolean },
): any {
  const meta = leerMeta(metadataActual);
  const prev = meta.email || {};
  return {
    ...meta,
    email: {
      ...prev,
      ...(datos.host !== undefined ? { host: datos.host } : {}),
      ...(datos.port !== undefined ? { port: datos.port } : {}),
      ...(datos.user !== undefined ? { user: datos.user } : {}),
      // Vacío = "no lo cambies": el GET nunca devuelve la contraseña, así que
      // el formulario no puede reenviarla.
      // Tampoco una máscara ("••••abcd"): se cifraría como si fuera la clave.
      ...(secretoNuevo(datos.pass) ? { pass: cifrarPassCorreo(String(datos.pass)) } : {}),
      ...(datos.fromName !== undefined ? { fromName: datos.fromName } : {}),
      ...(datos.enabled !== undefined ? { enabled: datos.enabled } : {}),
    },
  };
}

function transporteDe(cfg: ConfigCorreoNegocio) {
  return nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.user, pass: cfg.pass },
  });
}

/**
 * Envía un correo DEL NEGOCIO a un cliente suyo.
 * Devuelve false en vez de lanzar: que falle un correo no debe tumbar la
 * venta que lo disparó.
 */
export async function enviarComoNegocio(
  tenantId: number,
  opciones: { to: string; subject: string; html: string },
): Promise<boolean> {
  try {
    const tenant = await tenantManager.getTenantById(tenantId);
    const cfg = configCorreoDe(tenant);
    if (!cfg.enabled || !cfg.user || !cfg.pass) {
      logger.warn({ tenantId }, "[CorreoNegocio] Sin correo configurado; no se envía");
      return false;
    }
    await transporteDe(cfg).sendMail({
      from: `"${cfg.fromName}" <${cfg.user}>`,
      to: opciones.to,
      subject: opciones.subject,
      html: opciones.html,
    });
    logger.info({ tenantId, propio: cfg.propio }, "[CorreoNegocio] Enviado");
    return true;
  } catch (err) {
    logger.error({ err, tenantId }, "[CorreoNegocio] Error enviando");
    return false;
  }
}

/**
 * Prueba la configuración contra el servidor SMTP real.
 *
 * verify() abre la conexión y autentica sin mandar nada. Guardar sin probar
 * es descubrir que estaba mal el día que un cliente compra y no recibe nada.
 */
export async function probarCorreo(cfg: {
  host: string; port: number; user: string; pass: string;
}): Promise<{ ok: boolean; detalle: string }> {
  if (!cfg.user || !cfg.pass) return { ok: false, detalle: "Faltan el correo o la contraseña" };
  try {
    const t = nodemailer.createTransport({
      host: cfg.host || "smtp.gmail.com",
      port: cfg.port || 587,
      secure: (cfg.port || 587) === 465,
      auth: { user: cfg.user, pass: cfg.pass },
      connectionTimeout: 12000,
    });
    await t.verify();
    return { ok: true, detalle: `Conectado como ${cfg.user}` };
  } catch (err: any) {
    const msg = String(err?.message || "");
    // El error crudo de Gmail no dice qué hacer; esto sí.
    if (/invalid login|username and password not accepted|535/i.test(msg)) {
      return {
        ok: false,
        detalle: "Gmail rechazó el acceso. Con verificación en dos pasos activa, hay que usar una CONTRASEÑA DE APLICACIÓN, no la del correo.",
      };
    }
    return { ok: false, detalle: msg || "No se pudo conectar al servidor de correo" };
  }
}
