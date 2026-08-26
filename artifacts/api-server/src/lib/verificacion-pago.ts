/**
 * ============================================================
 * VERIFICACIÓN DE PAGO CON UNA PERSONA DETRÁS
 * ============================================================
 *
 * Los pagos por Nequi, Daviplata y transferencia NO tienen webhook: nadie le
 * avisa al sistema que el dinero llegó. Hasta ahora el bot resolvía eso
 * diciendo "apenas el sistema lo verifique te llega el acceso" -- una
 * verificación que no existía. El comprador quedaba esperando algo que nunca
 * iba a pasar, y en un caso el bot directamente afirmó "ya confirmé tu pago"
 * sin que nadie hubiera pagado.
 *
 * Acá está el proceso de verdad, y su regla de fondo:
 *
 *   el dinero lo confirma UNA PERSONA que lo vio en su cuenta.
 *   Ni el cliente diciendo que pagó, ni el modelo, ni un comprobante.
 *
 * El flujo completo:
 *
 *   1. el cliente manda la foto del comprobante por WhatsApp
 *   2. se GUARDA (antes se describía y se tiraba) y queda un pago `pending`
 *   3. al admin le llega el comprobante por WhatsApp y por correo, con un
 *      código corto
 *   4. el admin responde "APROBAR 47" o "RECHAZAR 47"
 *   5. recién ahí el pago queda `confirmed` y corresponde entregar
 *
 * Un comprobante puede ser falso o de otra cuenta, así que el paso 4 no se
 * puede automatizar sin conciliación bancaria real. Lo que sí se logra es que
 * nadie quede esperando en silencio: el admin se entera al instante y el
 * cliente sabe que hay alguien revisando.
 */

import { db, payments, conversations, tenants, products } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { logger } from "./logger";

export interface ComprobanteEntrante {
  tenantId: number;
  conversationId: number;
  leadId?: number | null;
  productId?: number | null;
  /** Monto esperado, del producto en juego. */
  monto?: number | null;
  moneda?: string | null;
  /** Teléfono de quien manda el comprobante. */
  telefono?: string | null;
  nombre?: string | null;
  /** Ruta relativa donde quedó guardada la imagen. */
  proofUrl?: string | null;
  /** Lo que el modelo de visión leyó en la imagen. */
  descripcion?: string | null;
  metodo?: string;
}

/**
 * ¿Esta imagen es un comprobante de pago?
 *
 * Se mira lo que el modelo de visión leyó Y en qué punto va la conversación.
 * Las dos cosas, porque cada una sola se equivoca:
 *
 *   · solo el texto: un cliente que manda la foto de su perro en una charla
 *     sobre el curso de adiestramiento no está pagando nada;
 *   · solo la etapa: alguien puede mandar el comprobante sin haber avisado.
 *
 * Con la etapa correcta (dijo que iba a pagar o que ya pagó) alcanza con
 * señales débiles; sin ella, se exige que la imagen hable de una transferencia.
 */
const SENALES_FUERTES =
  /\b(comprobante|transferencia|transferiste|recibo|soporte de pago|nequi|daviplata|bancolombia|davivienda|nequ[ií]|pse|consignaci[oó]n)\b/i;

const SENALES_DEBILES =
  /\b(pago|pagado|exitosa|exitoso|aprobad[oa]|monto|valor|\$\s?\d|referencia|cuenta|banco|envi[oó])\b/i;

export function pareceComprobante(
  descripcion: string | null | undefined,
  etapaDeCobro: boolean,
): boolean {
  const d = String(descripcion || "");
  if (!d.trim()) return false;
  if (SENALES_FUERTES.test(d)) return true;
  return etapaDeCobro && SENALES_DEBILES.test(d);
}

/** Código corto que el admin escribe para aprobar. Es el id del pago. */
export function codigoDe(pagoId: number): string {
  return String(pagoId);
}

