/**
 * ============================================================
 * CÓMO TERMINA UN TURNO DE ATLAS: plan, aviso y una sola pregunta
 * ============================================================
 *
 * Medido en producción el 07-10-2026 (02:42–02:44 UTC), tres turnos seguidos
 * sobre la misma landing:
 *
 *   1. y 2.  "[AtlasOpenCode] El modelo dijo que ya había hecho el trabajo sin
 *            ejecutar NADA -- se corrige", dos veces seguidas. Cada vez el
 *            servidor le pegó arriba "⚠️ Todavía no se guardó nada. Esto es
 *            solo texto; si querés que lo haga, pedímelo."
 *   3.       Atlas escribió, con sus palabras, "⚠️ La actualización todavía no
 *            se ejecutó. ¿Confirmás que actualice la landing 1…?" -- SIN
 *            proponer nada. El "sí" del dueño entró como texto, el modelo
 *            recién ahí propuso, y el dueño tuvo que confirmar DOS veces.
 *
 * Son tres síntomas de dos fallas de estado, no de redacción:
 *
 * ── Falla 1: el candado no sabía de trabajo hecho en turnos anteriores ────
 *
 * El candado de "ya lo hice" parte de una premisa escrita en la ruta: "si
 * estamos acá, NO se ejecutó ninguna acción en este turno". Es cierta para
 * ESTE turno y falsa como conclusión: una edición de landing que el dueño
 * aprobó en el turno anterior corre en segundo plano, y al turno siguiente el
 * servidor le avisa al modelo "✅ La landing [1] está LISTA ... Último cambio
 * aplicado: …" (`notaDeLandingsEnSegundoPlano`). El modelo lo cuenta --"la
 * landing quedó actualizada"--, que es VERDAD, y el candado lo desmentía
 * delante del dueño. Dos desmentidas seguidas y el propio modelo terminó
 * creyendo que no había hecho nada: de ahí sale el "todavía no se ejecutó"
 * del tercer turno, que es la frase del aviso con otras palabras.
 *
 * La salida es darle al candado el dato que le faltaba: qué se EJECUTÓ de
 * verdad en esta sesión hace poco (`anotarTrabajoReal`). No se adivina desde
 * el texto: lo anotan la rama que ejecuta el plan aprobado y el aviso de
 * landings terminadas, que son los dos lugares donde el trabajo existe.
 *
 * ── Falla 2: una pregunta de confirmación sin nada que confirmar ──────────
 *
 * Confirmar solo ejecuta lo que está en el plan pendiente. Si el modelo
 * pregunta "¿Confirmás que actualice…?" sin haber llamado propose_action, el
 * "sí" no tiene nada que ejecutar: vuelve al modelo como texto y recién ahí
 * se arma el plan, que pide OTRA confirmación. Lo enseñaban dos textos
 * nuestros: la plantilla B del prompt ("…y cerrá pidiendo confirmación. Ej:
 * ¿Lo genero?") y el resultado de propose_action ("pedile que lo confirme").
 * Esos se corrigen en su fuente; esto es la red para cuando igual pasa: antes
 * de cerrar el turno, si quedó una pregunta de sí/no (o un "ya está hecho")
 * sin plan, se le pide UNA vez al mismo modelo que lo convierta en propuesta.
 * Si no era un cambio, contesta "OK" y no pasa nada más.
 *
 * Y cuando sí hay plan, la pregunta la pone el SERVIDOR debajo ("❓
 * ¿Confirmas?..."): la del modelo sobra y se quita (`unSoloCierre`). Dos
 * preguntas de confirmación seguidas era lo que más alargaba esas respuestas.
 */

// ── Trabajo que se ejecutó de verdad en la sesión ──────────────────────────

interface TrabajoReal {
  herramientas: string[];
  hasta: number;
  /** Cuántos turnos más puede referirse a esto el modelo sin que sea mentira. */
  turnosRestantes: number;
}

