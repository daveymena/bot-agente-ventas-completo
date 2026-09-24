/**
 * ADAPTADOR: EL MOTOR NUEVO CONECTADO AL SISTEMA REAL
 * ===================================================
 *
 * `motor.ts` no sabe nada de la base ni del proveedor de IA: recibe un
 * cliente, un catálogo, un guion y una voz. Acá se construyen esas piezas con
 * lo que YA existe en el repo, sin reimplementar nada:
 *
 *   · el catálogo          `products` del tenant (con el video leído del
 *                          metadata igual que lo hace el render de la ficha)
 *   · la voz               el agente activo + el perfil del negocio
 *   · el guion             `business-context` + `hechos-de-pago` + `nicho.ts`
 *   · el conocimiento      `product_knowledge`, lo que cargó el dueño
 *   · la memoria           `conversations.estado_agente` (jsonb / text)
 *
 * Todo lo que escribe en la base pasa por las mismas funciones que usa el
 * motor viejo (`saveAgentMessage`, `avisarAlDueno`): el día que el motor nuevo
 * reemplace al viejo, el inbox, los avisos y los reportes siguen funcionando
 * igual. Que cambie el cerebro no puede cambiar el resto del cuerpo.
 */

import { and, desc, eq } from "drizzle-orm";
import {
  db,
  agents,
  conversations,
  leads,
  messages,
  products,
  productKnowledge,
  tenants,
} from "@workspace/db";
import { getBusinessContext } from "../business-context";
import { mediosDePago } from "../hechos-de-pago";
import { PaymentGateway } from "../payments";
import { videoDeProducto } from "../video-de-producto";
import { saveAgentMessage } from "../conversation-engine";
import { dbNow } from "../date-utils";
import { logger } from "../logger";
import { crearRepositorioDrizzle, type EstadoConversacion, type RepositorioEstado } from "./estado-conversacion";
import type { ItemDeConocimiento, Producto } from "./herramientas";
import { guionDelNegocio, type GuionDelNegocio, type NegocioParaNicho } from "./nicho";
import { crearClienteLLM, armarCadena, type ClienteLLM } from "./cliente-llm";
import { responder, type Mensaje, type VozDelNegocio } from "./motor";

/* ────────────────────────────────────────────────────────────────────────────
 * CARGA
 * ──────────────────────────────────────────────────────────────────────────── */

/** Productos activos del negocio, en la forma que espera el motor. */
export async function cargarCatalogoDelNegocio(tenantId: number): Promise<Producto[]> {
  const filas = await db
    .select()
    .from(products)
    .where(and(eq(products.tenantId, tenantId), eq(products.isActive, true)))
    // Orden estable y tope holgado: con `limit(200)` sin orden, en un
    // catálogo grande quedaban afuera productos al azar y `buscar_en_catalogo`
    // (que busca sobre esta lista) decía que no existían.
    .orderBy(desc(products.id))
    .limit(1000);

  return filas.map((p: any) => {
    let videoUrl: string | null = null;
    try {
      videoUrl = videoDeProducto(p.metadata) || null;
    } catch {
      videoUrl = null;
    }

    let opciones: string[] | null = null;
    try {
      const crudas = Array.isArray(p.opciones) ? p.opciones : p.opciones ? JSON.parse(String(p.opciones)) : null;
      if (Array.isArray(crudas)) {
        opciones = crudas
          .map((o: any) => String(o?.nombre || o?.name || o?.valor || o?.value || o || "").trim())
          .filter(Boolean);
      }
    } catch {
      opciones = null;
    }

    const precio = p.price != null && Number.isFinite(Number(p.price)) ? Number(p.price) : null;
    const stock = p.stock != null && Number.isFinite(Number(p.stock)) ? Number(p.stock) : null;

    return {
      id: p.id,
      name: String(p.name || ""),
      description: p.description ? String(p.description) : null,
      price: precio,
      currency: p.currency || "COP",
      kind: p.kind || "digital",
      categoria: p.category ?? null,
      opciones,
      videoUrl,
      disponible: true,
      stock,
    };
  });
}

