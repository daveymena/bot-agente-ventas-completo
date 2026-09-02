/**
 * ============================================================
 * LO QUE EL CLIENTE YA LEYÓ NO SE VUELVE A MANDAR
 * ============================================================
 *
 * Conversación real del 2026-09-02, 07:51-07:54:
 *
 *   07:51 bot     [ficha del curso de IA]
 *   07:51 bot     "¿Te paso el precio? 💰"
 *   07:53 cliente "Tienes más información?"
 *   07:53 bot     [texto nuevo]
 *   07:53 bot     [LA MISMA FICHA, otra vez]
 *   07:54 bot     "¿Te paso el precio? 💰"   ← palabra por palabra
 *
 * El cliente pidió MÁS información y recibió la misma. Dos minutos después.
 *
 * ── Por qué el guardia que ya existía no lo atajó ────────────────────────
 *
 * Había uno, y estaba bien pensado: si la ficha ya salió, no se repite. Pero
 * tenía una excepción -- `pideAlgoEntregable()` -- para no bloquear al cliente
 * que pide el video, el precio o los medios de pago, que son cosas que
 * todavía no vio.
 *
 * "¿Tienes más información?" entra por esa excepción. Y ahí la excepción se
 * come la regla: lo que pidió es exactamente lo que ya tiene.
 *
 * ── Por qué acá y no arreglando la excepción ─────────────────────────────
 *
 * Porque la repetición no llega por un solo camino. La ficha viene del parser,
 * el cierre lo arma `invitacionDe`, y el saludo tiene su propia función de
 * variantes. Cada uno con su regla, y cada regla con su hueco.
 *
 * Un mensaje que el cliente ya leyó no sirve, venga de donde venga. Eso se
 * puede comprobar UNA vez, sobre lo que está por salir, comparándolo con lo
 * que ya salió. Es la misma lección de siempre: lo que se puede decidir en el
 * servidor, se decide en el servidor.
 */

/** Para comparar: sin tildes, sin emojis, sin puntuación y sin espacios de más. */
export function comoSeLee(texto: string): string {
  return String(texto || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    // Emojis y símbolos: dos mensajes que solo difieren en el emoji son el
    // mismo mensaje para quien lo lee.
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export interface MensajeDelHistorial {
  role: string;
  content: string;
}

/**
 * ¿El agente ya dijo esto?
 *
 * Solo se miran los últimos mensajes: repetir algo de hace media hora puede
 * ser legítimo -- "te recuerdo el precio" -- y repetirlo dos turnos después
 * es un bot trabado.
 */
export function yaLoDijo(
  texto: string,
  historial: MensajeDelHistorial[] | null | undefined,
  cuantosAtras = 6,
): boolean {
  const buscado = comoSeLee(texto);
  // Frases muy cortas se repiten con razón ("listo", "dale", "claro").
  if (buscado.length < 25) return false;

  const delAgente = (historial || [])
    .filter((m) => m?.role === "agent" || m?.role === "assistant")
    .slice(-cuantosAtras);

  for (const m of delAgente) {
    const anterior = comoSeLee(m.content);
    if (!anterior) continue;
    if (anterior === buscado) return true;
    // Un mensaje contenido entero dentro de otro también es repetir: la ficha
    // sale a veces sola y a veces con una línea delante.
    if (anterior.includes(buscado) || buscado.includes(anterior)) return true;
  }
  return false;
}

export interface ParteDeSalida {
  kind?: string;
  content?: string;
  [k: string]: any;
}

/**
 * Saca de la respuesta las partes que el cliente ya leyó.
 *
 * Nunca deja el mensaje vacío: si TODAS las partes son repetidas, se conserva
 * la última. Un bot que no contesta es peor que uno que se repite -- y ahí el
 * problema es otro, que es no tener nada nuevo que decir.
 */
export function sinLoQueYaLeyo(
  partes: ParteDeSalida[],
  historial: MensajeDelHistorial[] | null | undefined,
): { partes: ParteDeSalida[]; quitadas: number } {
  const textos = partes.filter((p) => p.kind === "text" && String(p.content || "").trim());
  if (textos.length === 0) return { partes, quitadas: 0 };

  const repetidas = new Set<ParteDeSalida>();
  for (const p of textos) {
    if (yaLoDijo(String(p.content), historial)) repetidas.add(p);
  }
  if (repetidas.size === 0) return { partes, quitadas: 0 };

  // Si se van todas, se deja la última: algo hay que contestar.
  if (repetidas.size === textos.length) repetidas.delete(textos[textos.length - 1]);

  return {
    partes: partes.filter((p) => !repetidas.has(p)),
    quitadas: repetidas.size,
  };
}