/**
 * Deja el pago en `pending` con su comprobante.
 *
 * Si ya había uno pendiente para esta conversación se ACTUALIZA en vez de
 * crear otro: un cliente que manda el comprobante dos veces (porque no le
 * respondieron) no puede generar dos cobros que después haya que conciliar.
 */
export async function registrarComprobante(c: ComprobanteEntrante): Promise<number | null> {
  try {
    const [existente] = await db
      .select({ id: payments.id })
      .from(payments)
      .where(and(eq(payments.conversationId, c.conversationId), eq(payments.status, "pending")))
      .orderBy(desc(payments.id))
      .limit(1);

    const datos = {
      proofReceived: true,
      proofUrl: c.proofUrl ?? null,
      verificationSource: "whatsapp_image",
      payerPhone: c.telefono ?? null,
      payerName: c.nombre ?? null,
      notes: c.descripcion ? String(c.descripcion).slice(0, 1000) : null,
      updatedAt: new Date(),
    };

    if (existente?.id) {
      await db.update(payments).set(datos).where(eq(payments.id, existente.id));
      logger.info({ pagoId: existente.id, conversationId: c.conversationId }, "[Pago] Comprobante actualizado");
      return existente.id;
    }

    const [creado] = await db
      .insert(payments)
      .values({
        tenantId: c.tenantId,
        conversationId: c.conversationId,
        leadId: c.leadId ?? null,
        productId: c.productId ?? null,
        amount: String(c.monto ?? 0),
        currency: c.moneda || "COP",
        method: c.metodo || "transferencia",
        status: "pending",
        ...datos,
      })
      .returning({ id: payments.id });

    logger.info({ pagoId: creado?.id, conversationId: c.conversationId }, "[Pago] Comprobante registrado, pendiente de aprobación");
    return creado?.id ?? null;
  } catch (e: any) {
    logger.error({ err: e?.message, conversationId: c.conversationId }, "[Pago] No se pudo registrar el comprobante");
    return null;
  }
}

/** El mensaje que le llega al admin. Corto: se lee en el celular. */
export function avisoParaElAdmin(p: {
  pagoId: number;
  cliente: string;
  telefono: string;
  producto: string;
  monto: number;
  moneda: string;
  descripcion?: string | null;
}): string {
  const monto = p.monto > 0 ? `$${p.monto.toLocaleString("es-CO")} ${p.moneda}` : "monto sin confirmar";
  const l = [
    `💸 *COMPROBANTE PARA REVISAR*`,
    ``,
    `👤 ${p.cliente} (${p.telefono})`,
    `📦 ${p.producto}`,
    `💰 ${monto}`,
  ];
  if (p.descripcion) l.push(`🔎 ${String(p.descripcion).slice(0, 200)}`);
  l.push(``);
  l.push(`Revisá que el dinero esté en tu cuenta y respondé:`);
  l.push(`✅ *APROBAR ${p.pagoId}*`);
  l.push(`❌ *RECHAZAR ${p.pagoId}*`);
  l.push(``);
  l.push(`_Para mandarle el acceso también por correo:_ *APROBAR ${p.pagoId} correo@cliente.com*`);
  return l.join("\n");
}

/**
 * "APROBAR 47" / "aprobar #47" / "ok 47" → { accion, pagoId }
 *
 * Y opcionalmente un correo al final -- "APROBAR 47 juan@correo.com" -- para
 * mandarle el acceso TAMBIÉN por email. En los pagos por pasarela el correo lo
 * da la pasarela; en Nequi no lo tenemos, y un enlace en WhatsApp se pierde
 * entre mensajes. Si el admin lo sabe, lo escribe y el cliente lo recibe por
 * los dos lados.
 */
export function leerDecisionDelAdmin(
  texto: string,
): { accion: "aprobar" | "rechazar"; pagoId: number; correo?: string } | null {
  const t = String(texto || "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const m = t.match(
    /^(aprobar|aprobado|apruebo|ok|confirmar|confirmo|rechazar|rechazo|rechazado|no)\s*#?\s*(\d{1,9})\b\s*([^\s@]+@[^\s@]+\.[^\s@]+)?/,
  );
  if (!m) return null;
  const accion = /^(rechaz|no)/.test(m[1]!) ? "rechazar" : "aprobar";
  return { accion, pagoId: Number(m[2]), correo: m[3] || undefined };
}

