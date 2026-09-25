/**
 * Agente de dropshipping: pedidos de productos FÍSICOS.
 *
 * Un producto digital se entrega con un link y se acabó. Uno físico necesita
 * saber a dónde va, quién lo recibe y con qué documento — y nada de eso
 * existía: ni `leads` ni `conversations` tenían un solo campo de dirección, y
 * no había tabla de pedidos. El agente podía cerrar la venta y los datos se
 * perdían en el aire.
 *
 * Este módulo hace cuatro cosas:
 *   1. Leer los datos de envío de lo que el cliente escribe, sin formulario.
 *   2. Saber qué falta y pedirlo TODO junto en una lista (decisión del dueño,
 *      11-09-2026: "mejor es pedirle todos los datos y luego verificamos").
 *   3. Con los datos completos, verificar la zona, mostrar el resumen y pedir
 *      una confirmación EXPLÍCITA. Nada se despacha con un dato a medias ni
 *      sin un "sí": en contraentrega un pedido mal creado lo paga el negocio.
 *   4. Recién con el "sí", crear el pedido en WooCommerce (que es quien lo
 *      empuja a Dropi — la API de Dropi rechaza nuestros tokens por diseño,
 *      ver dropi.ts).
 *
 * Estados: borrador → completo (faltan 0 datos) → por_confirmar (se mostró el
 * resumen) → confirmado (el cliente dijo que sí) → enviado (orden en Woo).
 */
import { db, pool, products } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";
import { CONDICIONES_DE_RESPALDO, esColombia, type CondicionesDelNegocio } from "./modelo-de-negocio";

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
  dropiEstado?: string | null;
  dropiOrderId?: string | null;
  dropiError?: string | null;
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
    obligatorio: false,
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

/**
 * Bloque que se le inyecta al agente para que no invente estos datos.
 *
 * Las condiciones vienen del NEGOCIO (perfil); sin perfil se usan las del
 * dueño de la plataforma como respaldo. Antes eran constantes: cualquier
 * otro negocio heredaba "3 a 5 días, contraentrega, envío incluido".
 */
export function contextoDeDropshipping(c: CondicionesDelNegocio = CONDICIONES_DE_RESPALDO): string {
  const pago = c.envio.pago === "contraentrega"
    ? "• Pago CONTRA ENTREGA: el cliente paga cuando recibe el paquete. No se cobra por adelantado."
    : c.envio.pago === "anticipado"
      ? "• El envío se paga ANTES del despacho (enlace o transferencia). No ofrezcas contraentrega."
      : "• Se puede pagar antes del despacho o contraentrega: preguntale cuál prefiere.";
  const costo = c.envio.costo === "incluido"
    ? "• El envío va INCLUIDO en el precio: no se cobra aparte ni se cotiza por ciudad."
    : `• Costo de envío: ${c.envio.costo}. Decilo tal cual; no lo estimes por ciudad.`;
  return [
    "🚚 PRODUCTO FÍSICO — ENTREGA A DOMICILIO",
    `• Tiempo de entrega: ${c.envio.plazo}, cobertura: ${c.envio.cobertura}.`,
    `  Es un dato ${c.fuente === "perfil" ? "confirmado por el negocio" : "FIJO del negocio"}: decilo con seguridad y NUNCA lo cambies según la ciudad ni lo estimes.`,
    costo,
    pago,
    "• NO se entrega por Google Drive ni por link: esto se despacha físicamente.",
    `• Para despacharlo necesitas: nombre completo, celular, dirección con barrio, ciudad, ${esColombia(c.pais) ? "departamento" : "estado o provincia"} y un punto de referencia.`,
    "  Cuando el cliente quiera comprar, pedíselos TODOS JUNTOS en una lista numerada (el sistema te dice cuáles faltan).",
    "  Después se verifican, se le muestra el resumen y se registra SOLO cuando él confirma con un sí.",
    "• Nunca inventes número de guía ni fecha exacta de llegada: solo el rango de arriba.",
    "• Nunca digas que el pedido quedó registrado si el sistema no te lo confirma abajo.",
  ].join("\n");
}

/** Cómo se le pide cada dato en la lista numerada (una línea por dato). */
const ETIQUETA_DEL_DATO: Record<keyof DatosDeEnvio, string> = {
  nombre: "Nombre y apellido completos",
  documento: "Cédula (la pide la transportadora)",
  telefono: "Celular de contacto",
  direccion: "Dirección completa: calle o carrera, número, torre o apto",
  barrio: "Barrio",
  ciudad: "Ciudad",
  departamento: "Departamento",
  notas: "Un punto de referencia cerca (panadería, parque, tienda)",
};

/**
 * La lista numerada con los datos que FALTAN, lista para que el agente la
 * pegue. Solo los que faltan: si el cliente ya mandó la mitad, no se le
 * vuelve a pedir lo que ya dio.
 */
export function listaDeDatosQueFaltan(d: DatosDeEnvio): string {
  const orden: Array<keyof DatosDeEnvio> = [
    // Sin "documento": el dueño lo sacó el 24-09-2026, no es necesario (Dropi
    // lo lleva solo como nota) y es el dato que más fricción genera.
    "nombre", "telefono", "direccion", "barrio", "ciudad", "departamento", "notas",
  ];
  const faltan = orden.filter((c) => !String(d[c] ?? "").trim());
  return faltan.map((c, i) => `${i + 1}. ${ETIQUETA_DEL_DATO[c]}`).join("\n");
}

/**
 * ¿La zona tiene despacho?
 *
 * El dueño dijo (11-09-2026) que envía a TODO el país y que "la ciudad es
 * verificable cuando el cliente envía los datos". No tenemos la cobertura
 * de la transportadora en vivo, así que lo verificable es esto: que el
 * departamento sea uno de Colombia y que, si la ciudad es conocida, coincida
 * con el departamento que escribió. Un "Medellín, Cundinamarca" se frena acá
 * antes de convertirse en un envío devuelto.
 */
