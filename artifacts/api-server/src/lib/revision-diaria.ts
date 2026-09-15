/**
 * ============================================================
 * LA REVISIÓN DIARIA — lo que una agencia de verdad mira cada mañana
 * ============================================================
 *
 * Lo que había (agencia-ritmo → diagnostic-agent) mandaba al dueño frases
 * como "Revisar la oferta y garantía visibles" y cerraba con "decime cuál
 * querés que haga"; y cuando el dueño contestaba, ese mensaje caía en el
 * AGENTE DE VENTAS, que le respondía como a un cliente. Catorce
 * especialistas, ninguno con las manos en algo concreto.
 *
 * Esto es lo que hacen las agencias reales (investigado el 14-09-2026:
 * Revealbot/AnyTrack/theOptimizer sobre reglas de Meta, y la adopción de
 * WhatsApp en pymes LatAm): revisión diaria la primera semana y semanal
 * después, medida sobre TRES cosas que el dueño sí siente —
 *
 *   1. ¿Hay clientes escribiendo y nadie les contesta?   (velocidad)
 *   2. ¿Quedaron leads tibios sin seguimiento?           (seguimiento)
 *   3. ¿Los anuncios traen gente a un costo que sirve?   (adquisición)
 *
 * — y cada hallazgo viene con UNA acción concreta que el servidor puede
 * ejecutar cuando el dueño responde "1", "la 2" o "todas". Lo que gasta
 * plata (pautar, escalar) NO vive acá: eso ya lo maneja ad-growth-agent con
 * sus propias sugerencias; acá solo se le cuenta al dueño cuántas esperan.
 *
 * Se separa en tres funciones para que la decisión sea probable sin red:
 *   medir()   → números reales de la base y de Meta
 *   decidir() → reglas puras: de números a acciones numeradas
 *   redactar()→ el texto de WhatsApp
 */
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db, conversations, messages, leads, products, adAgentLogs, architectMemory, tenants } from "@workspace/db";
import { logger } from "./logger";
import { tenantManager } from "./tenantManager";
import { AnalyticsEngine } from "./analytics";
import { followUpScheduler } from "./followUpScheduler";
import { architectMemoryService } from "./architect-memory-service";

export interface CampanaMedida {
  id: string;
  nombre: string;
  gasto: number;
  resultados: number;
  costoPorResultado: number;
}

export interface Medidas {
  dias: number;
  leads: number;
  ventas: number;
  /** Conversaciones donde el cliente escribió y nadie contestó (ids). */
  sinRespuesta: number[];
  /** Respuestas que tardaron más de 30 min. */
  respuestasLentas: number;
  peorRespuestaMin: number;
  /** Conversaciones con interés, sin compra y sin movimiento hace 2+ días (ids). */
  tibios: number[];
  /** Campañas activas en Meta (vacío si no hay o no está conectado). */
  campanas: CampanaMedida[];
  metaConectado: boolean;
  /** Sugerencias del agente de anuncios esperando el sí del dueño. */
  sugerenciasPendientes: number;
  /** El producto más vendido/consultado para proponer un anuncio nuevo. */
  productoEstrella: { id: number; name: string } | null;
}

export interface AccionDelDia {
  n: number;
  texto: string;
  tool: string;
  args: Record<string, any>;
}

export interface RevisionDiaria {
  fecha: string;
  /** Líneas de estado, en lenguaje del dueño. */
  estado: string[];
  acciones: AccionDelDia[];
}

const DIAS = 7;
const TIBIO_DESDE_HORAS = 48;
const MAX_SEGUIMIENTOS_POR_DIA = 20; // anti-bloqueo: nunca una ráfaga

// ── Medir ────────────────────────────────────────────────────────────────

