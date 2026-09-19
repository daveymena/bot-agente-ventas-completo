/**
 * ============================================================
 * DESGLOSAR: explicar mejor un punto cuando la ficha ya se envió
 * ============================================================
 *
 * Pedido del dueño (19-09-2026): "si ya el cliente preguntó todo lo que
 * sabemos y luego vuelve a preguntar por saber más de algo específico, la IA
 * le sepa desglosar la información explicado como un humano".
 *
 * Medido ese día con el pipeline entero (curso de mecánica de bicicletas,
 * ficha de 343 caracteres + 6 viñetas), turno "explícame mejor cómo funciona
 * en la práctica":
 *
 *   modelo: "📂 Accedes al portal con tu usuario y recibes el enlace al
 *            primer módulo. 🎥 Cada módulo tiene videos cortos… 📄 Descargas
 *            la guía PDF…"
 *   y a "cuéntame más de la garantía":
 *   modelo: "✅ Garantía de 7 días, te devolvemos el 100 %…"
 *
 * Ni portal, ni PDF, ni garantía de 7 días existen: nada de eso está en la
 * ficha ni en las condiciones del negocio. El modelo sí "desglosa", pero
 * rellena con lo que le suena a un curso online cualquiera. Y el prompt lo
 * empujaba a eso: "explicale con tus palabras el punto concreto" sin decirle
 * de dónde puede sacar y de dónde no.
 *
 * La diferencia que este módulo fija:
 *
 *   EXPLICAR  = tomar lo que la ficha SÍ dice ("Frenos: ajuste y cambio") y
 *               contar qué significa en la práctica, para qué le sirve y un
 *               ejemplo cotidiano. Eso es conocimiento general del tipo de
 *               producto; un vendedor humano lo hace todo el día.
 *   INVENTAR  = afirmar un hecho del producto o del negocio que nadie cargó
 *               (formato, plataforma, PDFs, duración, garantía, plazos).
 *
 * El bloque le da al modelo, para el punto que preguntó, exactamente lo que
 * hay y lo que falta; y el guardián de abajo saca del texto las garantías
 * que nadie definió, siguiendo el patrón de `solo-lo-que-dice-la-ficha.ts`:
 * el servidor desmiente lo que no puede probar.
 */
import type { Entendimiento, Pedido, Subintencion } from "./entender-al-cliente";

export interface ProductoParaDesglose {
  id?: number;
  name?: string | null;
  description?: string | null;
  features?: string[] | null;
  kind?: string | null;
}

export interface NegocioParaDesglose {
  entrega?: { metodo?: string; plazo?: string; detalle?: string } | null;
  garantia?: { descripcion?: string } | null;
  acceso?: { descripcion?: string } | string | null;
}

/** El punto que el cliente quiere que se le explique mejor. */
export type PuntoDeDesglose = "contenido" | "entrega" | "acceso" | "garantia" | "duracion" | "soporte" | "general";

const PUNTO_POR_SUBINTENCION: Partial<Record<NonNullable<Subintencion>, PuntoDeDesglose>> = {
  content_question: "contenido",
  delivery_question: "entrega",
  access_question: "acceso",
  guarantee_question: "garantia",
  duration_question: "duracion",
  support_question: "soporte",
  general_question: "general",
};

const PUNTO_POR_PEDIDO: Partial<Record<Pedido, PuntoDeDesglose>> = {
  contenido: "contenido",
  entrega: "entrega",
  acceso: "acceso",
  garantia: "garantia",
  duracion: "duracion",
  soporte: "soporte",
};

/** Frases con las que la gente pide que le expliquen mejor, no un dato suelto. */
const PIDE_EXPLICACION =
  /\b(expl[ií]ca|expl[ií]came|expl[ií]queme|desglos|detalla|detállame|cu[eé]ntame m[aá]s|cuéntame más|dime m[aá]s|m[aá]s (?:detalle|informaci[oó]n|info)|c[oó]mo (?:funciona|es|ser[ií]a|se usa|se maneja)|en qu[eé] consiste|qu[eé] significa|paso a paso|en la pr[aá]ctica|no entend[ií]|no me qued[oó] claro|como si tuviera)\b/i;

export interface EntradaDesglose {
  mensaje: string;
  entendimiento: (Pick<Entendimiento, "sobreElFoco" | "productoId" | "pide" | "subintencion" | "preguntas" | "pideAlgoQueNoHay"> & { dicePago?: boolean }) | null | undefined;
  /** El producto en foco, si su ficha YA se le envió a este cliente. */
  productoConFichaEnviada: ProductoParaDesglose | null | undefined;
  negocio: NegocioParaDesglose | null | undefined;
}

