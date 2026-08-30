/**
 * ============================================================
 * CANDADO DE PRECIOS — ningun monto sale sin existir en el catalogo
 * ============================================================
 *
 * El prompt ya le dice a la IA "NUNCA escribas precios, van en la tarjeta".
 * Es una instruccion BLANDA, y el modelo la ignora. Medido en la prueba en
 * vivo del 2026-08-25 sobre el bot +57 304 2748687, en UNA conversacion:
 *
 *   - el curso de Excel se cotizo a $60.000, despues a $45.000 y despues a
 *     $20.000;
 *   - se ofrecio un "combo de los 3" a $100.000 y un minuto despues a
 *     $85.000 -- un combo que NO EXISTE como producto, asi que no tiene link
 *     de pago ni forma de entregarse;
 *   - se prometio un ahorro de $25.000 y luego de $15.000.
 *
 * El cliente lo noto y lo dijo: "pero hace un rato me dijiste que Excel valia
 * 20.000, no 45.000. cual es el precio real?".
 *
 * Habia un `response-validator.ts` con un verificador de precios, pero solo
 * miraba que el monto fuera "razonable" (entre 1.000 y 100.000.000): los tres
 * precios inventados de arriba pasan ese filtro sin problema. Y no lo importaba
 * nadie -- 301 lineas de codigo muerto. Se borro el 2026-08-29 junto con otras
 * cinco que tampoco corrian (ver CODIGO_MUERTO.md).
 *
 * Acá el criterio es el unico que no se puede alucinar: **un monto solo puede
 * salir si es el precio de un producto real**. El catalogo es la fuente de
 * verdad; el modelo redacta, pero no cotiza.
 */

/** Un producto, reducido a lo que hace falta para verificar un monto. */
export interface ProductoParaPrecio {
  id: number;
  name: string;
  price: number | string | null;
}

export interface RevisionDePrecios {
  /** El texto con los montos inventados sacados. */
  texto: string;
  /** Los montos que no existen en el catalogo, tal como venian escritos. */
  inventados: string[];
}

/**
 * Los montos escritos en un texto, en formato colombiano y variantes.
 * Cubre "$20.000", "$20,000", "20.000 COP", "$ 20.000", "$85.000 COP".
 */
const MONTO = /\$\s?\d[\d.,]*|\b\d{1,3}(?:[.,]\d{3})+\s?(?:COP|pesos)\b/gi;

/** "$20.000" | "20,000 COP" -> 20000. Devuelve NaN si no se puede leer. */
export function montoANumero(txt: string): number {
  const limpio = String(txt).replace(/\$|\s|COP|pesos/gi, "").trim();
  if (!limpio) return NaN;
  // En Colombia el punto y la coma son separador de miles: "20.000" y "20,000"
  // son el mismo numero. Solo se trata como decimal si quedan 1-2 digitos al
  // final tras el ultimo separador Y hay un solo separador.
  const seps = limpio.match(/[.,]/g) || [];
  const ultimo = Math.max(limpio.lastIndexOf("."), limpio.lastIndexOf(","));
  const cola = ultimo >= 0 ? limpio.length - ultimo - 1 : 0;
  if (seps.length === 1 && (cola === 1 || cola === 2)) {
    return Number(limpio.slice(0, ultimo) + "." + limpio.slice(ultimo + 1));
  }
  // ── Miles Y centavos juntos: "$60.000,00" ────────────────────────────────
  //
  // Con dos o más separadores, el último manda si deja 1-2 dígitos: ahí es el
  // decimal y los otros son de miles. Antes se borraban TODOS, así que
  // "60.000,00" daba 6.000.000 -- cien veces el precio real.
  //
  // Y eso no quedaba en un número mal leído: el monto no coincidía con el del
  // catálogo, el verificador lo daba por INVENTADO y borraba la frase entera.
  // Medido contra producción el 2026-08-30, con el curso de $60.000, al
  // cliente le llegó:
  //
  //   "💰 — pago único."          ← sin el número
  //   "💰 El pago es único, ."    ← coma suelta
  //
  // Un mensaje mutilado justo cuando está por decidir parece un error del
  // sistema, y eso frena una compra más que no decir el precio.
  if (seps.length >= 2 && (cola === 1 || cola === 2)) {
    const enteros = limpio.slice(0, ultimo).replace(/[.,]/g, "");
    return Number(`${enteros}.${limpio.slice(ultimo + 1)}`);
  }
  return Number(limpio.replace(/[.,]/g, ""));
}

/** Los precios reales, como numeros. */
function preciosReales(productos: ProductoParaPrecio[]): Set<number> {
  const s = new Set<number>();
  for (const p of productos) {
    const n = Number(p?.price);
    if (Number.isFinite(n) && n > 0) s.add(Math.round(n));
  }
  return s;
}

/**
 * Saca del texto todo monto que no corresponda a un producto real.
 *
 * `enContexto` son los ids del producto del que se esta hablando. Si viene con
 * algo, el monto ademas tiene que ser el precio de ESE producto: es lo que
 * distingue "el de Excel vale $20.000" (cierto) de "el de Excel vale $45.000"
 * (que es el precio de otro producto, y por eso pasaba desapercibido).
 *
 * Se saca la ORACION que contiene el monto, no el monto suelto: dejar "el
 * curso vale ." es peor que no decir el precio. Si al sacarlas no queda nada,
 * se devuelve un texto neutro que remite a la ficha, que es donde el precio
 * siempre es el real.
 */
export function verificarPrecios(
  texto: string,
  productos: ProductoParaPrecio[],
  enContexto: number[] = [],
): RevisionDePrecios {
  if (!texto) return { texto, inventados: [] };

  const delContexto = enContexto.length
    ? preciosReales(productos.filter((p) => enContexto.includes(p.id)))
    : null;
  const permitidos = delContexto && delContexto.size > 0 ? delContexto : preciosReales(productos);
  if (permitidos.size === 0) return { texto, inventados: [] };

  const inventados: string[] = [];
  // Se parte en oraciones conservando el separador, para poder sacar una
  // entera sin pegar las de al lado.
  //
  // El corte exige que despues del punto venga un espacio o el final. Cortar
  // en cualquier punto parte "$45.000" por la mitad y deja "$45." como si
  // fuera una oracion: el monto se vuelve ilegible y el filtro no lo reconoce.
  const trozos = texto.split(/(?<=[.!?])(?=\s)|(?<=\n)/);
  const quedan: string[] = [];

  for (const trozo of trozos) {
    const montos = trozo.match(MONTO) || [];
    const malos = montos.filter((m) => {
      const n = montoANumero(m);
      return Number.isFinite(n) && n > 0 && !permitidos.has(Math.round(n));
    });
    if (malos.length > 0) {
      inventados.push(...malos);
      continue; // la oracion entera no sale
    }
    quedan.push(trozo);
  }

  let limpio = quedan.join("").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  if (inventados.length > 0 && !limpio) {
    limpio = "Te paso la ficha aquí abajo con el precio exacto 👇";
  }
  return { texto: limpio, inventados };
}
