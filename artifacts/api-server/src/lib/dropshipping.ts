/**
 * Agente de dropshipping: pedidos de productos FÍSICOS.
 *
 * Un producto digital se entrega con un link y se acabó. Uno físico necesita
 * saber a dónde va, quién lo recibe y con qué documento — y nada de eso
 * existía: ni `leads` ni `conversations` tenían un solo campo de dirección, y
 * no había tabla de pedidos. El agente podía cerrar la venta y los datos se
 * perdían en el aire.
 *
 * Este módulo hace tres cosas:
 *   1. Leer los datos de envío de lo que el cliente escribe, sin formulario.
 *   2. Saber qué falta y pedir UNA cosa a la vez.
 *   3. Cuando está completo, crear el pedido en WooCommerce (que es quien lo
 *      empuja a Dropi — la API de Dropi rechaza nuestros tokens por diseño,
 *      ver dropi.ts).
 */
import { db, pool, products } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

/** Los datos mínimos para que una transportadora entregue en Colombia. */
export interface DatosDeEnvio {
  nombre?: string | null;
  telefono?: string | null;
  documento?: string | null;
  departamento?: string | null;
  ciudad?: string | null;
  direccion?: string | null;
  barrio?: string | null;
  notas?: string | null;
}

export interface PedidoDropshipping extends DatosDeEnvio {
  id: number;
  tenantId: number;
  conversationId: number | null;
  productId: number | null;
  productName: string | null;
  quantity: number;
  unitPrice: string | null;
  total: string | null;
  metodoPago: string;
  estado: string;
  wooOrderId: number | null;
  wooError: string | null;
}

/**
 * Orden en que se le piden los datos al cliente.
 *
 * El orden importa: se arranca por lo que la gente ya tiene en la cabeza
 * (nombre, ciudad) y se deja el documento para el final, que es lo que más
 * fricción genera. Pedir todo junto en un solo mensaje es la forma más rápida
 * de que alguien no conteste.
 */
export const CAMPOS_DE_ENVIO: Array<{
  campo: keyof DatosDeEnvio;
  pregunta: string[];
  obligatorio: boolean;
}> = [
  {
    campo: "nombre",
    obligatorio: true,
    pregunta: [
      "¿A nombre de quién hacemos el envío? 📦",
      "Perfecto 🙌 ¿Cuál es el nombre completo de quien recibe?",
      "Genial, ¿me confirmás el nombre completo para el envío? 😊",
    ],
  },
  {
    campo: "ciudad",
    obligatorio: true,
    pregunta: [
      "¿A qué ciudad lo enviamos? 🏙️",
      "¿En qué ciudad estás? Así calculo la entrega 📍",
      "Cuéntame la ciudad y te digo cuánto se demora 🚚",
    ],
  },
  {
    campo: "departamento",
    obligatorio: true,
    pregunta: [
      "¿Y el departamento? 🗺️",
      "¿De qué departamento es esa ciudad?",
      "Me falta el departamento para completar el envío 🗺️",
    ],
  },
  {
    campo: "direccion",
    obligatorio: true,
    pregunta: [
      "¿Cuál es la dirección exacta? (calle, número, apto si aplica) 🏠",
      "Pasame la dirección completa para la entrega 🏠",
      "¿A qué dirección llegamos? Poné calle y número 📮",
    ],
  },
  {
    campo: "telefono",
    obligatorio: true,
    pregunta: [
      "¿A qué número te llama el transportador? 📱",
      "Dejame un celular de contacto para la entrega 📱",
      "¿Qué número le doy al mensajero? 📞",
    ],
  },
  {
    campo: "documento",
    obligatorio: true,
    pregunta: [
      "Por último, ¿tu número de cédula? Lo pide la transportadora 🪪",
      "Me falta la cédula de quien recibe (requisito de la transportadora) 🪪",
      "¿Me das el número de documento? Es lo último que necesito 🪪",
    ],
  },
  {
    campo: "barrio",
    obligatorio: false,
    pregunta: ["¿De qué barrio? Ayuda a que llegue más rápido 📍"],
  },
];

/**
 * Hechos del negocio para productos físicos.
 *
 * Van acá, en un solo lugar, porque el agente NO debe inventarlos ni
 * "estimarlos" según la ciudad: el dueño los fijó y son iguales para todos.
 */
export const HECHOS_DROPSHIPPING = {
  /** Instrucción del dueño (17-08-2026): "las entregas son entre 3 a 5 días siempre". */
  diasDeEntrega: "3 a 5 días hábiles",
  /** En dropshipping colombiano lo normal es pagar al recibir. */
  pagoPorDefecto: "contraentrega",
} as const;

