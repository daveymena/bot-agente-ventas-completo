import type { MensajeHist } from "./estado-cognitivo";

/**
 * ============================================================
 * LO QUE EL CLIENTE TIENE QUE ELEGIR ANTES DE COMPRAR
 * ============================================================
 *
 * Talla, color, sabor, para cuántas personas, qué modelo de auto.
 *
 * El admin lo planteó así el 2026-09-01: *"si un cliente nuevo entra al
 * negocio tenés que tener habilitado todo eso, como lo hace WordPress"*. Tiene
 * razón, y el motivo es más duro que la comodidad: **sin esto el bot cierra el
 * pedido sin saber cuál quiere**. Eso no falla en silencio como otros errores
 * -- llega la prenda equivocada, hay devolución, y el negocio paga el envío
 * dos veces. Es peor que no vender.
 *
 * ── Por qué la lista de valores, y no texto libre ────────────────────────
 *
 * El bot tiene que poder preguntar "¿S, M o L?" y VALIDAR la respuesta contra
 * algo. Con texto libre volvería a adivinar, que es de donde salen los errores
 * caros de este proyecto: un "la mediana" hay que poder resolverlo a "M", y un
 * "la XL" a un valor que quizás el negocio no vende.
 *
 * ── Y por qué no bloquea a los negocios que no las usan ──────────────────
 *
 * `opciones` es null en todo catálogo que no las cargó -- los 84 cursos, por
 * ejemplo. Ahí todo esto devuelve lista vacía y no cambia absolutamente nada.
 * Una función nueva que le agrega un paso a quien no lo pidió es una función
 * que rompe a los clientes que ya estaban vendiendo.
 */

export interface OpcionDeProducto {
  nombre: string;
  valores: string[];
  obligatoria?: boolean;
}

const sinAcentos = (t: string) =>
  String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Las opciones de un producto, tolerando lo que venga de la base. */
export function opcionesDe(producto: any): OpcionDeProducto[] {
  const crudo = producto?.opciones;
  const lista = typeof crudo === "string" ? seguro(crudo) : crudo;
  if (!Array.isArray(lista)) return [];
  return lista
    .filter((o: any) => o && typeof o.nombre === "string" && Array.isArray(o.valores))
    .map((o: any) => ({
      nombre: String(o.nombre).trim(),
      valores: o.valores.map((v: any) => String(v).trim()).filter(Boolean),
      obligatoria: o.obligatoria !== false,
    }))
    .filter((o: OpcionDeProducto) => o.nombre && o.valores.length > 0);
}

function seguro(s: string): any {
  try { return JSON.parse(s); } catch { return null; }
}

/**
 * ¿Cuál de estos valores dijo el cliente?
 *
 * Se compara sin acentos y por palabra entera, no con `includes` suelto: "s"
 * está adentro de "sí", de "gracias" y de casi cualquier frase, así que un
 * `includes` haría que cualquier mensaje eligiera la talla S. La comparación
 * laxa es exactamente el atajo que este proyecto ya pagó caro en el chequeo
 * del teléfono del admin.
 */
export function valorElegido(opcion: OpcionDeProducto, texto: string): string | null {
  const t = ` ${sinAcentos(texto).replace(/[^a-z0-9ñ ]/g, " ").replace(/\s+/g, " ")} `;
  // Se prueba primero el valor más largo: si el negocio vende "XL" y "L", un
  // "quiero la XL" no puede resolverse a "L".
  const porLargo = [...opcion.valores].sort((a, b) => b.length - a.length);
  const encontrados: string[] = [];
  for (const v of porLargo) {
    const limpio = sinAcentos(v).replace(/[^a-z0-9ñ ]/g, " ").trim();
    if (!limpio) continue;
    if (t.includes(` ${limpio} `) || concuerda(t, limpio)) encontrados.push(v);
  }

  // ── Si nombró DOS, no se adivina ────────────────────────────────────────
  //
  // "la blanca no, la negra" menciona las dos, y entender la negación es
  // justo el tipo de interpretación en la que un sistema se equivoca en
  // silencio. Elegir mal acá no es un detalle de conversación: es despachar
  // el color equivocado y pagar una devolución.
  //
  // Devolver null deja la opción como pendiente, así que el bot vuelve a
  // preguntar con las dos a la vista. Preguntar de más cuesta un mensaje;
  // acertar de menos cuesta un envío.
  if (encontrados.length !== 1) return null;
  return encontrados[0];
}