export async function medir(tenantId: number): Promise<Medidas> {
  const desde = new Date(Date.now() - DIAS * 24 * 3600 * 1000);
  const tibioDesde = new Date(Date.now() - TIBIO_DESDE_HORAS * 3600 * 1000);
  const m: Medidas = {
    dias: DIAS, leads: 0, ventas: 0, sinRespuesta: [], respuestasLentas: 0, peorRespuestaMin: 0,
    tibios: [], campanas: [], metaConectado: false, sugerenciasPendientes: 0, productoEstrella: null,
  };

  try {
    const [l] = await db.select({ n: sql<number>`count(*)` }).from(leads)
      .where(and(eq(leads.tenantId, tenantId), gte(leads.createdAt, desde)));
    m.leads = Number(l?.n || 0);
  } catch (err) { logger.warn({ err, tenantId }, "[Revisión] leads"); }

  try {
    const [v] = await db.select({ n: sql<number>`count(*)` }).from(conversations)
      .where(and(eq(conversations.tenantId, tenantId), eq(conversations.paymentStatus, "confirmed"), gte(conversations.lastMessageAt, desde)));
    m.ventas = Number(v?.n || 0);
  } catch (err) { logger.warn({ err, tenantId }, "[Revisión] ventas"); }

  // Velocidad: la métrica que el panel escondía (promedio lindo, peores
  // casos afuera). Se usa la misma medición ya corregida de analytics.
  try {
    const tenant = await tenantManager.getTenantById(tenantId);
    if (tenant) {
      const p = await new AnalyticsEngine(tenant).getPerformanceMetrics(desde, new Date());
      m.respuestasLentas = Number(p.respuestasLentas || 0);
      m.peorRespuestaMin = Math.round(Number(p.peorRespuestaMs || 0) / 60000);
    }
  } catch (err) { logger.warn({ err, tenantId }, "[Revisión] velocidad"); }

  // Sin respuesta y tibios: se recorre el último mensaje de cada conversación
  // de la semana. Es UNA consulta ordenada, no una por conversación.
  try {
    const filas = await db
      .select({ conversationId: messages.conversationId, role: messages.role, createdAt: messages.createdAt, paymentStatus: conversations.paymentStatus, stage: conversations.currentStage })
      .from(messages)
      .innerJoin(conversations, eq(messages.conversationId, conversations.id))
      .where(and(eq(conversations.tenantId, tenantId), gte(messages.createdAt, desde)))
      .orderBy(desc(messages.createdAt));
    const vistos = new Set<number>();
    for (const f of filas) {
      if (vistos.has(f.conversationId)) continue;
      vistos.add(f.conversationId);
      const fecha = new Date(f.createdAt as any);
      if (f.role === "customer") {
        m.sinRespuesta.push(f.conversationId);
      } else if (f.paymentStatus !== "confirmed" && fecha < tibioDesde && /presentation|details|objection|closing|interested|negotiation/i.test(String(f.stage || ""))) {
        m.tibios.push(f.conversationId);
      }
    }
    m.sinRespuesta = m.sinRespuesta.slice(0, MAX_SEGUIMIENTOS_POR_DIA);
    m.tibios = m.tibios.slice(0, MAX_SEGUIMIENTOS_POR_DIA);
  } catch (err) { logger.warn({ err, tenantId }, "[Revisión] conversaciones"); }

  // Anuncios: solo lectura. Si Meta no está conectado, se dice y listo.
  try {
    const { FacebookService } = await import("./facebook");
    const tenant = await tenantManager.getTenantById(tenantId);
    const fb = new FacebookService(tenant || undefined);
    if (fb.isConfigured()) {
      m.metaConectado = true;
      const activas = await fb.listActiveCampaigns();
      for (const c of activas.slice(0, 10)) {
        const ins = await fb.getCampaignInsights(c.id, "last_7d");
        m.campanas.push({ id: c.id, nombre: c.name, gasto: ins?.spend || 0, resultados: ins?.results || 0, costoPorResultado: ins?.costPerResult || 0 });
      }
    }
  } catch (err) { logger.warn({ err, tenantId }, "[Revisión] anuncios"); }

  try {
    const [s] = await db.select({ n: sql<number>`count(*)` }).from(adAgentLogs)
      .where(and(eq(adAgentLogs.tenantId, tenantId), eq(adAgentLogs.status, "suggested")));
    m.sugerenciasPendientes = Number(s?.n || 0);
  } catch (err) { logger.warn({ err, tenantId }, "[Revisión] sugerencias"); }

  try {
    const [p] = await db.select({ id: products.id, name: products.name }).from(products)
      .where(and(eq(products.tenantId, tenantId), eq(products.isActive, true)))
      .orderBy(desc(products.createdAt)).limit(1);
    if (p) m.productoEstrella = { id: Number(p.id), name: String(p.name || "") };
  } catch (err) { logger.warn({ err, tenantId }, "[Revisión] producto"); }

  return m;
}

