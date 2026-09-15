/**
 * ── Presentación de los mensajes: que den ganas de leerlos ───────────────
 *
 * Reportado por el dueño (14-09-2026): "las respuestas del agente de WhatsApp
 * salen en texto plano; Atlas también manda mucho texto plano, no usa emoji,
 * espacio, decoraciones; da pereza leer texto antiguo sin separación".
 *
 * La causa principal estaba en el envío: `toEmojiStyle` borraba TODAS las
 * negritas antes de mandar por WhatsApp, aunque WhatsApp las muestra
 * (`*así*`). Y ni el modelo ni nadie garantizaba aire entre párrafos.
 *
 * Como con los emojis medidos y el precio, la decisión no se le deja al
 * modelo: el texto sale del modelo como sea y acá se presenta. Reglas:
 *
 *   · las negritas se conservan (y el markdown de doble asterisco se pasa
 *     al formato de WhatsApp);
 *   · el precio y las cifras de plata van en negrita;
 *   · un bloque largo sin aire se parte en párrafos de dos frases;
 *   · las viñetas (-, •, *) llevan un emoji con sentido según lo que dicen
 *     (🚚 envío, 💳 pago, 🛡️ garantía, 💰 precio…), y una línea que ya
 *     empieza con emoji no se toca;
 *   · nunca se toca la FICHA del producto (la escribe el dueño) ni los
 *     enlaces.
 */

const EMOJI_INICIAL = /^\s*(?:\p{Extended_Pictographic}|[☀-➿])/u;

/** Emoji para una viñeta según de qué habla. El último es el genérico. */
const VINETAS: Array<[RegExp, string]> = [
  [/\b(pag[oa]s?|contra\s*entrega|contraentrega|tarjeta|nequi|daviplata|transferencia|pse)\b/i, "💳"],
  [/\b(env[ií]o|entrega|despach|llega|domicilio)/i, "🚚"],
  [/\b(garant[ií]a|devoluci[oó]n|cambio)/i, "🛡️"],
  [/\b(precio|vale|cuesta|\$\s?\d)/i, "💰"],
  [/\b(incluye|trae|viene con|contenido|m[oó]dulos?|lecciones?|clases?)/i, "📦"],
  [/\b(acceso|inmediato|de por vida|descarga)/i, "🔓"],
  [/\b(tiempo|d[ií]as?|horas?|minutos?|dura)/i, "⏱️"],
  [/\b(soporte|acompa[ñn]amiento|asesor|whatsapp)/i, "💬"],
  [/\b(bono|regalo|gratis|extra)/i, "🎁"],
  [/./, "✅"],
];

function emojiDeVineta(linea: string): string {
  for (const [re, e] of VINETAS) if (re.test(linea)) return e;
  return "✅";
}

/** Cifras de plata: $45.999, $ 45.999 COP, 45.999 COP, 60mil, $60k. */
const PRECIO = /(?<![\w*])(\$\s?\d[\d.,]*(?:\s?(?:COP|USD|MXN|PEN|CLP|ARS|k|mil))?|\d{1,3}(?:[.,]\d{3})+\s?(?:COP|USD|MXN|PEN|CLP|ARS|pesos)\b|\d+\s?mil\b)(?![\w*])/gi;