/**
 * ¿Este turno es "explicame mejor X" sobre un producto cuya ficha ya vio?
 * Devuelve el punto, o null si no aplica (entonces no se agrega nada al prompt).
 */
export function puntoQueQuiereEntender(e: EntradaDesglose): PuntoDeDesglose | null {
  const p = e.productoConFichaEnviada;
  if (!p) return null;
  const en = e.entendimiento;
  if (en?.pideAlgoQueNoHay) return null;
  // Sin entendimiento (el modelo que lee al cliente falló o se pasó de
  // tiempo, visto el 19-09 con Groq saturado) deciden los patrones: hay un
  // producto en foco con ficha enviada y el mensaje pide que le expliquen.
  // Es la regla del repo: el modelo lee, las listas respaldan.
  const esSobreElProducto = en
    ? (en.sobreElFoco || (typeof p.id === "number" && en.productoId === p.id))
    : true;
  if (!esSobreElProducto) return null;

  // "¿Qué vale?", "¿cómo pago?", "mándame el link": eso lo resuelven la
  // tarjeta de precio y el flujo de pago, NUNCA este bloque. Medido en el
  // chat real del 19-09 15:14: "Que vale ?" cayó acá como pregunta general y
  // el modelo dijo "te lo confirmo con el equipo" mientras el servidor
  // adjuntaba el precio en el mismo turno.
  const msg = String(e.mensaje || "");
  if (/\b(vale|cuesta|precio|cu[aá]nto|pago|pagar|link|enlace|transferencia|nequi|daviplata|paypal|tarjeta)\b/i.test(msg)) return null;
  const pideDePago = (en?.pide || []).some((x) => ["precio", "pago", "transferencia", "link_pago"].includes(x));
  if (pideDePago || en?.subintencion === "price_question" || en?.subintencion === "payment_method_question" || en?.subintencion === "payment_execution" || en?.dicePago) return null;

  const porSub = en?.subintencion ? PUNTO_POR_SUBINTENCION[en.subintencion] : undefined;
  const porPedido = (en?.pide || []).map((x) => PUNTO_POR_PEDIDO[x]).find(Boolean);
  const pideExplicar = PIDE_EXPLICACION.test(msg);

  // Solo entra lo que pide ENTENDER algo. Una "pregunta general" sin pedido
  // explícito de explicación no alcanza.
  if (!porPedido && (!porSub || porSub === "general") && !pideExplicar) return null;
  return porPedido || (porSub && porSub !== "general" ? porSub : null) || "general";
}

const TITULO: Record<PuntoDeDesglose, string> = {
  contenido: "qué incluye / cómo funciona en la práctica",
  entrega: "cómo se entrega",
  acceso: "cómo y por cuánto tiempo accede",
  garantia: "la garantía o devolución",
  duracion: "cuánto dura / cuánto tiempo le toma",
  soporte: "qué apoyo tiene después de comprar",
  general: "lo que preguntó",
};

/** Lo que el negocio SÍ tiene definido para ese punto, o "" si nadie lo cargó. */
function loQueSeSabe(punto: PuntoDeDesglose, negocio: NegocioParaDesglose | null | undefined): string {
  if (!negocio) return "";
  if (punto === "entrega" && negocio.entrega) {
    return [negocio.entrega.metodo, negocio.entrega.plazo, negocio.entrega.detalle].filter(Boolean).join(" — ");
  }
  if (punto === "garantia" && negocio.garantia?.descripcion) return String(negocio.garantia.descripcion);
  if (punto === "acceso" && negocio.acceso) {
    return typeof negocio.acceso === "string" ? negocio.acceso : String(negocio.acceso.descripcion || "");
  }
  return "";
}

/**
 * El bloque para el prompt. Vacío si el turno no es un desglose.
 *
 * No repite la ficha (ya está más arriba en el prompt): le dice al modelo qué
 * punto explicar, con qué material, y qué NO puede afirmar.
 */