// ── Decidir (puro) ───────────────────────────────────────────────────────

const cop = (n: number) => `$${Math.round(n).toLocaleString("es-CO")}`;

export function decidir(m: Medidas, hoy = new Date()): RevisionDiaria {
  const estado: string[] = [];
  const acciones: AccionDelDia[] = [];
  const agregar = (texto: string, tool: string, args: Record<string, any>) => acciones.push({ n: acciones.length + 1, texto, tool, args });

  estado.push(`${m.leads} clientes nuevos y ${m.ventas} ventas en ${m.dias} días.`);

  // 1. Velocidad: lo primero que pierde una venta por WhatsApp.
  if (m.sinRespuesta.length > 0) {
    estado.push(`⚠️ ${m.sinRespuesta.length} cliente${m.sinRespuesta.length === 1 ? "" : "s"} escribieron y nadie les contestó.`);
    agregar(`Contestarles ahora a esos ${m.sinRespuesta.length}`, "contestar_sin_respuesta", { conversationIds: m.sinRespuesta });
  }
  if (m.respuestasLentas > 0) {
    estado.push(`${m.respuestasLentas} respuesta${m.respuestasLentas === 1 ? "" : "s"} tardaron más de 30 min (la peor: ${m.peorRespuestaMin} min).`);
  }

  // 2. Seguimiento: los tibios se enfrían solos.
  if (m.tibios.length > 0) {
    estado.push(`${m.tibios.length} interesado${m.tibios.length === 1 ? "" : "s"} llevan 2+ días sin seguimiento.`);
    agregar(`Mandarles un seguimiento a esos ${m.tibios.length}`, "seguimiento_tibios", { conversationIds: m.tibios });
  }

  // 3. Adquisición: solo lectura; lo que gasta lo sugiere el agente de anuncios.
  if (!m.metaConectado) {
    estado.push("Facebook no está conectado: no veo tus anuncios.");
  } else if (m.campanas.length === 0) {
    estado.push("No hay campañas activas.");
    if (m.productoEstrella) {
      agregar(`Armar un anuncio nuevo para ${m.productoEstrella.name} (queda en borrador, no gasta)`, "crear_anuncio", { producto: m.productoEstrella.name, objetivo: "mensajes" });
    }
  } else {
    const gasto = m.campanas.reduce((s, c) => s + c.gasto, 0);
    const resultados = m.campanas.reduce((s, c) => s + c.resultados, 0);
    estado.push(`${m.campanas.length} campaña${m.campanas.length === 1 ? "" : "s"} activa${m.campanas.length === 1 ? "" : "s"}: ${cop(gasto)} gastados, ${resultados} resultado${resultados === 1 ? "" : "s"}${resultados > 0 ? ` (${cop(gasto / resultados)} cada uno)` : ""}.`);
    const sinResultados = m.campanas.filter((c) => c.gasto > 0 && c.resultados === 0);
    if (sinResultados.length) estado.push(`Sin resultados con gasto: ${sinResultados.map((c) => c.nombre).join(", ")}.`);
  }
  if (m.sugerenciasPendientes > 0) {
    estado.push(`El agente de anuncios tiene ${m.sugerenciasPendientes} sugerencia${m.sugerenciasPendientes === 1 ? "" : "s"} esperando tu sí (te las mandó aparte).`);
  }

  return { fecha: hoy.toISOString().slice(0, 10), estado, acciones };
}

