/**
 * Evaluador de chats: califica lo que el agente MANDÓ, turno por turno.
 *
 * Nació el 13-09-2026 después de doce horas corrigiendo, una por una, nueve
 * causas medidas en dos chats reales del dueño. Ninguna era del modelo:
 * todas eran del servidor que rodea al modelo, y cada una había quedado
 * escondida porque nadie comparaba lo que el cliente RECIBE contra hechos
 * que el servidor conoce. Esto es esa comparación, automática, para poder
 * correrla sobre todas las conversaciones reales antes de cada deploy.
 *
 * Las reglas son de HECHOS (ids, precios, tipo de agente, lo que el cliente
 * dijo), no de estilo. Un fallo acá es un fallo demostrable.
 */

export interface TurnoEvaluado {
  /** Lo que escribió el cliente. */
  mensaje: string;
  /** Texto que salió (todas las partes de texto, unidas). */
  texto: string;
  /** Tarjetas que salieron. */
  tarjetas: Array<{ productId: number; seccion: string | null }>;
  /** Agente que atendió este turno. */
  agente?: string | null;
  /** Lo que el motor decidió, para las reglas que lo necesitan. */
  productoDelMensajeId?: number | null;
  nombraOtroProducto?: boolean;
  intent?: string | null;
}

export interface Hallazgo {
  turno: number;
  regla: string;
  detalle: string;
}

export interface ProductoParaEvaluar { id: number; name: string; price: number | string; kind?: string | null }

const GENERICO = /¿Qué te gustaría saber puntualmente\?/;
const NIEGA_TENERLO = /\b(no\s+(lo\s+)?(tengo|tenemos|manejo|manejamos)|no\s+(está|esta|aparece)\s+en\s+el\s+cat[aá]logo|no\s+tengo\s+ese\s+producto)\b/i;
const PIDE_COMPROBANTE = /\bcomprobante\b/i;
// Se evalúa sobre el texto SIN tildes: `\b` no reconoce "pagué" como palabra.
const DICE_QUE_PAGO = /\b(ya\s+(te\s+)?pague|ya\s+transferi|acabo\s+de\s+(pagar|transferir)|hice\s+(el\s+pago|la\s+transferencia))\b/;
const diceQuePago = (m: string) => DICE_QUE_PAGO.test(norm(m));
const URL = /https?:\/\/\S+/i;
const ID_INTERNO = /\(\s*ID:?\s*\d+\s*\)|\bID:?\s*\d{2,}\b/;