export interface ResultadoDecision {
  ok: boolean;
  mensajeParaElAdmin: string;
  /** Qué decirle al cliente. null = no avisarle (p. ej. el pago no existe). */
  mensajeParaElCliente: string | null;
  conversationId: number | null;
  productId: number | null;
  tenantId: number | null;
  aprobado: boolean;
}

/**
 * Aplica la decisión del admin.
 *
 * Solo toca pagos en `pending`: aprobar dos veces el mismo comprobante no
 * puede entregar dos veces, y rechazar uno ya confirmado no puede
 * "desentregarlo" en silencio.
 */
export async function aplicarDecision(
  pagoId: number,
  accion: "aprobar" | "rechazar",
  quien: string,
): Promise<ResultadoDecision> {
  const noExiste: ResultadoDecision = {
    ok: false,
    mensajeParaElAdmin: `No encontré un comprobante pendiente con el número ${pagoId}.`,
    mensajeParaElCliente: null,
    conversationId: null,
    productId: null,
    tenantId: null,
    aprobado: false,
  };

  try {
    const [pago] = await db.select().from(payments).where(eq(payments.id, pagoId)).limit(1);
    if (!pago) return noExiste;

    if (pago.status !== "pending") {
      return {
        ...noExiste,
        mensajeParaElAdmin:
          `El comprobante ${pagoId} ya estaba en "${pago.status}", no lo volví a tocar.`,
        conversationId: pago.conversationId ?? null,
      };
    }

    const aprobado = accion === "aprobar";
    await db
      .update(payments)
      .set({
        status: aprobado ? "confirmed" : "rejected",
        verifiedAt: new Date(),
        verifiedBy: quien,
        updatedAt: new Date(),
      })
      .where(eq(payments.id, pagoId));

    logger.info({ pagoId, accion, quien }, "[Pago] Decisión del admin aplicada");

    return {
      ok: true,
      mensajeParaElAdmin: aprobado
        ? `✅ Listo, comprobante ${pagoId} aprobado. Le aviso al cliente.`
        : `❌ Comprobante ${pagoId} rechazado. Le aviso al cliente con tacto.`,
      mensajeParaElCliente: aprobado
        ? `¡Confirmado tu pago! 🎉 Te paso el acceso enseguida.`
        : `Revisé el comprobante y todavía no veo el pago reflejado 🤔 ¿Podés verificar que la transferencia haya salido y mandarme el soporte de nuevo?`,
      conversationId: pago.conversationId ?? null,
      productId: pago.productId ?? null,
      tenantId: pago.tenantId ?? null,
      aprobado,
    };
  } catch (e: any) {
    logger.error({ err: e?.message, pagoId }, "[Pago] No se pudo aplicar la decisión");
    return { ...noExiste, mensajeParaElAdmin: `No pude aplicar la decisión sobre el ${pagoId}: ${e?.message}` };
  }
}

/**
 * A qué teléfono avisarle: el del NEGOCIO, y el del entorno solo de respaldo.
 *
 * Mismo criterio que ad-growth-agent: con varios negocios, una sola variable
 * de entorno mandaría los comprobantes de todos al mismo teléfono.
 */
export async function telefonoDelAdmin(tenantId: number): Promise<string | null> {
  try {
    const [fila] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
    const propio = String((fila as any)?.contactPhone || "").replace(/[^0-9]/g, "");
    if (propio.length >= 8) return propio;
  } catch (e: any) {
    logger.warn({ err: e?.message, tenantId }, "[Pago] no se pudo leer el teléfono del negocio");
  }
  const env = String(process.env.ADMIN_PHONE || "").replace(/[^0-9]/g, "");
  return env.length >= 8 ? env : null;
}