// ── Redactar ─────────────────────────────────────────────────────────────

export function redactar(r: RevisionDiaria): string {
  const partes = ["📊 *Revisión de hoy*", "", ...r.estado];
  if (r.acciones.length) {
    partes.push("", "Puedo hacer ahora:", ...r.acciones.map((a) => `${a.n}. ${a.texto}`), "", `Respondé con el número (o "todas") y lo hago.`);
  } else {
    partes.push("", "Nada urgente para hoy. Sigo mirando.");
  }
  return partes.join("\n");
}

// ── Estado: qué se le ofreció al dueño, para leer su respuesta ───────────

const TITULO = "revision_diaria";

async function guardarRevision(tenantId: number, r: RevisionDiaria): Promise<void> {
  await db.delete(architectMemory).where(and(eq(architectMemory.tenantId, tenantId), eq(architectMemory.memoryType, "instruction"), eq(architectMemory.title, TITULO)));
  await db.insert(architectMemory).values({
    tenantId, sessionId: "agencia", memoryType: "instruction", title: TITULO,
    content: JSON.stringify(r), tags: ["revision_diaria"], metadata: { fecha: r.fecha, acciones: r.acciones.length },
  });
}

async function cargarRevision(tenantId: number): Promise<RevisionDiaria | null> {
  const [row] = await db.select().from(architectMemory)
    .where(and(eq(architectMemory.tenantId, tenantId), eq(architectMemory.memoryType, "instruction"), eq(architectMemory.title, TITULO)))
    .orderBy(desc(architectMemory.createdAt)).limit(1);
  if (!row) return null;
  try { return JSON.parse(row.content) as RevisionDiaria; } catch { return null; }
}

/** Mide, decide, guarda. Devuelve el texto para mandar (o null si no hay nada que decir). */
export async function revisionDiaria(tenantId: number): Promise<{ texto: string | null; revision: RevisionDiaria }> {
  const m = await medir(tenantId);
  const r = decidir(m);
  await guardarRevision(tenantId, r);
  // Sin acciones no se molesta a nadie: un aviso que siempre dice "todo bien"
  // se deja de leer justo el día que importa.
  return { texto: r.acciones.length ? redactar(r) : null, revision: r };
}

// ── La respuesta del dueño ───────────────────────────────────────────────

/**
 * Qué acciones eligió. Solo números explícitos o "todas": un "sí" pelado
 * NO cuenta, porque ese mismo "sí" puede ser para una sugerencia del agente
 * de anuncios o para un comprobante — y esos handlers van después.
 */
export function accionesElegidas(texto: string, disponibles: number): number[] {
  const t = String(texto || "").toLowerCase().trim();
  if (!t) return [];
  if (/\b(todas|todo|las dos|los dos|ambas|ambos)\b/.test(t)) return Array.from({ length: disponibles }, (_, i) => i + 1);
  // "1", "la 2", "hacé la 1 y la 3", "1,3", "2 y 3"
  if (!/^(hac[eé]|dale con|la|el|s[ií],?\s*(la|el)|\d)/.test(t) && !/^\d/.test(t)) return [];
  const nums = (t.match(/\b\d{1,2}\b/g) ?? []).map(Number).filter((n) => n >= 1 && n <= disponibles);
  return Array.from(new Set(nums));
}

async function tenantDelTelefono(phone: string): Promise<number | null> {
  const quien = phone.replace(/[^0-9]/g, "");
  if (!quien) return null;
  try {
    const filas = await db.select({ id: tenants.id, contactPhone: tenants.contactPhone }).from(tenants);
    const propio = filas.find((t: { id: number; contactPhone: string | null }) => {
      const p = String(t.contactPhone || "").replace(/[^0-9]/g, "");
      return p.length >= 8 && (p === quien || quien.endsWith(p) || p.endsWith(quien));
    });
    if (propio) return Number(propio.id);
  } catch { /* abajo */ }
  const delEntorno = String(process.env.ADMIN_PHONE || "").replace(/[^0-9]/g, "");
  if (delEntorno && quien === delEntorno) return tenantManager.getDefaultTenant().id;
  return null;
}

