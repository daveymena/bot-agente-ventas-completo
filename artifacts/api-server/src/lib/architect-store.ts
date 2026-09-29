/**
 * Almacén persistente del Architect/Operador.
 *
 * Usa la tabla `architect_memory` para que la conversación y el "plan
 * pendiente de aprobación" sobrevivan al cierre de sesión (antes la memoria
 * vivía solo en el frontend → al recargar, el Architect empezaba de cero).
 *
 * Convención sobre architect_memory:
 *  - Turnos de chat  → memoryType "observation", metadata.role = user|assistant
 *  - Plan pendiente  → memoryType "decision",   title "pending_plan", content = JSON de acciones
 */
import { db, architectMemory } from "@workspace/db";
import { and, eq, desc, inArray } from "drizzle-orm";

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
  /**
   * El turno se cortó por tiempo y quedó a medio hacer.
   *
   * Hace falta al RESTAURAR. El encadenado de continuaciones vive en la
   * página: si el admin se va, esa cadena muere con ella y el trabajo queda
   * frenado en el último tramo, aunque el servidor lo haya guardado. Al volver
   * se veía un mensaje que decía "decime continuá" y nadie lo continuaba.
   *
   * Con esto, la página que restaura sabe que hay algo pendiente y sigue sola.
   */
  parcial?: boolean;
  /**
   * Cuándo se dijo, en milisegundos.
   *
   * La fila ya guardaba `createdAt` --de hecho el historial se ORDENA por él--
   * y al devolverlo se tiraba. Sin esto, al recargar la página el chat perdía
   * las horas: todo lo viejo quedaba sin fecha y solo lo de la sesión actual
   * la tenía. Un dato que ya está guardado y no se expone es un dato perdido.
   */
  at?: number;
}

export interface PlannedAction {
  tool: string;
  args: Record<string, any>;
}

const MAX_HISTORY = 40;

export async function loadArchitectHistory(
  tenantId: number,
  sessionId: string,
  /**
   * Cuántos mensajes traer. MAX_HISTORY (40) es lo que LEE EL MODELO; la
   * pantalla que muestra la charla al admin tiene que pedir más: con 40, una
   * conversación de 248 mensajes se abría mostrando solo el final y el admin
   * creía que el historial se estaba borrando (12-09-2026).
   */
  limite: number = MAX_HISTORY,
): Promise<ChatTurn[]> {
  const rows = await db
    .select()
    .from(architectMemory)
    .where(
      and(
        eq(architectMemory.tenantId, tenantId),
        eq(architectMemory.sessionId, sessionId),
        eq(architectMemory.memoryType, "observation"),
      ),
    )
    // ── LOS ÚLTIMOS 40, NO LOS PRIMEROS 40 ──────────────────────────────
    //
    // Acá decía `asc(...)` + `limit(40)`, y eso es "los cuarenta mensajes MÁS
    // VIEJOS de la charla". Mientras la conversación era corta daba lo mismo
    // --si hay 12 mensajes, los primeros 40 son los 12--, así que funcionó
    // hasta que alguien pasó de 40. A partir de ahí Atlas releía para siempre
    // el ARRANQUE de la charla y no volvía a ver nada reciente: cada mensaje
    // nuevo que el admin escribía entraba a la base y nunca salía.
    //
    // Reportado como "Atlas perdió contexto" el 2026-09-03. No es que se le
    // olvide: es que estaba leyendo el principio del libro cada vez, y el
    // problema EMPEORA cuanto más se conversa, que es lo contrario de lo que
    // uno espera de una memoria.
    //
    // Se piden los últimos por fecha descendente y se dan vuelta, porque el
    // modelo necesita leerlos en el orden en que pasaron.
    // ── Y el desempate por `id`, que no es un detalle ────────────────────
    //
    // `created_at` se guarda con `datetime('now')`: granularidad de UN SEGUNDO.
    // Varios mensajes del mismo turno caen en el MISMO instante y empatan, y
    // con el empate el motor devuelve lo que se le antoja. Encontrado con una
    // prueba de 45 mensajes: pidiendo los últimos 40 por fecha, devolvía los
    // PRIMEROS 40 igual -- el arreglo del orden no servía de nada sin esto.
    //
    // `id` es autoincremental, así que es el orden real en que se dijeron las
    // cosas, y no depende de la precisión del reloj.
    .orderBy(desc(architectMemory.createdAt), desc(architectMemory.id))
    .limit(limite);

  rows.reverse();

  return rows.map((r: any) => ({
    role: (r.metadata?.role as "user" | "assistant") || "user",
    content: r.content,
    at: r.createdAt ? new Date(r.createdAt).getTime() : undefined,
    parcial: r.metadata?.parcial === true,
  }));
}