/** Los medios de pago REALES del negocio. Si no hay ninguno, la lista es vacía. */
export async function cargarMediosDePago(tenantId: number): Promise<{ etiqueta: string; tipo: "transferencia" | "link" }[]> {
  try {
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
    if (!tenant) return [];
    const pg = new PaymentGateway(tenant as any);
    const info = (pg as any).getTransferInfo?.() || { options: [] };
    return mediosDePago({ dynamicLinks: { transfer: info } });
  } catch (e: any) {
    // Sin medios de pago el agente avisa que los confirma: nunca inventa uno.
    logger.warn({ err: e?.message, tenantId }, "[MotorV2] no se pudieron leer los medios de pago");
    return [];
  }
}

/** El guion de ventas derivado del negocio. Ver `nicho.ts`. */
export async function cargarGuion(tenantId: number, catalogo: Producto[], productoEnFoco?: number | null): Promise<GuionDelNegocio> {
  const ctx = await getBusinessContext(tenantId);
  const medios = await cargarMediosDePago(tenantId);
  // FASE 4 contraentrega: vive en condiciones.pagoEnvio, no en PaymentGateway.
  // Si el dueño la configuró, es un medio real y el cierre puede ofrecerlo.
  try {
    const pagoEnvio = String((ctx.condiciones as any)?.pagoEnvio || "");
    if (/contra\s*entrega/i.test(pagoEnvio) && !medios.some((m) => /contra/i.test(m.etiqueta))) {
      medios.push({ etiqueta: "Contraentrega", tipo: "transferencia" });
    }
  } catch {
    /* no crítico */
  }

  const negocio: NegocioParaNicho = {
    nombre: ctx.businessName || null,
    agente: ctx.agentName || null,
    nicho: ctx.nicho,
    descripcion: ctx.descripcion,
    cobertura: ctx.cobertura,
    horario: ctx.horario,
    entrega: ctx.entrega,
    garantia: ctx.garantia,
    acceso: ctx.acceso,
    tono: ctx.tono,
    noPuede: ctx.noPuede,
    loQueDebeSaber: ctx.loQueDebeSaber,
    modoCatalogo: ctx.modoCatalogo,
    condiciones: ctx.condiciones
      ? {
          pais: (ctx.condiciones as any).pais ?? null,
          envio: (ctx.condiciones as any).envio ?? null,
          costoEnvio: (ctx.condiciones as any).costoEnvio ?? null,
          pagoEnvio: (ctx.condiciones as any).pagoEnvio ?? null,
          agenda: (ctx.condiciones as any).agenda ?? null,
        }
      : null,
    negociaPrecio: ctx.negociaPrecio,
  };

  const enFoco = productoEnFoco != null ? catalogo.find((p) => p.id === productoEnFoco) : null;

  return guionDelNegocio({ catalogo, negocio, medios, productoEnFoco: enFoco ?? null });
}