async function agendarSeguimientos(conversationIds: number[]): Promise<number> {
  let n = 0;
  for (const id of conversationIds.slice(0, MAX_SEGUIMIENTOS_POR_DIA)) {
    try {
      const [c] = await db.select({ stage: conversations.currentStage }).from(conversations).where(eq(conversations.id, id)).limit(1);
      const r = await followUpScheduler.scheduleFollowUp(id, String(c?.stage || "warm"), 60, new Date());
      if (r) n++;
    } catch (err) { logger.warn({ err, id }, "[Revisión] no se pudo agendar el seguimiento"); }
  }
  return n;
}

export async function ejecutarAccion(tenantId: number, a: AccionDelDia): Promise<string> {
  // Los seguimientos van por el programador de siempre: respeta el espaciado
  // anti-bloqueo y no manda dos a la misma persona. "Ahora" = fecha de hoy;
  // el ciclo del programador los saca en minutos.
  if (a.tool === "contestar_sin_respuesta" || a.tool === "seguimiento_tibios") {
    const n = await agendarSeguimientos(a.args.conversationIds || []);
    return n > 0 ? `✅ ${a.texto}: ${n} mensaje${n === 1 ? "" : "s"} en cola, salen en los próximos minutos.` : `⚠️ ${a.texto}: no quedó ninguno por mandar (ya tenían seguimiento pendiente).`;
  }
  const { executeAction } = await import("./app-operator");
  const r = await executeAction(a.tool, a.args, { tenantId, sessionId: "agencia" } as any);
  return `${r.ok ? "✅" : "⚠️"} ${a.texto}: ${String(r.summary || "").slice(0, 300)}`;
}

/**
 * El dueño respondió por WhatsApp al aviso. Devuelve el texto de respuesta,
 * o null si esto no era para acá (y el mensaje sigue su camino normal).
 */
export async function atenderRespuestaAlAviso(phone: string, texto: string): Promise<string | null> {
  const tenantId = await tenantDelTelefono(phone);
  if (!tenantId) return null;
  const r = await cargarRevision(tenantId);
  if (!r || r.acciones.length === 0) return null;
  // El aviso caduca: una respuesta "1" tres días después ya no habla de esto.
  const edadMs = Date.now() - new Date(r.fecha).getTime();
  if (edadMs > 2 * 24 * 3600 * 1000) return null;

  const elegidas = accionesElegidas(texto, r.acciones.length);
  if (elegidas.length === 0) return null;

  const lineas: string[] = [];
  for (const n of elegidas) {
    const a = r.acciones.find((x) => x.n === n);
    if (!a) continue;
    try {
      lineas.push(await ejecutarAccion(tenantId, a));
    } catch (err: any) {
      lineas.push(`⚠️ ${a.texto}: no se pudo (${String(err?.message || err).slice(0, 120)}).`);
    }
  }
  // Lo hecho no se vuelve a ofrecer mañana como si nada: queda en la memoria
  // del negocio, que es lo que lee el plan semanal.
  try {
    await architectMemoryService.recordLearning(
      tenantId, "marketing_learning", `Revisión diaria ${r.fecha}: el dueño pidió ${elegidas.join(", ")}`,
      lineas.join("\n"), ["marketing", "revision_diaria", "ejecutado"], { fecha: r.fecha, acciones: elegidas },
    );
  } catch (err) { logger.warn({ err, tenantId }, "[Revisión] no se pudo registrar el aprendizaje"); }
  r.acciones = r.acciones.filter((a) => !elegidas.includes(a.n));
  await guardarRevision(tenantId, r).catch(() => undefined);
  return lineas.join("\n");
}
