import { eq, and, lte, asc, inArray } from "drizzle-orm";
import { db, conversations, messages, activityEvents, followUps, type FollowUp, type InsertFollowUp } from "@workspace/db";
import { logger } from "./logger";
import { esConversacionOperativa } from "./conversation-status";
import { condicionConversacionOperativa } from "./conversation-query";
import { leadScoringEngine, type LeadStage } from "./leadScoring";
import { getWhatsAppForTenant } from "./whatsapp-factory";
import { toDbDate } from "./date-utils";
import { FacebookMessengerService } from "./facebook-messenger";
import { tenantManager } from "./tenantManager";
import { cuandoLaBaseEsteLista } from "./esperar-base";

export interface PoliticaSeguimiento {
  demoraMs: number;
  prioridad: "low" | "medium" | "high" | "urgent";
  tipo: "nurture" | "check_in" | "decision_support" | "checkout_recovery";
}

/**
 * Política comercial explícita y comprobable.
 *
 * El código anterior devolvía SIEMPRE 24 horas, prioridad media y `check_in`:
 * trataba igual a quien apenas saludó y a quien ya pidió cómo pagar. Esta
 * tabla no interpreta texto; recibe la etapa estructurada del scoring y decide
 * cuándo retomar la conversación si el cliente deja de responder.
 */
export function politicaDeSeguimiento(stage: string, score = 0): PoliticaSeguimiento {
  switch (stage) {
    case "closing":
      return { demoraMs: 6 * 60 * 60 * 1000, prioridad: "urgent", tipo: "checkout_recovery" };
    case "negotiating":
      return { demoraMs: 12 * 60 * 60 * 1000, prioridad: "high", tipo: "decision_support" };
    case "qualified":
    case "hot":
      return { demoraMs: 24 * 60 * 60 * 1000, prioridad: score >= 70 ? "high" : "medium", tipo: "decision_support" };
    case "warm":
      return { demoraMs: 3 * 24 * 60 * 60 * 1000, prioridad: "medium", tipo: "check_in" };
    case "cold":
    default:
      return { demoraMs: 7 * 24 * 60 * 60 * 1000, prioridad: "low", tipo: "nurture" };
  }
}

export function calcularFechaSeguimiento(stage: string, score = 0, desde = new Date()): Date {
  return new Date(desde.getTime() + politicaDeSeguimiento(stage, score).demoraMs);
}

/** Meta solo deja escribir por Messenger/Instagram 24 h después del último mensaje del cliente. */
const VENTANA_META_MS = 24 * 60 * 60 * 1000;