export async function saveArchitectTurn(
  tenantId: number,
  sessionId: string,
  role: "user" | "assistant",
  content: string,
  /**
   * `parcial`: el turno se cortó por tiempo y falta seguirlo. Queda GUARDADO
   * en la fila, no solo en la respuesta HTTP, porque quien lo necesita es la
   * página que restaura después -- y para ella la respuesta de aquel turno ya
   * no existe.
   */
  extra?: { parcial?: boolean },
): Promise<void> {
  if (!content || !content.trim()) return;
  await db.insert(architectMemory).values({
    tenantId,
    sessionId,
    memoryType: "observation",
    title: `turn:${role}`,
    content: content.slice(0, 8000),
    tags: [],
    metadata: { role, ...(extra?.parcial ? { parcial: true } : {}) },
  });
}

export async function getPendingPlan(
  tenantId: number,
  sessionId: string,
): Promise<{ id: number; actions: PlannedAction[]; reply: string } | null> {
  const [row] = await db
    .select()
    .from(architectMemory)
    .where(
      and(
        eq(architectMemory.tenantId, tenantId),
        eq(architectMemory.sessionId, sessionId),
        eq(architectMemory.memoryType, "decision"),
      ),
    )
    .orderBy(desc(architectMemory.createdAt))
    .limit(1);

  if (!row) return null;
  try {
    const parsed = JSON.parse(row.content);
    return {
      id: row.id,
      actions: parsed.actions || [],
      reply: parsed.reply || "",
    };
  } catch {
    return null;
  }
}

export async function setPendingPlan(
  tenantId: number,
  sessionId: string,
  actions: PlannedAction[],
  reply: string,
): Promise<void> {
  await clearPendingPlan(tenantId, sessionId);
  await db.insert(architectMemory).values({
    tenantId,
    sessionId,
    memoryType: "decision",
    title: "pending_plan",
    content: JSON.stringify({ actions, reply }),
    tags: [],
    metadata: {},
  });
}

export async function clearPendingPlan(
  tenantId: number,
  sessionId: string,
): Promise<void> {
  await db
    .delete(architectMemory)
    .where(
      and(
        eq(architectMemory.tenantId, tenantId),
        eq(architectMemory.sessionId, sessionId),
        eq(architectMemory.memoryType, "decision"),
      ),
    );
}

// ── Lecciones de reparaciones ────────────────────────────────────────────────
// Cuando el Operador falla en ejecutar una acción aprobada y logra
// arreglarlo solo (ver attemptSelfRepair en code-agent.ts), se guarda qué
// pasó y cómo se resolvió. Es memoria POR TENANT, no por sesión de chat —
// sessionId fijo "global" — para que la lección sirva en cualquier
// conversación futura, no solo en la que ocurrió el error.
const LESSONS_SESSION = "global";
const MAX_LESSONS_IN_PROMPT = 6;

export async function saveRepairLesson(
  tenantId: number,
  tool: string,
  errorSummary: string,
  fixSummary: string,
): Promise<void> {
  try {
    await db.insert(architectMemory).values({
      tenantId,
      sessionId: LESSONS_SESSION,
      memoryType: "reflection",
      title: `lesson:${tool}`,
      content: `Herramienta "${tool}" falló (${errorSummary.slice(0, 200)}). Se resolvió: ${fixSummary.slice(0, 300)}`,
      tags: [tool],
      metadata: { tool },
    });
  } catch {
    // La lección es un extra, no algo crítico -- si falla guardarla no debe
    // romper la respuesta al admin.
  }
}

export async function loadRecentLessons(tenantId: number): Promise<string[]> {
  try {
    const rows = await db
      .select()
      .from(architectMemory)
      .where(
        and(
          eq(architectMemory.tenantId, tenantId),
          eq(architectMemory.sessionId, LESSONS_SESSION),
          eq(architectMemory.memoryType, "reflection"),
        ),
      )
      .orderBy(desc(architectMemory.createdAt))
      .limit(MAX_LESSONS_IN_PROMPT);
    return rows.map((r: any) => r.content);
  } catch {
    return [];
  }
}

/** Borra toda la conversación persistida de una sesión (turnos + plan pendiente). */
export async function clearArchitectHistory(
  tenantId: number,
  sessionId: string,
): Promise<void> {
  // Borra el TRANSCRIPT visible ("observation") y cualquier plan pendiente
  // sin confirmar ("decision" -- no debe sobrevivir a un reset, si quedara
  // colgado un "sí" suelto en la conversación nueva podría confirmar por
  // accidente un plan de OTRO pedido). Lo que NO se borra: "research_evidence".
  // Encontrado en vivo: el frontend nunca manda un sessionId propio (siempre
  // "default", ver code-agent.tsx), así que "Nueva conversación" -- pensado
  // como "limpiar lo que veo en pantalla" -- borraba TAMBIÉN la evidencia de
  // investigación real (con su propia ventana de vigencia de 3h en
  // hasRecentResearch()). El admin investigaba de verdad, apretaba Nueva por
  // cualquier motivo, y el siguiente fb_ad_draft volvía a rechazar esa misma
  // investigación real -- un loop de "todavía no investigaste nada" que desde
  // afuera no tenía ninguna explicación, porque la investigación SÍ había
  // pasado.
  await db
    .delete(architectMemory)
    .where(
      and(
        eq(architectMemory.tenantId, tenantId),
        eq(architectMemory.sessionId, sessionId),
        inArray(architectMemory.memoryType, ["observation", "decision"]),
      ),
    );
}

