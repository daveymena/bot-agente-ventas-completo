/**
 * EL NICHO NO SE ELIGE DE UNA LISTA: SE DERIVA.
 * =============================================
 *
 * El sistema anterior traía seis nichos escritos a mano (digital, retail,
 * services, education, health, general) y un `switch` para elegir uno. Eso
 * funciona con los rubros que alguien pensó ese día y falla con el siguiente:
 * una funeraria, un taller de motos o una escuela de adiestramiento canino
 * caían en `general`, o sea en ninguno, y el agente volvía a vender como si
 * fueran cursos digitales.
 *
 * Lo que de verdad cambia la forma de vender NO es el rubro: es CÓMO SE
 * ENTREGA lo que se vende y QUÉ HAY QUE SABER para poder entregarlo. Y eso se
 * puede leer de los datos que ya existen, sin adivinar:
 *
 *   · `products.kind` + `deliveryLink`  → ¿se manda un enlace, un paquete o
 *                                          se agenda una hora?
 *   · el perfil del negocio             → el dueño ya escribió cómo entrega,
 *                                          en qué plazo y a dónde llega.
 *   · `products.opciones`               → ¿hay tallas, colores, variantes?
 *   · los medios de pago configurados   → ¿contraentrega, transferencia, link?
 *
 * De ahí salen cuatro "formas de vender" (digital, físico, servicio y mixto),
 * y el RUBRO no hace falta clasificarlo: el modelo ya lo lee del nombre del
 * negocio, de lo que el dueño escribió y de los nombres de los productos. Lo
 * que este módulo le da es la parte que un modelo NO puede deducir mirando un
 * catálogo: qué se puede prometer, qué falta saber para poder cerrar, y qué
 * objeciones va a aparecer según lo que se vende.
 *
 * Todo es función pura: entra el negocio y el catálogo, sale el guion. Sin
 * base de datos y sin fecha, para que se pueda probar con un negocio que hoy
 * no existe.
 */

export type FormaDeVenta = "digital" | "fisico" | "servicio" | "mixto";

/** Un producto, con lo mínimo que hace falta para derivar la forma de venta. */
export interface ProductoParaNicho {
  id: number;
  name: string;
  description?: string | null;
  price?: number | null;
  currency?: string | null;
  /** digital | physical | service (lo que guarda `products.kind`). */
  kind?: string | null;
  categoria?: string | null;
  /** Tallas, colores, modelos… Si hay, cerrar exige elegir una. */
  opciones?: string[] | null;
  deliveryLink?: string | null;
  tieneVideo?: boolean;
}

/** El perfil del negocio, ya resuelto por `business-context.ts`. */
export interface NegocioParaNicho {
  nombre?: string | null;
  agente?: string | null;
  nicho?: string | null;
  descripcion?: string | null;
  cobertura?: string | null;
  horario?: string | null;
  entrega?: { metodo: string; plazo: string; detalle?: string } | null;
  garantia?: { dias: number; descripcion: string } | null;
  acceso?: { tipo: string; descripcion?: string } | null;
  tono?: string | null;
  noPuede?: string[] | null;
  loQueDebeSaber?: string[] | null;
  modoCatalogo?: "digital" | "fisico" | "mixto" | null;
  condiciones?: {
    pais?: string | null;
    envio?: { plazo?: string | null; cobertura?: string | null } | null;
    costoEnvio?: string | null;
    pagoEnvio?: string | null;
    agenda?: string | null;
  } | null;
  negociaPrecio?: boolean;
}

export interface MedioDePagoSimple {
  etiqueta: string;
  tipo: "transferencia" | "link";
}

/** Cómo se le habla al cliente en esta forma de venta. */
export interface Vocabulario {
  /** "el curso", "el pedido", "la asesoría". */
  producto: string;
  /** "te llega", "te lo llevamos", "lo agendamos". */
  entregar: string;
  /** "comprarlo", "pedirlo", "agendarlo". */
  comprar: string;
}

/** Un dato que el agente necesita antes de poder cerrar. */
export interface DatoDeCalificacion {
  campo: "nombre" | "ciudad" | "direccion" | "variante" | "necesidad" | "cuando" | "presupuesto";
  /** Por qué se pide: va al prompt para que el modelo no pregunte de más. */
  porque: string;
  /** Obligatorio para poder cerrar. Los opcionales solo si surge natural. */
  obligatorio: boolean;
}