/**
 * ¿Este número es el admin de algún negocio?
 *
 * Se acepta el del entorno o el de cualquier negocio. La comparación es
 * EXACTA a propósito: `isAdminPhone` (admin-commands.ts) compara con
 * `includes()` en las dos direcciones, así que un número que contenga al del
 * admin como subcadena pasaría el chequeo -- y ese chequeo aprueba dinero.
 */
export async function esTelefonoDeAdmin(phone: string): Promise<boolean> {
  const quien = String(phone || "").replace(/[^0-9]/g, "");
  if (quien.length < 8) return false;
  const delEntorno = String(process.env.ADMIN_PHONE || "").replace(/[^0-9]/g, "");
  if (delEntorno && quien === delEntorno) return true;
  try {
    const filas = await db.select({ contactPhone: tenants.contactPhone }).from(tenants);
    return filas.some((t: any) => String(t.contactPhone || "").replace(/[^0-9]/g, "") === quien);
  } catch {
    return false;
  }
}

export interface RespuestaAdmin {
  /** Qué contestarle al admin. */
  paraElAdmin: string;
  /** Qué decirle al cliente, y en qué conversación. */
  paraElCliente: { conversationId: number; texto: string; entregar: boolean } | null;
}

/**
 * El admin respondió "APROBAR 47" / "RECHAZAR 47".
 *
 * Devuelve null cuando NO era una decisión de pago -- ahí el mensaje sigue su
 * camino normal. Eso incluye el caso en que el número no corresponde a ningún
 * comprobante pendiente: sin eso, un "aprobar 47" dirigido a una sugerencia de
 * anuncios quedaría atrapado acá.
 */
export async function atenderDecisionDelAdmin(
  phone: string,
  texto: string,
): Promise<RespuestaAdmin | null> {
  const decision = leerDecisionDelAdmin(texto);
  if (!decision) return null;
  if (!(await esTelefonoDeAdmin(phone))) return null;

  // Solo se toma si HAY un comprobante pendiente con ese número.
  const [pago] = await db
    .select({ id: payments.id, status: payments.status })
    .from(payments)
    .where(eq(payments.id, decision.pagoId))
    .limit(1);
  if (!pago || pago.status !== "pending") return null;

  const r = await aplicarDecision(decision.pagoId, decision.accion, `whatsapp:${phone}`);
  if (!r.conversationId || !r.mensajeParaElCliente) {
    return { paraElAdmin: r.mensajeParaElAdmin, paraElCliente: null };
  }

  // ── Aprobado: el acceso va en el MISMO mensaje ────────────────────────────
  //
  // Decirle "confirmado, te paso el acceso enseguida" y que el acceso llegue
  // en otro momento -- o no llegue -- es la misma promesa incumplida que este
  // proceso vino a arreglar. Si hay con qué entregar, se entrega ahora.
  let paraCliente = r.mensajeParaElCliente;
  let avisoExtra = "";

  if (r.aprobado) {
    const entrega = r.productId ? await mensajeDeEntrega(r.productId) : null;
    if (entrega) {
      paraCliente = entrega;
    } else {
      // Sin enlace de entrega NO se le dice al cliente que ya lo tiene: se le
      // confirma el pago y se le avisa al admin, que es quien puede resolverlo.
      paraCliente = `✅ ¡Confirmado tu pago! 🎉 Estoy preparando tu acceso y te lo paso por acá en un momento.`;
      avisoExtra = r.productId
        ? `\n\n⚠️ Ese producto no tiene enlace de entrega cargado: el acceso se lo tenés que mandar vos.`
        : `\n\n⚠️ No pude identificar el producto de esa venta: el acceso se lo tenés que mandar vos.`;
      logger.warn({ pagoId: decision.pagoId, productId: r.productId }, "[Entrega] Pago aprobado SIN enlace de entrega");
    }
  }

  // ── Y por correo, si el admin dijo a dónde ────────────────────────────────
  // Un enlace en WhatsApp se pierde entre mensajes; en el correo queda.
  if (r.aprobado && decision.correo) {
    const enviado = await enviarAccesoPorCorreo(decision.correo, paraCliente, r.tenantId);
    avisoExtra += enviado
      ? `\n📧 También se lo mandé a ${decision.correo}.`
      : `\n⚠️ No pude mandarlo a ${decision.correo} (revisá el SMTP en Configuración → Email).`;
  }

  return {
    paraElAdmin: r.mensajeParaElAdmin + avisoExtra,
    paraElCliente: { conversationId: r.conversationId, texto: paraCliente, entregar: r.aprobado },
  };
}

