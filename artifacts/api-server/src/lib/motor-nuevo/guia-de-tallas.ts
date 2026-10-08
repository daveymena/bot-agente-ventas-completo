/**
 * Tallas con datos REALES del producto.
 *
 * El dueño (08-10): "a veces el cliente pregunta cosas que requieren análisis
 * —por talla o cosas así— y el bot se pega". El vendedor tenía
 * consultar_disponibilidad (stock y variantes), pero nada que leyera la TABLA
 * de tallas que casi siempre viene en la ficha de Dropi ("S: 60-75 cm de
 * pecho…"). Sin eso, ante "peso 70 kg, ¿qué talla?" solo le quedaba "lo
 * confirmo" — el atasco.
 *
 * Esto NO inventa medidas: junta lo que dicen la descripción, las
 * características, las preguntas frecuentes y el conocimiento del dueño, y se
 * lo entrega al modelo para que razone con la tabla de verdad.
 */

const TALLA = /\b(talla|tallas|size|xxs|xs|s|m|l|xl|xxl|xxxl|2xl|3xl|4xl|small|medium|large|[ú|u]nica)\b/i;
const MEDIDA = /\d+\s*(cm|cms|centimetros|centímetros|kg|kilos|kgs|lb|libras|mts?|metros|pulgadas)\b|\b(pecho|busto|cintura|cadera|contorno|torso|peso|estatura|altura|espalda|hombros?)\b/i;
const AJUSTABLE = /\b(ajustable|regulable|graduable|el[aá]stic[oa]|velcro|se adapta|talla [úu]nica|one size)\b/i;

export interface MedidasDelCliente {
  pesoKg?: number;
  alturaCm?: number;
  contornoCm?: number;
}

/** Peso, estatura y contorno que el cliente dijo, en cualquier forma común. */
export function medidasDelTexto(texto: string): MedidasDelCliente {
  const t = String(texto || "").toLowerCase().replace(",", ".");
  const out: MedidasDelCliente = {};
  const peso = /(\d{2,3}(?:\.\d)?)\s*(kg|kilos|kgs)\b/.exec(t);
  if (peso) out.pesoKg = Number(peso[1]);
  const metros = /\b(1[.,]\d{1,2})\s*(m|mts|metros)?\b/.exec(t);
  const cm = /(\d{3})\s*(cm|cms|centimetros|centímetros)\b/.exec(t);
  if (cm && Number(cm[1]) >= 120 && Number(cm[1]) <= 220 && /(mido|estatura|altura)/.test(t)) out.alturaCm = Number(cm[1]);
  else if (metros && /(mido|estatura|altura|m\b|metros)/.test(t)) out.alturaCm = Math.round(Number(metros[1].replace(",", ".")) * 100);
  // "pecho 92" y también "92 cm de pecho".
  const contorno = /(pecho|busto|cintura|cadera|contorno|torso)\D{0,12}(\d{2,3})\s*(cm)?/.exec(t);
  const contornoAntes = /(\d{2,3})\s*(cm|cms)?\s*(de\s+)?(pecho|busto|cintura|cadera|contorno|torso)/.exec(t);
  if (contorno) out.contornoCm = Number(contorno[2]);
  else if (contornoAntes) out.contornoCm = Number(contornoAntes[1]);
  return out;
}

/** Líneas de la ficha que hablan de tallas Y traen alguna medida. */
export function lineasDeTallas(fuentes: Array<string | null | undefined>): string[] {
  const lineas: string[] = [];
  for (const f of fuentes) {
    const limpio = String(f || "").replace(/<[^>]+>/g, "\n").replace(/&nbsp;/g, " ");
    for (const l of limpio.split(/\n|(?<=\.)\s+|\s*[•·|]\s*/)) {
      const x = l.trim();
      if (x.length < 3 || x.length > 220) continue;
      if (TALLA.test(x) && MEDIDA.test(x)) lineas.push(x);
    }
  }
  return [...new Set(lineas)].slice(0, 15);
}

export function esAjustable(fuentes: Array<string | null | undefined>): boolean {
  return fuentes.some((f) => AJUSTABLE.test(String(f || "")));
}

/**
 * El mensaje para el modelo: lo que HAY (tabla, tallas, ajustable) y qué
 * hacer con cada caso. Nunca "lo confirmo" a secas.
 */
export function mensajeDeTallas(p: {
  nombre: string;
  opciones: string[];
  lineas: string[];
  ajustable: boolean;
  medidas: MedidasDelCliente;
}): { ok: boolean; mensaje: string } {
  const partes: string[] = [];
  const dijo = [
    p.medidas.pesoKg ? `pesa ${p.medidas.pesoKg} kg` : "",
    p.medidas.alturaCm ? `mide ${p.medidas.alturaCm} cm` : "",
    p.medidas.contornoCm ? `contorno ${p.medidas.contornoCm} cm` : "",
  ].filter(Boolean).join(", ");
  if (p.opciones.length) partes.push(`Tallas/variantes REALES de ${p.nombre}: ${p.opciones.join(", ")}.`);
  if (p.lineas.length) {
    partes.push(`Tabla de la ficha (dato real, úsala tal cual):\n- ${p.lineas.join("\n- ")}`);
    partes.push(dijo
      ? `El cliente ${dijo}: recomiéndale UNA talla razonando con esa tabla y explícale en una frase por qué. Si cae entre dos, sugiere la mayor si quiere comodidad.`
      : "Para recomendarle la talla exacta pídele UNA medida de las que usa la tabla (por ejemplo contorno de pecho o peso), sin pedirle más.");
  } else if (p.ajustable) {
    partes.push(`La ficha dice que es AJUSTABLE: díselo con seguridad${p.opciones.length > 1 ? " y, si igual hay varias tallas, pídele una medida para orientarlo" : " (una sola talla le sirve a la mayoría)"}.`);
  } else {
    partes.push(
      "La ficha NO trae tabla de medidas. No inventes rangos. Dale las tallas reales que hay, pídele su medida (pecho/cintura o peso) " +
      "y usa preguntar_al_dueno con la pregunta exacta del cliente para tener la medida de cada talla. No lo dejes sin respuesta.",
    );
  }
  return { ok: true, mensaje: partes.join("\n\n") };
}
