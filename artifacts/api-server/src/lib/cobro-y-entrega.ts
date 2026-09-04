/**
 * ============================================================
 * EL RECIBO, Y QUÉ DECIRLE AL CLIENTE MIENTRAS ESPERA
 * ============================================================
 *
 * ⚠️ ANTES DE AGREGAR ALGO ACÁ: la verificación de pagos YA EXISTE COMPLETA en
 * `verificacion-pago.ts` y está conectada en `whatsapp.ts`. Tiene el aviso al
 * admin (`avisoParaElAdmin`), la lectura de su decisión
 * (`leerDecisionDelAdmin`), la aplicación (`aplicarDecision`) y el teléfono al
 * que escribirle (`telefonoDelAdmin`).
 *
 * Este archivo escribió una segunda versión de todo eso antes de mirar, y hubo
 * que borrarla. Es exactamente el error que este proyecto viene pagando todo el
 * día --construir lo que ya está-- y acá quedó por escrito para el próximo.
 *
 * Lo que SÍ faltaba y vive acá:
 *
 *   · el RECIBO de la compra, que el admin pidió explícitamente;
 *   · qué contestarle al cliente que dice haber pagado SIN mandar comprobante,
 *     que es el caso que `pareceComprobante` no cubre porque trabaja sobre la
 *     descripción de una imagen.
 */

/**
 * Lo que se le dice al CLIENTE mientras espera.
 *
 * No dice "confirmado" ni "ya lo verifiqué": no se verificó nada. Es el defecto
 * más grave que registró el QA (B1, 2026-08-26) -- el cliente escribió "listo
 * ya te pagué, mandame el acceso" y el bot contestó "Perfecto, ya confirmé tu
 * pago, te acabo de liberar el acceso". Cualquiera obtenía el producto
 * escribiendo una frase.
 *
 * Pero tampoco lo deja en el aire: decirle qué falta es lo que evita que
 * escriba cinco veces preguntando.
 */
export function esperaParaElCliente(mandoComprobante: boolean): string {
  if (!mandoComprobante) {
    return (
      "¡Genial! 🙏 Para activarlo necesito el comprobante de la transferencia. " +
      "Mandame la captura por acá y lo verifico enseguida."
    );
  }
  return (
    "¡Recibido! 🙏 Ya lo estoy verificando. " +
    "Apenas confirmemos que entró el dinero te aviso por acá y te entrego el acceso."
  );
}

/**
 * El comprobante de compra, cuando el pago YA fue confirmado por el admin.
 *
 * Es un RECIBO, no una factura, y la distinción no es de estilo: este sistema
 * no emite facturación electrónica ni tiene resolución de la DIAN. Llamar
 * "factura" a algo que no lo es le crea un problema legal al negocio que la
 * manda. El admin lo confirmó así: "solo es como un comprobante de que pagó".
 */
export function reciboDeVenta(d: {
  numero: string | number;
  cliente: string;
  producto?: string | null;
  monto?: number | string | null;
  moneda?: string | null;
  metodo?: string | null;
  fecha?: Date;
}): string {
  const f = d.fecha instanceof Date ? d.fecha : new Date();
  const fecha = f.toLocaleDateString("es-CO", { day: "2-digit", month: "2-digit", year: "numeric" });
  const n = Number(d.monto);
  const monto =
    Number.isFinite(n) && n > 0
      ? `$${Math.round(n).toLocaleString("es-CO")}${d.moneda ? ` ${String(d.moneda).toUpperCase()}` : ""}`
      : "";
  return [
    `🧾 *COMPROBANTE DE COMPRA*`,
    `N° ${d.numero} · ${fecha}`,
    ``,
    `👤 ${d.cliente}`,
    d.producto ? `📦 ${d.producto}` : null,
    monto ? `💰 ${monto}` : null,
    d.metodo ? `💳 ${d.metodo}` : null,
    ``,
    `✅ *Pago confirmado*`,
    ``,
    `Gracias por tu compra 🙏 Guardá este comprobante por si necesitás referenciarlo.`,
  ]
    .filter((l) => l !== null)
    .join("\n");
}

/**
 * El número del comprobante.
 *
 * Sale del id del pago y la fecha: es reproducible --el mismo pago genera
 * siempre el mismo número-- así que un reintento no emite dos comprobantes
 * distintos por la misma compra, y no hace falta una tabla de secuencias que
 * pueda desincronizarse.
 */
export function numeroDeRecibo(pagoId: number, fecha = new Date()): string {
  const a = fecha.getFullYear();
  const m = String(fecha.getMonth() + 1).padStart(2, "0");
  return `${a}${m}-${String(pagoId).padStart(5, "0")}`;
}
