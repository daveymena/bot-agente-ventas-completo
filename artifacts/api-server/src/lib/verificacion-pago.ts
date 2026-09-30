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
import { eq, and, desc, inArray } from "drizzle-orm";
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

  // ── Sin descripción NO se descarta: se mira la etapa ────────────────────
  //
  // Devolver `false` acá dejaba todo el aviso colgando de que el modelo de
  // visión contestara. Y durante semanas no contestó: `VISION_MODELS` apuntaba
  // en producción a tres candidatos de OpenRouter y NVIDIA sin clave de
  // ninguno de los dos, así que `describirImagen` devolvía `null` siempre.
  // Resultado: el cliente pagaba, mandaba la foto, y no se registraba el pago
  // ni se avisaba a nadie. Silencio total sobre plata ya transferida.
  //
  // Si el cliente estaba pagando y manda una imagen, se avisa aunque no se
  // sepa qué tiene: el admin recibe la foto y decide. Un aviso de más cuesta
  // una mirada; uno de menos cuesta la venta y la confianza.
  if (!d.trim()) return etapaDeCobro;

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

/**
 * Deja anotado, junto al pago, lo que el cotejo de la vision marco como NO
 * cuadrado.
 *
 * Va aparte de `registrarComprobante` porque el cotejo corre DESPUES de
 * registrar (necesita la imagen ya guardada y el producto resuelto). Pasarlo
 * como argumento de registro seria un campo que nunca llega — el patron de
 * "codigo correcto que nadie llama" que ya aparecio varias veces en este repo.
 *
 * Esto es lo que despues le explica al cliente por que se le rechazo: "todavia
 * no veo el pago reflejado" es cierto pero inutil, y el cliente vuelve a
 * mandar la misma captura sin saber que corregir.
 */