/** Divide en frases sin romper cifras ("$45.999.") ni abreviaturas comunes. */
function frases(parrafo: string): string[] {
  return parrafo
    .split(/(?<=[.!?…])\s+(?=[A-ZÁÉÍÓÚÑ¿¡"“(])/)
    .map((f) => f.trim())
    .filter(Boolean);
}

/**
 * Un bloque de texto corrido y largo se parte en párrafos de dos frases.
 * Solo si NO tiene ya saltos de línea: si el modelo (o el dueño en la ficha)
 * lo organizó, se respeta.
 */
function conAire(bloque: string): string {
  if (bloque.includes("\n") || bloque.length < 220) return bloque;
  const fs = frases(bloque);
  if (fs.length < 3) return bloque;
  const parrafos: string[] = [];
  for (let i = 0; i < fs.length; i += 2) parrafos.push(fs.slice(i, i + 2).join(" "));
  return parrafos.join("\n\n");
}

/**
 * Quita los asteriscos que quedaron sueltos (uno solo en la línea, o
 * `* texto` de viñeta) sin tocar los pares `*negrita*`.
 */
export function sinAsteriscosSueltos(texto: string): string {
  // Se protegen los pares reales (**x** y *x*, sin espacio pegado al
  // asterisco de adentro) y se quita cualquier otro asterisco.
  const guardados: string[] = [];
  const guardar = (m: string) => {
    guardados.push(m);
    return `\u0000${guardados.length - 1}\u0000`;
  };
  const conMarcas = texto
    .replace(/\*\*(?=\S)([^*\n]+?)(?<=\S)\*\*/g, guardar)
    .replace(/\*(?=\S)([^*\n]+?)(?<=\S)\*/g, guardar)
    .replace(/\*/g, "");
  return conMarcas.replace(/\u0000(\d+)\u0000/g, (_m, i: string) => guardados[Number(i)]);
}

export function presentarParaWhatsApp(texto: string): string {
  if (!texto) return texto;
  let t = String(texto).replace(/\r\n/g, "\n");

  // Markdown → WhatsApp: **x** y __x__ → *x*; títulos → negrita; sin código.
  t = t
    .replace(/\*\*\*([^*\n]+)\*\*\*/g, "*$1*")
    .replace(/\*\*([^*\n]+)\*\*/g, "*$1*")
    .replace(/__([^_\n]+)__/g, "*$1*")
    .replace(/^#{1,6}\s+(.+)$/gm, "*$1*")
    .replace(/```[a-z]*\n?([\s\S]*?)```/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    // Separadores de guiones/igual se ven robóticos.
    .replace(/^[ \t]*[-=_]{3,}[ \t]*$/gm, "");

  // Viñetas con emoji con sentido (una línea que ya trae emoji no se toca).
  t = t.replace(/^[ \t]*(?:[-•▪●‣·]|\*(?!\S))\s+(.+)$/gm, (_m, resto: string) =>
    EMOJI_INICIAL.test(resto) ? resto : `${emojiDeVineta(resto)} ${resto}`,
  );

  t = sinAsteriscosSueltos(t);

  // Precio en negrita (si no lo está ya).
  t = t.replace(PRECIO, (m, _g, off: number, s: string) => {
    const antes = s[off - 1];
    const despues = s[off + m.length];
    return antes === "*" || despues === "*" ? m : `*${m}*`;
  });

  // Aire: línea por línea. Un renglón largo de texto corrido se parte en
  // párrafos de dos frases; entre un párrafo y una lista (o al revés) va una
  // línea en blanco. Las líneas de lista (empiezan con emoji) no se tocan.
  const lineas = t.split("\n");
  const salida: string[] = [];
  let anterior: "texto" | "lista" | "vacia" = "vacia";
  for (const cruda of lineas) {
    const l = cruda.trim();
    if (!l) {
      if (anterior !== "vacia") salida.push("");
      anterior = "vacia";
      continue;
    }
    const tipo: "texto" | "lista" = EMOJI_INICIAL.test(l) ? "lista" : "texto";
    if (anterior !== "vacia" && anterior !== tipo) salida.push("");
    if (tipo === "texto") {
      const parrafos = conAire(l).split("\n\n");
      salida.push(parrafos.join("\n\n"));
    } else {
      salida.push(l);
    }
    anterior = tipo;
  }
  t = salida.join("\n");

  return t.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Para el panel (Atlas): el navegador renderiza Markdown, así que las
 * negritas y los títulos se conservan; solo se quitan los asteriscos sueltos
 * y los separadores robóticos, y las viñetas quedan como lista Markdown.
 */
export function presentarParaPanel(texto: string): string {
  if (!texto) return texto;
  let t = String(texto).replace(/\r\n/g, "\n").replace(/^[ \t]*[-=_]{3,}[ \t]*$/gm, "");
  t = sinAsteriscosSueltos(t);
  return t.replace(/\n{3,}/g, "\n\n").trim();
}