/** Bloque que se le inyecta al agente para que no invente estos datos. */
export function contextoDeDropshipping(): string {
  return [
    "🚚 PRODUCTO FÍSICO — ENTREGA A DOMICILIO",
    `• Tiempo de entrega: ${HECHOS_DROPSHIPPING.diasDeEntrega}. SIEMPRE ese, para toda Colombia.`,
    "  Es un dato FIJO del negocio: decilo con seguridad y NUNCA lo cambies según la ciudad ni lo estimes.",
    "• Pago CONTRA ENTREGA: el cliente paga en efectivo cuando recibe el paquete. No se cobra por adelantado.",
    "• NO se entrega por Google Drive ni por link: esto se despacha físicamente.",
    "• Para despacharlo necesitas: nombre completo, ciudad, departamento, dirección, celular y cédula.",
    "  Pedí UNO a la vez, con naturalidad. Nunca mandes la lista completa de golpe.",
    "• Nunca inventes número de guía ni fecha exacta de llegada: solo el rango de arriba.",
  ].join("\n");
}

// ─── Lectura de datos desde texto libre ──────────────────────────────────────

/** Departamentos de Colombia, para no confundir la ciudad con el departamento. */
const DEPARTAMENTOS = [
  "amazonas", "antioquia", "arauca", "atlantico", "bolivar", "boyaca", "caldas",
  "caqueta", "casanare", "cauca", "cesar", "choco", "cordoba", "cundinamarca",
  "guainia", "guaviare", "huila", "la guajira", "guajira", "magdalena", "meta",
  "narino", "norte de santander", "putumayo", "quindio", "risaralda", "san andres",
  "santander", "sucre", "tolima", "valle del cauca", "valle", "vaupes", "vichada",
  "bogota", "bogota dc",
];

/** Ciudades grandes con su departamento: si dicen solo la ciudad, se deduce. */
const CIUDAD_A_DEPARTAMENTO: Record<string, string> = {
  bogota: "Bogotá D.C.", medellin: "Antioquia", cali: "Valle del Cauca",
  barranquilla: "Atlántico", cartagena: "Bolívar", cucuta: "Norte de Santander",
  bucaramanga: "Santander", pereira: "Risaralda", "santa marta": "Magdalena",
  ibague: "Tolima", manizales: "Caldas", villavicencio: "Meta", pasto: "Nariño",
  monteria: "Córdoba", neiva: "Huila", armenia: "Quindío", popayan: "Cauca",
  sincelejo: "Sucre", valledupar: "Cesar", tunja: "Boyacá", riohacha: "La Guajira",
  quibdo: "Chocó", florencia: "Caquetá", yopal: "Casanare", arauca: "Arauca",
  mocoa: "Putumayo", leticia: "Amazonas", envigado: "Antioquia",
  itagui: "Antioquia", bello: "Antioquia", soacha: "Cundinamarca",
  soledad: "Atlántico", palmira: "Valle del Cauca", buenaventura: "Valle del Cauca",
};

/**
 * ¿Aparece `palabra` como palabra entera dentro de `texto`?
 *
 * A propósito sin construir un RegExp: armarlo con un template literal exige
 * escapar la barra invertida y una sola barra convierte `\b` en el carácter
 * backspace, con lo que el patrón deja de coincidir con nada. Pasó en este
 * mismo archivo y las pruebas lo cazaron. Un indexOf con chequeo de bordes
 * hace lo mismo y no se puede romper al editarlo.
 */
function contienePalabra(texto: string, palabra: string): boolean {
  let desde = 0;
  for (;;) {
    const i = texto.indexOf(palabra, desde);
    if (i < 0) return false;
    const antes = i === 0 ? " " : texto[i - 1]!;
    const despues = i + palabra.length >= texto.length ? " " : texto[i + palabra.length]!;
    if (!/[a-z0-9]/i.test(antes) && !/[a-z0-9]/i.test(despues)) return true;
    desde = i + 1;
  }
}

const sinTildes = (t: string) =>
  t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

/**
 * Saca del texto del cliente los datos de envío que aparezcan.
 *
 * Deliberadamente conservador: prefiere NO capturar antes que capturar mal.
 * Un dato mal leído manda el paquete a otra parte y ese error cuesta plata
 * real; uno que no se detecta solo hace que el agente vuelva a preguntar.
 */