export function bloqueDeDesglose(e: EntradaDesglose): string {
  const punto = puntoQueQuiereEntender(e);
  if (!punto) return "";
  const p = e.productoConFichaEnviada!;
  const features = (p.features || []).map((f) => String(f).trim()).filter(Boolean);
  const dato = loQueSeSabe(punto, e.negocio);
  const esDeNegocio = punto === "entrega" || punto === "garantia" || punto === "acceso";

  const l: string[] = [];
  l.push("");
  l.push(`EL CLIENTE YA TIENE LA FICHA DE "${p.name}" Y AHORA QUIERE ENTENDER MEJOR: ${TITULO[punto]}.`);
  l.push("Desglosalo como lo haría un vendedor que conoce el producto, no como un folleto:");
  if (esDeNegocio) {
    if (dato) {
      l.push(`- El dato real es este y solo este: "${dato}". Explicalo con tus palabras, qué significa para él en la práctica, con un ejemplo. No le agregues plazos, condiciones ni pasos que no estén ahí.`);
    } else {
      l.push(`- Ese dato NADIE lo cargó: no existe una definición de ${TITULO[punto]} para este negocio. NO inventes días, porcentajes, plataformas ni pasos. Decilo con naturalidad ("ese detalle puntual te lo confirmo con el equipo y te escribo") y seguí con lo que sí sabés del producto.`);
    }
  } else {
    l.push(`- Tomá los puntos de la ficha (descripción y características de arriba${features.length ? `: ${features.slice(0, 8).join(" · ")}` : ""}) y explicá QUÉ significa cada uno en la práctica, para qué le sirve y un ejemplo cotidiano. Eso es explicar, y es tuyo.`);
    l.push("- Lo que la ficha NO dice (formato del material, plataforma, PDFs, cantidad de videos, duración, garantía, plazos) NO existe: no lo afirmes. Si justo pregunta por eso, decí que ese dato puntual lo confirmás con el equipo y seguí con lo que sí sabés.");
  }
  l.push("- 3 a 6 líneas cortas, una idea por línea, sin repetir la ficha ni el precio. Cerrá comprobando si quedó claro o qué parte quiere que le amplíes.");
  return l.join("\n") + "\n";
}

// ─── Guardián: garantías que nadie definió ──────────────────────────────────

/**
 * Afirmaciones de que EXISTE una garantía, devolución o reembolso. No hace
 * falta que traiga días o porcentajes: "el proceso de reembolso es sencillo"
 * (medido 19-09) promete un reembolso que nadie definió. Queda fuera lo que
 * dice la verdad ("te confirmo con el equipo", "no manejamos devoluciones").
 */
const GARANTIA_CONCRETA =
  /\b(reembols\w*|devoluci[oó]n(?:es)?|te devolvemos|devolvemos|garantiz\w+|garant[ií]a (?:de|total|completa|por|es|incluye)|con garant[ií]a|tiene garant[ií]a)\b/i;
const DICE_LA_VERDAD = /confirmo|con el equipo|te escribo|no (?:tengo|tenemos|manejamos|hay|ofrecemos)|sin garant/i;

/**
 * ¿El texto afirma una garantía concreta que ni el producto ni el negocio
 * tienen definida?
 */
export function garantiaInventada(
  texto: string,
  producto: ProductoParaDesglose | null | undefined,
  negocio: NegocioParaDesglose | null | undefined,
): boolean {
  const t = String(texto || "");
  const afirma = t.split(/(?<=[.!?])\s+|\r?\n/).some((f) => GARANTIA_CONCRETA.test(f) && !DICE_LA_VERDAD.test(f));
  if (!afirma) return false;
  if (negocio?.garantia?.descripcion) return false;
  if (/garant[ií]a|devoluci[oó]n|reembolso/i.test(String(producto?.description || ""))) return false;
  return true;
}

/**
 * Saca del texto las frases que afirman esa garantía. Se quita frase por
 * frase (y línea por línea), no el mensaje entero: el resto del desglose
 * suele estar bien y es lo que el cliente pidió.
 */