/** Lo que el dueño cargó como respuestas. */
export async function cargarConocimiento(tenantId: number): Promise<ItemDeConocimiento[]> {
  try {
    const filas = await db
      .select()
      .from(productKnowledge)
      .where(eq(productKnowledge.tenantId, tenantId))
      .limit(300);

    return filas.map((k: any) => ({
      productId: k.productId ?? null,
      pregunta: String(k.pregunta || ""),
      disparadores: String(k.disparadores || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      respuesta: k.respuesta ? String(k.respuesta) : null,
    }));
  } catch (e: any) {
    logger.warn({ err: e?.message, tenantId }, "[MotorV2] no se pudo leer el conocimiento del negocio");
    return [];
  }
}

/**
 * QUIÉN ATIENDE esta conversación: el mismo enrutador del motor viejo
 * (`agent-router.ts`): continuidad por conversación, traspaso de la
 * recepcionista al especialista y enrutado por el tipo de producto que pide
 * el cliente.
 *
 * Hasta el 23-09-2026 el motor v2 no lo llamaba: tomaba el nombre del PRIMER
 * agente activo (en cualquier orden) y el catálogo entero. Todo lo que Atlas
 * configuraba al crear un agente -- especialidad, indicaciones, traspaso -- no
 * llegaba al vendedor que atiende WhatsApp, y Atlas le decía al dueño "el
 * sistema ya lo enruta automáticamente".
 */
export async function agenteQueAtiende(conversationId: number, tenantId: number, mensaje: string): Promise<any | null> {
  try {
    const { getActiveAgent } = await import("../agent-router");
    return (await getActiveAgent(mensaje || "", conversationId, tenantId)) || null;
  } catch (e: any) {
    logger.warn({ err: e?.message, conversationId }, "[MotorV2] no se pudo elegir el agente: se usa la voz general del negocio");
    return null;
  }
}

/**
 * Los productos que le tocan a la especialidad del agente: el de dropshipping
 * ve lo físico, el digital ve lo que no es físico. Sin especialidad, o si el
 * filtro dejara el catálogo vacío, se ve todo: un vendedor sin productos es
 * peor que uno con productos de más.
 */
export function catalogoDeLaEspecialidad(catalogo: Producto[], especialidad: string | null | undefined): Producto[] {
  const e = String(especialidad || "").toLowerCase();
  if (e !== "digital" && e !== "dropshipping") return catalogo;
  const esFisico = (p: Producto) => String(p.kind || "digital") === "physical";
  const suyos = catalogo.filter((p) => (e === "dropshipping" ? esFisico(p) : !esFisico(p)));
  return suyos.length ? suyos : catalogo;
}

/**
 * La voz: el agente que atiende y lo que el dueño escribió.
 *
 * Nombre: con un solo agente activo manda el nombre del perfil del negocio
 * (el dueño lo eligió); con varios, el de cada agente -- si no, la
 * recepcionista y el especialista se presentan con el mismo nombre.
 *
 * Indicaciones: el tono general del negocio + las indicaciones propias del
 * agente (`agents.metadata.indicaciones`, las escribe Atlas al crearlo). NO
 * se usa `agents.systemPrompt`: es la plantilla larga del motor viejo, con
 * reglas que chocan con las de este motor (fichas [CARD], "Google Drive").
 */
export async function cargarVozDelNegocio(tenantId: number, elegido?: any | null): Promise<VozDelNegocio> {
  const ctx = await getBusinessContext(tenantId);
  let activos: any[] = [];
  try {
    activos = await db.select().from(agents).where(and(eq(agents.tenantId, tenantId), eq(agents.isActive, true))).limit(20);
  } catch {
    activos = [];
  }
  const agente = elegido || activos[0] || null;
  const varios = activos.length > 1;

  const meta = typeof agente?.metadata === "string" ? (() => { try { return JSON.parse(agente.metadata); } catch { return {}; } })() : agente?.metadata || {};
  const indicaciones = [ctx.tono, typeof meta?.indicaciones === "string" ? meta.indicaciones.trim() : ""].filter(Boolean).join("\n");

  return {
    nombreAgente: (varios ? agente?.name || ctx.agentName : ctx.agentName || agente?.name) || "Asesor",
    rolAgente: agente?.role || "asesor comercial",
    nombreNegocio: ctx.businessName || "nuestro equipo",
    instruccionesExtra: indicaciones || null,
  };
}

/**
 * El historial, en orden, con el último mensaje del cliente al final.
 *
 * ⚠️ El `limit` va DESPUÉS de ordenar y NO ANTES: con `orderBy(asc)` +
 * `limit(60)` la base devuelve los 60 mensajes MÁS VIEJOS, así que una
 * conversación larga se quedaba sin su final -- justo lo que el agente
 * necesita para no repetirse. Se traen los últimos de la charla.
 */
export async function cargarHistorial(conversationId: number, limite = 60): Promise<Mensaje[]> {
  // Los 500 MÁS RECIENTES, después vueltos a orden cronológico. Con
  // `asc + limit` una charla de más de 500 mensajes traía los 500 primeros y
  // el agente contestaba leyendo la conversación de hace semanas.
  const filas = (
    await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(desc(messages.createdAt), desc(messages.id))
      .limit(500)
  ).reverse();

  return filas
    .filter((m: any) => m.role === "customer" || m.role === "agent")
    .slice(-Math.max(1, limite))
    .map((m: any) => ({
      role: m.role === "customer" ? ("customer" as const) : ("agent" as const),
      content: String(m.content || ""),
      createdAt: m.createdAt,
    }));
}

export function repositorioDeEstado(): RepositorioEstado {
  return crearRepositorioDrizzle({ db, conversations, eq });
}

/* ────────────────────────────────────────────────────────────────────────────
 * EL TURNO COMPLETO
 * ──────────────────────────────────────────────────────────────────────────── */

export interface RespuestaDelVendedor {
  content: string;
  stage: string;
  parts: any[];
  aiProvider: string;
  cardProductIds: number[];
  /** Diagnóstico del turno. Se devuelve para poder medirlo sin leer logs. */
  motor: "v2";
  traza: { herramienta: string; resultado: string }[];
  modoPlan: boolean;
  corregido: boolean;
  nicho: GuionDelNegocio["forma"];
}

// Los valores son los que ya usa el inbox y el panel (`Stage` en
// conversation-engine.ts). Inventar etapas nuevas rompía los filtros de la
// pantalla aunque la columna acepte cualquier texto.
export const ETAPA_A_STAGE: Record<EstadoConversacion["etapa"], string> = {
  saludo: "greeting",
  explorando: "discovery",
  producto_en_foco: "presentation",
  precio_dado: "details",
  cierre: "closing",
  postventa: "post_sale",
  escalado: "human_handoff",
};

/**
 * Corre un turno del vendedor con el motor nuevo.
 *
 * Devuelve EXACTAMENTE la misma forma que `runAgentReply()` de agent.ts, para
 * que `AgentOrchestrator`, la ruta de pruebas y el panel no se enteren de cuál
 * de los dos motores contestó.
 */
export async function responderComoVendedor(
  conversationId: number,
  opts: { llm?: ClienteLLM; appSettings?: any } = {},
): Promise<RespuestaDelVendedor | null> {
  const [convo] = await db.select().from(conversations).where(eq(conversations.id, conversationId)).limit(1);
  if (!convo) return null;

  const tenantId = convo.tenantId ?? 1;
  const repositorio = repositorioDeEstado();

  const estado = await repositorio.cargar(conversationId);
  const estadoAntes = JSON.parse(JSON.stringify(estado));
  const [historial, catalogoCompleto] = await Promise.all([
    cargarHistorial(conversationId),
    cargarCatalogoDelNegocio(tenantId),
  ]);
  // Quién atiende sale del último mensaje del cliente (el enrutador decide
  // si hay traspaso), y de ahí salen su voz y SUS productos.
  const ultimoMensaje = [...historial].reverse().find((m) => m.role === "customer")?.content ?? "";
  const agente = await agenteQueAtiende(conversationId, tenantId, ultimoMensaje);
  const voz = await cargarVozDelNegocio(tenantId, agente);
  const catalogo = catalogoDeLaEspecialidad(catalogoCompleto, agente?.especialidad);
  // El producto del que VIENEN hablando no desaparece por un traspaso.
  if (estado.productoEnFoco != null && !catalogo.some((p) => p.id === estado.productoEnFoco)) {
    const enFoco = catalogoCompleto.find((p) => p.id === estado.productoEnFoco);
    if (enFoco) catalogo.push(enFoco);
  }

  const guion = await cargarGuion(tenantId, catalogo, estado.productoEnFoco);
  const conocimiento = await cargarConocimiento(tenantId);

  const llm =
    opts.llm ??
    crearClienteLLM({ cadena: await armarCadena({ tenantId, appSettings: opts.appSettings }), tenantId });

  const resultado = await responder({
    llm,
    estado,
    historial,
    catalogo,
    conocimiento,
    guion,
    voz,
    recargarGuion: (nuevoFocoId: number) => cargarGuion(tenantId, catalogo, nuevoFocoId),
  });

  await repositorio.guardar(resultado.estado);

  // ── Persistir la respuesta igual que el motor viejo ──────────────────────
  const texto = resultado.partes
    .filter((p) => p.kind === "text")
    .map((p) => String((p as any).content || ""))
    .join("\n\n")
    .trim();
  const cardProductIds = resultado.partes.filter((p) => p.kind === "card").map((p) => (p as any).productId);
  const textoParaGuardar = texto || (cardProductIds.length ? `[ficha de ${cardProductIds.join(", ")}]` : "");

  await saveAgentMessage(conversationId, textoParaGuardar || "…", ETAPA_A_STAGE[resultado.estado.etapa] as any, {
    intent: "motor_v2",
    productId: resultado.estado.productoEnFoco ?? undefined,
    isHardcoded: false,
  } as any);

  // El producto en foco NO se guarda en la columna de la conversación: no
  // existe en el esquema (`currentProductId` lo escribe el motor viejo y
  // Drizzle lo descarta en silencio, así que nunca se persistió). Acá vive en
  // `estado_agente`, que sí es una columna real, y por eso sobrevive al
  // reinicio del contenedor y a los mensajes sin tarjeta.
  await db
    .update(conversations)
    .set({ currentStage: ETAPA_A_STAGE[resultado.estado.etapa], lastMessageAt: dbNow() as any })
    .where(eq(conversations.id, conversationId));

  // ── Scoring y seguimiento: igual que el motor viejo ─────────────────────
  //
  // El motor v2 no deja de alimentar el pipeline comercial: el lead scoring y
  // los seguimientos programados viven en `leadScoring.ts`, los lee el dashboard
  // y son los que avisan cuando un cliente quedó a media charla. Es
  // fire-and-forget y atrapa sus propios errores: nunca puede retrasarle la
  // respuesta a quien está escribiendo ahora.
  const ultimoDelCliente = [...historial].reverse().find((m) => m.role === "customer")?.content;
  if (ultimoDelCliente) {
    import("../leadScoring")
      .then(({ processMessageForLeadScoring }) => processMessageForLeadScoring(conversationId, ultimoDelCliente))
      .catch((err) => logger.warn({ err: err?.message }, "[MotorV2] no se pudo calcular el scoring del lead"));
  }

  // ── Efectos: lo que las herramientas pidieron hacer en la base ───────────
  for (const efecto of resultado.efectos) {
    try {
      await aplicarEfecto(efecto, { conversationId, tenantId, convo, estado: resultado.estado, catalogo });
    } catch (e: any) {
      logger.error({ err: e?.message, efecto }, "[MotorV2] no se pudo aplicar el efecto del turno");
    }
  }

  // FASE 14 — Observabilidad: por qué respondió esto, sin adivinar ni
  // guardar datos sensibles (se trunca texto del cliente).
  logger.info(
    {
      conversationId,
      tenantId,
      mensajeRecibido: String(ultimoDelCliente || "").slice(0, 200),
      estadoAntes: {
        foco: estadoAntes.productoEnFoco,
        anterior: estadoAntes.productoAnterior,
        intencion: estadoAntes.intencionActual,
        oferta: estadoAntes.ultimaOferta,
        compra: estadoAntes.compra,
        pago: estadoAntes.pago,
      },
      intencionDetectada: resultado.estado.intencionActual,
      productoActivo: resultado.estado.productoEnFoco,
      herramientas: resultado.traza.map((t) => t.herramienta),
      estadoDespues: {
        foco: resultado.estado.productoEnFoco,
        compra: resultado.estado.compra,
        pago: resultado.estado.pago,
        entrega: resultado.estado.entregaEstado,
      },
      siguienteAccion: resultado.estado.siguienteAccion,
      proveedor: resultado.proveedor,
      modoPlan: resultado.modoPlan,
      corregido: resultado.corregido,
      forma: guion.forma,
    },
    "[MOTOR-V2] turno",
  );

  return {
    content: texto,
    stage: ETAPA_A_STAGE[resultado.estado.etapa],
    parts: resultado.partes as any[],
    aiProvider: resultado.proveedor,
    cardProductIds,
    motor: "v2",
    traza: resultado.traza.map((t) => ({ herramienta: t.herramienta, resultado: String(t.resultado).slice(0, 120) })),
    modoPlan: resultado.modoPlan,
    corregido: resultado.corregido,
    nicho: guion.forma,
  };
}

async function aplicarEfecto(
  efecto: any,
  ctx: { conversationId: number; tenantId: number; convo: any; estado: EstadoConversacion; catalogo: Producto[] },
): Promise<void> {
  if (efecto.tipo === "dato") {
    if (efecto.campo === "nombre") {
      // Con el que se le HABLA: el pushName trae apellido y saludar con
      // apellido delata a la máquina en el primer mensaje.
      await db
        .update(conversations)
        .set({ contactName: String(efecto.valor) })
        .where(eq(conversations.id, ctx.conversationId));
    }
    if (ctx.convo?.leadId) {
      const [lead] = await db.select().from(leads).where(eq(leads.id, ctx.convo.leadId)).limit(1);
      const notas = String((lead as any)?.notes || "");
      const linea = `${efecto.campo}: ${efecto.valor}`;
      if (!notas.includes(linea)) {
        await db
          .update(leads)
          .set({ notes: `${notas ? `${notas}\n` : ""}${linea}` })
          .where(eq(leads.id, ctx.convo.leadId));
      }
    }
    return;
  }

  if (efecto.tipo === "pago_reportado") {
    const foco = ctx.estado.productoEnFoco;
    const producto = foco != null ? ctx.catalogo.find((p) => p.id === foco) : null;
    await db
      .update(conversations)
      .set({
        // pending: el cliente DICE que pagó. Confirmarlo lo hace una persona.
        paymentStatus: "pending",
        paymentMethod: efecto.medio ? String(efecto.medio) : null,
        paymentAmount: producto?.price != null ? String(producto.price) : null,
      })
      .where(eq(conversations.id, ctx.conversationId));

    try {
      const { avisarAlDueno } = await import("../avisos");
      await avisarAlDueno(
        ctx.tenantId,
        `💰 *Pago por verificar* — ${ctx.convo?.contactName || "cliente"} dice que ya pagó${
          producto ? ` ${producto.name}` : ""
        }${efecto.medio ? ` por ${efecto.medio}` : ""}. Entrá al panel a confirmarlo.`,
      );
    } catch {
      /* avisar no puede frenar la respuesta al cliente */
    }
    return;
  }

  if (efecto.tipo === "escalar") {
    await db
      .update(conversations)
      .set({ status: "human" })
      .where(eq(conversations.id, ctx.conversationId));
    try {
      const { avisarAlDueno } = await import("../avisos");
      await avisarAlDueno(
        ctx.tenantId,
        `🙋 *Te toca* — ${ctx.convo?.contactName || "un cliente"} necesita a una persona: ${efecto.motivo}`,
      );
    } catch {
      /* idem */
    }
  }
}

/** Para la ruta de sombra: corre el motor sin escribir nada en la conversación. */
export async function correrEnSombra(params: {
  tenantId: number;
  turnos: string[];
  estadoInicial?: EstadoConversacion;
  llm: ClienteLLM;
}) {
  const catalogo = await cargarCatalogoDelNegocio(params.tenantId);
  const voz = await cargarVozDelNegocio(params.tenantId);
  const conocimiento = await cargarConocimiento(params.tenantId);
  const guion = await cargarGuion(params.tenantId, catalogo, null);

  let estado: EstadoConversacion =
    params.estadoInicial ??
    ((await import("./estado-conversacion")).estadoInicial(0));
  const historial: Mensaje[] = [];
  const salida: any[] = [];

  for (const turno of params.turnos) {
    historial.push({ role: "customer", content: turno, createdAt: new Date() });
    let partes: any[] = [];
    let traza: any[] = [];
    let error: string | null = null;
    let proveedor = "—";
    try {
      const r = await responder({
        llm: params.llm,
        estado,
        historial,
        catalogo,
        conocimiento,
        guion,
        voz,
        recargarGuion: (nuevoFocoId: number) => cargarGuion(params.tenantId, catalogo, nuevoFocoId),
      });
      partes = r.partes;
      traza = r.traza;
      proveedor = r.proveedor;
      estado = r.estado;
    } catch (e: any) {
      error = String(e?.message || e);
    }
    const texto = partes
      .filter((p) => p.kind === "text")
      .map((p) => String(p.content || ""))
      .join("\n\n");
    historial.push({ role: "agent", content: texto || "[ficha]", createdAt: new Date() });
    salida.push({
      mensaje: turno,
      texto,
      tarjetas: partes.filter((p) => p.kind === "card"),
      herramientas: traza.map((t) => `${t.herramienta} → ${String(t.resultado).slice(0, 90)}`),
      proveedor,
      error,
      // FASE 11/12: comparación estructurada, no solo texto.
      intencion: (estado as any)?.intencionActual ?? null,
      producto: (estado as any)?.productoEnFoco ?? null,
      toolCalls: traza.map((t: any) => t.herramienta),
      state: {
        foco: (estado as any)?.productoEnFoco ?? null,
        anterior: (estado as any)?.productoAnterior ?? null,
        oferta: (estado as any)?.ultimaOferta ?? null,
        compra: (estado as any)?.compra ?? null,
        pago: (estado as any)?.pago ?? null,
        entrega: (estado as any)?.entregaEstado ?? null,
      },
      nextAction: (estado as any)?.siguienteAccion ?? null,
    });
  }

  return { salida, estado, guion: { forma: guion.forma, confianza: guion.confianza, senales: guion.senales } };
}