/** Manda el acceso por correo. Devuelve false en vez de tirar. */
async function enviarAccesoPorCorreo(
  correo: string,
  cuerpo: string,
  tenantId: number | null,
): Promise<boolean> {
  try {
    const { enviarCorreoSimple } = await import("./email");
    const { credencialesEmailDe } = await import("./tenant-email-credentials");
    const { tenantManager } = await import("./tenantManager");
    const tenant = tenantId ? await tenantManager.getTenantById(tenantId) : null;
    return await enviarCorreoSimple(
      correo,
      "✅ Tu acceso — pago confirmado",
      cuerpo.replace(/\*/g, ""),
      credencialesEmailDe(tenant as any),
    );
  } catch (e: any) {
    logger.error({ err: e?.message, correo }, "[Entrega] No se pudo mandar el acceso por correo");
    return false;
  }
}

/**
 * El mensaje de entrega de un producto ya pagado.
 *
 * Es la misma lógica que usa el webhook de la pasarela (routes/webhooks.ts):
 * si el producto tiene su ruta de Terabox cargada, se genera un enlace con
 * clave propia para ESTA venta; si Terabox no responde -- su cookie vence en
 * días -- cae al enlace fijo de siempre. Se pierde la clave, nunca la venta.
 *
 * Devuelve null si el producto no tiene forma de entregarse: ahí NO se le
 * puede decir al cliente que le llegó nada.
 */
export async function mensajeDeEntrega(productId: number): Promise<string | null> {
  try {
    const [producto] = await db.select().from(products).where(eq(products.id, productId)).limit(1);
    if (!producto?.deliveryLink) return null;

    const { prepararEntrega, textoDeEntrega } = await import("./entrega-personalizada");
    const meta: any =
      typeof producto.metadata === "string"
        ? (() => { try { return JSON.parse(producto.metadata as string); } catch { return {}; } })()
        : (producto.metadata || {});

    const entrega = await prepararEntrega({
      id: producto.id,
      name: producto.name,
      deliveryLink: producto.deliveryLink,
      teraboxPath: meta?.teraboxPath || null,
    });
    if (entrega?.origen === "fija" && entrega.motivo) {
      logger.warn({ productId, motivo: entrega.motivo }, "[Entrega] Se entregó con el enlace fijo");
    }

    const acceso = entrega ? textoDeEntrega(entrega) : `🚀 ${producto.deliveryLink}`;
    return `✅ *¡Pago confirmado!* 🎉\n\nAcá tienes tu acceso a *${producto.name}*:\n\n${acceso}\n\n¡Que lo disfrutes! Si tienes dudas, escríbeme por acá.`;
  } catch (e: any) {
    logger.error({ err: e?.message, productId }, "[Entrega] No se pudo preparar la entrega");
    return null;
  }
}

/** Los comprobantes que están esperando decisión. */
export async function pendientes(tenantId: number, limite = 10) {
  return db
    .select({
      id: payments.id,
      conversationId: payments.conversationId,
      amount: payments.amount,
      currency: payments.currency,
      payerName: payments.payerName,
      payerPhone: payments.payerPhone,
      proofUrl: payments.proofUrl,
      createdAt: payments.createdAt,
    })
    .from(payments)
    .where(and(eq(payments.tenantId, tenantId), eq(payments.status, "pending")))
    .orderBy(desc(payments.id))
    .limit(limite);
}
