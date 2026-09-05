// ────────────────────────────────────────────────────────────────────────────
// whatsapp-factory.ts — Multi-tenant WhatsApp manager
//
// Antes todo el sistema usaba UN solo singleton (`whatsapp` en lib/whatsapp.ts)
// con UN solo directorio de credenciales. Eso significaba que si abrías el bot
// desde otra cuenta o para otro tenant, la sesión anterior se sobrescribía o
// quedaba corrupta.
//
// Ahora cada tenant tiene su propia instancia de WhatsAppByTenant, con su propia
// carpeta `auth/tenants/<id>/.baileys-auth/`, su propio QR y su propio estado.
// Así abrir el bot en otro lugar no afecta a los demás.
// ────────────────────────────────────────────────────────────────────────────

import path from "node:path";
import { existsSync, mkdirSync } from "node:fs";
import { tenantManager, type TenantContext } from "./tenantManager";
import { WhatsAppByTenant } from "./whatsappManagerByTenant";
import { logger } from "./logger";
import { prepararSalidaFinal, prepararTextoWhatsApp } from "./salida-segura-whatsapp";

// Raíz de credenciales por tenant — cada tenant tiene su subcarpeta.
const AUTH_BASE =
  process.env.WA_AUTH_DIR
    ? path.resolve(process.env.WA_AUTH_DIR, "tenants")
    : path.resolve(process.cwd(), "data", "whatsapp-tenants");

export function tenantAuthDir(tenantId: number): string {
  return path.join(AUTH_BASE, `tenant-${tenantId}`);
}

const instances = new Map<number, WhatsAppByTenant>();
const salidaInstalada = new WeakSet<object>();

/**
 * Última barrera antes de WhatsApp.
 *
 * El agente puede producir partes por IA, reglas o tarjetas. Todos terminan
 * llamando a sendAgentParts/sendText/sendImage. Envolvemos la instancia una
 * sola vez para que el mismo candado proteja los tres caminos, sin duplicar
 * lógica dentro de cada proveedor o agente.
 */
function instalarSalidaSegura(instance: WhatsAppByTenant, tenantId: number): void {
  if (salidaInstalada.has(instance)) return;
  salidaInstalada.add(instance);

  const originalSendAgentParts = instance.sendAgentParts.bind(instance);
  const originalSendText = instance.sendText.bind(instance);
  const originalSendImage = instance.sendImage.bind(instance);

  instance.sendAgentParts = async function (phone: string, pushName: string, parts: any[], originalJid?: string) {
    const preparado = prepararSalidaFinal(parts as any);

    if (preparado.blockedPlaceholders.length > 0) {
      logger.error({
        tenantId,
        blockedPlaceholders: preparado.blockedPlaceholders,
      }, "[FINAL-RESPONSE] Se bloquearon placeholders antes de WhatsApp");
    }

    if (preparado.removedClaims.length > 0) {
      logger.info({
        tenantId,
        removedClaims: preparado.removedClaims,
      }, "[FINAL-RESPONSE] Se reconciliaron promesas con lo que realmente viaja");
    }

    if (!preparado.parts.length) {
      logger.warn({ tenantId, phone }, "[FINAL-RESPONSE] No quedó contenido seguro para enviar");
      return;
    }

    return originalSendAgentParts(phone, pushName, preparado.parts as any, originalJid);
  } as any;

  instance.sendText = async function (phone: string, text: string, originalJid?: string) {
    return originalSendText(phone, prepararTextoWhatsApp(text), originalJid);
  } as any;

  instance.sendImage = async function (phone: string, imageUrl: string, caption: string, originalJid?: string) {
    return originalSendImage(phone, imageUrl, prepararTextoWhatsApp(caption), originalJid);
  } as any;
}

/**
 * Devuelve (o crea) la instancia de WhatsApp asociada al tenant.
 *
 * `tenantCtx` es el TenantContext REAL del tenant (ej. req.tenant, ya
 * resuelto por resolveTenant() en el request) -- se usa para que la
 * instancia conozca su propio negocio (brandName, agentPrompt, credenciales
 * de pago, etc). Antes esta función SIEMPRE usaba
 * tenantManager.getDefaultTenant() sin importar qué tenantId se pidiera
 * (tenantManager.getById no existe y el lookup real es async, mientras esta
 * función es síncrona) -- el aislamiento de auth/QR por carpeta SÍ
 * funcionaba, pero la identidad de negocio de la instancia era siempre la
 * del tenant 1. Eso es una bomba de tiempo real: en cuanto la instancia de
 * OTRO tenant enviara mensajes o generara un link de pago, usaría las
 * credenciales de MercadoPago/PayPal y el prompt del tenant 1.
 *
 * Si no se pasa ni tenantId ni tenantCtx, cae al tenant por defecto (id 1).
 */
export function getWhatsAppForTenant(tenantId?: number, tenantCtx?: TenantContext): WhatsAppByTenant {
  const tid = tenantId ?? tenantCtx?.id ?? tenantManager.getDefaultTenant().id;

  let instance = instances.get(tid);
  if (instance) {
    // La instancia ya existía (ej. se creó en el auto-start con datos
    // parciales) -- si ahora tenemos el contexto real, se actualiza para que
    // no se quede pegada a datos viejos/por defecto.
    if (tenantCtx) instance.setTenant(tenantCtx);
    instalarSalidaSegura(instance, tid);
    return instance;
  }

  const dir = tenantAuthDir(tid);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const tenant = tenantCtx ?? tenantManager.getDefaultTenant();
  instance = new WhatsAppByTenant(tenant, dir);

  instances.set(tid, instance);
  instalarSalidaSegura(instance, tid);
  logger.info({ tenantId: tid, authDir: dir }, "[WhatsApp-Factory] Instancia creada");
  return instance;
}

/**
 * Lista los tenants que tienen una instancia activa.
 */
export function listWhatsAppInstances(): Array<{ tenantId: number; status: any }> {
  return Array.from(instances.entries()).map(([tenantId, mgr]) => ({
    tenantId,
    status: mgr.getStatus(),
  }));
}

/**
 * Detiene y elimina la instancia del tenant (sin borrar credenciales en disco).
 */
export async function disposeWhatsAppForTenant(tenantId: number): Promise<void> {
  const inst = instances.get(tenantId);
  if (!inst) return;
  try {
    await inst.stop(true);
  } catch (e) {
    logger.warn({ err: e, tenantId }, "[WhatsApp-Factory] Error al detener instancia");
  }
  instances.delete(tenantId);
  logger.info({ tenantId }, "[WhatsApp-Factory] Instancia eliminada");
}