function norm(t: string): string {
  return String(t || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function nombraProducto(mensaje: string, p: ProductoParaEvaluar): boolean {
  const palabras = new Set(norm(mensaje).match(/[a-zñ0-9]{4,}/g) ?? []);
  const claves = (norm(p.name).match(/[a-zñ0-9]{4,}/g) ?? [])
    .filter((w) => !/^(curso|cursos|pack|mega|megapack|completo|online|para|desde|hasta|nivel|todo|todos|combo|cero|avanzado)$/.test(w));
  return claves.length > 0 && claves.some((w) => palabras.has(w));
}

/**
 * Califica una conversación entera. Devuelve los hallazgos (vacío = limpio).
 */
export function evaluarChat(turnos: TurnoEvaluado[], catalogo: ProductoParaEvaluar[]): Hallazgo[] {
  const out: Hallazgo[] = [];
  const porId = new Map(catalogo.map((p) => [p.id, p]));
  let agenteAnterior: string | null = null;
  let focoAnterior: number | null = null;
  let clienteDijoQuePago = false;

  turnos.forEach((t, i) => {
    const n = i + 1;
    const texto = String(t.texto || "");
    const nombrados = catalogo.filter((p) => nombraProducto(t.mensaje, p));
    if (diceQuePago(t.mensaje)) clienteDijoQuePago = true;

    // ── Cambio de agente sin motivo ────────────────────────────────────────
    if (t.agente && agenteAnterior && t.agente !== agenteAnterior) {
      const cambioDeTipo = nombrados.some((p) => {
        const foco = focoAnterior != null ? porId.get(focoAnterior) : null;
        return foco && String(p.kind || "digital") !== String(foco.kind || "digital");
      });
      if (!cambioDeTipo) out.push({ turno: n, regla: "cambio-de-agente", detalle: `Pasó de ${agenteAnterior} a ${t.agente} sin que el cliente nombrara un producto de otro tipo` });
    }

    // ── Niega tener algo que sí existe (o el producto en foco) ─────────────
    if (NIEGA_TENERLO.test(texto)) {
      if (nombrados.length > 0) out.push({ turno: n, regla: "niega-lo-que-existe", detalle: `Dice que no lo tiene y el cliente nombró ${nombrados.map((p) => p.name).join(", ")}` });
      else if (nombrados.length === 0 && focoAnterior != null && !t.nombraOtroProducto) out.push({ turno: n, regla: "niega-el-foco", detalle: `Dice que no tiene el producto, pero el cliente no pidió otro: seguía con ${porId.get(focoAnterior)?.name ?? focoAnterior}` });
    }

    // ── Pidió varios y salió la sección de precio de UNO ──────────────────
    if (nombrados.length >= 2 && t.tarjetas.some((c) => c.seccion === "precio")) {
      out.push({ turno: n, regla: "ficha-de-uno-por-varios", detalle: `Nombró ${nombrados.length} productos y salió el precio de uno solo` });
    }

    // ── Tarjeta de un producto que el cliente no pidió ─────────────────────
    for (const c of t.tarjetas) {
      if (nombrados.length > 0 && !nombrados.some((p) => p.id === c.productId)) {
        out.push({ turno: n, regla: "tarjeta-equivocada", detalle: `Salió la ficha de ${porId.get(c.productId)?.name ?? c.productId} y el cliente nombró ${nombrados.map((p) => p.name).join(", ")}` });
      }
      if (t.nombraOtroProducto && c.productId === focoAnterior) {
        out.push({ turno: n, regla: "ficha-del-foco-por-otro", detalle: `El cliente preguntó por otra cosa y salió la ficha de ${porId.get(c.productId)?.name ?? c.productId}` });
      }
      if (/^pago/.test(String(c.seccion || "")) && diceQuePago(t.mensaje)) {
        out.push({ turno: n, regla: "cobra-a-quien-ya-pago", detalle: "Dice que ya pagó y salieron los medios de pago" });
      }
    }

    // ── Precio que no es de ningún producto nombrado ni en foco ────────────
    const montos = texto.match(/\$\s?\d[\d.]*/g) ?? [];
    if (montos.length > 0) {
      const permitidos = new Set<number>();
      const base = nombrados.length > 0 ? nombrados : (focoAnterior != null && porId.get(focoAnterior) ? [porId.get(focoAnterior)!] : []);
      for (const p of base) permitidos.add(Math.round(Number(p.price)));
      // sumas de 2..4 de los nombrados
      const precios = nombrados.map((p) => Math.round(Number(p.price))).filter((x) => x > 0).slice(0, 6);
      for (let mask = 1; mask < 1 << precios.length; mask++) {
        let s = 0, k = 0; for (let j = 0; j < precios.length; j++) if (mask & (1 << j)) { s += precios[j]; k++; }
        if (k >= 2 && k <= 4) permitidos.add(s);
      }
      if (permitidos.size > 0) {
        for (const m of montos) {
          const v = Number(m.replace(/[^\d]/g, ""));
          if (v > 0 && !permitidos.has(v)) out.push({ turno: n, regla: "precio-ajeno", detalle: `${m} no es el precio de lo que se está hablando` });
        }
      }
    }

    // ── Pide comprobante a quien nunca dijo que pagó ───────────────────────
    if (PIDE_COMPROBANTE.test(texto) && !clienteDijoQuePago && !/\b(comprobante|pago|pague|transfer)/i.test(t.mensaje)) {
      out.push({ turno: n, regla: "comprobante-sin-pago", detalle: "Pide el comprobante y el cliente nunca dijo que pagó" });
    }

    // ── Cosas que nunca deben salir ────────────────────────────────────────
    if (ID_INTERNO.test(texto)) out.push({ turno: n, regla: "id-interno", detalle: "El texto trae un ID del catálogo" });
    if (GENERICO.test(texto)) out.push({ turno: n, regla: "respuesta-generica", detalle: "Salió la pregunta genérica: el texto del modelo se vació" });
    if (URL.test(texto) && !/drive\.google\.com|youtu/.test(texto)) out.push({ turno: n, regla: "url-en-texto", detalle: "URL escrita en el texto (los enlaces van en la ficha)" });
    if (!texto.trim() && t.tarjetas.length === 0) out.push({ turno: n, regla: "silencio", detalle: "No salió nada" });

    // Estado para el siguiente turno.
    if (t.agente) agenteAnterior = t.agente;
    const idTarjeta = t.tarjetas[0]?.productId;
    if (typeof t.productoDelMensajeId === "number") focoAnterior = t.productoDelMensajeId;
    else if (typeof idTarjeta === "number") focoAnterior = idTarjeta;
    else if (nombrados.length === 1) focoAnterior = nombrados[0].id;
  });
  return out;
}