const TRABAJO_REAL = new Map<string, TrabajoReal>();

/**
 * Cuánto dura. Lo ejecutado se cuenta en el turno siguiente ("¿ya quedó?") y
 * a lo sumo un par más; pasado eso, un "ya está hecho" sin plan vuelve a ser
 * sospechoso, que es lo que el candado existe para cazar.
 */
const TTL_MS = 20 * 60_000;
const TURNOS = 3;

const clave = (tenantId: number, sessionId: string) => `${tenantId}:${sessionId}`;

/** Lo llaman los dos lugares donde el trabajo existe: el plan ejecutado y la landing terminada. */
export function anotarTrabajoReal(tenantId: number, sessionId: string | undefined, herramientas: string[]): void {
  if (!sessionId || !herramientas.length) return;
  const previo = TRABAJO_REAL.get(clave(tenantId, sessionId));
  const vigente = previo && previo.hasta > Date.now() ? previo.herramientas : [];
  TRABAJO_REAL.set(clave(tenantId, sessionId), {
    herramientas: Array.from(new Set([...vigente, ...herramientas])),
    hasta: Date.now() + TTL_MS,
    turnosRestantes: TURNOS,
  });
}

/** Un turno normal (no la ejecución de un plan) empieza: descuenta uno. */
export function contarTurnoDeSesion(tenantId: number, sessionId: string): void {
  const k = clave(tenantId, sessionId);
  const t = TRABAJO_REAL.get(k);
  if (!t) return;
  t.turnosRestantes -= 1;
  if (t.turnosRestantes < 0 || t.hasta <= Date.now()) TRABAJO_REAL.delete(k);
}

/** Lo ejecutado de verdad hace poco en esta sesión (vacío si nada). */
export function trabajoRealReciente(tenantId: number, sessionId: string): string[] {
  const k = clave(tenantId, sessionId);
  const t = TRABAJO_REAL.get(k);
  if (!t) return [];
  if (t.hasta <= Date.now() || t.turnosRestantes < 0) {
    TRABAJO_REAL.delete(k);
    return [];
  }
  return t.herramientas;
}

/**
 * ¿Hay que decirle al dueño que lo que el modelo da por hecho no se ejecutó?
 *
 * Solo si lo afirma Y no hay trabajo real reciente al que pueda estar
 * refiriéndose. Con trabajo real cerca, desmentirlo es desmentir una verdad.
 */
export function debeAvisarQueNoEjecuto(afirmaHaberloHecho: boolean, trabajoReciente: string[]): boolean {
  return afirmaHaberloHecho && trabajoReciente.length === 0;
}

// ── El cierre de la respuesta ──────────────────────────────────────────────

/** La última línea con contenido. */
function ultimaLinea(texto: string): string {
  const lineas = String(texto || "").split("\n").map((l) => l.trim()).filter(Boolean);
  return lineas[lineas.length - 1] || "";
}

/**
 * ¿La respuesta termina en una pregunta?
 *
 * Se mira la FORMA, no las palabras: la última línea abre o cierra
 * interrogación (ignorando emoji y espacios del final).
 */
export function terminaEnPregunta(texto: string): boolean {
  const u = ultimaLinea(texto).replace(/[\s\p{Extended_Pictographic}️*_]+$/u, "");
  return u.includes("¿") || u.endsWith("?");
}

export interface SituacionDelCierre {
  /** Acciones que quedaron propuestas en este turno. */
  plan: number;
  textoFinal: string;
  /** La pregunta final pide un DATO (cuál producto, cuánto presupuesto): no es una confirmación. */
  pideUnDato: boolean;
  /** El candado de "ya lo hice" quedó levantado. */
  avisarQueNoEjecuto: boolean;
  /** Ya se insistió en este turno por otro motivo (el anuncio redactado sin guardar). */
  yaSeInsistio: boolean;
  /** Ruta guiada: ahí las preguntas de sí/no son el diseño y el servidor ejecuta el paso. */
  enRutaGuiada: boolean;
  /** Milisegundos que le quedan al turno. */
  quedaMs: number;
}

