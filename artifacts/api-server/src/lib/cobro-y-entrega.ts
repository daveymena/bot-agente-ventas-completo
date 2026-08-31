/**
 * ============================================================
 * DEL COMPROBANTE A LA ENTREGA — con el admin en el medio
 * ============================================================
 *
 * El admin lo pidió así: "necesito que al cliente pagar generes una factura,
 * pero el pago por consignación debe ser confirmado: el cliente manda el
 * comprobante, tú me lo envías y esperas mi confirmación con un sí; si no, no
 * le entregas".
 *
 * ── Por qué la confirmación es del admin y no del sistema ────────────────
 *
 * Porque una transferencia NO se puede verificar leyendo un chat. El cliente
 * puede escribir "ya te pagué", mandar una captura vieja, una editada, o la de
 * otra persona. El único que sabe si el dinero llegó es quien mira la cuenta.
 *
 * Y ya pasó acá. Es el defecto más grave que registró el QA (B1, 2026-08-26):
 * el cliente escribió "listo ya te pagué el pack de idiomas, mandame el
 * acceso" --sin comprobante, sin nada-- y el bot contestó "Perfecto, ya
 * confirmé tu pago. Te acabo de liberar el acceso a la carpeta". Cualquiera
 * obtenía el producto escribiendo una frase.
 *
 * Por eso acá NADA de lo que diga el cliente alcanza para entregar. La única
 * llave es un "sí" del admin.
 *
 * ── Lo que ya existía y no estaba conectado ──────────────────────────────
 *
 * `payment-confirmation.ts` tiene `isPaymentConfirmation` y
 * `formatConfirmationForCompany` desde hace tiempo. La primera se importaba en
 * `agent.ts` y NUNCA se llamaba; la segunda no se usa en ningún lado. O sea
 * que el admin no se enteraba de que alguien decía haber pagado.
 */

export interface DatosDelPago {
  /** Cómo se llama el cliente en WhatsApp. */
  cliente: string;
  /** Su teléfono, para poder escribirle. */
  telefono: string;
  producto?: { id?: number | null; name?: string | null } | null;
  monto?: number | string | null;
  moneda?: string | null;
  /** El id de la conversación: es lo que el admin necesita para confirmar. */
  conversationId: number;
  /** true si el cliente mandó una imagen (la captura de la transferencia). */
  mandoComprobante?: boolean;
}

const plata = (monto?: number | string | null, moneda?: string | null): string => {
  const n = Number(monto);
  if (!Number.isFinite(n) || n <= 0) return "";
  return `$${Math.round(n).toLocaleString("es-CO")}${moneda ? ` ${String(moneda).toUpperCase()}` : ""}`;
};

/**
 * El aviso que recibe el ADMIN cuando un cliente dice que pagó.
 *
 * Tiene que poder decidir sin abrir la app: quién, cuánto, por qué producto, y
 * si mandó comprobante. Y tiene que ser inequívoco en que NADA se entregó
 * todavía -- el error opuesto (que el admin crea que ya se entregó) es igual de
 * caro.
 */
export function avisoDePagoParaElAdmin(d: DatosDelPago): string {
  const monto = plata(d.monto, d.moneda);
  return [
    `💳 *Un cliente dice que pagó*`,
    ``,
    `👤 ${d.cliente || "Sin nombre"} — ${d.telefono}`,
    d.producto?.name ? `📦 ${d.producto.name}` : null,
    monto ? `💰 ${monto}` : null,
    d.mandoComprobante ? `📎 Mandó comprobante` : `⚠️ *NO* mandó comprobante todavía`,
    ``,
    `🔒 No le entregué nada y no le confirmé el pago.`,
    ``,
    `Revisá tu cuenta y respondeme:`,
    `   *sí ${d.conversationId}* — para entregarle`,
    `   *no ${d.conversationId}* — si el dinero no llegó`,
  ]
    .filter((l) => l !== null)
    .join("\n");
}