export interface ObjecionPrevista {
  /** Lo que dice el cliente, en sus palabras. */
  suena: string;
  /** Qué hacer, en una línea. Sin libreto: el modelo redacta. */
  como: string;
}

/** El guion completo de ventas de este negocio. */
export interface GuionDelNegocio {
  forma: FormaDeVenta;
  /** 0..1. Con catálogo vacío es 0 y el agente tiene que preguntar. */
  confianza: number;
  /** Qué miró para decidir la forma. Para depurar sin adivinar. */
  senales: string[];
  vocabulario: Vocabulario;
  /** Líneas que el agente PUEDE afirmar. Salen de datos reales. */
  hechos: string[];
  /** Lo que NO está configurado: se convierte en prohibición de afirmarlo. */
  sinConfirmar: string[];
  prohibiciones: string[];
  /** Qué hay que saber antes de cerrar. */
  calificacion: DatoDeCalificacion[];
  objeciones: ObjecionPrevista[];
  /** Cómo se cierra en esta forma de venta. */
  cierre: string[];
  /** Datos sueltos del negocio que el dueño cargó. */
  datosDelNegocio: string[];
}

/* ────────────────────────────────────────────────────────────────────────────
 * Normalización
 * ──────────────────────────────────────────────────────────────────────────── */