// Detección de aprobación/rechazo del plan pendiente en el mensaje del usuario.
// Solo se llama cuando YA hay un plan pendiente esperando sí/no (el caller
// filtra por `pending.actions.length > 0`) — no en medio de una conversación
// libre — así que una palabra suelta acá no es ambigua: es LA respuesta a
// "¿Confirmas? Responde sí para ejecutar". Antes esta función exigía una
// frase compuesta ("sí ejecuta", "sí adelante") y rechazaba un "sí" o "ok"
// solos — exactamente lo que el propio mensaje le pide al usuario que
// escriba — así que el admin confirmaba, el plan se descartaba por "no
// reconocido" y la IA volvía a proponer el mismo plan en bucle infinito.
export function isApproval(text: string): boolean {
  let t = text.trim().toLowerCase().replace(/,/g, " ").replace(/[!.¡¿?]+$/g, "").trim();
  // Muletillas al inicio ("entonces", "bueno", "pues", "vale", "ya") no
  // cambian el sentido: "entonces confirmado" aprueba igual que "confirmado"
  // solo. Sin este strip, isApproval() la rechazaba, el plan pendiente se
  // borraba sin ejecutar y la IA volvía a proponer el MISMO plan — bucle
  // visto en vivo con exactamente esta frase.
  t = t.replace(/^(entonces|bueno|pues|vale|ya)[,\s]+/i, "").trim();
  // La palabra sola (o con una coletilla corta tipo "sí porfa", "dale pues")
  // ES la confirmación. "sí pero cambia el texto" NO debe contar como
  // aprobación — por eso se exige que sea (casi) todo el mensaje, no un
  // prefijo de una frase más larga con un "pero/pero que/cambia" después.
  // "s" SOLA cuenta como sí. Visto en vivo (2026-08-12): el admin respondió
  // "S" a un "¿Confirmas?", no matcheaba `s[ií]` (que exige la i), el plan se
  // borraba sin ejecutar y Atlas volvía a proponer EXACTAMENTE lo mismo --
  // el admin confirmó tres veces seguidas y nunca pasó nada. Delante de un
  // plan pendiente que pregunta "responde sí para ejecutar", una "s" sola no
  // puede significar otra cosa. Mismo criterio para "sii", "yes" y "ya está".
  // El admin aprueba COMBINANDO palabras: "dale confirmado", "listo dale",
  // "ok dale", "si señor", "confirmado dale". Medido el 2026-09-01 sobre 41
  // formas reales: el patron anterior reconocia 23. Las 18 que faltaban eran
  // todas combinaciones o frases de dos palabras ("esta bien", "de una",
  // "hagale", "subelo", "ya esta").
  //
  // Se acepta una o mas unidades de aprobacion seguidas, y nada mas. Un
  // "si pero cambia el titulo" no entra, porque "pero" no es ninguna de
  // ellas -- que es justo lo que hay que seguir rechazando.
  // El admin aprueba COMBINANDO palabras: "dale confirmado", "listo dale",
  // "ok dale", "si señor", "confirmado dale". Medido el 2026-09-01 sobre 41
  // formas reales de aprobar: el patron anterior reconocia 23. Las 18 que
  // faltaban eran combinaciones o frases de dos palabras ("esta bien",
  // "de una", "hagale", "subelo", "ya esta").
  //
  // Se acepta una o mas unidades de aprobacion seguidas, y NADA mas. Un
  // "si pero cambia el titulo" no entra, porque "pero" no es ninguna de
  // ellas -- que es justo lo que hay que seguir rechazando.
  if (/^(?:s|s[ií]+|sip|yes|ok(ay|ey)?|dale|listo|confirmo|confirmado|confirmada|confirma|apruebo|aprobado|adelante|proced[eo]|hazlo|h[aá]gale|ejec[uú]talo|correcto|perfecto|va|eso|sale|excelente|genial|publica|publ[ií]calo|s[uú]belo|s[uú]bela|aprueba|porfa|por\s+favor|pues|ya|nomas|nom[aá]s|no\s+m[aá]s|se[nñ]or|se[nñ]ora|que\s+s[ií]|todo|hermano|parce|de\s+una|claro|claro\s+que\s+s[ií]|obvio|por\s+supuesto|est[aá]\s+bien|as[ií]\s+est[aá]\s+bien|as[ií]\s+dale|est[aá]|me\s+gusta|ya\s+est[aá]|todo\s+bien|muy\s+bien|as[ií]\s+qued[oó]|d[eé]jalo\s+as[ií])(?:[\s,]+(?:s|s[ií]+|sip|yes|ok(ay|ey)?|dale|listo|confirmo|confirmado|confirmada|confirma|apruebo|aprobado|adelante|proced[eo]|hazlo|h[aá]gale|ejec[uú]talo|correcto|perfecto|va|eso|sale|excelente|genial|publica|public[aá]lo|s[uú]belo|s[uú]bela|aprueba|porfa|por\s+favor|pues|ya|nomas|nom[aá]s|no\s+m[aá]s|se[nñ]or|se[nñ]ora|que\s+s[ií]|todo|hermano|parce|de\s+una|claro|claro\s+que\s+s[ií]|obvio|por\s+supuesto|est[aá]\s+bien|as[ií]\s+est[aá]\s+bien|as[ií]\s+dale|me\s+gusta|ya\s+est[aá]|todo\s+bien|muy\s+bien|as[ií]\s+qued[oó]|d[eé]jalo\s+as[ií]))*$/i.test(t)) {
    return true;
  }
  return /^\s*(s[ií]\s+(haz|por\s+favor|adelante|dale|ejecuta|procede|confirm(o|a|ado|ada)|apruebo|estoy\s+de\s+acuerdo)|dale\s+haz|ejecuta\s+(el\s+)?plan|apruebo\s+(el\s+)?plan|confirm(o|a|ado|ada)\s+(la\s+)?ejecuci|procede\s+con\s+todo|publ[ií]calo(\s+ya)?)/i.test(t);
}

