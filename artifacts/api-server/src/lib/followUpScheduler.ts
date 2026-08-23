import { eq, and, lte, asc, inArray } from "drizzle-orm";
import { db, conversations, messages, activityEvents, followUps, type FollowUp, type InsertFollowUp } from "@workspace/db";
import { logger } from "./logger";
import { leadScoringEngine, type LeadStage } from "./leadScoring";
import { getWhatsAppForTenant } from "./whatsapp-factory";
import { toDbDate } from "./date-utils";
import { facebookMessengerService } from "./facebook-messenger";

export class FollowUpScheduler {
  private isRunning = false;
  private intervalId: NodeJS.Timeout | null = null;

  start(intervalMinutes: number = 30): void {
    if (this.isRunning) {
      logger.warn("[FollowUpScheduler] Already running");
      return;
    }

    this.isRunning = true;
    logger.info({ intervalMinutes }, "[FollowUpScheduler] Starting scheduler");

    this.processDueFollowUps().catch(error => {
      logger.error({ error }, "[FollowUpScheduler] Initial processing failed");
    });

    this.intervalId = setInterval(() => {
      this.processDueFollowUps().catch(error => {
        logger.error({ error }, "[FollowUpScheduler] Scheduled processing failed");
      });
    }, intervalMinutes * 60 * 1000);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    logger.info("[FollowUpScheduler] Scheduler stopped");
  }

  async scheduleFollowUp(
    conversationId: number,
    stage: string,
    score: number,
    scheduledFor?: Date
  ): Promise<FollowUp | null> {
    try {
      const [conversation] = await db.select().from(conversations).where(eq(conversations.id, conversationId)).limit(1);
      if (!conversation) return null;

      // Un solo seguimiento pendiente por conversación.
      //
      // Esto se llama desde el scoring en CADA mensaje entrante y no
      // comprobaba nada: cada mensaje del cliente agregaba una fila más. Con
      // un contacto que escribió unas pocas veces se juntaron 46 seguimientos
      // pendientes para él solo (medido el 17-08-2026). Aunque el candado de
      // `debeEnviarse` ya impide que salgan, no tiene sentido acumularlos.
      const [pendiente] = await db.select({ id: followUps.id })
        .from(followUps)
        .where(and(eq(followUps.conversationId, conversationId), eq(followUps.completed, false)))
        .limit(1);
      if (pendiente) {
        logger.info({ conversationId, followUpId: pendiente.id }, "[FollowUpScheduler] Ya hay un seguimiento pendiente para esta conversación; no se agrega otro");
        return null;
      }

      if (!scheduledFor) {
        scheduledFor = this.calculateFollowUpDate(stage);
      }

      const followUpType = this.determineFollowUpType(stage, score);
      const priority = this.determinePriority(stage, score);
      // El teléfono va como semilla para que dos contactos distintos no reciban
      // el mismo texto: mandar mensajes casi idénticos a muchos números es lo
      // que hace que WhatsApp bloquee la línea del negocio.
      const message = leadScoringEngine.generateFollowUpMessage(
        stage as LeadStage,
        conversation.lastMessage || "",
        String(conversation.contactPhone || conversationId),
      );

      const [followUp] = await db.insert(followUps).values({
        conversationId,
        leadId: conversation.leadId,
        contactName: conversation.contactName,
        contactPhone: conversation.contactPhone,
        scheduledFor: toDbDate(scheduledFor),
        followUpType,
        message,
        priority,
        stage,
        lastScore: score,
        attempts: 0,
        completed: false
      }).returning();

      logger.info({ followUpId: followUp!.id, conversationId, stage }, "[FollowUpScheduler] Follow-up scheduled in DB");
      return followUp!;
    } catch (error) {
      logger.error({ error, conversationId }, "[FollowUpScheduler] Failed to schedule follow-up");
      return null;
    }
  }

