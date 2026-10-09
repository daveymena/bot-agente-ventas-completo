/**
 * UN solo lugar para avisarle al dueño lo que pasa en la automatización.
 *
 * Antes cada módulo armaba su propio envío por WhatsApp (pedidos, rechazos
 * de Dropi, lanzamientos, auditoría de tokens, informes de la agencia).
 * Ahora todos llaman acá, y acá se manda por WhatsApp Y por Telegram (si el
 * negocio lo configuró). Si un canal falla, el otro sigue; nunca se rompe el
 * flujo que estaba avisando.
 */
import { logger } from "./logger";

export interface ResultadoAviso { whatsapp: boolean; telegram: boolean }

export async function avisarAlDueno(tenantId: number, texto: string): Promise<ResultadoAviso> {
  const r: ResultadoAviso = { whatsapp: false, telegram: false };
  // WhatsApp (el canal de siempre).
  try {
    const { telefonoDelAdmin } = await import("./verificacion-pago");
    const { getWhatsAppForTenant } = await import("./whatsapp-factory");
    const phone = await telefonoDelAdmin(tenantId);
    if (phone) {
      const wa = getWhatsAppForTenant(tenantId);
      if (wa.isConnected()) { await wa.sendText(phone, texto); r.whatsapp = true; }
    }
  } catch (e: any) {
    logger.warn({ tenantId, err: e?.message }, "[Avisos] WhatsApp falló");
  }
  // Telegram.
  try {
    const { configTelegramDelTenant, enviarTelegram } = await import("./telegram");
    const cfg = await configTelegramDelTenant(tenantId);
    if (cfg) {
      const t = await enviarTelegram(cfg, texto);
      r.telegram = t.ok;
      if (!t.ok) logger.warn({ tenantId, error: t.error }, "[Avisos] Telegram falló");
    }
  } catch (e: any) {
    logger.warn({ tenantId, err: e?.message }, "[Avisos] Telegram falló");
  }
  if (!r.whatsapp && !r.telegram) logger.warn({ tenantId }, "[Avisos] ningún canal entregó el aviso");
  // Push al celular (si el dueño activó "App en tu celular"). No rompe nada.
  try {
    const { enviarPushAlDueno } = await import("./push");
    const primera = texto.split("\n")[0] || "VentasPro";
    await enviarPushAlDueno(tenantId, {
      titulo: primera.slice(0, 80),
      cuerpo: texto.slice(0, 180),
      url: "/conversations",
      tag: "aviso",
      accion: "Abrir",
    });
  } catch (e: any) {
    logger.warn({ tenantId, err: e?.message }, "[Avisos] Push falló");
  }
  return r;
}