export function extraerDatosDeEnvio(
  texto: string,
  yaTengo: DatosDeEnvio = {},
): Partial<DatosDeEnvio> {
  const encontrado: Partial<DatosDeEnvio> = {};
  const t = (texto || "").trim();
  if (!t) return encontrado;
  const plano = sinTildes(t);

  // Cédula: 6 a 10 dígitos, casi siempre anunciada. Va ANTES que el teléfono
  // porque un celular colombiano también es una tira de dígitos.
  const doc = t.match(/\b(?:c[eé]dula|cc|c\.c\.?|documento|nit|identificaci[oó]n)\b\s*:?\s*([\d.,\s]{6,15})/i);
  if (doc && !yaTengo.documento) {
    const soloDigitos = doc[1]!.replace(/\D/g, "");
    if (soloDigitos.length >= 6 && soloDigitos.length <= 10) encontrado.documento = soloDigitos;
  }

  // Celular colombiano: empieza en 3 y tiene 10 dígitos.
  const tel = t.match(/(?:\+?57[\s.-]?)?\b(3\d{2}[\s.-]?\d{3}[\s.-]?\d{4})\b/);
  if (tel && !yaTengo.telefono) {
    const n = tel[1]!.replace(/\D/g, "");
    // Si ese mismo número ya se leyó como documento, no es teléfono.
    if (n !== encontrado.documento) encontrado.telefono = n;
  }

  // Ciudad conocida primero: resuelve tambien el departamento sin preguntarlo.
  // Va ANTES que el departamento porque "bogota" figura en las dos listas y
  // la ciudad es el dato mas especifico.
  if (!yaTengo.ciudad) {
    const ciu = Object.keys(CIUDAD_A_DEPARTAMENTO).find((c) => contienePalabra(plano, c));
    if (ciu) {
      encontrado.ciudad = ciu.replace(/\b\w/g, (c) => c.toUpperCase());
      if (!yaTengo.departamento) encontrado.departamento = CIUDAD_A_DEPARTAMENTO[ciu]!;
    }
  }

  // Departamento explícito, solo si la ciudad no lo resolvió.
  if (!yaTengo.departamento && !encontrado.departamento) {
    const dep = DEPARTAMENTOS.find((d) => contienePalabra(plano, d));
    if (dep) encontrado.departamento = dep.replace(/\b\w/g, (c) => c.toUpperCase());
  }

  // Dirección.
  //
  // Se prefiere SIEMPRE la forma estructurada (calle/carrera + número) sobre
  // la anunciada. Con la anunciada sola pasaban dos cosas medidas en pruebas:
  // "vivo en Bogotá" guardaba "Bogotá" como dirección, y en un mensaje donde
  // el cliente manda todo junto la captura se tragaba el resto de la frase
  // ("Medellín, dirección Calle 45 #30-12, barrio Laureles, mi celular
  // 3115557788" entero como dirección). Una dirección mal leída manda el
  // paquete a otro lado, así que acá conviene quedarse corto.
  if (!yaTengo.direccion) {
    const dirForma = t.match(/\b((?:calle|cll?|carrera|cra?|kr|avenida|av|diagonal|dg|transversal|tv|tr|manzana|mz|circular)\.?\s*\d+[^\n,;]{2,80})/i);
    const dirMarcada = t.match(/\b(?:direcci[oó]n|dir|vivo en|env[ií]a(?:lo|melo)? a|llega a|queda en)\b\s*:?\s*(.{6,120})/i);
    let dir = dirForma?.[1] || dirMarcada?.[1] || "";
    // Corta en cuanto empieza OTRO dato: el cliente los encadena con comas.
    dir = dir.split(/\s*[,;]\s*(?=barrio|mi\s|cel|tel|c[eé]dula|cc\b|documento|nombre)/i)[0]!;
    dir = dir.replace(/\s+/g, " ").trim().replace(/[.,;]+$/, "");
    // Un nombre de ciudad o departamento suelto NO es una dirección.
    const soloLugar = !!CIUDAD_A_DEPARTAMENTO[sinTildes(dir)] || DEPARTAMENTOS.includes(sinTildes(dir));
    if (dir.length >= 6 && !soloLugar) encontrado.direccion = dir;
  }

  // Barrio, solo si viene anunciado.
  const bar = t.match(/\bbarrio\b\s*:?\s*([^\n,;.]{3,40})/i);
  if (bar && !yaTengo.barrio) encontrado.barrio = bar[1]!.trim();

  // Nombre: SOLO si viene anunciado. Adivinar el nombre a partir de una frase
  // suelta produce basura tipo "Quiero" o "Si señor" guardada como nombre del
  // destinatario, que es peor que no tenerlo.
  if (!yaTengo.nombre) {
    const nom = t.match(/\b(?:mi nombre es|me llamo|a nombre de|soy)\b\s*:?\s*([A-Za-zÁÉÍÓÚÑáéíóúñ]{3,20}(?:\s+[A-Za-zÁÉÍÓÚÑáéíóúñ]{2,20}){1,3})/i);
    if (nom) {
      const candidato = nom[1]!.trim();
      // "para mañana", "para el lunes" no son nombres.
      if (!/^(manana|mañana|hoy|el|la|los|las|un|una|mi|que|cuando|donde)\b/i.test(candidato)) {
        encontrado.nombre = candidato.replace(/\s+/g, " ");
      }
    }
  }

  return encontrado;
}

