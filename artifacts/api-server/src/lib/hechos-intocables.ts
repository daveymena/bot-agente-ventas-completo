/**
 * ============================================================
 * LA IA REDACTA. EL SERVIDOR MANDA LOS HECHOS.
 * ============================================================
 *
 * El pedido es que la IA juegue un papel de verdad en como se entrega cada
 * parte de la ficha, en vez de que todo salga de una plantilla fija. Tiene
 * razon: una plantilla identica para toda persona es justo lo que hace que el
 * bot se lea como un folleto.
 *
 * Pero este proyecto ya pago el precio de dejar que el modelo escriba datos:
 *
 *   · precios inventados ("$149.000" en un producto de $60.000, 2026-08-26)
 *   · certificaciones y estudios que no existen
 *   · una academia con sede fisica que nadie tiene
 *   · numeros de Nequi que no son los del negocio
 *
 * De ahi salieron las plantillas. Sacarlas sin mas seria repetir el error.
 *
 * La salida no es elegir entre las dos cosas: es partir la responsabilidad.
 * El SERVIDOR decide que hechos van --precio, enlaces, cuentas, caracteristicas
 * reales-- y la IA decide COMO se dicen. Este modulo es la aduana entre las
 * dos: recibe la version de la plantilla y la version redactada por la IA, y
 * solo deja pasar la segunda si no invento ni cambio un solo hecho.
 *
 * Ante cualquier duda gana la plantilla. Un mensaje algo mas rigido no cuesta
 * nada; un precio inventado cuesta la venta y la confianza.
 */

/** Un hecho que la IA no puede inventar, cambiar ni borrar. */
export type TipoDeHecho = "monto" | "enlace" | "cuenta" | "porcentaje";

export interface Discrepancia {
  tipo: TipoDeHecho;
  /** El valor problematico. */
  valor: string;
  /** `inventado` = no estaba en la plantilla. `perdido` = estaba y desaparecio. */
  falta: "inventado" | "perdido";
}

/* ------------------------------------------------------------------ */
/*  Extractores                                                        */
/* ------------------------------------------------------------------ */

/**
 * Montos de dinero, normalizados.
 *
 * "$60.000 COP", "60000", "$ 60,000" son el mismo hecho escrito de tres
 * formas: comparar los textos crudos marcaria diferencias que no lo son.
 * Se comparan los digitos.
 */
export function montosDe(texto: string): Set<string> {
  const out = new Set<string>();
  const re = /(?:\$|\bCOP\b|\bUSD\b)?\s?(\d{1,3}(?:[.,]\d{3})+|\d{4,})(?:\s?(?:COP|USD))?/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(String(texto || "")))) {
    const digitos = m[1].replace(/[.,]/g, "");
    // Menos de 4 digitos no es un precio en COP; y los años se cuelan solos.
    if (digitos.length >= 4 && !/^(19|20)\d\d$/.test(digitos)) out.add(digitos);
  }
  return out;
}

/** Enlaces, sin la barra final ni el protocolo, que no cambian el destino. */
export function enlacesDe(texto: string): Set<string> {
  const out = new Set<string>();
  for (const m of String(texto || "").matchAll(/https?:\/\/[^\s<>"')]+/gi)) {
    out.add(m[0].replace(/^https?:\/\//i, "").replace(/[.,;:]+$/, "").replace(/\/$/, "").toLowerCase());
  }
  return out;
}

/**
 * Numeros de cuenta / celular colombianos: 10 digitos que empiezan por 3.
 *
 * Se excluyen los que ya se contaron como monto: "$60.000" no es una cuenta.
 */
export function cuentasDe(texto: string): Set<string> {
  const out = new Set<string>();
  for (const m of String(texto || "").matchAll(/\b(3\d{9})\b/g)) out.add(m[1]);
  return out;
}

/** Porcentajes: "90% de descuento" es una afirmacion, no una redaccion. */
export function porcentajesDe(texto: string): Set<string> {
  const out = new Set<string>();
  for (const m of String(texto || "").matchAll(/\b(\d{1,3})\s?%/g)) out.add(m[1]);
  return out;
}

/* ------------------------------------------------------------------ */
/*  La aduana                                                          */
/* ------------------------------------------------------------------ */

const EXTRACTORES: Array<{ tipo: TipoDeHecho; de: (t: string) => Set<string> }> = [
  { tipo: "monto", de: montosDe },
  { tipo: "enlace", de: enlacesDe },
  { tipo: "cuenta", de: cuentasDe },
  { tipo: "porcentaje", de: porcentajesDe },
];

/**
 * En qué se aparta la version de la IA de los hechos de la plantilla.
 *
 * Un hecho `inventado` es el caso grave: la IA agrego un precio, un enlace o
 * una cuenta que el servidor no puso. Un hecho `perdido` es mas leve pero
 * tambien invalida: si la plantilla llevaba el enlace de pago y la redaccion
 * lo dejo fuera, el cliente no puede pagar.
 */
export function discrepancias(plantilla: string, propuesta: string): Discrepancia[] {
  const out: Discrepancia[] = [];
  for (const { tipo, de } of EXTRACTORES) {
    const dePlantilla = de(plantilla);
    const dePropuesta = de(propuesta);
    for (const v of dePropuesta) if (!dePlantilla.has(v)) out.push({ tipo, valor: v, falta: "inventado" });
    for (const v of dePlantilla) if (!dePropuesta.has(v)) out.push({ tipo, valor: v, falta: "perdido" });
  }
  return out;
}

/** ¿La redaccion de la IA respeta exactamente los hechos del servidor? */
export function respetaLosHechos(plantilla: string, propuesta: string): boolean {
  return discrepancias(plantilla, propuesta).length === 0;
}

/**
 * Deja pasar la redaccion de la IA, o devuelve la plantilla.
 *
 * Ademas de los hechos se miran dos cosas de forma:
 *   · que no venga vacia ni ridiculamente corta (el modelo a veces devuelve
 *     un "Ok" cuando no entendio la tarea)
 *   · que no se dispare de largo, porque el defecto que se esta corrigiendo
 *     es justamente el muro de texto
 */
export function entregaFinal(
  plantilla: string,
  propuesta: string | null | undefined,
  registrar?: (motivo: string, detalle?: Discrepancia[]) => void,
): string {
  const p = String(propuesta || "").trim();
  if (!p) return plantilla;

  if (p.length < Math.min(20, plantilla.length / 3)) {
    registrar?.("la redaccion vino demasiado corta");
    return plantilla;
  }
  if (p.length > plantilla.length * 2 + 200) {
    registrar?.("la redaccion se disparo de largo");
    return plantilla;
  }

  const problemas = discrepancias(plantilla, p);
  if (problemas.length) {
    registrar?.("la redaccion cambio hechos del servidor", problemas);
    return plantilla;
  }
  return p;
}