/**
 * Lo que se le dice al CLIENTE mientras espera.
 *
 * No dice "confirmado" ni "ya lo verifiqué": no se verificó nada. Pero tampoco
 * lo deja en el aire -- decirle cuánto puede tardar es lo que evita que
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
    "¡Recibido! 🙏 Ya lo estoy verificando con el equipo. " +
    "Apenas confirmemos que entró el dinero te aviso por acá y te entrego el acceso."
  );
}

/**
 * ¿El admin está confirmando o rechazando un pago?
 *
 * Se exige el número de conversación a propósito. Un "sí" suelto en el chat del
 * admin es ambiguo --puede estar contestando otra cosa-- y confirmar el pago
 * equivocado entrega un producto sin cobrar.
 */
export function leerRespuestaDelAdmin(
  mensaje: string,
): { decision: "confirma" | "rechaza"; conversationId: number } | null {
  const m = String(mensaje || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
  const match = m.match(/^(si|sí|no|confirmo|confirmado|rechazar|rechazo)\s+#?(\d{1,10})\b/);
  if (!match) return null;
  const palabra = match[1]!;
  const id = Number(match[2]);
  if (!Number.isFinite(id) || id <= 0) return null;
  return {
    decision: palabra.startsWith("no") || palabra.startsWith("rechaz") ? "rechaza" : "confirma",
    conversationId: id,
  };
}

/**
 * La factura, cuando el pago YA está confirmado por el admin.
 *
 * Es un comprobante de venta simple, no un documento fiscal: este sistema no
 * emite facturación electrónica ni lleva resolución de la DIAN. Decirle
 * "factura" a algo que no lo es le crearía un problema al negocio, así que se
 * llama por lo que es -- un recibo -- y lleva un número propio para poder
 * referenciarlo.
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
  const monto = plata(d.monto, d.moneda);
  return [
    `🧾 *RECIBO DE COMPRA*`,
    `N° ${d.numero} · ${fecha}`,
    ``,
    `👤 ${d.cliente}`,
    d.producto ? `📦 ${d.producto}` : null,
    monto ? `💰 ${monto}` : null,
    d.metodo ? `💳 ${d.metodo}` : null,
    ``,
    `✅ *Pago confirmado*`,
    ``,
    `Gracias por tu compra 🙏 Guardá este recibo por si necesitás referenciarlo.`,
  ]
    .filter((l) => l !== null)
    .join("\n");
}

/**
 * El número del recibo.
 *
 * Sale del id de la conversación y la fecha: es reproducible --el mismo pago
 * genera siempre el mismo número-- y no necesita una tabla de secuencias que
 * pueda desincronizarse entre reintentos.
 */
export function numeroDeRecibo(conversationId: number, fecha = new Date()): string {
  const a = fecha.getFullYear();
  const m = String(fecha.getMonth() + 1).padStart(2, "0");
  return `${a}${m}-${String(conversationId).padStart(5, "0")}`;
}

/**
 * Le avisa al ADMIN que un cliente dice que pagó, y le deja el mensaje al
 * cliente listo para enviar.
 *
 * Devuelve `null` si no se pudo avisar. Y eso importa: si el admin NO se
 * enteró, el cliente no puede quedar esperando una confirmación que nunca va a
 * llegar -- el llamador tiene que decírselo.
 *
 * Nada de esto entrega el producto. La entrega la habilita solo el "sí" del
 * admin, que llega por `leerRespuestaDelAdmin`.
 */
export async function avisarAlAdminDelPago(
  tenantId: number,
  d: DatosDelPago,
  deps: {
    telefonoDelAdmin: (tenantId: number) => Promise<string | null>;
    enviar: (telefono: string, texto: string) => Promise<unknown>;
  },
): Promise<{ avisado: boolean; motivo?: string }> {
  const telefono = await deps.telefonoDelAdmin(tenantId).catch(() => null);
  if (!telefono) {
    return { avisado: false, motivo: "el negocio no tiene un teléfono de administrador cargado" };
  }
  try {
    await deps.enviar(telefono, avisoDePagoParaElAdmin(d));
    return { avisado: true };
  } catch (e: any) {
    return { avisado: false, motivo: e?.message || "no se pudo enviar el aviso" };
  }
}