/** Campos obligatorios que todavía faltan, en el orden en que se preguntan. */
export function datosQueFaltan(d: DatosDeEnvio): Array<keyof DatosDeEnvio> {
  return CAMPOS_DE_ENVIO
    .filter((c) => c.obligatorio && !String(d[c.campo] ?? "").trim())
    .map((c) => c.campo);
}

export function pedidoCompleto(d: DatosDeEnvio): boolean {
  return datosQueFaltan(d).length === 0;
}

// ─── Persistencia ────────────────────────────────────────────────────────────

function aPedido(r: any): PedidoDropshipping {
  return {
    id: r.id, tenantId: r.tenant_id, conversationId: r.conversation_id,
    productId: r.product_id, productName: r.product_name, quantity: r.quantity,
    unitPrice: r.unit_price, total: r.total, metodoPago: r.metodo_pago,
    estado: r.estado, wooOrderId: r.woo_order_id, wooError: r.woo_error,
    nombre: r.nombre, telefono: r.telefono, documento: r.documento,
    departamento: r.departamento, ciudad: r.ciudad, direccion: r.direccion,
    barrio: r.barrio, notas: r.notas,
  };
}

/** El pedido en curso de una conversación (el que todavía no se despachó). */
export async function pedidoEnCurso(conversationId: number): Promise<PedidoDropshipping | null> {
  const { rows } = await pool.query(
    `SELECT * FROM dropshipping_orders
     WHERE conversation_id = $1 AND estado IN ('borrador', 'completo')
     ORDER BY id DESC LIMIT 1`,
    [conversationId],
  );
  return rows[0] ? aPedido(rows[0]) : null;
}

export async function abrirPedido(datos: {
  tenantId: number;
  // null cuando el pedido NO viene de una conversación de WhatsApp sino del
  // checkout de la tienda. La columna ya era nullable; el tipo pedía un número
  // porque hasta ahora el único que abría pedidos era el bot.
  conversationId: number | null;
  leadId?: number | null;
  productId: number;
  productName: string;
  unitPrice: number;
  quantity?: number;
  telefono?: string | null;
}): Promise<PedidoDropshipping> {
  const cantidad = datos.quantity || 1;
  const { rows } = await pool.query(
    `INSERT INTO dropshipping_orders
       (tenant_id, conversation_id, lead_id, product_id, product_name,
        quantity, unit_price, total, telefono, estado)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'borrador')
     RETURNING *`,
    [datos.tenantId, datos.conversationId, datos.leadId ?? null, datos.productId,
     datos.productName, cantidad, datos.unitPrice, datos.unitPrice * cantidad,
     datos.telefono ?? null],
  );
  logger.info({ pedidoId: rows[0].id, productId: datos.productId }, "[Dropshipping] Pedido abierto");
  return aPedido(rows[0]);
}

export async function guardarDatos(
  pedidoId: number,
  datos: Partial<DatosDeEnvio>,
): Promise<PedidoDropshipping | null> {
  const campos = Object.entries(datos).filter(([, v]) => String(v ?? "").trim());
  if (campos.length === 0) {
    const { rows } = await pool.query(`SELECT * FROM dropshipping_orders WHERE id = $1`, [pedidoId]);
    return rows[0] ? aPedido(rows[0]) : null;
  }
  const sets = campos.map(([k], i) => `${k} = $${i + 2}`).join(", ");
  const { rows } = await pool.query(
    `UPDATE dropshipping_orders SET ${sets}, updated_at = now() WHERE id = $1 RETURNING *`,
    [pedidoId, ...campos.map(([, v]) => v)],
  );
  if (!rows[0]) return null;
  const pedido = aPedido(rows[0]);
  // Cuando ya no falta nada, queda listo para despachar.
  if (pedido.estado === "borrador" && pedidoCompleto(pedido)) {
    await pool.query(`UPDATE dropshipping_orders SET estado = 'completo', updated_at = now() WHERE id = $1`, [pedidoId]);
    pedido.estado = "completo";
    logger.info({ pedidoId }, "[Dropshipping] Datos de envío completos");
  }
  return pedido;
}