/** Por dónde se le escribe a este contacto, según cómo se guardó. */
export function canalDelContacto(contacto: string): "whatsapp" | "facebook" | "instagram" | "comentario" {
  const c = String(contacto || "");
  if (c.startsWith("fb_comment:") || c.startsWith("ig_comment:")) return "comentario";
  if (c.startsWith("fb:")) return "facebook";
  if (c.startsWith("ig:")) return "instagram";
  return "whatsapp";
}

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

    // La primera pasada espera a la base: arrancaba al importar el módulo,
    // antes de "[DB] Lista para usar", y fallaba siempre (ver esperar-base.ts).
    cuandoLaBaseEsteLista()
      .then(() => this.processDueFollowUps())
      .catch(err => {
        logger.error({ err }, "[FollowUpScheduler] Initial processing failed");
      });

    this.intervalId = setInterval(() => {
      this.processDueFollowUps().catch(err => {
        logger.error({ err }, "[FollowUpScheduler] Scheduled processing failed");
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
      if (!esConversacionOperativa(conversation)) return null;

      // Un solo seguimiento pendiente por conversación, pero VIVO.
      //
      // Antes el primer mensaje ganaba para siempre: un lead "warm" dejaba un
      // check-in genérico a 24 h y, aunque después pidiera el enlace de pago,
      // la fila no se actualizaba. El vendedor parecía no ser proactivo justo
      // en el momento de mayor intención. Conservamos una sola fila para no
      // acosar ni acumular duplicados, pero más abajo la actualizamos con la
      // etapa, prioridad, fecha y mensaje más recientes.
      const [pendiente] = await db.select()
        .from(followUps)
        .where(and(eq(followUps.conversationId, conversationId), eq(followUps.completed, false)))
        .limit(1);

      if (!scheduledFor) {
        scheduledFor = this.calculateFollowUpDate(stage, score);
      }

      const followUpType = this.determineFollowUpType(stage, score);
      const priority = this.determinePriority(stage, score);
      // El teléfono va como semilla para que dos contactos distintos no reciban
      // el mismo texto: mandar mensajes casi idénticos a muchos números es lo
      // que hace que WhatsApp bloquee la línea del negocio.
      const semilla = String(conversation.contactPhone || conversationId);

      // ── Si es una venta ABANDONADA, el mensaje sabe de qué habla ──────────
      //
      // El seguimiento por etapa es genérico por diseño: sirve para cualquiera.
      // Pero a alguien que llegó de un anuncio pago, pidió el precio y no
      // compró, mandarle "¿cómo va el proceso?" es desperdiciar el clic que ya
      // se cobró. Con el producto que estaba mirando (que ahora vive en el
      // perfil comercial del lead) se puede nombrar lo que quedó a medias.
      //
      // Si no se sabe qué producto era, `mensajeDeRecuperacion` devuelve null y
      // se cae al mensaje por etapa: es preferible el genérico a inventar.
      let message: string | null = null;
      try {
        const { cargarPerfil } = await import("./customer-profile");
        const { mensajeDeRecuperacion } = await import("./recuperacion");
        const perfil = await cargarPerfil(conversation.leadId);
        const ultimoProducto = perfil.productosVistos?.[0]?.nombre || null;
        const ultimaObjecion = perfil.objeciones?.[0]?.tipo || null;
        if (ultimoProducto && ["closing", "negotiating", "qualified"].includes(String(stage))) {
          message = mensajeDeRecuperacion({
            producto: ultimoProducto,
            objecion: ultimaObjecion,
            semilla,
          });
        }
      } catch (err) {
        logger.warn({ err, conversationId }, "[FollowUpScheduler] No se pudo armar el mensaje de recuperación; se usa el de la etapa");
      }

      if (!message) {
        message = leadScoringEngine.generateFollowUpMessage(
          stage as LeadStage,
          conversation.lastMessage || "",
          semilla,
        );
      }

      if (pendiente) {
        const [actualizado] = await db.update(followUps).set({
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
        }).where(eq(followUps.id, pendiente.id)).returning();

        logger.info(
          { followUpId: pendiente.id, conversationId, etapaAnterior: pendiente.stage, stage, priority },
          "[FollowUpScheduler] Seguimiento pendiente actualizado con la intención más reciente",
        );
        return actualizado ?? null;
      }

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
      const candidatos: FollowUp[] = await db.select().from(followUps)
        .where(and(eq(followUps.completed, false), lte(followUps.scheduledFor, now as any)))
        .orderBy(asc(followUps.scheduledFor)) as any;

      const idsCandidatos: number[] = [...new Set(candidatos.map((f: FollowUp) => f.conversationId))];
      const operativas: Array<{ id: number }> = idsCandidatos.length
        ? await db.select({ id: conversations.id }).from(conversations).where(and(
            inArray(conversations.id, idsCandidatos),
            condicionConversacionOperativa(),
          )) as any
        : [];
      const idsOperativos = new Set(operativas.map((c) => c.id));
      const pruebasConFollowUp = candidatos.filter((f: FollowUp) => !idsOperativos.has(f.conversationId));
      if (pruebasConFollowUp.length) {
        await db.update(followUps).set({ completed: true })
          .where(inArray(followUps.id, pruebasConFollowUp.map((f) => f.id)));
      }
      const dueFollowUps: FollowUp[] = candidatos.filter((f: FollowUp) => idsOperativos.has(f.conversationId));

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
      // `err` y no `error`: pino solo serializa un Error bajo `err`; con
      // `error` el log de producción decía literalmente "error: {}".
      logger.error({ err: error }, "[FollowUpScheduler] Failed to process due follow-ups");
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

    const [conversacion] = await db.select({
      status: conversations.status,
      currentStage: conversations.currentStage,
      paymentStatus: conversations.paymentStatus,
    }).from(conversations).where(eq(conversations.id, convoId)).limit(1);

    if (!conversacion) return { ok: false, motivo: "la conversación ya no existe" };
    const canal = canalDelContacto(followUp.contactPhone);
    if (canal === "comentario") {
      // A quien comentó solo se le puede escribir UNA vez por privado, y eso
      // ya lo hace la respuesta al comentario. Antes caía al camino de
      // WhatsApp y se intentaba mandar a "fb_comment:123".
      return { ok: false, motivo: "es un comentario: no admite seguimiento por mensaje" };
    }
    if (["confirmed", "approved"].includes(String(conversacion.paymentStatus || "").toLowerCase())) {
      return { ok: false, motivo: "la compra ya fue pagada/confirmada" };
    }
    if (["post_sale", "converted", "won"].includes(String(conversacion.currentStage || "").toLowerCase())) {
      return { ok: false, motivo: "la conversación ya está en posventa" };
    }
    if (["closed", "resolved"].includes(String(conversacion.status || "").toLowerCase())) {
      return { ok: false, motivo: "la conversación está cerrada" };
    }

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

    // 4. Messenger e Instagram: Meta solo deja escribir dentro de las 24 h
    //    desde el último mensaje del cliente. Pasado eso rechaza el envío
    //    (y insistir afecta a la página), así que no se intenta.
    if ((canal === "facebook" || canal === "instagram") && ultimoDelCliente) {
      const desde = Date.now() - new Date(ultimoDelCliente.createdAt).getTime();
      if (desde > VENTANA_META_MS) {
        return { ok: false, motivo: "pasaron más de 24 h desde su último mensaje: Meta no permite escribirle" };
      }
    }

    // 5. Nada de escribir de madrugada: hora local de Colombia (UTC-5).
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
      // El negocio sale de la CONVERSACIÓN. Antes se mandaba todo por el
      // WhatsApp / la página del negocio por defecto: el seguimiento de un
      // cliente del negocio 2 salía desde el número del dueño de la plataforma.
      const [conv] = await db.select({ tenantId: conversations.tenantId })
        .from(conversations).where(eq(conversations.id, followUp.conversationId)).limit(1);
      const tenantId = Number(conv?.tenantId) || 0;
      if (!tenantId) {
        await db.update(followUps).set({ completed: true }).where(eq(followUps.id, followUp.id));
        logger.warn({ followUpId: followUp.id }, "[FollowUpScheduler] Conversación sin negocio: no se envía");
        return;
      }
      const canal = canalDelContacto(followUp.contactPhone);

      if (canal === "facebook" || canal === "instagram") {
        const psid = followUp.contactPhone.slice(followUp.contactPhone.indexOf(":") + 1);
        const tenant = await tenantManager.getTenantById(tenantId);
        const svc = tenant ? new FacebookMessengerService(tenant) : null;
        if (!svc || !svc.isConfigured()) {
          logger.warn({ followUpId: followUp.id, tenantId }, "[FollowUpScheduler] Facebook Messenger not configured");
          return;
        }
        const sent = await svc.sendText(psid, followUp.message);
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
        const wa = getWhatsAppForTenant(tenantId);
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
    const all: FollowUp[] = await db.select().from(followUps) as any;
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
      const rows: Array<{ followUp: FollowUp }> = await db.select({ followUp: followUps })
        .from(followUps)
        .innerJoin(conversations, eq(followUps.conversationId, conversations.id))
        .where(and(
          eq(followUps.completed, false),
          lte(followUps.scheduledFor, now as any),
          condicionConversacionOperativa(),
        ))
        .orderBy(asc(followUps.scheduledFor)) as any;
      return rows.map((r: { followUp: FollowUp }) => r.followUp);
    }
    const rows: Array<{ followUp: FollowUp }> = await db.select({ followUp: followUps })
      .from(followUps)
      .innerJoin(conversations, eq(followUps.conversationId, conversations.id))
      .where(and(
        eq(followUps.completed, false),
          lte(followUps.scheduledFor, now as any),
          eq(conversations.tenantId, tenantId),
        condicionConversacionOperativa(),
        ))
      .orderBy(asc(followUps.scheduledFor)) as any;
    return rows.map((r: { followUp: FollowUp }) => r.followUp);
  }

  private calculateFollowUpDate(stage: string, score: number): Date {
    return calcularFechaSeguimiento(stage, score);
  }

  private determineFollowUpType(stage: string, score: number): string {
    return politicaDeSeguimiento(stage, score).tipo;
  }

  private determinePriority(stage: string, score: number): string {
    return politicaDeSeguimiento(stage, score).prioridad;
  }
}

/**
 * Cierra cualquier recuperación comercial pendiente cuando la venta terminó o
 * el cliente rechazó continuar. Un seguimiento de preventa después de un pago
 * reportado/confirmado deteriora la confianza y hace parecer que el agente no
 * leyó la conversación.
 */
export async function cancelarSeguimientosPendientes(conversationId: number): Promise<number> {
  const pendientes = await db.select({ id: followUps.id })
    .from(followUps)
    .where(and(eq(followUps.conversationId, conversationId), eq(followUps.completed, false)));
  if (!pendientes.length) return 0;
  await db.update(followUps)
    .set({ completed: true })
    .where(inArray(followUps.id, pendientes.map((f: { id: number }) => f.id)));
  logger.info(
    { conversationId, total: pendientes.length },
    "[FollowUpScheduler] Seguimientos comerciales cancelados por cierre de ciclo",
  );
  return pendientes.length;
}

export const followUpScheduler = new FollowUpScheduler();
// Se arranca desde app.ts (bloque "relojes que tocan la base"), no al
// importar: cualquier archivo que importara este módulo --pruebas incluidas--
// encendía un reloj real que consultaba la base antes de que existiera.

export async function scheduleIntelligentFollowUp(conversationId: number, stage: string, score: number) {
  return followUpScheduler.scheduleFollowUp(conversationId, stage, score);
}

export function getFollowUpMetrics(): Promise<{ totalScheduled: number; overdue: number; successRate: number; responseRate: number }> {
  return followUpScheduler.getMetrics();
}

export async function getDueFollowUps(tenantId?: number): Promise<FollowUp[]> {
  return followUpScheduler.getDueFollowUpsFromDB(tenantId);
}