/**
 * Lo mismo dicho en femenino o en plural.
 *
 * En castellano el cliente NO repite la etiqueta del catálogo: el negocio
 * carga "Negro" y la persona escribe "la negra", porque está hablando de una
 * camisa. Igual con "rojo/roja", "pequeño/pequeña", "grande/grandes". Sin
 * esto, una tienda de ropa --que es donde más se usan las opciones-- no
 * reconocería casi ninguna respuesta y volvería a preguntar el color en cada
 * turno.
 *
 * Solo aplica a palabras de cuatro letras o más terminadas en vocal. Las
 * tallas ("S", "M", "XL") y los números quedan fuera a propósito: ahí flexionar
 * no significa nada y solo abriría la puerta a confundir una con otra.
 */
function concuerda(textoNormalizado: string, valor: string): boolean {
  if (valor.length < 4 || !/[aoe]$/.test(valor)) return false;
  const raiz = valor.slice(0, -1);
  // Se escapa la raíz: un valor con un carácter especial no puede convertirse
  // en un patrón que matchee cualquier cosa.
  const seguro = raiz.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^| )${seguro}[aoe]s?( |$)`).test(textoNormalizado);
}

/**
 * Lo que todavía falta elegir, mirando toda la conversación.
 *
 * Se recorre el historial y no solo el último mensaje: el cliente pudo decir
 * la talla tres mensajes atrás, y volvérsela a preguntar es exactamente el
 * "no tiene memoria de lo que pasa" que el admin ya reportó.
 */
export function opcionesPendientes(producto: any, historial: MensajeHist[]): OpcionDeProducto[] {
  const opciones = opcionesDe(producto).filter((o) => o.obligatoria);
  if (opciones.length === 0) return [];

  const loQueDijo = (historial || [])
    .filter((m) => m.role === "customer")
    .map((m) => String(m.content || ""))
    .join(" \n ");

  return opciones.filter((o) => valorElegido(o, loQueDijo) === null);
}

/** Lo que YA eligió, para poder repetírselo al confirmar el pedido. */
export function opcionesElegidas(
  producto: any,
  historial: MensajeHist[],
): Array<{ nombre: string; valor: string }> {
  const loQueDijo = (historial || [])
    .filter((m) => m.role === "customer")
    .map((m) => String(m.content || ""))
    .join(" \n ");

  const out: Array<{ nombre: string; valor: string }> = [];
  for (const o of opcionesDe(producto)) {
    const v = valorElegido(o, loQueDijo);
    if (v) out.push({ nombre: o.nombre, valor: v });
  }
  return out;
}

/**
 * La pregunta por UNA opción, con sus valores a la vista.
 *
 * Una sola por vez: preguntar talla, color y cantidad en el mismo mensaje es
 * un formulario, y a un formulario por WhatsApp la gente no contesta.
 */
export function preguntaPorLaOpcion(o: OpcionDeProducto): string {
  const n = o.nombre.trim();
  const lista = o.valores.length <= 6
    ? o.valores.join(", ")
    : `${o.valores.slice(0, 6).join(", ")}…`;
  return `¿En qué ${n.toLowerCase()} lo querés? Tengo: ${lista}`;
}

/**
 * ¿Hay stock?
 *
 * `null` significa que el negocio NO lleva control, no que se agotó. Es la
 * distinción que evita que 84 cursos digitales aparezcan como agotados el día
 * que se agrega la columna.
 */
export function hayStock(producto: any): { hay: boolean; porQue: string } {
  const s = producto?.stock;
  if (s === null || s === undefined) return { hay: true, porQue: "este negocio no lleva control de stock" };
  const n = Number(s);
  if (!Number.isFinite(n)) return { hay: true, porQue: "el stock no es un número, no se bloquea la venta por eso" };
  if (n > 0) return { hay: true, porQue: `quedan ${n}` };
  return { hay: false, porQue: "no queda stock" };
}

/**
 * Qué decirle a quien pregunta por algo agotado.
 *
 * Nunca se lo esconde ni se le vende igual: las dos cosas terminan en un
 * reclamo, y la segunda además en una devolución de dinero.
 */
export function textoSinStock(nombreDelProducto: string): string {
  return (
    `De momento ${nombreDelProducto} está agotado 🙏 ` +
    `Si querés te aviso apenas entre, o te muestro algo parecido que sí tengo.`
  );
}