/** Margen mínimo para pedirle la propuesta al modelo sin pasarse del corte del proxy. */
export const MARGEN_PARA_PEDIR_PROPUESTA_MS = 20_000;

/**
 * ¿Se le pide al modelo que convierta su cierre en una propuesta?
 *
 * Sí cuando el turno termina sin plan y, aun así, el texto le deja al dueño
 * algo que confirmar: una pregunta de sí/no, o la afirmación de que algo ya
 * se hizo. Las dos son la misma trampa: el "sí" no ejecutaría nada.
 */
export function debePedirLaPropuesta(s: SituacionDelCierre): boolean {
  if (s.plan > 0 || s.yaSeInsistio || s.enRutaGuiada) return false;
  if (s.quedaMs < MARGEN_PARA_PEDIR_PROPUESTA_MS) return false;
  if (!String(s.textoFinal || "").trim()) return false;
  const preguntaDeSiONo = terminaEnPregunta(s.textoFinal) && !s.pideUnDato;
  return preguntaDeSiONo || s.avisarQueNoEjecuto;
}

/** Lo que se le manda al modelo, en la misma sesión, para que proponga. */
export function pedidoDePropuesta(motivo: { avisarQueNoEjecuto: boolean }): string {
  return (
    "[SISTEMA] Terminaste sin proponer nada (no llamaste propose_action), pero " +
    (motivo.avisarQueNoEjecuto
      ? "tu respuesta da por hecho un cambio que en este turno no se ejecutó. "
      : "cerraste con una pregunta de sí o no. ") +
    "El admin solo puede confirmar lo que está propuesto: si contesta \"sí\", hoy no se ejecuta nada y tiene que confirmar dos veces.\n\n" +
    "- Si es un CAMBIO (crear, editar, actualizar, publicar, borrar, enviar, gastar): llamá AHORA propose_action con la herramienta exacta y los argumentos reales que ya leíste. No escribas texto: el sistema le muestra el plan y le pregunta.\n" +
    "- Si solo ofrecías LEER algo, o hablabas de un trabajo que el sistema ya terminó antes, no llames nada y respondé exactamente: OK"
  );
}

/**
 * Con plan propuesto, la pregunta de confirmación la pone el servidor
 * debajo. La del modelo sobra: se saca la última línea si es una pregunta.
 *
 * Solo la ÚLTIMA y solo si es corta: una pregunta en el medio del texto o un
 * párrafo largo que termina en "?" no se tocan.
 */
export function unSoloCierre(texto: string): string {
  const t = String(texto || "").replace(/\s+$/, "");
  if (!terminaEnPregunta(t)) return t;
  const lineas = t.split("\n");
  let i = lineas.length - 1;
  while (i >= 0 && !lineas[i].trim()) i--;
  if (i < 0 || lineas[i].trim().length > 220) return t;
  return lineas.slice(0, i).join("\n").replace(/\s+$/, "");
}

// ── Medir la forma de la respuesta ─────────────────────────────────────────

export interface FormaDeLaRespuesta {
  lineas: number;
  preguntas: number;
  caracteres: number;
}

/**
 * Cuánto mide lo que le llegó al dueño. Va al diagnóstico de cada turno
 * (`GET /api/code-agent/atlas-diagnostico`), así "responde largo" deja de ser
 * una impresión: se ve el promedio de líneas y cuántas respuestas cierran con
 * más de una pregunta.
 */
export function medirRespuesta(texto: string): FormaDeLaRespuesta {
  const t = String(texto || "");
  return {
    lineas: t.split("\n").filter((l) => l.trim()).length,
    preguntas: (t.match(/\?/g) || []).length,
    caracteres: t.length,
  };
}