// ─── Despacho a WooCommerce ──────────────────────────────────────────────────

/**
 * Crea el pedido real en WooCommerce, que es quien lo empuja a Dropi.
 *
 * No pasa por la API de Dropi a propósito: `api.dropi.co` rechaza por diseño
 * los tokens emitidos por su propio panel (comprobado el 17-08-2026 con el
 * token que usa Dropify, que sí funciona ahí). El camino que sirve es
 * WooCommerce + el plugin Dropify.
 */
export async function despacharPedido(
  pedido: PedidoDropshipping,
): Promise<{ ok: boolean; wooOrderId?: number; error?: string }> {
  if (!pedidoCompleto(pedido)) {
    return { ok: false, error: `Faltan datos: ${datosQueFaltan(pedido).join(", ")}` };
  }
  if (pedido.wooOrderId) {
    return { ok: true, wooOrderId: pedido.wooOrderId };
  }

  try {
    const { getWooCommerceService } = await import("./woocommerce");
    const woo = await getWooCommerceService(pedido.tenantId);
    if (!woo) {
      const e = "WooCommerce no está configurado para este negocio.";
      await pool.query(`UPDATE dropshipping_orders SET woo_error = $2, updated_at = now() WHERE id = $1`, [pedido.id, e]);
      return { ok: false, error: e };
    }

    // El id de WooCommerce vive en el metadata del producto local.
    const [local] = await db.select().from(products).where(eq(products.id, pedido.productId!)).limit(1);
    const meta: any = typeof local?.metadata === "string" ? JSON.parse(local.metadata) : local?.metadata;
    const wooProductId = Number(meta?.woocommerce?.id);
    if (!wooProductId) {
      const e = `El producto "${pedido.productName}" no está sincronizado con WooCommerce.`;
      await pool.query(`UPDATE dropshipping_orders SET woo_error = $2, updated_at = now() WHERE id = $1`, [pedido.id, e]);
      return { ok: false, error: e };
    }

    const partes = String(pedido.nombre).trim().split(/\s+/);
    const nombre = partes[0] || String(pedido.nombre);
    const apellido = partes.slice(1).join(" ") || ".";

    // `shipping` es lo que Dropify lee para despachar. Mandar solo `billing`
    // (que era lo único que armaba createOrderFromConversation) deja el pedido
    // sin dirección de entrega.
    const contacto = {
      first_name: nombre,
      last_name: apellido,
      address_1: String(pedido.direccion),
      address_2: pedido.barrio || "",
      city: String(pedido.ciudad),
      state: String(pedido.departamento),
      country: "CO",
      phone: String(pedido.telefono),
    };

    const orden = await woo.createOrder({
      billing: { ...contacto, email: `${pedido.telefono}@whatsapp.local` },
      shipping: contacto,
      line_items: [{ product_id: wooProductId, quantity: pedido.quantity }],
      payment_method: pedido.metodoPago === "contraentrega" ? "cod" : "bacs",
      payment_method_title: pedido.metodoPago === "contraentrega" ? "Pago contra entrega" : "Transferencia",
      status: "processing",
      customer_note: [
        "Pedido tomado por el agente de WhatsApp.",
        `Documento: ${pedido.documento}`,
        pedido.barrio ? `Barrio: ${pedido.barrio}` : "",
        pedido.notas ? `Notas: ${pedido.notas}` : "",
      ].filter(Boolean).join(" | "),
    } as any);

    const wooOrderId = Number(orden?.id);
    await pool.query(
      `UPDATE dropshipping_orders SET woo_order_id = $2, estado = 'enviado', woo_error = NULL, updated_at = now() WHERE id = $1`,
      [pedido.id, wooOrderId],
    );
    logger.info({ pedidoId: pedido.id, wooOrderId }, "[Dropshipping] Pedido creado en WooCommerce");
    return { ok: true, wooOrderId };
  } catch (e: any) {
    const error = e?.message || String(e);
    await pool.query(`UPDATE dropshipping_orders SET woo_error = $2, updated_at = now() WHERE id = $1`, [pedido.id, error]);
    logger.error({ pedidoId: pedido.id, error }, "[Dropshipping] Falló la creación en WooCommerce");
    return { ok: false, error };
  }
}