export function sinLaGarantiaInventada(texto: string): string {
  const lineas = String(texto || "").split(/\r?\n/);
  const salida = lineas.map((linea) => {
    const frases = linea.split(/(?<=[.!?])\s+/);
    const quedan = frases.filter((f) => !(GARANTIA_CONCRETA.test(f) && !DICE_LA_VERDAD.test(f)));
    return quedan.join(" ").trim();
  }).filter((l, i, arr) => l || (i > 0 && arr[i - 1]));
  return salida.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

// ─── Guardián: formato/plataforma que nadie definió ─────────────────────────

/**
 * Cosas que solo pueden afirmarse si la ficha o el negocio las dicen: cómo se
 * entrega o consume el producto. Medido 19-09 (turno "explícame paso a
 * paso"): "Accedes al portal con tu usuario… cada módulo tiene videos
 * cortos… descargas la guía PDF". El modelo lo repitió incluso con la
 * prohibición en el prompt; el servidor lo desmiente.
 *
 * Cada entrada: [lo que dice el texto, lo que tendría que aparecer en la
 * ficha para respaldarlo].
 */
const AFIRMACIONES_DE_FORMATO: Array<[RegExp, RegExp]> = [
  [/\bportal\b|\bplataforma\b|\bcampus\b|\baula virtual\b/i, /portal|plataforma|campus|aula/i],
  [/\busuario y contrase[ñn]a\b|\bcontrase[ñn]a\b|\bcredenciales\b|\blogin\b|\binici(?:as|ar) sesi[oó]n\b/i, /usuario|contrase|credencial|login|sesi[oó]n/i],
  [/\bpdfs?\b|\bgu[ií]as? descargables?\b|\bebook\b|\be-book\b/i, /pdf|gu[ií]a|ebook|e-book|descarg/i],
  [/\bvideos?\b|\bvideotutorial\w*|\bclases? grabadas?\b/i, /video|grabad/i],
  [/\bm[oó]dulos?\b|\blecci[oó]n(?:es)?\b|\bunidad(?:es)?\b|\bcap[ií]tulos?\b/i, /m[oó]dulo|lecci[oó]n|unidad|cap[ií]tulo/i],
  [/\ben vivo\b|\bzoom\b|\bmeet\b|\bwebinar\b/i, /en vivo|zoom|meet|webinar/i],
  [/\bcertificad[oa]\b|\bdiploma\b/i, /certificad|diploma/i],
  [/\bcomunidad\b|\bgrupo (?:privado|de whatsapp|de telegram)\b|\bforo\b/i, /comunidad|grupo|foro/i],
  [/\bacceso (?:de por vida|ilimitado|para siempre)\b|\bde por vida\b/i, /de por vida|ilimitad|para siempre|acceso/i],
  [/\bapp\b|\baplicaci[oó]n m[oó]vil\b/i, /\bapp\b|aplicaci[oó]n/i],
];

function textoQueRespalda(producto: ProductoParaDesglose | null | undefined, negocio: NegocioParaDesglose | null | undefined): string {
  const partes = [
    producto?.name, producto?.description, ...(producto?.features || []),
    negocio?.entrega?.metodo, negocio?.entrega?.plazo, negocio?.entrega?.detalle,
    negocio?.garantia?.descripcion,
    typeof negocio?.acceso === "string" ? negocio?.acceso : negocio?.acceso?.descripcion,
  ];
  return partes.filter(Boolean).map(String).join(" ");
}

/** Las frases del texto que afirman un formato que nada respalda. */
export function frasesDeFormatoInventado(
  texto: string,
  producto: ProductoParaDesglose | null | undefined,
  negocio: NegocioParaDesglose | null | undefined,
): string[] {
  const respaldo = textoQueRespalda(producto, negocio);
  if (respaldo.trim().length < 40) return [];
  const malas: string[] = [];
  for (const linea of String(texto || "").split(/\r?\n/)) {
    for (const frase of linea.split(/(?<=[.!?])\s+/)) {
      const f = frase.trim();
      if (!f) continue;
      const sinRespaldo = AFIRMACIONES_DE_FORMATO.some(([dice, respalda]) => dice.test(f) && !respalda.test(respaldo));
      if (sinRespaldo) malas.push(f);
    }
  }
  return malas;
}

/** Línea que quedó solo con emojis, viñetas o puntuación después de recortar. */
const LINEA_VACIA = /^[\s\p{Extended_Pictographic}\p{Emoji_Component}•\-*·:,.!?¡¿]*$/u;

/**
 * Saca esas frases y limpia las líneas que quedaron solo con un emoji
 * (medido 19-09: "💰 ⏎ 🔄" sueltos después de quitar la garantía).
 */
export function sinElFormatoInventado(
  texto: string,
  producto: ProductoParaDesglose | null | undefined,
  negocio: NegocioParaDesglose | null | undefined,
): string {
  const malas = new Set(frasesDeFormatoInventado(texto, producto, negocio));
  const lineas = String(texto || "").split(/\r?\n/).map((linea) =>
    linea.split(/(?<=[.!?])\s+/).filter((f) => !malas.has(f.trim())).join(" ").trim(),
  );
  return limpiarLineasVacias(lineas.join("\n"));
}

export function limpiarLineasVacias(texto: string): string {
  const lineas = String(texto || "").split(/\r?\n/).map((l) => (LINEA_VACIA.test(l) ? "" : l.trimEnd()));
  return lineas.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