export async function anotarMotivos(pagoId: number, motivos: string[]): Promise<void> {
  if (!pagoId || !motivos?.length) return;
  try {
    await db
      .update(payments)
      .set({ metadata: JSON.stringify({ cotejo: motivos.slice(0, 6) }).slice(0, 2000) })
      .where(eq(payments.id, pagoId));
  } catch (e: any) {
    // Sin motivos anotados el rechazo sale con el texto general: se pierde el
    // detalle, no la venta.
    logger.warn({ err: e?.message, pagoId }, "[Pago] no se pudieron anotar los motivos del cotejo");
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
  /** Lo que la vision leyo del comprobante, ya cotejado (`leer-comprobante.ts`). */
  lectura?: string | null;
  /** Lo que dice la bandeja del dueño (`pagos-por-correo.ts`). */
  correo?: string | null;
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

  // Lo que se leyó del comprobante va ANTES de los botones: es lo que hace
  // falta para decidir, y en el celular lo de abajo es lo que se ve primero
  // pero lo de arriba es lo que se lee.
  if (p.lectura) {
    l.push(``);
    l.push(String(p.lectura));
  }

  // El cruce con el correo del banco va después de la lectura de la captura:
  // primero lo que el cliente manda (falsificable), después lo que el banco
  // avisa (no falsificable). Ese orden le da al dueño la jerarquía correcta.
  if (p.correo) {
    l.push(``);
    l.push(String(p.correo));
  }

  l.push(``);
  l.push(`Revisa que el dinero esté en tu cuenta y responde:`);
  // Ojo con la redacción de esta línea: es una LEYENDA, no un comando.
  // Escrita como "*1* = aprobar" el test de ida y vuelta la tomaba por una
  // línea de acción y pedía poder leerla de vuelta, cosa que no tiene sentido.
  // Empezando con un verbo queda claro para el admin y para el test.
  l.push(`Respondeme *1* para aprobar, o *2* para rechazar.`);
  l.push(``);
  l.push(`_O si preferís:_`);
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
/**
 * El sistema imprimía una instrucción que él mismo no sabía leer.
 *
 * `avisoParaElAdmin` le dice al admin, con todas las letras:
 *
 *     ✅ *APROBAR 47*
 *     ❌ *RECHAZAR 47*
 *
 * Y en el celular lo natural es dejar pulsada esa línea y copiarla. WhatsApp
 * copia el texto CRUDO, o sea con los asteriscos y con el emoji adelante. El
 * parser estaba anclado con `^` a la palabra, así que "*RECHAZAR 47*" y
 * "❌ RECHAZAR 47" no casaban con nada.
 *
 * Reportado por el admin el 2026-09-06: "recibí el mensaje para aceptar o
 * rechazar el comprobante, lo rechacé, pero nunca le entregó el mensaje al
 * cliente diciendole que la transferencia no era correcta".
 *
 * Y el daño no termina ahí: al no parsear, el mensaje del admin sigue de
 * largo hasta el agente de VENTAS, el pago queda en `pending` para siempre y
 * el cliente no se entera de nada.
 *
 * Se limpian los adornos antes de leer: formato de WhatsApp (* _ ~ `),
 * comillas, viñetas y todo lo que no sea letra al principio de la línea.
 */
function sinAdornos(texto: string): string {
  return String(texto || "")
    .replace(/[*_~`]/g, "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    // Todo lo que no sea letra al principio: emojis, viñetas, comillas, guiones.
    .replace(/^[^a-z0-9]+/i, "")
    .trim();
}

export function leerDecisionDelAdmin(
  texto: string,
): { accion: "aprobar" | "rechazar"; pagoId: number; correo?: string; razon?: string } | null {
  const t = sinAdornos(texto);
  const m = t.match(
    /^(aprobar|aprobado|apruebo|ok|confirmar|confirmo|rechazar|rechazo|rechazado|no)\s*#?\s*(\d{1,9})\b\s*(.*)/,
  );
  if (!m) return null;
  const accion = /^(rechaz|no)/.test(m[1]!) ? "rechazar" : "aprobar";
  const resto = (m[3] || "").trim();
  // La razón es todo lo que queda después del número, excluyendo el correo
  const razon = resto.replace(/[^\s@]+@[^\s@]+\.[^\s@]+/, "").trim() || undefined;
  const correoMatch = resto.match(/([^\s@]+@[^\s@]+\.[^\s@]+)/);
  return { accion, pagoId: Number(m[2]), correo: correoMatch?.[1] || undefined, razon };
}

/**
 * La respuesta corta: "1" es aprobar, "2" es rechazar.
 *
 * El admin lo pidio asi el 2026-09-06: "necesito que sea facil el envio de la
 * informacion, en vez de escribir la palabra literal yo mando 1 o 2".
 *
 * Tiene razon: escribir "RECHAZAR 47" en el celular, con el numero correcto,
 * es justo el tipo de friccion que hace que un comprobante se quede sin
 * revisar. Y el numero del pago ya lo sabe el servidor.
 *
 * ⚠️ Un "1" suelto es ambiguo por naturaleza, asi que NO decide por si solo:
 * quien llama tiene que comprobar que haya EXACTAMENTE UN comprobante
 * pendiente de ese negocio. Con dos pendientes se le pregunta cual, y con
 * ninguno el mensaje sigue su camino normal como cualquier otro texto.
 *
 * Por eso tampoco se aceptan "si" ni "no": el admin le escribe al bot como
 * cualquier persona, y esas dos palabras aparecen solas todo el tiempo. Un
 * "1" o un "2" sueltos, en cambio, no son conversacion.
 */
export function decisionCorta(texto: string): "aprobar" | "rechazar" | null {
  const t = sinAdornos(texto).replace(/[.,;:!?)\]]+$/, "").trim();
  if (t === "1") return "aprobar";
  if (t === "2") return "rechazar";
  return null;
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
/**
 * El rechazo, con el motivo concreto.
 *
 * "todavia no veo el pago reflejado" es cierto pero inutil: el cliente no sabe
 * que corregir y vuelve a mandar la misma captura. `leer-comprobante.ts` ya
 * dejo anotado QUE no cuadraba (la cuenta no era la del negocio, el monto no
 * alcanzaba, la imagen no era un comprobante), asi que se le dice.
 *
 * Pedido del admin el 2026-09-06: "que mande la informacion diciendo aprobado
 * o pago incorrecto por esto y esto al WhatsApp del cliente".
 *
 * Se dicen los HECHOS, no acusaciones: casi siempre es un error honesto
 * --transfirio a otra cuenta, mando la captura equivocada, le falto plata--.
 * Tratar de estafador a quien se equivoco de captura pierde una venta buena.
 */
export function motivoDelRechazo(pago: any): string {
  let motivos: string[] = [];
  try {
    const meta = typeof pago?.metadata === "string" ? JSON.parse(pago.metadata) : pago?.metadata;
    const c = meta?.cotejo;
    if (Array.isArray(c)) motivos = c.filter((x: any) => typeof x === "string" && x.trim()).slice(0, 4);
  } catch {
    /* sin motivos anotados se manda el texto general */
  }

  if (motivos.length === 0) {
    return (
      "Revisé el comprobante y todavía no veo el pago reflejado 🤔 " +
      "¿Puedes verificar que la transferencia haya salido y mandarme el soporte de nuevo?"
    );
  }

  return [
    "Revisé el comprobante y hay algo que no me cuadra 🤔",
    "",
    ...motivos.map((m) => `• ${m}`),
    "",
    "¿Puedes revisarlo y mandarme el soporte de nuevo? Si ya lo enviaste bien, avísame y lo verifico otra vez 🙌",
  ].join("\n");
}

export async function aplicarDecision(
  pagoId: number,
  accion: "aprobar" | "rechazar",
  quien: string,
  razon?: string,
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

    // ── Si el admin rechaza, construir mensaje específico ────────────────
    let mensajeClienteRechazo: string | null = null;
    if (!aprobado) {
      // Buscar datos del producto para comparar
      let productoNombre: string | null = null;
      let montoEsperado: number | null = null;
      if (pago.productId) {
        try {
          const [prod] = await db.select({ name: products.name, price: products.price })
            .from(products).where(eq(products.id, pago.productId)).limit(1);
          if (prod) {
            productoNombre = prod.name;
            montoEsperado = Number(prod.price);
          }
        } catch {}
      }

      const montoPagado = Number(pago.amount);
      const pagador = pago.payerName || "el cliente";
      const cuentaOrigen = pago.payerAccount || null;

      // Detectar qué está mal
      const problemas: string[] = [];
      if (razon) {
        problemas.push(razon);
      }
      if (montoEsperado && montoPagado && Math.abs(montoPagado - montoEsperado) > 1) {
        problemas.push(`el monto de $${Math.round(montoPagado).toLocaleString("es-CO")} no coincide con el precio de $${Math.round(montoEsperado).toLocaleString("es-CO")}`);
      }

      if (problemas.length > 0) {
        const listaProblemas = problemas.map(p => `  • ${p}`).join("\n");
        mensajeClienteRechazo = [
          `Hola ${pagador}, revisé tu comprobante y encontré estos problemas:`,
          ``,
          listaProblemas,
          ``,
          cuentaOrigen ? `En tu comprobante aparece la cuenta: *${cuentaOrigen}*` : null,
          productoNombre ? `Producto: *${productoNombre}*` : null,
          `¿Puedes verificar los datos y mandarme el comprobante correcto? 🙏`,
        ].filter(Boolean).join("\n");
      } else {
        // Sin razón específica, mensaje genérico pero más informativo
        mensajeClienteRechazo = [
          `Hola ${pagador}, revisé tu comprobante del pago`,
          productoNombre ? `del producto *${productoNombre}*` : "",
          `y no pude confirmarlo 🤔`,
          ``,
          cuentaOrigen ? `En el comprobante aparece la cuenta: *${cuentaOrigen}*` : null,
          `¿Puedes verificar que:`,
          `  • El monto sea el correcto`,
          `  • La cuenta de destino sea la nuestra`,
          `  • La fecha sea reciente`,
          ``,
          `Mándame el comprobante de nuevo y lo reviso 👍`,
        ].filter(Boolean).join("\n");
      }
    }

    await db
      .update(payments)
      .set({
        status: aprobado ? "confirmed" : "rejected",
        verifiedAt: new Date(),
        verifiedBy: quien,
        notes: razon || pago.notes,
        updatedAt: new Date(),
      })
      .where(eq(payments.id, pagoId));

    logger.info({ pagoId, accion, quien, razon }, "[Pago] Decisión del admin aplicada");

    return {
      ok: true,
      mensajeParaElAdmin: aprobado
        ? `✅ Listo, comprobante ${pagoId} aprobado. Le aviso al cliente.`
        : `❌ Comprobante ${pagoId} rechazado${razon ? `: ${razon}` : ""}. Le aviso al cliente.`,
      mensajeParaElCliente: aprobado
        ? `¡Confirmado tu pago! 🎉 Te paso el acceso enseguida.`
        : motivoDelRechazo(pago),
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
  // Respaldo SOLO para el dueño del servidor: a otro negocio sin teléfono sus
  // comprobantes (nombres y montos de SUS clientes) le llegaban al dueño.
  const { envSoloDelDueno } = await import("./respaldo-del-dueno");
  const env = envSoloDelDueno(tenantId, process.env.ADMIN_PHONE).replace(/[^0-9]/g, "");
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
  return (await tenantsQueAdministra(phone)).length > 0;
}

/**
 * DE QUÉ negocios es admin este número.
 *
 * Antes esto era un booleano suelto, y ahí estaba el agujero: la consulta
 * comparaba contra el `contact_phone` de TODOS los negocios sin filtrar, así
 * que en un SaaS con varios clientes el admin del negocio A podía aprobar un
 * pago del negocio B escribiendo "aprobar 47". Nadie lo notaba: el cliente de
 * B recibía su producto y el dueño de B nunca supo quién lo autorizó.
 *
 * Hoy no expone a nadie --hay un solo negocio real-- pero el producto se está
 * vendiendo a otros, y este es exactamente el tipo de cosa que no se arregla
 * después: para cuando se nota, ya hubo entregas aprobadas por quien no debía.
 *
 * ── El caso del ADMIN_PHONE del entorno ─────────────────────────────────
 *
 * Es un respaldo global, así que por sí solo no dice de QUÉ negocio es admin.
 * Se le conceden únicamente los negocios cuyo `contact_phone` está vacío --que
 * son exactamente aquellos a los que `telefonoDelAdmin` le mandaría el aviso a
 * ese mismo número. Si un negocio cargó su teléfono, el del entorno ya no
 * recibe sus avisos y tampoco puede aprobar sus pagos.
 */
/**
 * ¿Son el mismo teléfono, aunque uno traiga el indicativo del país y el otro no?
 *
 * WhatsApp entrega el número SIEMPRE con indicativo ("573136174267"), pero el
 * dueño del negocio escribe su teléfono en el panel como lo escribe todo el
 * mundo en Colombia: "3136174267". El propio bot lo muestra así en su bloque
 * de pago ("Nequi 3136174267 Duvier Mena").
 *
 * La comparación era EXACTA, así que esos dos no casaban: el dueño de un
 * negocio nuevo no podía aprobar NINGUNO de sus pagos, y su "APROBAR 47" se
 * iba de largo hasta el agente de ventas, que le contestaba como si fuera un
 * cliente. Falla en silencio y en el peor lugar: el cobro.
 *
 * No se vuelve a `includes()` —que es lo que hace `isAdminPhone` y por lo que
 * un número que contenga al del admin aprobaría dinero ajeno—. La regla es
 * estrecha a propósito:
 *
 *   · los dos tienen que tener al menos 8 dígitos,
 *   · el corto tiene que tener al menos 9 (un número de móvil entero),
 *   · la diferencia no puede pasar de 3 dígitos (cabe un indicativo, no más),
 *   · y el largo tiene que TERMINAR en el corto.
 *
 * "3136174267" vs "573136174267" casa. "6174267" vs "573136174267" no.
 */
export function mismoTelefono(a: string, b: string): boolean {
  const A = String(a || "").replace(/[^0-9]/g, "");
  const B = String(b || "").replace(/[^0-9]/g, "");
  if (A.length < 8 || B.length < 8) return false;
  if (A === B) return true;

  const largo = A.length >= B.length ? A : B;
  const corto = A.length >= B.length ? B : A;
  if (corto.length < 9) return false;
  if (largo.length - corto.length > 3) return false;
  return largo.endsWith(corto);
}

export async function tenantsQueAdministra(phone: string): Promise<number[]> {
  const quien = String(phone || "").replace(/[^0-9]/g, "");
  if (quien.length < 8) return [];

  try {
    const filas = await db
      .select({ id: tenants.id, contactPhone: tenants.contactPhone })
      .from(tenants);

    // La comparación es EXACTA a propósito: `isAdminPhone` (admin-commands.ts)
    // usa `includes()` en las dos direcciones, así que un número que contenga
    // al del admin como subcadena pasaría el chequeo -- y este chequeo aprueba
    // dinero.
    const propios = filas
      .filter((t: any) => mismoTelefono(t.contactPhone, quien))
      .map((t: any) => Number(t.id));
    if (propios.length > 0) return propios;

    // El ADMIN_PHONE del .env administra SOLO al negocio dueño del servidor.
    // Antes aprobaba pagos de TODOS los negocios sin teléfono propio.
    const delEntorno = String(process.env.ADMIN_PHONE || "").replace(/[^0-9]/g, "");
    if (delEntorno && mismoTelefono(delEntorno, quien)) {
      const { esDuenoDelServidor } = await import("./respaldo-del-dueno");
      return filas
        .filter((t: any) => esDuenoDelServidor(Number(t.id)) && String(t.contactPhone || "").replace(/[^0-9]/g, "").length < 8)
        .map((t: any) => Number(t.id));
    }
    return [];
  } catch {
    return [];
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
  let decision = leerDecisionDelAdmin(texto);

  // ── El "1" o "2" suelto ──────────────────────────────────────
  //
  // No trae el numero del pago, asi que solo se puede resolver mirando que
  // hay pendiente. Se pide EXACTAMENTE UNO: con dos, aprobar el que no era
  // entrega un producto sin cobrar y deja al que si pago esperando.
  const corta = decision ? null : decisionCorta(texto);
  const suyos = await tenantsQueAdministra(phone);
  if (suyos.length === 0) return null;

  if (!decision && corta) {
    const pendientes = await db
      .select({ id: payments.id, payerName: payments.payerName, amount: payments.amount })
      .from(payments)
      .where(and(inArray(payments.tenantId, suyos), eq(payments.status, "pending")))
      .orderBy(desc(payments.id))
      .limit(6);

    if (pendientes.length === 0) return null; // no era una decision: sigue su camino

    if (pendientes.length > 1) {
      const l = [
        `Tenés ${pendientes.length} comprobantes esperando, así que no sé a cuál le decis "${texto.trim()}":`,
        ``,
        ...pendientes.map((x: any) =>
          `• *${x.id}* — ${x.payerName || "sin nombre"} · $${Number(x.amount || 0).toLocaleString("es-CO")}`,
        ),
        ``,
        `Respondeme con el numero: *1 ${pendientes[0]!.id}* para aprobar ese, o *2 ${pendientes[0]!.id}* para rechazarlo.`,
      ];
      return { paraElAdmin: l.join("\n"), paraElCliente: null };
    }

    decision = { accion: corta, pagoId: Number(pendientes[0]!.id) };
    logger.info({ phone, pagoId: decision.pagoId, accion: corta }, "[Pago] decision corta resuelta contra el unico pendiente");
  }

  if (!decision) return null;

  // Solo se toma si HAY un comprobante pendiente con ese número Y ES DE UN
  // NEGOCIO SUYO. El filtro por tenant faltaba: sin él, cualquier admin del
  // sistema podía aprobar la entrega de un pago ajeno con solo acertarle al
  // número del comprobante, que además va impreso en el aviso.
  const [pago] = await db
    .select({ id: payments.id, status: payments.status })
    .from(payments)
    .where(and(eq(payments.id, decision.pagoId), inArray(payments.tenantId, suyos)))
    .limit(1);
  if (!pago || pago.status !== "pending") return null;

  const r = await aplicarDecision(decision.pagoId, decision.accion, `whatsapp:${phone}`, decision.razon);
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
        ? `\n\n⚠️ Ese producto no tiene enlace de entrega cargado: el acceso se lo tienes que mandar tú.`
        : `\n\n⚠️ No pude identificar el producto de esa venta: el acceso se lo tienes que mandar tú.`;
      logger.warn({ pagoId: decision.pagoId, productId: r.productId }, "[Entrega] Pago aprobado SIN enlace de entrega");
    }
  }

  // ── El comprobante de compra ──────────────────────────────────────────────
  //
  // Pedido del admin: "necesito que al cliente pagar generes una factura".
  // Aclarado después: "solo es como un comprobante de que pagó y ya".
  //
  // Va DESPUÉS de la entrega y en el mismo mensaje: el cliente acaba de pagar
  // y lo primero que quiere es su acceso, no un papel. Pero le queda el número
  // para poder referenciar la compra si algo sale mal.
  //
  // Se llama COMPROBANTE y no factura a propósito: este sistema no emite
  // facturación electrónica ni tiene resolución de la DIAN, y llamar factura a
  // algo que no lo es le crea un problema legal al negocio que lo manda.
  if (r.aprobado) {
    try {
      const { reciboDeVenta, numeroDeRecibo } = await import("./cobro-y-entrega");
      // Los datos salen de la fila del pago y del catálogo, no del resultado
      // de la decisión: ahí solo viajan los ids. El monto REAL es el que quedó
      // registrado en el pago, no el precio de lista -- si el admin cobró otra
      // cosa, el comprobante tiene que decir lo que se pagó.
      const [fila] = await db.select().from(payments).where(eq(payments.id, decision.pagoId)).limit(1);
      const [conv] = r.conversationId
        ? await db.select({ nombre: conversations.contactName }).from(conversations).where(eq(conversations.id, r.conversationId)).limit(1)
        : [undefined as any];
      const [prod] = r.productId
        ? await db.select({ nombre: products.name }).from(products).where(eq(products.id, r.productId)).limit(1)
        : [undefined as any];

      const recibo = reciboDeVenta({
        numero: numeroDeRecibo(decision.pagoId),
        cliente: conv?.nombre || "Cliente",
        producto: prod?.nombre || null,
        monto: (fila as any)?.amount ?? null,
        moneda: (fila as any)?.currency ?? null,
        metodo: (fila as any)?.method || "Transferencia",
        // El recibo lo emite el NEGOCIO, no la plataforma: encabezarlo con
        // "VentasPro" seria decirle al cliente que le cobro otra empresa.
        negocio: await nombreDelNegocio(r.tenantId),
      });
      paraCliente = `${paraCliente}

${recibo}`;
    } catch (e: any) {
      // Sin comprobante la venta igual se entrega: es un extra, no un
      // requisito. Pero queda registrado que no salió.
      logger.warn({ err: e?.message, pagoId: decision.pagoId }, "[Entrega] No se pudo armar el comprobante");
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

/**
 * El nombre comercial del negocio, para encabezar el recibo.
 *
 * Devuelve null si no se puede leer: el recibo sale igual sin encabezado,
 * antes que no salir.
 */
async function nombreDelNegocio(tenantId: number | null): Promise<string | null> {
  if (!tenantId) return null;
  try {
    const [t] = await db
      .select({ brandName: tenants.brandName })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);
    return String((t as any)?.brandName || "").trim() || null;
  } catch {
    return null;
  }
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
    return `✅ *¡Pago confirmado!* 🎉\n\nAcá tienes tu acceso a *${producto.name}*:\n\n${acceso}\n\n¡Que lo disfrutes! Si tienes dudas, escríbeme por aquí.`;
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