  async processDueFollowUps(): Promise<void> {
    try {
      // Mismo fix que getDueFollowUpsFromDB(): sql.js rechaza bindear un Date
      // crudo. Este es el cron real que ENVÍA los follow-ups -- con el bug,
      // esta query fallaba en cada corrida (silenciosamente, atrapada por el
      // catch de abajo) y ningún follow-up se enviaba jamás.
      const now = toDbDate(new Date());
      const dueFollowUps = await db.select().from(followUps)
        .where(and(eq(followUps.completed, false), lte(followUps.scheduledFor, now as any)))
        .orderBy(asc(followUps.scheduledFor));

      if (dueFollowUps.length === 0) return;

      // UNO por conversación y por pasada.
      //
      // `debeEnviarse()` decide bien, pero decide sobre CADA fila por
      // separado: si una conversación acumuló varias, las seis pasan el
      // control y las seis se mandan, una cada 2 segundos. Fue lo que le pasó
      // a Chuy Fernando el 2026-08-22: seis "check_in" idénticos a las 20:09.
      // Para el cliente eso es acoso, y WhatsApp castiga al número que manda
      // mensajes repetidos en serie.
      //
      // Se manda el más viejo (ya vienen ordenados por `scheduledFor`) y el
      // resto se cierra como superado: si más adelante corresponde otro
      // seguimiento, se agenda uno nuevo.
      const porConversacion = new Map<number, typeof dueFollowUps>();
      for (const f of dueFollowUps) {
        const lista = porConversacion.get(f.conversationId) || [];
        lista.push(f);
        porConversacion.set(f.conversationId, lista);
      }

      const aEnviar: typeof dueFollowUps = [];
      for (const [conversationId, lista] of porConversacion) {
        aEnviar.push(lista[0]!);
        if (lista.length > 1) {
          const superados = lista.slice(1).map((f) => f.id);
          await db.update(followUps)
            .set({ completed: true })
            .where(inArray(followUps.id, superados));
          logger.warn(
            { conversationId, enviado: lista[0]!.id, superados },
            "[FollowUpScheduler] Varios seguimientos vencidos para la misma conversación — se manda uno y se cierran los demás",
          );
        }
      }

      logger.info(
        { vencidos: dueFollowUps.length, aEnviar: aEnviar.length },
        "[FollowUpScheduler] Processing due follow-ups from DB",
      );

      for (const followUp of aEnviar) {
        await this.processFollowUp(followUp);
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    } catch (error) {
      logger.error({ error }, "[FollowUpScheduler] Failed to process due follow-ups");
    }
  }

  /**
   * ¿Corresponde mandarle ESTE seguimiento a ESTA persona?
   *
   * Es el único candado real: se pregunta justo antes de enviar, así que vale
   * tanto para lo que se encole de ahora en adelante como para lo que ya está
   * encolado. `scheduleFollowUp` no comprobaba absolutamente nada y se llama
   * en CADA mensaje entrante -- el 17-08-2026 había 55 seguimientos en cola,
   * 46 de ellos para un solo contacto que había llegado de un anuncio, con
   * apenas 3 textos distintos entre todos. Esa persona iba a recibir 46
   * mensajes casi idénticos: exactamente el patrón por el que WhatsApp
   * bloquea un número.
   *
   * Las reglas salen de una instrucción explícita del dueño de la cuenta:
   * si se le escribió una vez y no respondió, NO se le vuelve a escribir a
   * menos que muestre interés.
   */
  private async debeEnviarse(followUp: FollowUp): Promise<{ ok: boolean; motivo?: string }> {
    const convoId = followUp.conversationId;
    if (!convoId) return { ok: false, motivo: "el seguimiento no tiene conversación asociada" };

    const historial = await db.select({
      role: messages.role,
      createdAt: messages.createdAt,
    }).from(messages).where(eq(messages.conversationId, convoId)).orderBy(asc(messages.createdAt));

    if (historial.length === 0) return { ok: false, motivo: "la conversación no tiene mensajes" };

    // 1. Un seguimiento por conversación mientras el cliente no vuelva a
    //    escribir. Si ya se le mandó uno y sigue callado, se acabó: insistir
    //    es lo que quema la cuenta.
    const [yaEnviado] = await db.select({ id: followUps.id })
      .from(followUps)
      .where(and(eq(followUps.conversationId, convoId), eq(followUps.completed, true)))
      .limit(1);

    const ultimoDelCliente = [...historial].reverse().find((m) => m.role === "customer");
    const ultimoNuestro = [...historial].reverse().find((m) => m.role !== "customer");

    if (yaEnviado) {
      // Solo se permite otro si el cliente HABLÓ después del anterior: eso es
      // interés, y entonces ya no es insistir sino continuar la charla.
      const hablóDespués = ultimoDelCliente && ultimoNuestro &&
        new Date(ultimoDelCliente.createdAt).getTime() > new Date(ultimoNuestro.createdAt).getTime();
      if (!hablóDespués) {
        return { ok: false, motivo: "ya se le mandó un seguimiento y no volvió a escribir" };
      }
    }

    // 2. Si el ÚLTIMO mensaje de la conversación es del cliente, está esperando
    //    respuesta nuestra -- eso no es un seguimiento, es una respuesta
    //    pendiente, y de eso se encarga el orquestador.
    if (historial[historial.length - 1]!.role === "customer") {
      return { ok: false, motivo: "el cliente escribió último: le debemos una respuesta, no un seguimiento" };
    }

    // 3. El cliente tiene que haber dicho algo alguna vez. Alguien que llegó de
    //    un anuncio, recibió el saludo automático y nunca contestó no mostró
    //    ningún interés: escribirle de nuevo es mensaje no solicitado.
    const mensajesDelCliente = historial.filter((m) => m.role === "customer").length;
    if (mensajesDelCliente < 2) {
      return { ok: false, motivo: "el cliente nunca respondió (no mostró interés)" };
    }

    // 4. Nada de escribir de madrugada: hora local de Colombia (UTC-5).
    const horaLocal = new Date(Date.now() - 5 * 60 * 60 * 1000).getUTCHours();
    if (horaLocal < 8 || horaLocal >= 21) {
      return { ok: false, motivo: `son las ${horaLocal}:00 en Colombia, fuera del horario para escribir` };
    }

    return { ok: true };
  }

  private async processFollowUp(followUp: FollowUp): Promise<void> {
    try {
      const permiso = await this.debeEnviarse(followUp);
      if (!permiso.ok) {
        // Se marca como resuelto para que no vuelva a evaluarse en cada pasada.
        await db.update(followUps)
          .set({ completed: true })
          .where(eq(followUps.id, followUp.id));
        logger.info(
          { followUpId: followUp.id, phone: followUp.contactPhone, motivo: permiso.motivo },
          "[FollowUpScheduler] Seguimiento DESCARTADO (no se envía)",
        );
        return;
      }

      // Los leads de Facebook Messenger se guardan como contactPhone=`fb:<psid>`
      // (ver facebook-messenger.ts). Antes esto se ignoraba y SOLO se enviaba
      // por WhatsApp, dejando a todos los leads de Facebook sin seguimiento.
      const isFacebookLead = followUp.contactPhone.startsWith("fb:");

      if (isFacebookLead) {
        const psid = followUp.contactPhone.slice(3);
        if (!facebookMessengerService.isConfigured()) {
          logger.warn({ followUpId: followUp.id }, "[FollowUpScheduler] Facebook Messenger not configured");
          return;
        }
        const sent = await facebookMessengerService.sendText(psid, followUp.message);
        if (!sent) {
          logger.warn({ followUpId: followUp.id }, "[FollowUpScheduler] Failed to send Facebook follow-up");
          return;
        }
      } else {
        // Antes usaba el singleton "./whatsapp" (instancia standalone que
        // nunca se inicia) -- isConnected() daba SIEMPRE false, así que
        // NINGÚN follow-up por WhatsApp se enviaba jamás, sin ningún error
        // visible (solo el warning de "not connected" en el log).
        // followUps no tiene columna tenantId propia (ver comentario en
        // getDueFollowUpsFromDB), así que se usa el tenant por defecto --
        // correcto para un negocio de un solo tenant; si en el futuro hay
        // varios negocios activos con follow-ups propios, esto necesita
        // resolver el tenant real via conversations.tenantId.
        const wa = getWhatsAppForTenant();
        if (!wa.isConnected()) {
          logger.warn({ followUpId: followUp.id }, "[FollowUpScheduler] WhatsApp not connected");
          return;
        }
        await wa.sendText(followUp.contactPhone, followUp.message);
      }

      await db.update(followUps)
        .set({ completed: true, attempts: followUp.attempts + 1 })
        .where(eq(followUps.id, followUp.id));

      await db.insert(activityEvents).values({
        type: "follow_up_sent",
        title: `Follow-up enviado a ${followUp.contactName}`,
        subtitle: `Tipo: ${followUp.followUpType}`,
      });

      logger.info({ followUpId: followUp.id }, "[FollowUpScheduler] Follow-up sent and marked in DB");
    } catch (error) {
      logger.error({ error, followUpId: followUp.id }, "[FollowUpScheduler] Failed to process follow-up");
      await db.update(followUps)
        .set({ attempts: followUp.attempts + 1 })
        .where(eq(followUps.id, followUp.id));
    }
  }

  async getMetrics(): Promise<{
    totalScheduled: number;
    overdue: number;
    successRate: number;
    responseRate: number;
  }> {
    const all = await db.select().from(followUps);
    const totalScheduled = all.length;
    const completed = all.filter(f => f.completed).length;
    const overdue = all.filter(f => !f.completed && f.scheduledFor < new Date()).length;

    return {
      totalScheduled,
      overdue,
      successRate: totalScheduled > 0 ? Math.round((completed / totalScheduled) * 100) : 0,
      responseRate: 0
    };
  }

  // followUps no tiene columna tenantId propia -- sin el join a conversations,
  // esta consulta devolvía los follow-ups (nombre, teléfono, mensaje) de
  // TODOS los tenants a cualquier tenant autenticado que pidiera /follow-ups/due.
  async getDueFollowUpsFromDB(tenantId?: number): Promise<FollowUp[]> {
    // toDbDate(): sql.js (SQLite local) rechaza bindear un Date crudo
    // ("Wrong API use: tried to bind a value of an unknown type") -- había
    // que convertirlo igual que el resto del código hace con dbNow()/toDbDate().
    const now = toDbDate(new Date());
    if (tenantId === undefined) {
      return db.select().from(followUps)
        .where(and(eq(followUps.completed, false), lte(followUps.scheduledFor, now as any)))
        .orderBy(asc(followUps.scheduledFor));
    }
    const rows = await db.select({ followUp: followUps })
      .from(followUps)
      .innerJoin(conversations, eq(followUps.conversationId, conversations.id))
      .where(and(
        eq(followUps.completed, false),
        lte(followUps.scheduledFor, now as any),
        eq(conversations.tenantId, tenantId),
      ))
      .orderBy(asc(followUps.scheduledFor));
    return rows.map(r => r.followUp);
  }

  private calculateFollowUpDate(stage: string): Date {
    const now = new Date();
    const delay = 24 * 60 * 60 * 1000;
    return new Date(now.getTime() + delay);
  }

  private determineFollowUpType(stage: string, score: number): string {
    return "check_in";
  }

  private determinePriority(stage: string, score: number): string {
    return "medium";
  }
}

export const followUpScheduler = new FollowUpScheduler();
followUpScheduler.start(30);

export async function scheduleIntelligentFollowUp(conversationId: number, stage: string, score: number) {
  return followUpScheduler.scheduleFollowUp(conversationId, stage, score);
}

export function getFollowUpMetrics(): Promise<{ totalScheduled: number; overdue: number; successRate: number; responseRate: number }> {
  return followUpScheduler.getMetrics();
}

export async function getDueFollowUps(tenantId?: number): Promise<FollowUp[]> {
  return followUpScheduler.getDueFollowUpsFromDB(tenantId);
}
