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
      // 2. Verificar que el último mensaje sigue siendo del bot (si el cliente respondió, el drip ya se canceló por adaptador, pero por si quedó huérfano)
      try {
        const { db, messages } = await import("@workspace/db");
        const { eq, desc } = await import("drizzle-orm");
        const [ultimo]: any[] = await db.select({ role: messages.role }).from(messages).where(eq(messages.conversationId, conversacionId)).orderBy(desc(messages.createdAt), desc(messages.id)).limit(1);
        if (ultimo?.role === "customer") {
          logger.info({ conversacionId, plantilla }, "[FollowupPro] Cliente ya respondió, se omite drip huérfano");
          return { ok: true, omitido: "ya_respondio" };
        }
      } catch {}
      // 3. Enviar por WhatsApp vía transporte (baileys o cloud) — respeta maqueta si hay
      let enviado = false;
      try {
        const phone = String((conv as any).contactPhone || "");
        const pushName = String((conv as any).contactName || "");
        if (!phone) throw new Error("sin teléfono");
        const { enviarPartsAlCliente } = await import("../transporte-whatsapp");
        const { saveAgentMessage } = await import("../conversation-engine");
        // Guardar en historial igual que el bot
        await saveAgentMessage(conversacionId, texto, "followup" as any, { intent: "followup_pro", isHardcoded: true } as any);
        const parts: any[] = [{ type: "text", content: texto }];
        // Si la maqueta es video, el transporte ya sabe mandar video si el texto incluye link; por ahora solo texto + followup
        await enviarPartsAlCliente(tenantId, phone, pushName, parts);
        enviado = true;
      } catch (e: any) {
        logger.warn({ err: e?.message, conversacionId }, "[FollowupPro] No se pudo enviar por transporte");
      }
      return { ok: enviado, plantilla, conversacionId };
    } catch (e: any) {
      logger.error({ err: e?.message }, "[FollowupPro] Error en manejador");
      return { ok: false, error: e?.message };
    }
  });
}
