/**
 * ============================================================
 * MAQUETAS: UNA VEZ, Y DESPUÉS SE RAZONA
 * ============================================================
 *
 * Pedido del dueño (24-09-2026): las respuestas prediseñadas (ficha, precio,
 * pago, entrega) ahorran tokens y se ven profesionales, pero NO se vuelven a
 * mandar. "Si el cliente vuelve a preguntar es porque le quedó alguna duda y
 * toca resolverla con lógica, razonamiento y conocimiento del producto."
 *
 * Por eso, cuando una maqueta ya salió, `mostrar` no la repite: le entrega al
 * modelo los DATOS de esa maqueta (para que no invente) y la instrucción de
 * encontrar la duda y contestarla con sus palabras.
 *
 * Solo se reenvía lo ACCIONABLE -- lo que el cliente necesita tener a mano
 * para hacer algo: las cuentas para pagar, el enlace, el video, la tienda.
 * Una ficha o un precio repetidos no resuelven ninguna duda: la esquivan.
 *
 * Y la voz: cuando el agente manda nota de voz, antes se leía SOLO el texto
 * del modelo ("Este es el valor:") y la maqueta quedaba muda -- el cliente
 * escuchaba "este es el valor" y ningún valor. Cada maqueta aporta ahora su
 * frase hablada, distinta para físico, digital y servicio.
 */
import type { Producto, Seccion } from "./herramientas";
import { modeloDelProducto } from "../modelo-de-negocio";

/** Lo único que se puede volver a mandar, y solo si el cliente lo pide. */
export const SECCIONES_QUE_SE_REENVIAN = new Set<Seccion>(["pago", "pago_transferencia", "pago_link", "video", "tienda"] as Seccion[]);

export function sePuedeReenviar(seccion: string): boolean {
  return SECCIONES_QUE_SE_REENVIAN.has(seccion as Seccion);
}

type Modelo = ReturnType<typeof modeloDelProducto>;

export function modeloDe(p: Producto): Modelo {
  return modeloDelProducto({ kind: p.kind, name: p.name, category: p.categoria, description: p.description } as any);
}

/** "$45.000 COP" para leer; "45.000 pesos" para decir. */
function precioParaLeer(p: Producto): string | null {
  if (p.price == null || !Number.isFinite(Number(p.price)) || Number(p.price) <= 0) return null;
  return `$${Number(p.price).toLocaleString("es-CO")} ${(p.currency || "COP").toUpperCase()}`;
}
function precioParaDecir(p: Producto): string | null {
  if (p.price == null || !Number.isFinite(Number(p.price)) || Number(p.price) <= 0) return null;
  const moneda = (p.currency || "COP").toUpperCase();
  const palabra = moneda === "COP" || moneda === "MXN" || moneda === "CLP" || moneda === "ARS" ? "pesos" : moneda === "USD" ? "dólares" : moneda;
  return `${Number(p.price).toLocaleString("es-CO")} ${palabra}`;
}

/**
 * Los datos de una maqueta ya enviada, en crudo, para que el modelo razone la
 * duda del cliente SIN inventar y SIN pegar la maqueta de nuevo.
 */
export function datosParaRazonar(p: Producto, seccion: string, hechosDelNegocio: string[] = []): string {
  const modelo = modeloDe(p);
  const lineas = [
    `Producto: ${p.name} (${modelo === "fisico" ? "físico, se envía" : modelo === "servicio" || modelo === "cotizacion" ? "servicio" : "digital, se entrega por enlace"})`,
  ];
  const precio = precioParaLeer(p);
  if (precio) lineas.push(`Precio: ${precio}`);
  if (p.description) lineas.push(`Descripción: ${String(p.description).replace(/\s+/g, " ").slice(0, 700)}`);
  if (p.opciones?.length) lineas.push(`Opciones: ${p.opciones.join(", ")}`);
  if (p.stock != null) lineas.push(`Stock: ${p.stock}`);
  const relevantes = hechosDelNegocio.filter((h) =>
    seccion.startsWith("pago") ? /^(Pago|Medios|Cuenta)/i.test(h)
      : seccion === "entrega" ? /^Entrega/i.test(h)
        : /^(Entrega|Pago|Garant|Env[ií]o|Devoluci)/i.test(h));
  if (relevantes.length) lineas.push(...relevantes.slice(0, 6));
  return lineas.join("\n");
}

