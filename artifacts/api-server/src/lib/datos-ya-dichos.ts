/**
 * ============================================================
 * MEMORIA COMERCIAL: QUÉ DATOS YA LE DIJIMOS AL CLIENTE
 * ============================================================
 *
 * §14 del playbook de ventas. El estado mínimo que un vendedor lleva en la
 * cabeza: qué ya contó, qué ya mandó, qué prometió y qué falta.
 *
 * ── Por qué no alcanzaba lo que ya había ──────────────────────────────────
 *
 * `no-repetir.ts` compara MENSAJES: atrapa que el bot mande dos veces el mismo
 * texto. Eso deja pasar lo que de verdad molesta:
 *
 *     turno 1: "El curso cuesta $60.000 COP."
 *     turno 3: "Te comento que la inversión es de sesenta mil pesos."
 *
 * Son textos distintos, así que `yaLoDijo` no los ve. Pero para el cliente es
 * la misma información dos veces, y esa sensación --"ya me dijiste"-- es la
 * que hace que una conversación parezca un formulario en vez de una persona.
 *
 * Acá se rastrea el DATO, no la frase.
 *
 * ── Lo que NO hace ────────────────────────────────────────────────────────
 *
 * No prohíbe repetir. El playbook es explícito con las excepciones: se repite
 * cuando el cliente lo pide, cuando hubo un error de entrega, cuando el dato
 * cambió, o cuando la pregunta nueva necesita el resumen. Este módulo solo
 * INFORMA qué ya se dijo; quién lo use decide.
 *
 * Y no llama a ningún modelo: es determinístico y se puede probar entero.
 */

/** Los datos comerciales que un cliente pregunta una sola vez. */
export type DatoComercial =
  | "precio"
  | "que-incluye"
  | "duracion"
  | "como-se-entrega"
  | "como-se-paga"
  | "garantia"
  | "envio";

/**
 * Cómo se reconoce cada dato en lo que el agente escribió.
 *
 * Los patrones miran la FORMA de decirlo, no una frase exacta: el modelo
 * redacta distinto cada vez, y una lista de frases fijas se le escapa a la
 * segunda vuelta. Por eso "cuesta", "vale", "inversión" y el símbolo de peso
 * cuentan todos como haber dicho el precio.
 */
const COMO_SE_DICE: Record<DatoComercial, RegExp> = {
  // Un monto con símbolo, o el verbo de precio seguido de números/letras.
  precio: /\$\s?\d|\d{1,3}(?:\.\d{3})+\s*(?:cop|pesos)|(?:cuesta|vale|precio|inversi[oó]n|sale)\b/i,
  "que-incluye": /\b(incluye|conten[ií]|vas a (?:ver|aprender)|trae|consta de|m[oó]dulos?|lecciones?|clases?)\b/i,
  duracion: /\b\d+\s*(?:horas?|d[ií]as?|semanas?|meses?|minutos?)\b|\bdura\b|\bduraci[oó]n\b/i,
  "como-se-entrega": /\b(drive|google drive|acceso (?:inmediato|de por vida)|enlace de acceso|te llega|descarg|plataforma)\b/i,
  "como-se-paga": /\b(nequi|daviplata|bancolombia|transferencia|mercadopago|paypal|pse|tarjeta|consign|contraentrega)\b/i,
  garantia: /\bgarant[ií]a\b|\breembolso\b|\bdevoluci[oó]n\b/i,
  envio: /\b(env[ií]o|env[ií]os|domicilio|transportadora|paqueter[ií]a|llega en \d)\b/i,
};

export interface MensajeDelHistorial {
  role?: string | null;
  content?: string | null;
}

/** Qué datos entrega ESTE texto. */
export function datosQueTrae(texto: string): DatoComercial[] {
  const t = String(texto || "");
  if (!t.trim()) return [];
  return (Object.keys(COMO_SE_DICE) as DatoComercial[]).filter((d) => COMO_SE_DICE[d].test(t));
}

/**
 * Qué datos ya le dijimos al cliente en esta conversación.
 *
 * ⚠️ Solo cuentan los mensajes DEL AGENTE. Que el cliente escriba "¿cuánto
 * cuesta?" no significa que se lo hayamos dicho -- al contrario, es la señal
 * de que falta. Confundir las dos puntas haría que el bot creyera haber
 * respondido algo que nunca respondió, que es peor que repetir.
 *
 * El agente guarda con `role: "agent"` (ver saveAgentMessage) y otros canales
 * usaron "assistant": se aceptan los dos, como en la métrica de tiempo.
 */
export function datosYaDichos(historial: MensajeDelHistorial[] | null | undefined): Set<DatoComercial> {
  const dichos = new Set<DatoComercial>();
  for (const m of historial || []) {
    const rol = String(m?.role || "");
    if (rol !== "agent" && rol !== "assistant") continue;
    for (const d of datosQueTrae(String(m?.content || ""))) dichos.add(d);
  }
  return dichos;
}

/** Cómo se le nombra cada dato al modelo, en su idioma. */
const NOMBRE: Record<DatoComercial, string> = {
  precio: "el precio",
  "que-incluye": "qué incluye",
  duracion: "cuánto dura",
  "como-se-entrega": "cómo se entrega",
  "como-se-paga": "los medios de pago",
  garantia: "la garantía",
  envio: "el envío",
};

/**
 * El bloque que se le mete al prompt.
 *
 * Se le dice lo que ya sabe el cliente y CUÁNDO sí conviene repetirlo, porque
 * una prohibición seca produce el error opuesto: el cliente pregunta "¿cuánto
 * era?" y el bot se niega a contestar por no repetirse.
 *
 * Devuelve cadena vacía cuando no hay nada dicho todavía: un bloque que dice
 * "no dijiste nada" es peso muerto en el prompt de un primer mensaje.
 */
export function bloqueDeLoYaDicho(historial: MensajeDelHistorial[] | null | undefined): string {
  const dichos = [...datosYaDichos(historial)];
  if (dichos.length === 0) return "";
  const lista = dichos.map((d) => NOMBRE[d]).join(" · ");
  return (
    `\nYA LE DIJISTE: ${lista}.\n` +
    `No lo repitas salvo que te lo pregunte de nuevo, que el dato haya cambiado, ` +
    `o que la pregunta nueva no se entienda sin recordarlo en media línea. ` +
    `Repetir lo que el cliente ya leyó hace que la conversación se sienta un formulario.\n`
  );
}
