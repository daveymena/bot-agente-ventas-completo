/**
 * QUÉ ÁNGULO TOMA CADA ANUNCIO.
 *
 * 08-10-2026, dueño: "arma siempre el mismo anuncio, el mismo copy, como si
 * tuviera eso prediseñado". Tenía razón: `crear_anuncio` pedía el texto con un
 * solo esqueleto (gancho de dolor → beneficio → puntos → precio → acción), sin
 * ángulo y sin saber qué anuncios ya existían del producto. Un A/B salía con
 * dos anuncios casi iguales: no había nada que comparar.
 *
 * Acá se elige un ángulo DISTINTO a los de los borradores anteriores del mismo
 * producto, y se le pasa al modelo junto con los ganchos/titulares ya usados.
 */

export interface Angulo {
  id: string;
  nombre: string;
  instruccion: string;
}

export const ANGULOS: Angulo[] = [
  {
    id: "dolor",
    nombre: "el problema que vive el cliente",
    instruccion: "Abrí con el problema concreto que la persona siente hoy (cuándo le pasa, cómo se nota) y mostrá el producto como la salida.",
  },
  {
    id: "resultado",
    nombre: "el resultado que quiere",
    instruccion: "Abrí con la imagen del después: cómo se ve o se siente la persona cuando ya lo usa. Nada de dolor ni de miedo; todo en positivo.",
  },
  {
    id: "como-funciona",
    nombre: "cómo funciona",
    instruccion: "Abrí con la característica más llamativa de la ficha y explicá en 2-3 pasos simples cómo se usa y por qué sirve. Tono de demostración.",
  },
  {
    id: "confianza",
    nombre: "comprar sin riesgo",
    instruccion: "Abrí con la objeción de comprar por internet y resolvela con lo que el negocio SÍ ofrece de verdad (pago al recibir, envío, atención por WhatsApp). Solo condiciones que estén en el brief.",
  },
  {
    id: "escena",
    nombre: "un momento del día",
    instruccion: "Abrí con una escena cotidiana y reconocible donde el producto aparece (en la oficina, manejando, en casa). Contalo corto, como una historia de dos líneas.",
  },
];

/**
 * El primer ángulo que no se usó en los borradores anteriores (del más viejo
 * al más nuevo, para no volver siempre al primero). Si ya se usaron todos,
 * el menos reciente.
 */
export function elegirAngulo(usados: Array<string | null | undefined>): Angulo {
  const vistos = usados.map((u) => String(u || "")).filter(Boolean);
  const libre = ANGULOS.find((a) => !vistos.includes(a.id));
  if (libre) return libre;
  // Todos usados: el que se usó hace más tiempo (usados viene del más nuevo al más viejo).
  for (let i = vistos.length - 1; i >= 0; i--) {
    const a = ANGULOS.find((x) => x.id === vistos[i]);
    if (a) return a;
  }
  return ANGULOS[0]!;
}

/** El bloque del prompt: el ángulo obligatorio y lo que no se puede repetir. */
export function bloqueDeAngulo(angulo: Angulo, anteriores: Array<{ headline?: string | null; gancho?: string | null }>): string {
  const repetidos = anteriores
    .flatMap((a) => [a.gancho, a.headline])
    .map((s) => String(s || "").trim())
    .filter(Boolean)
    .slice(0, 8);
  return (
    `🎯 ÁNGULO DE ESTE ANUNCIO (obligatorio): ${angulo.nombre}. ${angulo.instruccion}\n` +
    `La forma (bloques, puntos, precio, acción) se adapta a este ángulo: no copies el esqueleto de otro anuncio.` +
    (repetidos.length
      ? `\nYa hay anuncios de este producto con estos ganchos y titulares. NO los repitas ni los parafrasees:\n${repetidos.map((r) => `- ${r}`).join("\n")}`
      : "")
  );
}

/** La primera línea con texto: el gancho. */
export function ganchoDe(primaryText: string | null | undefined): string {
  return String(primaryText || "").split("\n").map((l) => l.trim()).find(Boolean) || "";
}