/** Lo que devuelve `mostrar` cuando la maqueta ya salió: razonar, no repetir. */
export function instruccionDeDuda(p: Producto, seccion: string, hechosDelNegocio: string[] = []): string {
  return (
    `NO se volvió a enviar la maqueta "${seccion}" de ${p.name}: ya la recibió. ` +
    `Si vuelve a preguntar es porque le quedó una DUDA. Identificá cuál es (lo que pregunta AHORA, no lo que ya leyó) ` +
    `y respondela con tus palabras, razonando con estos datos reales, en 2-4 frases, sin copiar los renglones de la maqueta. ` +
    `Si el dato para su duda no está acá, decilo con honestidad y ofrecé averiguarlo: no inventes.\n\n` +
    `DATOS:\n${datosParaRazonar(p, seccion, hechosDelNegocio)}`
  );
}

/**
 * La frase que la maqueta aporta a la nota de voz. Corta y natural: el
 * detalle queda escrito; la voz dice lo importante y dónde mirarlo.
 */
export function fraseHablada(p: Producto, seccion: string): string {
  const modelo = modeloDe(p);
  const precio = precioParaDecir(p);
  switch (seccion) {
    case "precio":
      return precio ? `${p.name} tiene un valor de ${precio}.` : `Te dejé por escrito el valor de ${p.name}.`;
    case "completa":
    case "info":
      return modelo === "fisico"
        ? `Te dejé por escrito la ficha de ${p.name}, con sus características${precio ? ` y su precio, ${precio}` : ""}.`
        : modelo === "servicio" || modelo === "cotizacion"
          ? `Te dejé por escrito en qué consiste ${p.name} y cómo funciona.`
          : `Te dejé por escrito todo lo que incluye ${p.name}${precio ? `, que tiene un valor de ${precio}` : ""}.`;
    case "pago":
    case "pago_transferencia":
    case "pago_link":
      return modelo === "fisico"
        ? `Te dejé por escrito los medios de pago.`
        : `Te dejé por escrito los medios de pago; apenas lo confirmes, te llega el acceso por aquí mismo.`;
    case "entrega":
      return modelo === "fisico"
        ? `Te dejé por escrito cómo te llega y en cuánto tiempo.`
        : modelo === "servicio" || modelo === "cotizacion"
          ? `Te dejé por escrito cómo coordinamos.`
          : `Te dejé por escrito cómo recibís el acceso.`;
    case "video":
      return `Te mandé un video para que lo veas en acción.`;
    case "tienda":
      return `Te dejé el enlace para verlo en la tienda.`;
    default:
      return "";
  }
}

/**
 * La maqueta de los DATOS DE ENVÍO (físico / dropshipping).
 *
 * Pedido del dueño (24-09-2026): "a veces en vez de enviar todos los datos
 * que necesita para envío pide uno por uno; envía una maqueta con todos los
 * datos, omitiendo cédula ya que no es necesaria". Antes el modelo recibía
 * "pedíselos todos juntos" y los redactaba él -- a veces de a uno. Ahora la
 * lista la pega el SISTEMA: completa la primera vez, y si después falta algo,
 * solo eso. La cédula no se pide: Dropi la lleva solo como nota.
 */
const LINEA_DEL_DATO: Record<string, string> = {
  "nombre completo": "👤 Nombre y apellido",
  "celular": "📱 Celular",
  "dirección": "🏠 Dirección (calle o carrera, número, apto o casa)",
  "barrio": "📍 Barrio",
  "ciudad": "🏙️ Ciudad",
  "departamento": "🗺️ Departamento",
  "punto de referencia": "📌 Un punto de referencia (opcional)",
};

export function maquetaDeDatosDeEnvio(faltan: string[], primeraVez: boolean): string {
  let pedidos = faltan.filter((f) => f !== "cédula" && f !== "documento");
  // La primera vez se piden también los que ayudan al mensajero (opcionales).
  if (primeraVez) for (const extra of ["barrio", "punto de referencia"]) if (!pedidos.includes(extra)) pedidos.push(extra);
  const orden = ["nombre completo", "celular", "dirección", "barrio", "ciudad", "departamento", "punto de referencia"];
  pedidos = [...new Set(pedidos)].sort((a, b) => (orden.indexOf(a) + 1 || 99) - (orden.indexOf(b) + 1 || 99));
  const lineas: string[] = [];
  for (const d of pedidos) {
    if (d === "departamento" && pedidos.includes("ciudad")) continue;
    if (d === "ciudad" && pedidos.includes("departamento")) { lineas.push("🏙️ Ciudad y departamento"); continue; }
    lineas.push(LINEA_DEL_DATO[d] || `• ${d.charAt(0).toUpperCase()}${d.slice(1)}`);
  }
  if (!lineas.length) return "";
  return primeraVez
    ? `📦 *Para enviarte tu pedido necesito:*\n\n${lineas.join("\n")}\n\nMandámelos todos en un solo mensaje y te confirmo el pedido 🙌`
    : `📝 *Solo me falta:*\n\n${lineas.join("\n")}\n\nCon eso te confirmo el pedido.`;
}
