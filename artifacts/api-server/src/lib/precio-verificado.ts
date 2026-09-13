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

/**
 * El hueco de una plantilla que el modelo no supo llenar.
 *
 * ── Por qué hace falta, además de MONTO ───────────────────────────────────
 *
 * Producción, 2026-09-05 11:58, a un cliente real:
 *
 *   "💰 El valor es de $X.XXX COP (pago único)"
 *
 * `MONTO` exige un dígito justo detrás del `$`, y acá hay una equis. Así que el
 * candado de precios --que verifica que el número coincida con el catálogo-- no
 * vio NADA que verificar y dejó pasar la frase entera.
 *
 * Esa es la falla de fondo: el guardia buscaba números EQUIVOCADOS y un
 * marcador no es un número equivocado, es la ausencia de número. El modelo
 * escribe el hueco cuando no tiene el dato, y el hueco viaja hasta el cliente.
 *
 * Se trata igual que un precio inventado --se cae la oración-- porque para el
 * cliente es peor: un precio falso al menos parece un precio; "$X.XXX" dice
 * "esto lo escribió una máquina rota".
 *
 * ⚠️ El detector YA existía en `app-operator.ts` (para los anuncios de Atlas) y
 * no del lado del vendedor. Mismo patrón que el diccionario de emojis y el
 * nombre de pila: arreglado en una copia, intacto en la gemela. Va acá, dentro
 * de la función que ya llaman `agent.ts` y `supervisor.ts`, para que las dos lo
 * hereden sin cablear nada nuevo.
 */
const MARCADOR =
  /\$\s?[Xx]+(?:[.,\s][Xx]+)*|\$\s?_{2,}|\[[^\]\n]{2,40}\]|\{\{[^}\n]{2,40}\}\}|<[A-ZÁÉÍÓÚÑ\s_]{3,30}>|\bXXX+\b/;

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

/**
 * Los precios de cada uno y todas las sumas posibles de 2 a 4 de ellos.
 * Es lo único que puede contestar con verdad "¿cuánto me salen juntos?".
 */