const N = (t: unknown): string =>
  String(t ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

/** ¿El texto menciona alguna de estas raíces? Se busca por RAÍZ: el español conjuga. */
const menciona = (texto: string, raices: string[]) =>
  raices.some((r) => new RegExp(`\\b${r}`, "i").test(N(texto)));

/* ────────────────────────────────────────────────────────────────────────────
 * 1. LA FORMA DE VENTA
 *
 * No se clasifica el rubro: se mira cómo llega lo que el cliente compra. Es
 * lo único que cambia de verdad la conversación, y está escrito en los datos.
 * ──────────────────────────────────────────────────────────────────────────── */

const RAIZ_DIGITAL = [
  "enlace", "link", "drive", "descarga", "download", "pdf", "correo", "email",
  "acceso", "plataforma", "usuario", "clave", "curso", "video", "plantilla",
  "digital", "online", "virtual", "whatsapp",
];
const RAIZ_FISICO = [
  "envio", "envio a domicilio", "domicilio", "transportadora", "paquete",
  "contraentrega", "contra entrega", "tienda", "local", "sucursal", "retiro",
  "bodega", "mercancia", "stock", "inventario", "unidades", "talla", "color",
  "medida", "peso", "material",
];
const RAIZ_SERVICIO = [
  "cita", "agenda", "agendar", "sesion", "consulta", "asesoria", "visita",
  "instalacion", "reparacion", "mantenimiento", "servicio a domicilio",
  "hora", "turno", "reserva", "clase", "entrenamiento", "valoracion",
];

function kindDe(p: ProductoParaNicho): "digital" | "fisico" | "servicio" | null {
  const k = N(p.kind);
  if (k.includes("serv")) return "servicio";
  if (k.includes("phys") || k.includes("fisic")) return "fisico";
  if (k.includes("digit")) return "digital";
  return null;
}

export function derivarFormaDeVenta(
  catalogo: ProductoParaNicho[],
  negocio: NegocioParaNicho,
): { forma: FormaDeVenta; confianza: number; senales: string[] } {
  const senales: string[] = [];
  const votos: Record<"digital" | "fisico" | "servicio", number> = { digital: 0, fisico: 0, servicio: 0 };

  // ── El kind de cada producto es el voto más fuerte ────────────────────────
  for (const p of catalogo) {
    const k = kindDe(p);
    if (!k) continue;
    votos[k] += 3;
  }
  const porKind = Object.entries(votos).filter(([, v]) => v > 0);
  if (porKind.length) {
    senales.push(`kind del catálogo: ${porKind.map(([k, v]) => `${k}×${v / 3}`).join(", ")}`);
  }

  // ── Delivery link: si el producto trae enlace de entrega, se entrega por ahí ──
  const conEnlace = catalogo.filter((p) => !!p.deliveryLink);
  if (conEnlace.length) {
    votos.digital += conEnlace.length;
    senales.push(`${conEnlace.length} producto(s) con enlace de entrega cargado`);
  }

  // ── Lo que el DUEÑO escribió sobre cómo entrega ───────────────────────────
  const textoEntrega = `${negocio.entrega?.metodo || ""} ${negocio.entrega?.plazo || ""} ${negocio.entrega?.detalle || ""}`;
  if (menciona(textoEntrega, RAIZ_SERVICIO)) {
    votos.servicio += 4;
    senales.push(`la entrega que configuró el dueño es una agenda: "${negocio.entrega?.metodo}"`);
  } else if (menciona(textoEntrega, RAIZ_FISICO)) {
    votos.fisico += 4;
    senales.push(`la entrega que configuró el dueño es física: "${negocio.entrega?.metodo}"`);
  } else if (menciona(textoEntrega, RAIZ_DIGITAL)) {
    votos.digital += 4;
    senales.push(`la entrega que configuró el dueño es digital: "${negocio.entrega?.metodo}"`);
  }

  // ── Las palabras del catálogo y del propio negocio ────────────────────────
  const textoCatalogo = catalogo.map((p) => `${p.name} ${p.description || ""} ${p.categoria || ""}`).join(" ");
  const textoNegocio = `${negocio.nicho || ""} ${negocio.descripcion || ""}`;
  const texto = `${textoCatalogo} ${textoNegocio}`;

  const cuantas = (raices: string[]) => raices.filter((r) => new RegExp(`\\b${r}`, "i").test(N(texto))).length;
  const d = cuantas(RAIZ_DIGITAL);
  const f = cuantas(RAIZ_FISICO);
  const s = cuantas(RAIZ_SERVICIO);
  if (d || f || s) {
    // Se suma con peso bajo: las palabras sugieren, no deciden.
    votos.digital += d * 0.5;
    votos.fisico += f * 0.5;
    votos.servicio += s * 0.5;
    senales.push(`palabras del catálogo: digital ${d}, físico ${f}, servicio ${s}`);
  }

  const total = votos.digital + votos.fisico + votos.servicio;
  if (total === 0) {
    senales.push("sin señales: ni kind, ni enlace de entrega, ni perfil cargado");
    return { forma: "mixto", confianza: 0, senales };
  }

  const orden = (Object.entries(votos) as [keyof typeof votos, number][]).sort((a, b) => b[1] - a[1]);
  const [primero, segundo] = orden;
  const confianza = Math.min(1, primero[1] / (total || 1));

  // ── El catálogo mezclado es evidencia ESTRUCTURAL: gana a todo lo demás ──
  //
  // Un negocio que vende un curso Y una rodillera necesita preguntar de cuál
  // le están hablando antes de prometer cómo llega. Antes esto salía de
  // comparar pesos y el resultado era arbitrario: el peso que le ponía el
  // dueño a su propia entrega podía tapar que el catálogo estaba partido.
  const kinds = new Set(catalogo.map(kindDe).filter(Boolean));
  if (kinds.size > 1) {
    senales.push(`el catálogo tiene productos de más de un tipo (${[...kinds].join(" + ")}) → mixto`);
    return { forma: "mixto", confianza, senales };
  }

  // ── El modo que el dueño eligió SOLO manda si el catálogo es homogéneo ────
  if (negocio.modoCatalogo === "digital") {
    senales.push("el dueño configuró el catálogo como digital");
    return { forma: "digital", confianza: 1, senales };
  }
  if (negocio.modoCatalogo === "fisico") {
    senales.push("el dueño configuró el catálogo como físico");
    return { forma: "fisico", confianza: 1, senales };
  }

  // ── Con un solo tipo, lo que el DUEÑO configuró decide ──────────────────
  // Es el dato más fuerte: lo escribió él, para su negocio. Un gimnasio que
  // factura sus planes como "digital" pero atiende con cita no vende como un
  // curso por Drive.
  if (textoEntrega.trim()) {
    const porDueno: FormaDeVenta | null = menciona(textoEntrega, RAIZ_SERVICIO)
      ? "servicio"
      : menciona(textoEntrega, RAIZ_FISICO)
        ? "fisico"
        : menciona(textoEntrega, RAIZ_DIGITAL)
          ? "digital"
          : null;
    if (porDueno) {
      senales.push(`lo que el dueño cargó decide sobre las palabras del catálogo → ${porDueno}`);
      return { forma: porDueno, confianza: Math.max(confianza, 0.8), senales };
    }
  }

  // Dos formas con peso parecido y sin nada que desempate: mejor no adivinar.
  if (segundo && segundo[1] > 0 && segundo[1] * 1.5 > primero[1]) {
    senales.push(`${primero[0]} y ${segundo[0]} pesan parecido → se trata como mixto`);
    return { forma: "mixto", confianza, senales };
  }

  return { forma: primero[0], confianza, senales };
}

/* ────────────────────────────────────────────────────────────────────────────
 * 2. EL VOCABULARIO
 *
 * No hace falta saber si vende zapatillas o criptomonedas para saber que a un
 * producto físico se le dice "el pedido" y que "te llega" es la frase correcta.
 * ──────────────────────────────────────────────────────────────────────────── */

export function vocabularioDe(forma: FormaDeVenta): Vocabulario {
  switch (forma) {
    case "digital":
      return { producto: "el acceso", entregar: "te llega", comprar: "tomarlo" };
    case "fisico":
      return { producto: "el pedido", entregar: "te llega", comprar: "pedirlo" };
    case "servicio":
      return { producto: "el servicio", entregar: "lo agendamos", comprar: "agendarlo" };
    default:
      return { producto: "el producto", entregar: "te llega", comprar: "llevarlo" };
  }
}

/* ────────────────────────────────────────────────────────────────────────────
 * 3. LOS HECHOS Y LAS PROHIBICIONES
 *
 * La regla que ordena todo el sistema: LO QUE NO ESTÁ CONFIGURADO NO SE
 * AFIRMA. Un dato faltante se convierte en una prohibición explícita, que es
 * lo contrario de lo que pasaba antes (se rellenaba con el del negocio del
 * dueño y el agente inventaba con total seguridad).
 * ──────────────────────────────────────────────────────────────────────────── */

export function hechosYProhibiciones(
  negocio: NegocioParaNicho,
  forma: FormaDeVenta,
  medios: MedioDePagoSimple[],
): { hechos: string[]; sinConfirmar: string[]; prohibiciones: string[] } {
  const hechos: string[] = [];
  const sinConfirmar: string[] = [];
  const prohibiciones: string[] = [...(negocio.noPuede || [])];

  if (negocio.nicho) hechos.push(`Rubro: ${negocio.nicho}`);
  if (negocio.descripcion) hechos.push(`Qué hace el negocio: ${negocio.descripcion}`);
  if (negocio.cobertura) hechos.push(`A dónde llega: ${negocio.cobertura}`);
  else sinConfirmar.push("a qué ciudades o zonas llega");
  if (negocio.horario) hechos.push(`Horario de atención: ${negocio.horario}`);
  else sinConfirmar.push("el horario de atención");

  // ── Entrega ──────────────────────────────────────────────────────────────
  if (negocio.entrega) {
    hechos.push(
      `Entrega: ${negocio.entrega.metodo} — ${negocio.entrega.plazo}${
        negocio.entrega.detalle ? `. ${negocio.entrega.detalle}` : ""
      }`,
    );
    prohibiciones.push(
      `No prometas otra forma de entrega que no sea "${negocio.entrega.metodo}" ni un plazo distinto de "${negocio.entrega.plazo}".`,
    );
  } else {
    sinConfirmar.push("cómo se entrega y cuánto tarda");
    prohibiciones.push(
      "No prometas ninguna forma de entrega ni ningún plazo: el negocio no lo cargó. Si te preguntan, di que lo confirmas.",
    );
  }

  // ── Garantía ─────────────────────────────────────────────────────────────
  if (negocio.garantia) {
    hechos.push(`Garantía: ${negocio.garantia.descripcion}`);
  } else {
    sinConfirmar.push("si hay garantía o devolución");
    prohibiciones.push(
      "No prometas garantía, devolución ni cambios: no hay ninguna cargada. Si pregunta, di que lo confirmas.",
    );
  }

  if (negocio.acceso) {
    hechos.push(`Acceso: ${negocio.acceso.tipo}${negocio.acceso.descripcion ? ` — ${negocio.acceso.descripcion}` : ""}`);
  }

  // ── Medios de pago ───────────────────────────────────────────────────────
  if (medios.length) {
    hechos.push(`Se cobra con: ${medios.map((m) => m.etiqueta).join(", ")}`);
    prohibiciones.push(
      `No ofrezcas ningún medio de pago que no esté en esa lista (${medios
        .map((m) => m.etiqueta)
        .join(", ")}). Si el cliente pide otro, dile cuáles hay.`,
    );
  } else {
    sinConfirmar.push("con qué se puede pagar");
    prohibiciones.push(
      "No des números de cuenta ni enlaces de pago: el negocio no tiene ningún medio cargado. Dile que le pasas los datos apenas los confirmes.",
    );
  }

  // ── Prohibiciones que se derivan de la FORMA de venta ────────────────────
  if (forma === "digital") {
    prohibiciones.push(
      "No hables de envíos, transportadora, dirección, paquetes ni contraentrega: no se manda nada por correo.",
    );
  }
  if (forma === "servicio") {
    prohibiciones.push(
      "No hables de transportadora, paquetes ni 'te llega': un servicio no se despacha, se agenda. " +
        "La dirección sí importa si el servicio es a domicilio.",
    );
  }
  if (forma === "fisico") {
    prohibiciones.push(
      "No digas que 'le llega al instante' ni que se entrega por enlace: es un producto físico y necesita dirección y transportadora.",
    );
  }
  if (forma === "digital") {
    prohibiciones.push(
      "No prometas clases en vivo, sesiones en directo, tutorías ni atención presencial salvo que el negocio lo diga arriba.",
    );
  }
  if (forma === "servicio") {
    prohibiciones.push(
      "No prometas un resultado concreto ni un antes/después: se agenda un servicio, no se garantiza un resultado.",
    );
  }
  if (forma === "mixto") {
    prohibiciones.push(
      "El catálogo mezcla productos que se entregan distinto. Antes de decir cómo llega, asegúrate de CUÁL producto están hablando.",
    );
  }

  // El precio es el dato que más se inventa. Si no se negocia, no se rebaja.
  if (!negocio.negociaPrecio) {
    prohibiciones.push(
      "No rebajes el precio, no inventes descuentos ni promociones: el precio es el del catálogo y no está autorizado a negociarlo.",
    );
  } else {
    hechos.push("El negocio sí autoriza a negociar el precio.");
  }

  return { hechos, sinConfirmar, prohibiciones };
}

/* ────────────────────────────────────────────────────────────────────────────
 * 4. QUÉ HAY QUE SABER ANTES DE CERRAR
 *
 * Derivado de la forma de entrega y de si los productos tienen variantes: es
 * la lista de datos sin los cuales la venta NO se puede concretar. No es un
 * formulario: el agente los junta cuando surge y solo pregunta lo que falta.
 * ──────────────────────────────────────────────────────────────────────────── */

export function calificacionDe(
  forma: FormaDeVenta,
  catalogo: ProductoParaNicho[],
  productoEnFoco?: ProductoParaNicho | null,
): DatoDeCalificacion[] {
  const hayVariantes = (productoEnFoco ? [productoEnFoco] : catalogo).some(
    (p) => Array.isArray(p.opciones) && p.opciones.length > 1,
  );
  const precioAlto =
    catalogo.length > 1 &&
    !!productoEnFoco?.price &&
    productoEnFoco.price > mediana(catalogo.map((p) => Number(p.price) || 0).filter((n) => n > 0)) * 2;

  const datos: DatoDeCalificacion[] = [];

  if (forma === "fisico") {
    datos.push({ campo: "nombre", porque: "va en la guía de la transportadora", obligatorio: true });
    datos.push({ campo: "ciudad", porque: "sin ciudad no se puede cotizar ni despachar", obligatorio: true });
    datos.push({ campo: "direccion", porque: "es a donde llega el pedido", obligatorio: true });
    if (hayVariantes) {
      datos.push({ campo: "variante", porque: "el producto tiene opciones y hay que saber cuál mandar", obligatorio: true });
    }
  } else if (forma === "servicio") {
    datos.push({ campo: "necesidad", porque: "sin saber qué necesita no se puede proponer el servicio", obligatorio: true });
    datos.push({ campo: "cuando", porque: "un servicio se agenda en una fecha concreta", obligatorio: true });
    datos.push({ campo: "ciudad", porque: "define si el servicio llega a su zona", obligatorio: false });
    if (hayVariantes) {
      datos.push({ campo: "variante", porque: "el servicio tiene opciones y hay que saber cuál quiere", obligatorio: true });
    }
  } else if (forma === "digital") {
    datos.push({ campo: "necesidad", porque: "define cuál de los productos le sirve de verdad", obligatorio: false });
    if (hayVariantes) {
      datos.push({ campo: "variante", porque: "el producto tiene opciones y hay que saber cuál quiere", obligatorio: true });
    }
  } else {
    datos.push({ campo: "necesidad", porque: "hay productos que se entregan distinto y define cuál le sirve", obligatorio: false });
    datos.push({ campo: "ciudad", porque: "solo si el producto en juego es físico", obligatorio: false });
    if (hayVariantes) {
      datos.push({ campo: "variante", porque: "hay opciones y hay que saber cuáles mandar", obligatorio: false });
    }
  }

  if (precioAlto) {
    datos.push({ campo: "presupuesto", porque: "es el producto más caro del catálogo y conviene saber de cuánto dispone", obligatorio: false });
  }

  return datos;
}

function mediana(numeros: number[]): number {
  if (!numeros.length) return 0;
  const s = [...numeros].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Cuáles de esos datos faltan todavía. Lo usa el prompt y la herramienta. */
export function datosQueFaltan(
  datos: DatoDeCalificacion[],
  yaTiene: Record<string, string | undefined>,
): DatoDeCalificacion[] {
  return datos.filter((d) => !String(yaTiene[d.campo] || "").trim());
}

/* ────────────────────────────────────────────────────────────────────────────
 * 5. LAS OBJECIONES QUE VAN A APARECER
 *
 * No es una lista cerrada por rubro: se derivan de la forma de entrega (que es
 * lo que genera la duda) y del nivel de precio del catálogo.
 * ──────────────────────────────────────────────────────────────────────────── */

export function objecionesDe(
  forma: FormaDeVenta,
  catalogo: ProductoParaNicho[],
  negocio: NegocioParaNicho,
): ObjecionPrevista[] {
  const objeciones: ObjecionPrevista[] = [
    { suena: "está caro / muy caro", como: "volvé al valor concreto que ya vio; nunca rebajes por tu cuenta" },
    { suena: "lo voy a pensar", como: "no te despidas: pregunta QUÉ es lo que le frena, que casi nunca es el precio" },
    { suena: "no conozco, ¿será estafa?", como: "muestra lo verificable que tengas (medios de pago, garantía, datos del negocio): nunca inventes testimonios ni cifras de clientes" },
  ];

  if (forma === "fisico") {
    objeciones.push(
      { suena: "¿cuánto demora?", como: "el plazo real que tengas cargado; si no está cargado, di que lo confirmas" },
      { suena: "¿pago contraentrega?", como: "solo si el negocio lo tiene configurado; si no, explica lo que sí hay" },
      { suena: "¿y si no me queda / no me sirve?", como: "la garantía o política de cambios cargada; si no hay, dilo" },
    );
  }
  if (forma === "digital") {
    objeciones.push(
      { suena: "¿y si no me sirve / no es lo que esperaba?", como: "la garantía cargada; si no hay ninguna, dilo" },
      { suena: "¿cuándo me llega?", como: "el plazo de entrega cargado; nunca prometas 'ya mismo' si no está escrito" },
    );
  }
  if (forma === "servicio") {
    objeciones.push(
      { suena: "¿y si no resulta?", como: "no prometas resultados: contá cómo trabaja el negocio y qué incluye el servicio" },
      { suena: "¿a dónde van / cubren mi zona?", como: "la cobertura cargada; si no hay, di que lo confirmas" },
    );
  }

  const conPrecio = catalogo.map((p) => Number(p.price) || 0).filter((n) => n > 0);
  if (conPrecio.length && mediana(conPrecio) > 0) {
    objeciones.push({
      suena: "¿puedo pagar en cuotas / a credito?",
      como: negocio.negociaPrecio
        ? "el dueño autoriza a negociar: pregúntale qué propone y dile que lo confirmas con él"
        : "di los medios que sí hay y que no manejas cuotas salvo que el negocio lo diga",
    });
  }

  return objeciones;
}

/* ────────────────────────────────────────────────────────────────────────────
 * 6. EL CIERRE
 * ──────────────────────────────────────────────────────────────────────────── */

export function cierreDe(forma: FormaDeVenta, vocabulario: Vocabulario, medios: MedioDePagoSimple[]): string[] {
  const lineas: string[] = [];
  if (forma === "fisico") {
    lineas.push(
      "Para cerrar necesitas nombre, ciudad y dirección. Juntalos mientras hablan, sin sonar a formulario: uno por mensaje, y siempre después de contestar lo que preguntó.",
    );
  } else if (forma === "servicio") {
    lineas.push(
      "Para cerrar necesitas saber qué necesita y cuándo. La agenda es el cierre: proponé un momento concreto.",
    );
  } else if (forma === "digital") {
    lineas.push("Para cerrar alcanza con el producto y el pago: no le pidas datos que no hacen falta para enviar un acceso.");
  } else {
    lineas.push("Para cerrar depende de QUÉ producto quedó en foco: si es físico pide dirección, si no, no.");
  }

  if (medios.length) {
    lineas.push(
      `Cuando esté listo para pagar, deja de explicar y mándale los medios con la herramienta. Los datos concretos los pone el sistema: ${medios
        .map((m) => m.etiqueta)
        .join(", ")}.`,
    );
  } else {
    lineas.push("Cuando esté listo para pagar, dile que le confirmas los datos de pago: este negocio no tiene ninguno cargado todavía.");
  }

  lineas.push(
    `Nunca digas que un pago está confirmado, verificado ni recibido. Eso lo confirma una persona del equipo, y el sistema te avisa.`,
    `Vocabulario: di "${vocabulario.producto}", "${vocabulario.entregar}", "${vocabulario.comprar}", o mejor, las palabras que usó el cliente.`,
  );

  return lineas;
}

/* ────────────────────────────────────────────────────────────────────────────
 * 7. EL GUION COMPLETO
 * ──────────────────────────────────────────────────────────────────────────── */

export function guionDelNegocio(params: {
  catalogo: ProductoParaNicho[];
  negocio: NegocioParaNicho;
  medios?: MedioDePagoSimple[];
  productoEnFoco?: ProductoParaNicho | null;
}): GuionDelNegocio {
  const { catalogo, negocio } = params;
  const medios = params.medios || [];
  const { forma, confianza, senales } = derivarFormaDeVenta(catalogo, negocio);
  const vocabulario = vocabularioDe(forma);
  const { hechos, sinConfirmar, prohibiciones } = hechosYProhibiciones(negocio, forma, medios);

  return {
    forma,
    confianza,
    senales,
    vocabulario,
    hechos,
    sinConfirmar,
    prohibiciones,
    calificacion: calificacionDe(forma, catalogo, params.productoEnFoco ?? null),
    objeciones: objecionesDe(forma, catalogo, negocio),
    cierre: cierreDe(forma, vocabulario, medios),
    datosDelNegocio: negocio.loQueDebeSaber || [],
  };
}

/**
 * El guion en texto, para el system prompt.
 *
 * Se entrega como un bloque de HECHOS, no como cuarenta instrucciones
 * condicionales: el modelo razona bien sobre hechos y mal sobre una lista de
 * "si el cliente dice X entonces Y" que además se contradice sola.
 */
export function renderGuion(guion: GuionDelNegocio): string {
  const l: string[] = [];

  l.push(`FORMA DE VENTA: ${guion.forma} (confianza ${Math.round(guion.confianza * 100)}%)`);

  if (guion.hechos.length) {
    l.push("", "DATOS REALES DE ESTE NEGOCIO (puedes afirmarlos con seguridad):");
    for (const h of guion.hechos) l.push(`• ${h}`);
  }

  if (guion.datosDelNegocio.length) {
    l.push("", "LO QUE EL DUEÑO QUIERE QUE SEPAS:");
    for (const d of guion.datosDelNegocio) l.push(`• ${d}`);
  }

  if (guion.sinConfirmar.length) {
    l.push("", `NO TIENES ESTOS DATOS: ${guion.sinConfirmar.join("; ")}.`);
    l.push("Si te preguntan por algo de esa lista, no lo inventes: di que lo confirmas y le respondes.");
  }

  l.push("", "PROHIBIDO (esto es lo que hace que un bot pierda una venta o meta al negocio en un problema):");
  for (const p of guion.prohibiciones) l.push(`• ${p}`);

  l.push("", "CÓMO SE CIERRA ACÁ:");
  for (const c of guion.cierre) l.push(`• ${c}`);

  l.push("", "OBJECCIONES QUE VAN A APARECER (no son un libreto; es el mapa):");
  for (const o of guion.objeciones) l.push(`• "${o.suena}" → ${o.como}`);

  return l.join("\n");
}