export function verificarZona(d: DatosDeEnvio, pais?: string | null): { ok: boolean; motivo?: string } {
  const dep = sinTildes(String(d.departamento || ""));
  const ciu = sinTildes(String(d.ciudad || ""));
  if (!dep) return { ok: false, motivo: "falta el departamento" };
  // La lista de departamentos y ciudades es de Colombia. Para otro país lo
  // único verificable es que el dato exista: no se frena a un cliente de
  // Guadalajara porque "Jalisco" no está en una lista colombiana.
  if (!esColombia(pais)) return { ok: true };
  const depConocido = DEPARTAMENTOS.some((x) => x === dep || dep.startsWith(x));
  if (!depConocido) return { ok: false, motivo: `"${d.departamento}" no es un departamento de Colombia` };
  const esperado = CIUDAD_A_DEPARTAMENTO[ciu];
  if (esperado) {
    // "Bogotá" y "Bogotá D.C." son el mismo departamento: se compara por
    // prefijo en los dos sentidos, no por igualdad exacta.
    const limpio = (t: string) => sinTildes(t).replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();
    const a = limpio(esperado);
    const b = limpio(dep);
    if (!(a === b || a.startsWith(b) || b.startsWith(a))) {
      return { ok: false, motivo: `${d.ciudad} queda en ${esperado}, no en ${d.departamento}` };
    }
  }
  return { ok: true };
}

/**
 * El departamento de una ciudad grande, si se sabe ("Bogotá" → "Bogotá D.C.").
 * Para que el cliente que escribió solo la ciudad no tenga que contestar
 * otra pregunta más: lo usa el motor v2 al tomar el pedido.
 */
export function departamentoDeCiudad(ciudad: string | null | undefined): string | null {
  return CIUDAD_A_DEPARTAMENTO[sinTildes(String(ciudad || "")).replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim()] ?? null;
}

/** El resumen que se le muestra al cliente antes de pedirle el sí. */
export function resumenDelPedido(p: PedidoDropshipping, c: CondicionesDelNegocio = CONDICIONES_DE_RESPALDO): string {
  const precio = Number(p.total ?? p.unitPrice ?? 0);
  const lineas = [
    `📦 ${p.productName} × ${p.quantity}`,
    precio > 0 ? `💰 Total: $${precio.toLocaleString("es-CO")} COP (${c.envio.costo === "incluido" ? "envío incluido" : `envío ${c.envio.costo}`})` : "",
    `💵 Pago: ${p.metodoPago === "contraentrega" ? "contraentrega, al recibir" : p.metodoPago}`,
    `👤 ${p.nombre}`,
    // La cédula ya no se pide: sin esto el resumen mostraba "🪪 Cédula undefined".
    ...(String(p.documento ?? "").trim() && String(p.documento) !== "null" ? [`🪪 Cédula ${p.documento}`] : []),
    `📱 ${p.telefono}`,
    `🏠 ${p.direccion}${p.barrio ? `, barrio ${p.barrio}` : ""}`,
    `🏙️ ${p.ciudad}, ${p.departamento}`,
    p.notas ? `📍 ${p.notas}` : "",
    `🚚 Entrega: ${c.envio.plazo}`,
  ];
  return lineas.filter(Boolean).join("\n");
}

/**
 * La confirmación que recibe el cliente cuando el pedido quedó registrado:
 * ordenada como la ficha, un dato por línea con su emoji. Antes era una tira de
 * frases ("Producto: … Envío incluido. Paga contraentrega… Llega a …") que se
 * partía en ". " y quedaba como texto corrido.
 */