export function sumasDe(productos: ProductoParaPrecio[]): Set<number> {
  const precios = productos
    .map((p) => Math.round(Number(p?.price)))
    .filter((n) => Number.isFinite(n) && n > 0)
    .slice(0, 6);
  const out = new Set<number>(precios);
  const total = 1 << precios.length;
  for (let mask = 1; mask < total; mask++) {
    let suma = 0; let k = 0;
    for (let i = 0; i < precios.length; i++) if (mask & (1 << i)) { suma += precios[i]; k++; }
    if (k >= 2 && k <= 4) out.add(suma);
  }
  return out;
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
  textoEntrante: string,
  productos: ProductoParaPrecio[],
  enContexto: number[] = [],
  /**
   * Productos que el cliente pidió JUNTOS ("piano, contabilidad e idiomas,
   * ¿cuánto sería en total?"). La suma de sus precios es un monto real
   * aunque no sea el precio de ningún producto: sin esto, el "$180.000" que
   * escribió el modelo se borraba como inventado y al cliente le llegaba
   * "te hago la cuenta clara:" seguido de nada (chat real, 12-09-2026).
   */
  pedidosJuntos: ProductoParaPrecio[] = [],
): RevisionDePrecios {
  if (!textoEntrante) return { texto: textoEntrante, inventados: [] };
  let texto = textoEntrante;

  const delContexto = enContexto.length
    ? preciosReales(productos.filter((p) => enContexto.includes(p.id)))
    : null;
  const permitidos = delContexto && delContexto.size > 0 ? delContexto : preciosReales(productos);
  for (const n of sumasDe(pedidosJuntos)) permitidos.add(n);
  if (permitidos.size === 0) return { texto, inventados: [] };

  const inventados: string[] = [];
  // Se parte en oraciones conservando el separador, para poder sacar una
  // entera sin pegar las de al lado.
  //
  // El corte exige que despues del punto venga un espacio o el final. Cortar
  // en cualquier punto parte "$45.000" por la mitad y deja "$45." como si
  // fuera una oracion: el monto se vuelve ilegible y el filtro no lo reconoce.
  // ── Un precio partido por un espacio se repara ANTES de juzgarlo ────────
  //
  // Visto en produccion el 2026-09-02, dos veces, en mensajes que le llegaron
  // a un cliente:
  //
  //   "El curso tiene un valor de $60. 000 COP"
  //
  // Lo escribe asi el modelo (se comprobo que no lo rompe ninguno de los pasos
  // de limpieza). Y es peligroso por partida doble:
  //
  //   · El cliente lee "$60." y despues "000". Un precio partido se lee mal, y
  //     este proyecto ya pago caro un numero mal leido -- "60.000,00" que se
  //     entendia como seis millones.
  //   · El candado de abajo corta el monto en "$60." y lo evalua como SESENTA
  //     PESOS. Sesenta no es el precio de nada, asi que la frase entera se
  //     daba por inventada y se borraba: el cliente se quedaba sin el precio.
  //
  // Se junta el numero antes de medirlo. Asi vale lo que vale, se verifica
  // bien, y sale escrito como se debe.
  texto = texto
    .replace(/(\d)[ \t]+([.,]\d)/g, "$1$2")
    .replace(/([.,])[ \t]+(\d{3}\b)/g, "$1$2");

  const trozos = texto.split(/(?<=[.!?])(?=\s)|(?<=\n)/);
  const quedan: string[] = [];

  for (const trozo of trozos) {
    // El hueco de plantilla se juzga ANTES que el monto: no hay número que
    // comparar, así que el candado de abajo lo dejaría pasar entero.
    const hueco = trozo.match(MARCADOR);
    if (hueco) {
      inventados.push(hueco[0]);
      continue; // la oracion entera no sale
    }

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

/**
 * Qué contestarle a quien pide rebaja.
 *
 * El admin lo planteó así, y es doctrina de venta correcta: "el precio no
 * tiene rebaja, no es negociable. Solo debe mostrar POR QUÉ debería comprarlo
 * y por qué es una gran oportunidad. Si rebajas, le pierde el valor al precio
 * y a todo".
 *
 * Tiene razón en lo comercial, no solo en lo económico:
 *
 *   · Un precio que baja al primer pedido enseña que el de la lista era falso,
 *     y a partir de ahí TODO el catálogo se lee como inflado.
 *   · Quien consiguió rebaja lo cuenta. El siguiente entra pidiendo la misma.
 *   · Y el que pagó completo la semana pasada se entera.
 *
 * ── Lo que hacía antes ───────────────────────────────────────────────────
 *
 * "El precio es $60.000 y es fijo 🙏 No manejo descuentos, pero es pago único
 * y el acceso te queda de por vida."
 *
 * Niega dos veces --"es fijo", "no manejo descuentos"-- y no da UNA razón para
 * comprarlo. Al cliente que pide rebaja no lo convence un "no": lo convence
 * ver que lo vale.
 *
 * ── Lo que hace ahora ────────────────────────────────────────────────────
 *
 * Dice el precio una vez, sin disculparse, y lo sostiene con lo que el
 * producto REALMENTE tiene. Nada de comparar con la competencia: el sistema no
 * sabe qué cobran otros, y el detector de invenciones ya rechaza esas frases
 * (ver `PRECIO_AJENO` en sales-playbook.ts).
 */
export function defenderElPrecio(p: {
  name?: string | null;
  price?: number | string | null;
  currency?: string | null;
  features?: string[] | null;
}): string {
  const monto = Number(p?.price);
  const precioTexto =
    Number.isFinite(monto) && monto > 0
      ? `$${Math.round(monto).toLocaleString("es-CO")}${p?.currency ? ` ${String(p.currency).toUpperCase()}` : ""}`
      : "el del catálogo";

  // Lo que de verdad se lleva. Solo del producto: si no hay características
  // cargadas, no se inventa ninguna -- se sostiene el precio sin adornarlo.
  const rasgos = (Array.isArray(p?.features) ? p!.features! : [])
    .map((f) => String(f || "").trim())
    .filter(Boolean)
    .slice(0, 3);

  // Sin caracteristicas cargadas NO se repite "el mismo para todos", que ya se
  // dice en la primera frase. Visto en produccion (2026-08-30): "El precio es
  // el del catalogo, el mismo para todos. Ese precio es el mismo para todos
  // los que ya lo compraron." -- dos veces lo mismo en dos renglones.
  const razon = rasgos.length
    ? `Por ${precioTexto} te llevás ${rasgos.join(", ")}.`
    : "";

  return (
    // Se dice el precio UNA vez y sin pedir perdón. "Es el mismo para todos"
    // explica el porqué sin sonar a negativa: no es que no quiera, es que el
    // precio es serio.
    `El precio es ${precioTexto}, el mismo para todos 🙏 ` +
    (razon ? `${razon} ` : "") +
    `Prefiero sostenerlo y que valga lo que cuesta, antes que rebajarlo y que no valga nada.`
  );
}
