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
  /** El nombre del negocio que cobra. Encabeza el recibo. */
  negocio?: string | null;
}): string {
  const f = d.fecha instanceof Date ? d.fecha : new Date();
  const fecha = f.toLocaleDateString("es-CO", { day: "2-digit", month: "2-digit", year: "numeric" });
  const hora = f.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", hour12: true });
  const n = Number(d.monto);
  const monto =
    Number.isFinite(n) && n > 0
      ? `$${Math.round(n).toLocaleString("es-CO")}${d.moneda ? ` ${String(d.moneda).toUpperCase()}` : ""}`
      : null;

  // ── Por qué monoespaciado y no viñetas con emojis ───────────────────
  //
  // WhatsApp solo da negrita, cursiva, tachado y monoespaciado. De esos, el
  // único que ALINEA es el monoespaciado (```): dentro del bloque todos los
  // caracteres miden lo mismo, así que las columnas quedan derechas en
  // cualquier teléfono. Una lista de emojis se ve informal y se desalinea sola
  // cuando un nombre es largo.
  //
  // El ancho es 34: entra sin cortarse en un teléfono angosto. Todo lo que se
  // escribe adentro se recorta a ese ancho, porque una línea que se parte
  // arruina la caja entera y el recibo pasa de prolijo a roto.
  const W = 34;
  const linea = (c = "\u2500") => c.repeat(W);
  const centrar = (t: string) => {
    const s2 = t.length > W ? t.slice(0, W) : t;
    const izq = Math.floor((W - s2.length) / 2);
    return " ".repeat(izq) + s2;
  };
  // Etiqueta a la izquierda, valor a la derecha. Si no entran juntos, el valor
  // baja a la línea siguiente en vez de empujar la caja.
  const par = (k: string, v: string): string[] => {
    const val = String(v);
    if (k.length + val.length + 1 <= W) {
      return [k + " ".repeat(W - k.length - val.length) + val];
    }
    return [k, val.length > W ? val.slice(0, W) : " ".repeat(Math.max(0, W - val.length)) + val];
  };

  const cuerpo: string[] = [];
  cuerpo.push(centrar((d.negocio || "").toUpperCase().slice(0, W)));
  cuerpo.push(centrar("RECIBO DE CAJA"));
  cuerpo.push(linea("\u2550"));
  cuerpo.push(...par("N\u00b0", String(d.numero)));
  cuerpo.push(...par("Fecha", `${fecha} ${hora}`));
  cuerpo.push(linea());
  cuerpo.push(...par("Recibido de", String(d.cliente).slice(0, 22)));
  if (d.producto) {
    cuerpo.push("Por concepto de");
    // El nombre del producto va entero, partido en renglones de ancho fijo.
    const palabras = String(d.producto).split(/\s+/);
    let r = "";
    for (const w of palabras) {
      if ((r + " " + w).trim().length > W - 2) {
        cuerpo.push("  " + r.trim());
        r = w;
      } else {
        r = (r + " " + w).trim();
      }
    }
    if (r) cuerpo.push("  " + r);
  }
  if (d.metodo) cuerpo.push(...par("Forma de pago", String(d.metodo).slice(0, 18)));
  cuerpo.push(linea());
  if (monto) cuerpo.push(...par("TOTAL PAGADO", monto));
  cuerpo.push(linea("\u2550"));
  cuerpo.push(centrar("*** PAGADO ***"));

  return [
    "\ud83e\uddfe *RECIBO DE CAJA*",
    "```",
    ...cuerpo,
    "```",
    // Esto NO es adorno legal: es lo que evita que el negocio quede afirmando
    // que emitió una factura. Ver el comentario de arriba.
    "_Documento no válido como factura de venta._",
    "",
    "\u00a1Gracias por tu compra! \ud83d\ude4c Guard\u00e1 este recibo por si necesit\u00e1s referenciar la compra.",
  ].join("\n");
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