export function confirmacionDelPedido(p: PedidoDropshipping, c: CondicionesDelNegocio = CONDICIONES_DE_RESPALDO): string {
  return [
    `📦 ${p.productName} × ${p.quantity}`,
    `💵 ${p.metodoPago === "contraentrega" ? "Pagas contraentrega, cuando lo recibes" : "Pago ya acordado"}`,
    `🏠 ${p.direccion}${p.barrio ? `, barrio ${p.barrio}` : ""}`,
    `🏙️ ${p.ciudad}${p.departamento ? `, ${p.departamento}` : ""}`,
    `🚚 ${c.envio.costo === "incluido" ? "Envío incluido" : `Envío ${c.envio.costo}`} · llega en ${c.envio.plazo}`,
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
  // Se copia como lo ESCRIBIÓ el cliente ("Medellín", no "Medellin"): la
  // clave sin tildes sirve para buscar, no para mostrar en el resumen. Como
  // `plano` conserva el largo del original, el mismo índice sirve en los dos.
  const comoLoEscribio = (clave: string): string => {
    const i = plano.indexOf(clave);
    const original = i >= 0 && plano.length === t.length ? t.slice(i, i + clave.length) : clave;
    return original.replace(/(^|\s)(\p{L})/gu, (_, sp, ch) => sp + ch.toUpperCase());
  };

  if (!yaTengo.ciudad) {
    const ciu = Object.keys(CIUDAD_A_DEPARTAMENTO).find((c) => contienePalabra(plano, c));
    if (ciu) {
      encontrado.ciudad = comoLoEscribio(ciu);
      if (!yaTengo.departamento) encontrado.departamento = CIUDAD_A_DEPARTAMENTO[ciu]!;
    }
  }

  // Departamento explícito, solo si la ciudad no lo resolvió.
  if (!yaTengo.departamento && !encontrado.departamento) {
    const dep = DEPARTAMENTOS.find((d) => contienePalabra(plano, d));
    if (dep) encontrado.departamento = comoLoEscribio(dep);
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

  // Nombre en un mensaje ESTRUCTURADO (la lista que le pedimos). Cuando el
  // cliente manda "Juan Pérez Gómez, cc 1020304050, cel 300..." el nombre va
  // primero y sin anunciar. Solo se acepta si en el mismo mensaje vinieron al
  // menos dos datos más: así una frase suelta sigue sin convertirse en nombre.
  if (!yaTengo.nombre && !encontrado.nombre) {
    const otrosDatos = ["documento", "telefono", "direccion", "ciudad"]
      .filter((k) => (encontrado as any)[k]).length;
    if (otrosDatos >= 2) {
      const primerTramo = t.split(/[\n,;]/)[0]!.replace(/^\s*(?:1[.)-]?\s*)?(?:nombre\s*:?\s*)?/i, "").trim();
      const nom2 = primerTramo.match(/^([A-Za-zÁÉÍÓÚÑáéíóúñ]{2,20}(?:\s+[A-Za-zÁÉÍÓÚÑáéíóúñ]{2,20}){1,3})$/);
      if (nom2 && !/^(hola|buenas|quiero|si|sí|dale|listo|claro|ok|bueno)\b/i.test(nom2[1]!)) {
        encontrado.nombre = nom2[1]!.replace(/\s+/g, " ");
      }
    }
  }

  // Punto de referencia: es lo que más evita envíos devueltos, y va anunciado.
  if (!yaTengo.notas) {
    const ref = t.match(/(?:punto de referencia|referencia|frente a|al lado de|cerca de|diagonal a|junto a)\s*:?\s*([^\n,;]{4,80})/i);
    if (ref) encontrado.notas = ref[0]!.replace(/^(?:punto de referencia|referencia)\s*:?\s*/i, "").trim();
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
    dropiEstado: r.dropi_estado ?? null, dropiOrderId: r.dropi_order_id ?? null, dropiError: r.dropi_error ?? null,
    nombre: r.nombre, telefono: r.telefono, documento: r.documento,
    departamento: r.departamento, ciudad: r.ciudad, direccion: r.direccion,
    barrio: r.barrio, notas: r.notas,
  };
}

/** El pedido en curso de una conversación (el que todavía no se despachó). */
export async function pedidoEnCurso(conversationId: number): Promise<PedidoDropshipping | null> {
  const { rows } = await pool.query(
    `SELECT * FROM dropshipping_orders
     WHERE conversation_id = $1 AND estado IN ('borrador', 'completo', 'por_confirmar', 'confirmado')
     ORDER BY id DESC LIMIT 1`,
    [conversationId],
  );
  return rows[0] ? aPedido(rows[0]) : null;
}

/** Cambia el estado del pedido (por_confirmar / confirmado / cancelado). */
export async function marcarEstado(
  pedidoId: number,
  estado: "borrador" | "completo" | "por_confirmar" | "confirmado" | "cancelado",
): Promise<void> {
  await pool.query(`UPDATE dropshipping_orders SET estado = $2, updated_at = now() WHERE id = $1`, [pedidoId, estado]);
  logger.info({ pedidoId, estado }, "[Dropshipping] Estado del pedido");
}

/**
 * ¿Este mensaje es el "sí" al resumen del pedido?
 *
 * Solo cuenta cuando el pedido está esperando confirmación: el mismo "sí" en
 * otro momento es la respuesta a otra cosa. Acepta las formas cortas con que
 * se confirma en Colombia y también "confirmo", "confirmado", "correcto".
 */
export function confirmaElPedido(mensaje: string, pedido: PedidoDropshipping | null): boolean {
  if (!pedido || pedido.estado !== "por_confirmar") return false;
  const t = sinTildes(mensaje).replace(/[¡!¿?.]/g, " ").replace(/\s+/g, " ").trim();
  if (!t) return false;
  // Una corrección no es una confirmación, aunque empiece con "sí".
  if (/\b(no|pero|cambia|cambio|corrige|corrijo|mal|error|equivoc|en vez|mejor)\b/.test(t)) return false;
  return /^(si|sii+|claro|dale|listo|ok|okey|okay|de una|confirmo|confirmado|correcto|perfecto|exacto|asi es|todo bien|todo correcto|hagale|hagamosle|va|vale)(\b|$)/.test(t)
    || /\b(confirmo|confirmado|todo correcto|esta correcto|esta bien asi|si confirmo|si esta bien|si es correcto)\b/.test(t);
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
  /** "contraentrega" (default) o "transferencia": sale de las condiciones del negocio. */
  metodoPago?: string | null;
}): Promise<PedidoDropshipping> {
  const cantidad = datos.quantity || 1;
  const { rows } = await pool.query(
    `INSERT INTO dropshipping_orders
       (tenant_id, conversation_id, lead_id, product_id, product_name,
        quantity, unit_price, total, telefono, estado, metodo_pago)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'borrador',$10)
     RETURNING *`,
    [datos.tenantId, datos.conversationId, datos.leadId ?? null, datos.productId,
     datos.productName, cantidad, datos.unitPrice, datos.unitPrice * cantidad,
     datos.telefono ?? null, datos.metodoPago || "contraentrega"],
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
export interface VeredictoDropi {
  /** sincronizada = el proveedor ya la tiene; error = Dropi la rechazó; sin_rastro = Dropify no corrió. */
  estado: "sincronizada" | "error" | "sin_productos_dropi" | "sin_rastro";
  dropiOrderId: string | null;
  detalle: string;
}

export interface ResultadoDespacho {
  ok: boolean;
  wooOrderId?: number;
  error?: string;
  /**
   * El pedido NO se creó porque Dropi dijo de antemano que el producto está
   * archivado o sin stock. Distinto de `dropi` (veredicto DESPUÉS de crear).
   */
  noDisponible?: { estado: "archivado" | "sin_stock"; detalle: string; mensajeAlCliente: string };
  /**
   * Dropi no cubre ciudad+método para ESTE proveedor (ej. "Cali sin
   * CON RECAUDO"). No es producto agotado: por otro camino (Woo/Dropify) o
   * con otro método (transferencia) puede salir. Incluye qué decirle al cliente.
   */
  cobertura?: { ciudad: string; metodo: string; detalle: string; mensajeAlCliente: string };
  /** Qué hizo Dropi con el pedido. Solo falta cuando ni siquiera llegó a Woo. */
  dropi?: VeredictoDropi;
  /** true cuando el rechazo dejó el producto fuera del catálogo. */
  productoDesactivado?: boolean;
}

/**
 * ¿El rechazo de Dropi es por COBERTURA (ciudad/método de envío) y no por el
 * producto? Caso medido 24-09-2026, pedido #39: "La ciudad no tiene habilitado
 * el médoto de envío: CON RECAUDO". La cobertura es por proveedor/bodega, no
 * por ciudad: rendirse acá impide intentar por Woo/Dropify, que usa otro token
 * y normaliza distinto — y ese camino sí pasó Cali+contraentrega (#90133857).
 */
const ES_ERROR_DE_COBERTURA = /ciudad.*(habilitado|cobertura)|m[eé]todo de env[ií]o|cobertura|sin.*recaudo|recaudo.*no|contraentrega.*no|no.*contraentrega|zona.*(no|sin)/i;
export function esErrorDeCobertura(detalle: string): boolean {
  return ES_ERROR_DE_COBERTURA.test(String(detalle || ""));
}

interface EntradaSinCobertura { ciudad: string; metodo: string; en: string }
const DIAS_SIN_COBERTURA = 30;

function leerSinCobertura(meta: any): EntradaSinCobertura[] {
  const lista = meta?.sinCobertura;
  return Array.isArray(lista) ? lista.filter((e: any) => e && typeof e.ciudad === "string") : [];
}

/** ¿Este proveedor ya rechazó esta ciudad+método hace poco? (chequeo previo, sin pegar a Dropi). */
export function hayRechazoDeCobertura(meta: any, ciudad: string, contraentrega: boolean): EntradaSinCobertura | null {
  const normal = ciudad.trim().toUpperCase();
  const metodo = contraentrega ? "CON RECAUDO" : "SIN RECAUDO";
  const limite = Date.now() - DIAS_SIN_COBERTURA * 24 * 3600 * 1000;
  const vieja = leerSinCobertura(meta).find((e) => e.ciudad === normal && e.metodo === metodo);
  if (!vieja) return null;
  if (new Date(vieja.en).getTime() < limite) return null;
  return vieja;
}

async function guardarRechazoDeCobertura(productId: number, meta: any, ciudad: string, contraentrega: boolean): Promise<void> {
  const normal = ciudad.trim().toUpperCase();
  const metodo = contraentrega ? "CON RECAUDO" : "SIN RECAUDO";
  const lista = leerSinCobertura(meta).filter((e) => !(e.ciudad === normal && e.metodo === metodo));
  lista.push({ ciudad: normal, metodo, en: new Date().toISOString() });
  await db.update(products).set({ metadata: JSON.stringify({ ...meta, sinCobertura: lista.slice(-20) }) } as any).where(eq(products.id, productId));
}

export function mensajeCoberturaAlCliente(productName: string, ciudad: string): string {
  return `En ${ciudad} la contraentrega no está disponible para ${productName}. ¿Te sirve pagarlo por transferencia (Nequi, Daviplata o tarjeta) y te lo mando igual?`;
}

export async function despacharPedido(pedido: PedidoDropshipping): Promise<ResultadoDespacho> {
  if (!pedidoCompleto(pedido)) {
    return { ok: false, error: `Faltan datos: ${datosQueFaltan(pedido).join(", ")}` };
  }
  if (pedido.wooOrderId) {
    const dropi: VeredictoDropi | undefined = pedido.dropiEstado
      ? { estado: pedido.dropiEstado as VeredictoDropi["estado"], dropiOrderId: pedido.dropiOrderId ?? null, detalle: pedido.dropiError || "" }
      : undefined;
    return { ok: dropi?.estado !== "error", wooOrderId: pedido.wooOrderId, dropi, error: dropi?.estado === "error" ? dropi.detalle : undefined };
  }

  // ── Dropi DIRECTO (sin WooCommerce) ────────────────────────────────────
  // Si el negocio cargó su token de integración y el producto está
  // vinculado a Dropi, el pedido se crea directo (ver lib/dropi-directo.ts).
  // WooCommerce queda como respaldo si Dropi rechaza y el producto también
  // existe allá.
  //
  // Si el rechazo es por COBERTURA (ciudad/método del proveedor), NO se
  // vuelve acá: se sigue por Woo/Dropify, que usa otro token y normaliza
  // distinto — ese camino sí pasó Cali+contraentrega (#90133857) cuando el
  // directo la rechazó (#39). Rendirse al primer "no" dejaba el pedido muerto
  // con el mensaje falso de "no se pudo registrar en WooCommerce" sin haberlo
  // intentado.
  try {
    const directo = await despacharDirectoEnDropi(pedido);
    if (directo) {
      if (directo.ok) return directo;
      if (!directo.cobertura) return directo;
      logger.warn({ pedidoId: pedido.id, error: directo.error }, "[Dropshipping] Directo sin cobertura; se sigue por WooCommerce/Dropify");
      await pool.query(
        `UPDATE dropshipping_orders SET dropi_error = $2, notas = COALESCE(notas, '') || $3, updated_at = now() WHERE id = $1`,
        [pedido.id, directo.error || "sin detalle", ` | Directo sin cobertura (${new Date().toISOString().slice(0, 16)}): se intenta por Woo`],
      ).catch(() => null);
    }
  } catch (e: any) {
    logger.warn({ pedidoId: pedido.id, err: e?.message }, "[Dropshipping] Dropi directo falló; se sigue por WooCommerce");
  }

  try {
    const { getWooCommerceService } = await import("./woocommerce");
    const woo = await getWooCommerceService(pedido.tenantId);
    if (!woo) {
      const e = "WooCommerce no está configurado para este negocio (y Dropi directo no aplicó: falta el token de Dropi o el producto no está vinculado).";
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

    // ── Preguntarle a Dropi ANTES de crear la orden ───────────────────────
    //
    // El #323 se creó en Woo, Dropify lo mandó a Dropi y Dropi lo rechazó
    // (producto archivado). Con el chequeo previo, un producto que el
    // proveedor archivó o agotó no genera orden: se le dice al cliente, se
    // saca del catálogo y se avisa al admin. Si Dropi no contesta o el
    // formato no se entiende, NO se bloquea: se sigue y decide el veredicto
    // de después, como hasta ahora.
    try {
      const { disponibilidadEnDropi, mensajeAlClienteSinDisponibilidad } = await import("./dropi-disponibilidad");
      const disp = await disponibilidadEnDropi(woo, wooProductId);
      console.log(`📦 [DROPSHIPPING] Dropi dice del producto Woo #${wooProductId}: ${disp.estado} — ${disp.detalle}`);
      if (disp.estado === "archivado" || disp.estado === "sin_stock") {
        const detalle = `Verificado en Dropi antes de crear la orden: ${disp.detalle}`;
        await pool.query(
          `UPDATE dropshipping_orders SET estado = 'rechazado_dropi', dropi_estado = 'error', dropi_error = $2, updated_at = now() WHERE id = $1`,
          [pedido.id, detalle],
        );
        let productoDesactivado = false;
        if (pedido.productId) {
          try {
            await db.update(products).set({ isActive: false } as any).where(eq(products.id, pedido.productId));
            productoDesactivado = true;
          } catch (e: any) {
            logger.error({ err: e?.message, productId: pedido.productId }, "[Dropshipping] No se pudo desactivar el producto no disponible");
          }
        }
        await avisarAlAdmin(pedido, { estado: "error", dropiOrderId: null, detalle }, productoDesactivado);
        return {
          ok: false,
          error: detalle,
          productoDesactivado,
          noDisponible: { estado: disp.estado, detalle: disp.detalle, mensajeAlCliente: mensajeAlClienteSinDisponibilidad(String(pedido.productName || "el producto"), disp) },
        };
      }
    } catch (e: any) {
      logger.warn({ err: e?.message, pedidoId: pedido.id }, "[Dropshipping] No se pudo verificar disponibilidad en Dropi; se sigue con la orden");
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

    // Woo lo tiene; ahora, ¿lo tiene Dropi? Dropify corre dentro del guardado
    // y deja el veredicto en la meta de la orden, pero sobre OTRA instancia:
    // la respuesta del POST no lo trae, hay que releer.
    const dropi = await leerVeredictoDeDropi(woo, wooOrderId);
    const productoDesactivado = await registrarVeredicto({ ...pedido, wooOrderId }, dropi);
    if (dropi.estado === "error") {
      return { ok: false, wooOrderId, dropi, productoDesactivado, error: `Dropi rechazó el pedido: ${dropi.detalle}` };
    }
    return { ok: true, wooOrderId, dropi };
  } catch (e: any) {
    const error = e?.message || String(e);
    await pool.query(`UPDATE dropshipping_orders SET woo_error = $2, updated_at = now() WHERE id = $1`, [pedido.id, error]);
    logger.error({ pedidoId: pedido.id, error }, "[Dropshipping] Falló la creación en WooCommerce");
    return { ok: false, error };
  }
}

// ─── Veredicto de Dropi ─────────────────────────────────────────────────────

/**
 * Relee la orden en Woo para saber qué hizo Dropify con ella.
 *
 * Si Woo no deja leerla, se responde "sin_rastro" con el motivo: es mejor
 * decir "no sé si llegó a Dropi" que dar el pedido por despachado.
 */
async function leerVeredictoDeDropi(woo: { getOrder(id: number): Promise<any> }, wooOrderId: number): Promise<VeredictoDropi> {
  try {
    const { leerRastroDropi } = await import("./woocommerce-estado");
    const orden = await woo.getOrder(wooOrderId);
    const r = leerRastroDropi(orden);
    return { estado: r.estado, dropiOrderId: r.dropiOrderId, detalle: r.detalle };
  } catch (e: any) {
    return { estado: "sin_rastro", dropiOrderId: null, detalle: `No se pudo releer la orden en WooCommerce: ${e?.message || e}` };
  }
}

/** Motivos por los que Dropi rechaza y que significan "este producto ya no se vende". */
export const PRODUCTO_YA_NO_SE_VENDE = /archivad|agotad|sin stock|no disponible|inactiv|descontinuad|eliminad/i;

/**
 * Guarda el veredicto y actúa sobre él: si Dropi rechazó porque el proveedor
 * archivó o agotó el producto, se saca del catálogo — cada minuto que siga
 * publicado es otro cliente dando sus datos para nada (pasó con el #323:
 * "Bolso by lola 1.1", tres días "registrado" sin que nadie supiera).
 * Devuelve si el producto quedó desactivado.
 */
async function registrarVeredicto(pedido: PedidoDropshipping, dropi: VeredictoDropi): Promise<boolean> {
  const estado = dropi.estado === "sincronizada" ? "despachado" : dropi.estado === "error" ? "rechazado_dropi" : "enviado";
  await pool.query(
    `UPDATE dropshipping_orders
        SET dropi_estado = $2, dropi_order_id = $3, dropi_error = $4, estado = $5, updated_at = now()
      WHERE id = $1`,
    [pedido.id, dropi.estado, dropi.dropiOrderId, dropi.estado === "sincronizada" ? null : dropi.detalle, estado],
  );

  if (dropi.estado === "sincronizada") {
    logger.info({ pedidoId: pedido.id, dropiOrderId: dropi.dropiOrderId }, "[Dropshipping] Pedido aceptado por Dropi");
    return false;
  }
  logger.warn({ pedidoId: pedido.id, wooOrderId: pedido.wooOrderId, veredicto: dropi }, "[Dropshipping] El pedido NO quedó en Dropi");

  let productoDesactivado = false;
  if (dropi.estado === "error" && pedido.productId && PRODUCTO_YA_NO_SE_VENDE.test(dropi.detalle)) {
    try {
      await db.update(products).set({ isActive: false } as any).where(eq(products.id, pedido.productId));
      productoDesactivado = true;
      logger.warn({ productId: pedido.productId, motivo: dropi.detalle }, "[Dropshipping] Producto desactivado: Dropi ya no lo despacha");
    } catch (e: any) {
      logger.error({ err: e?.message, productId: pedido.productId }, "[Dropshipping] No se pudo desactivar el producto");
    }
  }

  await avisarAlAdmin(pedido, dropi, productoDesactivado);
  return productoDesactivado;
}

/** Aviso por WhatsApp al dueño: el mismo canal por el que le llegan los comprobantes. */
async function avisarAlAdmin(pedido: PedidoDropshipping, dropi: VeredictoDropi, productoDesactivado: boolean): Promise<void> {
  try {
    const { avisarAlDueno } = await import("./avisos");
    const texto = [
      dropi.estado === "error" ? "⚠️ *Dropi RECHAZÓ un pedido*" : "⚠️ *Pedido sin confirmar en Dropi*",
      `Pedido #${pedido.id} · Woo ${pedido.wooOrderId != null ? `#${pedido.wooOrderId}` : "— (no llegó a Woo)"} · ${pedido.productName}`,
      `Cliente: ${pedido.nombre} · ${pedido.telefono} · ${pedido.ciudad}, ${pedido.departamento}`,
      `Motivo: ${dropi.detalle}`,
      productoDesactivado ? "Saqué el producto del catálogo para que el bot no lo siga ofreciendo." : "",
      "El cliente ya sabe que hubo un problema; hay que contactarlo o cargar el pedido a mano en Dropi.",
    ].filter(Boolean).join("\n");
    await avisarAlDueno(pedido.tenantId, texto);
  } catch (e: any) {
    logger.error({ err: e?.message, pedidoId: pedido.id }, "[Dropshipping] No se pudo avisar al admin del rechazo de Dropi");
  }
}

// ─── Reintentar en Dropi ────────────────────────────────────────────────────

/**
 * Vuelve a mandar a Dropi un pedido que YA está en WooCommerce.
 *
 * Dropify envía la orden cada vez que pasa a "processing" (gancho
 * woocommerce_order_status_changed). Se la pasa por "on-hold" y de vuelta a
 * "processing", y se relee el veredicto. Sirve cuando el proveedor reactivó
 * el producto o el rechazo fue transitorio; si el motivo sigue (producto
 * archivado), Dropi contesta lo mismo y acá queda registrado.
 */
export async function reintentarEnDropi(
  tenantId: number,
  pedidoId: number,
  opts: { conProductoId?: number | null } = {},
): Promise<ResultadoDespacho & { pedidoId?: number }> {
  const { rows } = await pool.query(`SELECT * FROM dropshipping_orders WHERE id = $1 AND tenant_id = $2 LIMIT 1`, [pedidoId, tenantId]);
  const pedido = rows[0] ? aPedido(rows[0]) : null;
  if (!pedido) return { ok: false, error: `No existe el pedido #${pedidoId} de este negocio.` };

  // Mismo cliente, otro producto: pasa cuando el original quedó archivado
  // (el #323 del 15-09). A una orden ya enviada Dropify no le relee los
  // productos, así que se clona el pedido con los mismos datos de envío y se
  // despacha como uno nuevo. El original queda como estaba, con su rechazo.
  if (opts.conProductoId && opts.conProductoId !== pedido.productId) {
    const [prod] = await db.select().from(products).where(eq(products.id, opts.conProductoId)).limit(1);
    if (!prod || (prod as any).tenantId !== tenantId) return { ok: false, error: `El producto ${opts.conProductoId} no existe en este negocio.` };
    const { rows: nuevos } = await pool.query(
      `INSERT INTO dropshipping_orders
         (tenant_id, conversation_id, lead_id, product_id, product_name, quantity, unit_price, total,
          nombre, telefono, documento, departamento, ciudad, direccion, barrio, notas, metodo_pago, estado)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,'confirmado') RETURNING *`,
      [tenantId, pedido.conversationId, (rows[0] as any).lead_id ?? null, (prod as any).id, (prod as any).name, pedido.quantity,
       String((prod as any).price ?? 0), String(Number((prod as any).price ?? 0) * pedido.quantity),
       pedido.nombre, pedido.telefono, pedido.documento, pedido.departamento, pedido.ciudad, pedido.direccion, pedido.barrio,
       [pedido.notas, `Reintento del pedido #${pedido.id} con otro producto`].filter(Boolean).join(" | "), pedido.metodoPago],
    );
    const clon = aPedido(nuevos[0]);
    logger.info({ de: pedido.id, a: clon.id, productoId: (prod as any).id }, "[Dropshipping] Pedido clonado con otro producto para reintentar en Dropi");
    const r = await despacharPedido(clon);
    return { ...r, pedidoId: clon.id };
  }
  if (!pedido.wooOrderId) return { ok: false, error: `El pedido #${pedidoId} nunca llegó a WooCommerce: no hay nada que reintentar en Dropi (use despacharPedido).` };
  if (pedido.dropiEstado === "sincronizada") {
    return { ok: true, wooOrderId: pedido.wooOrderId, dropi: { estado: "sincronizada", dropiOrderId: pedido.dropiOrderId ?? null, detalle: "Ya estaba en Dropi." } };
  }

  const { getWooCommerceService } = await import("./woocommerce");
  const woo = await getWooCommerceService(tenantId);
  if (!woo) return { ok: false, wooOrderId: pedido.wooOrderId, error: "WooCommerce no está configurado para este negocio." };

  try {
    await woo.updateOrderStatus(pedido.wooOrderId, "on-hold");
    await woo.updateOrderStatus(pedido.wooOrderId, "processing");
  } catch (e: any) {
    return { ok: false, wooOrderId: pedido.wooOrderId, error: `No se pudo reenviar desde WooCommerce: ${e?.message || e}` };
  }
  logger.info({ pedidoId, wooOrderId: pedido.wooOrderId }, "[Dropshipping] Reintento en Dropi (on-hold → processing)");

  const dropi = await leerVeredictoDeDropi(woo, pedido.wooOrderId);
  const productoDesactivado = await registrarVeredicto(pedido, dropi);
  if (dropi.estado === "error") {
    return { ok: false, wooOrderId: pedido.wooOrderId, dropi, productoDesactivado, error: `Dropi volvió a rechazarlo: ${dropi.detalle}` };
  }
  return { ok: dropi.estado === "sincronizada", wooOrderId: pedido.wooOrderId, dropi, error: dropi.estado === "sincronizada" ? undefined : dropi.detalle };
}

// ─── Cancelar un pedido ─────────────────────────────────────────────────────

/**
 * Cancela un pedido del bot y, si llegó a WooCommerce, también ahí
 * (status 'cancelled'). Dropify NO reenvía a Dropi al cancelar, así que si
 * Dropi ya lo había aceptado hay que cancelarlo además en el panel de Dropi;
 * se avisa en el resultado. Caso de uso real (19-09): los duplicados
 * #324-#327 de una misma compra de prueba.
 */
export async function cancelarPedido(tenantId: number, pedidoId: number, motivo = ""): Promise<{ ok: boolean; wooOrderId?: number | null; aviso?: string; error?: string }> {
  const { rows } = await pool.query(`SELECT * FROM dropshipping_orders WHERE id = $1 AND tenant_id = $2 LIMIT 1`, [pedidoId, tenantId]);
  const pedido = rows[0] ? aPedido(rows[0]) : null;
  if (!pedido) return { ok: false, error: `No existe el pedido #${pedidoId} de este negocio.` };
  if (pedido.estado === "cancelado") return { ok: true, wooOrderId: pedido.wooOrderId, aviso: "Ya estaba cancelado." };

  let aviso = "";
  if (pedido.wooOrderId) {
    try {
      const { getWooCommerceService } = await import("./woocommerce");
      const woo = await getWooCommerceService(tenantId);
      if (woo) await woo.updateOrderStatus(pedido.wooOrderId, "cancelled");
      else aviso = "WooCommerce no está configurado: se canceló solo acá.";
    } catch (e: any) {
      return { ok: false, wooOrderId: pedido.wooOrderId, error: `No se pudo cancelar en WooCommerce: ${e?.message || e}` };
    }
    if (pedido.dropiEstado === "sincronizada" && pedido.dropiOrderId) {
      aviso = `Dropi ya lo tenía como orden #${pedido.dropiOrderId}: cancelalo también en el panel de Dropi, Dropify no lo hace solo.`;
    }
  }
  await pool.query(
    `UPDATE dropshipping_orders SET estado = 'cancelado', notas = COALESCE(notas, '') || $2, updated_at = now() WHERE id = $1`,
    [pedidoId, ` | Cancelado${motivo ? `: ${motivo}` : ""} (${new Date().toISOString().slice(0, 16)})`],
  );
  logger.info({ pedidoId, wooOrderId: pedido.wooOrderId, motivo }, "[Dropshipping] Pedido cancelado");
  return { ok: true, wooOrderId: pedido.wooOrderId, aviso: aviso || undefined };
}

// ─── Dropi directo ──────────────────────────────────────────────────────────

/**
 * Crea el pedido directo en Dropi. Devuelve null si no aplica (sin token del
 * negocio o producto sin `dropiProductId`), para que quien llama siga por
 * WooCommerce. Si Dropi lo acepta, queda `despachado` con su número; si lo
 * rechaza por un motivo de negocio (archivado, sin stock), se registra igual
 * que el veredicto que llega por Woo, con aviso al admin y baja del producto.
 */
async function despacharDirectoEnDropi(pedido: PedidoDropshipping): Promise<ResultadoDespacho | null> {
  const { tokenDropiDelTenant, crearPedidoDropi } = await import("./dropi-directo");
  const token = await tokenDropiDelTenant(pedido.tenantId);
  if (!token || !pedido.productId) return null;
  const [prod] = await db.select().from(products).where(eq(products.id, pedido.productId)).limit(1);
  if (!prod) return null;
  let meta: any = {};
  try { meta = typeof (prod as any).metadata === "string" ? JSON.parse((prod as any).metadata) : ((prod as any).metadata || {}); } catch { /* sin metadata */ }
  const dropiProductId = Number(meta?.dropiProductId);
  if (!dropiProductId) return null;

  const contraentrega = pedido.metodoPago === "contraentrega";
  const ciudadCli = String(pedido.ciudad || "");

  // ── Chequeo previo: este proveedor ya rechazó esta ciudad+método ──────
  // No se pega a Dropi para repetir un "no" conocido: se devuelve cobertura
  // para que el flujo ofrezca transferencia o siga por Woo/Dropify.
  const previo = hayRechazoDeCobertura(meta, ciudadCli, contraentrega);
  if (previo && contraentrega) {
    const detalle = `Dropi ya rechazó ${previo.ciudad} con ${previo.metodo} para este proveedor (caché del ${previo.en.slice(0, 10)}): no se reintenta igual.`;
    logger.info({ pedidoId: pedido.id, ciudad: previo.ciudad }, "[Dropshipping] Cobertura conocida: se salta el directo");
    return {
      ok: false, error: detalle,
      cobertura: { ciudad: ciudadCli, metodo: previo.metodo, detalle, mensajeAlCliente: mensajeCoberturaAlCliente(String(pedido.productName || "el producto"), ciudadCli) },
    };
  }

  const r = await crearPedidoDropi(token, {
    dropiProductId,
    nombre: String((prod as any).name),
    supplierId: meta?.dropiSupplierId ?? null,
    stock: meta?.dropiStock ?? null,
    variationId: meta?.dropiVariationId ?? null,
  }, {
    nombre: String(pedido.nombre), telefono: String(pedido.telefono), documento: pedido.documento,
    direccion: String(pedido.direccion), barrio: pedido.barrio, ciudad: ciudadCli, departamento: String(pedido.departamento),
    notas: [pedido.notas, "Pedido tomado por VentasPro"].filter(Boolean).join(" | "),
    cantidad: pedido.quantity, precioUnitario: Number(pedido.unitPrice) || 0,
    contraentrega, referencia: `vp-${pedido.id}`,
  });

  if (r.ok) {
    const dropiOrderId = r.data?.id != null ? String(r.data.id) : null;
    await pool.query(
      `UPDATE dropshipping_orders SET estado = 'despachado', dropi_estado = 'sincronizada', dropi_order_id = $2, dropi_error = NULL, woo_error = NULL, updated_at = now() WHERE id = $1`,
      [pedido.id, dropiOrderId],
    );
    logger.info({ pedidoId: pedido.id, dropiOrderId }, "[Dropshipping] Pedido creado DIRECTO en Dropi");
    return { ok: true, dropi: { estado: "sincronizada", dropiOrderId, detalle: `Creado directo en Dropi${dropiOrderId ? ` (orden #${dropiOrderId})` : ""}.` } };
  }

  // Rechazo por COBERTURA: se guarda en caché y NO se registra veredicto ni
  // se avisa todavía — quien llama sigue por Woo/Dropify y solo al final,
  // si todo falló, se avisa una vez con el cuadro completo.
  if (contraentrega && esErrorDeCobertura(String(r.error || ""))) {
    await guardarRechazoDeCobertura(pedido.productId!, meta, ciudadCli, contraentrega).catch(() => null);
    const detalle = `Dropi rechazó el pedido directo: ${r.error}`;
    logger.warn({ pedidoId: pedido.id, error: r.error }, "[Dropshipping] Directo sin cobertura para este proveedor");
    return {
      ok: false, error: detalle,
      cobertura: { ciudad: ciudadCli, metodo: "CON RECAUDO", detalle, mensajeAlCliente: mensajeCoberturaAlCliente(String(pedido.productName || "el producto"), ciudadCli) },
    };
  }

  // Rechazo de Dropi por el producto: mismo tratamiento que el veredicto que llega por Woo.
  const detalle = `Dropi rechazó el pedido directo: ${r.error}`;
  const veredicto: VeredictoDropi = { estado: "error", dropiOrderId: null, detalle };
  const productoDesactivado = await registrarVeredicto(pedido, veredicto);
  return { ok: false, dropi: veredicto, productoDesactivado, error: detalle };
}

/**
 * Reintenta un pedido rechazado por cobertura como SIN RECAUDO
 * (transferencia/prepago). Cambia el método de pago — úsalo cuando el cliente
 * aceptó pagar por adelantado o el admin lo autoriza. Re-despacha por el flujo
 * completo (directo + Woo).
 */
export async function reintentarSinRecaudo(tenantId: number, pedidoId: number): Promise<ResultadoDespacho & { pedidoId: number }> {
  const { rows } = await pool.query(`SELECT * FROM dropshipping_orders WHERE id = $1 AND tenant_id = $2 LIMIT 1`, [pedidoId, tenantId]);
  const pedido = rows[0] ? aPedido(rows[0]) : null;
  if (!pedido) return { ok: false, pedidoId, error: `No existe el pedido #${pedidoId} de este negocio.` };
  if (pedido.metodoPago !== "contraentrega") return { ok: false, pedidoId, error: `El pedido #${pedidoId} ya es ${(pedido.metodoPago || "sin método")}: no hay nada que cambiar.` };
  if (pedido.estado === "despachado") return { ok: true, pedidoId, error: undefined };
  await pool.query(
    `UPDATE dropshipping_orders SET metodo_pago = 'transferencia', estado = 'confirmado', dropi_error = NULL, woo_error = NULL, notas = COALESCE(notas, '') || $2, updated_at = now() WHERE id = $1`,
    [pedidoId, ` | Cambio a transferencia (${new Date().toISOString().slice(0, 16)}): reintento sin recaudo`],
  );
  pedido.metodoPago = "transferencia";
  pedido.estado = "confirmado";
  logger.info({ pedidoId, tenantId }, "[Dropshipping] Reintento sin recaudo (transferencia)");
  const r = await despacharPedido(pedido);
  return { ...r, pedidoId };
}