export function isRejection(text: string): boolean {
  return /^\s*(no\b|cancel|espera|det[eé]n|mejor|cambia|cambi[eé]|otra|otro|as[ií] no|ninguno|nada)/i.test(
    text.trim(),
  );
}

// ── "Sí, pero…" (aprobación CON corrección) ─────────────────────────────────
//
// Medido en vivo (2026-09-29): el admin aprueba el plan pero pide un ajuste
// en el mismo mensaje ("sí", "dale pero en rojo", "confirmado, pero sin esos
// emojis"). Hasta acá eso caía en "pedido nuevo": el plan se DESCARTABA y el
// turno siguiente proponía lo MISMO sin el ajuste, el admin volvía a pedirlo,
// y así en loop -- propone → descarta → restaura.
//
// No es un rechazo (el plan sigue valiendo, solo cambia un detalle) y no es
// una aprobación pura (no se puede ejecutar tal cual). Es un tercer caso: el
// plan se CONSERVA y el turno sigue con plan + corrección, para que el modelo
// re-proponga el plan corregido en vez de empezar de cero.
//
// Se detecta barato y sin modelo: tiene que EMPEZAR con una apertura de
// aprobación y traer una marca de corrección después. Un "cambia el texto"
// a secas (sin apertura) sigue siendo pedido nuevo, no esto.
const APERTURA_DE_SI = /^(s[ií]+|sip|dale|listo|ok(ay|ey)?|confirmo|confirmado|confirmada|claro(\s+que\s+s[ií])?|perfecto|bueno|va|de\s+una|hagale|hazlo|adelante|procede|apruebo|obvio|por\s+supuesto|est[aá]\s+bien|todo\s+bien|me\s+gusta|de\s+acuerdo)(?=[\s,!.]|$)/i;
const MARCA_DE_CORRECCION = /\b(pero|cambia(r|lo|la|le|me)?|cámbia|mejor|en\s+vez\s+de|sin\s+(el|la|los|las|ese|esa|esos|esas|esos)?\s*[a-záéíóúñ]+\b|que\s+(sea|diga|lleve|tenga|vaya|quede)|pon(le|me)?|quit(a|ale|ame)?|sac(a|ale|ame)?|agreg(a|ale|ame)?|con\s+(este|esta|ese|esa)\b)/i;

export function esSiConCorreccion(text: string): boolean {
  const t = String(text || "").trim();
  if (!t || t.length > 400) return false;
  const m = APERTURA_DE_SI.exec(t);
  if (!m) return false;
  const resto = t.slice(m[0].length);
  // "sí, súbelo" es aprobación (súbelo está en la lista de isApproval), no
  // corrección: la marca tiene que estar en lo que sigue a la apertura.
  if (isApproval(t)) return false;
  return MARCA_DE_CORRECCION.test(resto);
}
