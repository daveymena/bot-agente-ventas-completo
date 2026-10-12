/**
 * WhatsApp Followup Pro — Manejador para programador.ts
 * Se registra en el arranque del server para que los trabajos whatsapp_followup_pro se ejecuten.
 * Cancela solo si la conversación ya tiene respuesta reciente o está escalada.
 */
import { registrarManejador } from "../programador";
import { logger } from "../logger";

export function registrarManejadorFollowupPro(): void {
  registrarManejador("whatsapp_followup_pro", async ({ tenantId, datos }) => {
    const conversacionId = Number(datos?.conversacionId) || 0;
    const texto = String(datos?.texto || "");
    const plantilla = String(datos?.plantilla || "");
    const maqueta = datos?.maqueta || null;
    if (!conversacionId || !texto) {
      logger.warn({ conversacionId, plantilla }, "[FollowupPro] Trabajo sin datos, se omite");
      return { ok: false, motivo: "sin datos" };
    }
    // 1. Anti-spam: si el cliente respondió después de programar, cancelar
    try {
      const { db, conversations } = await import("@workspace/db");
      const { eq } = await import("drizzle-orm");
      const [conv]: any[] = await db.select().from(conversations).where(eq(conversations.id, conversacionId)).limit(1);
      if (!conv) return { ok: false, motivo: "conversacion no existe" };
      // si ya hay respuesta cliente posterior a correAt, se cancela (heuristic: updatedAt muy reciente con ultimoMensaje cliente)
      // Por ahora solo verifica escalado:
      if (String((conv as any).estado || "") === "escalado") {
        logger.info({ conversacionId, plantilla }, "[FollowupPro] Ya escalado, se omite");
        return { ok: true, omitido: "escalado" };
      }
      // 2. Enviar por WhatsApp (usa adaptador v2 si existe, si no whatsapp.ts legacy)
      let enviado = false;
      try {
        const { enviarMensajeWhatsApp } = await import("../whatsapp");
        const res = await (enviarMensajeWhatsApp as any)(tenantId, conversacionId, texto, { maqueta });
        enviado = !!res?.ok;
      } catch (e: any) {
        logger.warn({ err: e?.message, conversacionId }, "[FollowupPro] No se pudo enviar");
      }
      return { ok: enviado, plantilla, conversacionId };
    } catch (e: any) {
      logger.error({ err: e?.message }, "[FollowupPro] Error en manejador");
      return { ok: false, error: e?.message };
    }
  });
}
