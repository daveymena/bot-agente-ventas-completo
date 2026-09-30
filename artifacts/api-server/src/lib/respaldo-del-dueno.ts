/**
 * El .env es la configuración del DUEÑO del servidor, no de la plataforma.
 *
 * ADMIN_PHONE, WHATSAPP_NUMBER, TRANSFER_NUMBER, FB_*, DROPI_TOKEN, SMTP_*…
 * son las cuentas de UN negocio: el que instaló el servidor (el tenant por
 * defecto). Usarlas de respaldo para cualquier negocio que no configuró lo
 * suyo mezcla negocios: sus clientes terminan en el WhatsApp del dueño, sus
 * comprobantes le llegan al dueño, sus anuncios gastan de la cuenta del dueño.
 * Barrido del 29-09-2026: el patrón estaba resuelto en pagos, email y
 * FacebookService, y abierto en ~20 lugares más.
 *
 * Regla única: el respaldo del .env vale SOLO para el negocio dueño del
 * servidor. Para cualquier otro, vacío es vacío (la interfaz pide configurar).
 */
import { tenantManager } from "./tenantManager";

export function esDuenoDelServidor(tenantId: number | null | undefined): boolean {
  return tenantId != null && Number(tenantId) === tenantManager.getDefaultTenant().id;
}

/** El valor del .env si el negocio es el dueño del servidor; si no, "". */
export function envSoloDelDueno(tenantId: number | null | undefined, valor: string | undefined): string {
  return esDuenoDelServidor(tenantId) ? String(valor || "") : "";
}
