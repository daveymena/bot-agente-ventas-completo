/**
 * ── Traductor a lenguaje de dueño de negocio ─────────────────────────────
 *
 * Pedido del dueño (14-09-2026): "a la gente háblale en lenguaje natural que
 * entienda, no con términos que no comprendan". El prompt ya se lo pide al
 * modelo, y aun así se le escapan "CPA", "ad set", "copy", "hook". Como con
 * el candado del "resumen interno", esto se corrige sobre el texto terminado,
 * en el servidor, que es donde sí se puede garantizar.
 *
 * Se traduce solo lo que un dueño de tienda de verdad no entiende. Palabras
 * que ya son parte del panel (Leads, Landing Studio) se dejan: cambiarlas
 * confundiría más. Nunca se toca lo que va dentro de enlaces, código o
 * nombres de herramientas (`fb_ad_library`).
 */

interface Regla {
  patron: RegExp;
  /** Reemplazo; puede usar $1 para conservar la forma (plural/mayúscula) del original. */
  por: string;
}

// Orden importa: las expresiones largas van antes que las cortas que contienen.
const REGLAS: Regla[] = [
  { patron: /\bA\/B\s*test(?:ing|s)?\b/gi, por: "prueba de dos versiones" },
  { patron: /\bad\s?sets?\b/gi, por: "grupo de anuncios" },
  { patron: /\bconjuntos? de anuncios\b/gi, por: "grupo de anuncios" },
  { patron: /\bROAS\b/g, por: "retorno por cada peso invertido" },
  { patron: /\bCPA\b/g, por: "costo por venta" },
  { patron: /\bCPL\b/g, por: "costo por cada persona interesada" },
  { patron: /\bCPM\b/g, por: "costo por cada mil personas que lo ven" },
  { patron: /\bCPC\b/g, por: "costo por clic" },
  { patron: /\bCTR\b/g, por: "porcentaje de gente que hace clic" },
  { patron: /\bretargeting\b/gi, por: "volver a mostrarle el anuncio a quien ya lo vio" },
  { patron: /\bremarketing\b/gi, por: "volver a escribirle a quien ya preguntó" },
  { patron: /\b(?:el|un)\s+hook\b/gi, por: "la frase que engancha" },
  { patron: /\b(?:del|al)\s+hook\b/gi, por: "de la frase que engancha" },
  { patron: /\bhooks?\b/gi, por: "frase que engancha" },
  { patron: /\b(el|un|del|al)\s+copy\s+(?:del|de)\s+(?:anuncio|la campaña)\b/gi, por: "$1 texto del anuncio" },
  { patron: /\bcopy\s+(?:del|de)\s+(?:anuncio|la campaña)\b/gi, por: "texto del anuncio" },
  { patron: /\b(el|un|del|al)\s+copy\b/gi, por: "$1 texto del anuncio" },
  { patron: /\bcreativos?\s+(?:del|de)\s+anuncio\b/gi, por: "imagen o video del anuncio" },
  { patron: /\bp[ií]xel\s+de\s+(?:meta|facebook)\b/gi, por: "medidor de ventas de Facebook" },
  { patron: /\bawareness\b/gi, por: "que te conozcan" },
  { patron: /\bengagement\b/gi, por: "interacción de la gente" },
  { patron: /\bfunnel\b/gi, por: "camino del cliente hasta comprar" },
  { patron: /\bsegmentaci[oó]n\b/gi, por: "a quién se le muestra el anuncio" },
  { patron: /\btargeting\b/gi, por: "a quién se le muestra el anuncio" },
  { patron: /\bconversion(?:es)?\s+rate\b/gi, por: "porcentaje de gente que compra" },
  { patron: /\btasa de conversi[oó]n\b/gi, por: "porcentaje de gente que compra" },
  { patron: /\bAds\s+Manager\b/g, por: "Administrador de anuncios de Facebook" },
  { patron: /\bbrief\b/gi, por: "resumen del pedido" },
];

/**
 * Trozos que NO se tocan: enlaces, código entre acentos graves, y nombres de
 * herramientas con guion bajo.
 */
const INTOCABLE = /(https?:\/\/\S+|`[^`]*`|\b[a-z]+(?:_[a-z0-9]+)+\b)/g;

export function enLenguajeDeDueno(texto: string): string {
  const t = String(texto || "");
  if (!t) return t;
  const partes = t.split(INTOCABLE);
  return partes
    .map((p, i) => {
      // split() con grupo de captura intercala los trozos capturados en las
      // posiciones impares: esos se dejan como están.
      if (i % 2 === 1) return p;
      let out = p;
      for (const r of REGLAS) out = out.replace(r.patron, r.por);
      return out;
    })
    .join("");
}

/** Para pruebas y para saber si una respuesta sigue teniendo tecnicismos. */
export function tieneTecnicismos(texto: string): boolean {
  const limpio = String(texto || "").replace(INTOCABLE, "");
  return REGLAS.some((r) => new RegExp(r.patron.source, r.patron.flags.replace("g", "")).test(limpio));
}
