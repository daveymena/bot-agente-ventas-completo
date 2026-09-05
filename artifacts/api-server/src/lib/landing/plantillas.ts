/**
 * ============================================================
 * PLANTILLAS: LA ESTRUCTURA DE LA PÁGINA, DECIDIDA ANTES DEL MODELO
 * ============================================================
 *
 * ── El problema que resuelve ──────────────────────────────────────────────
 *
 * Hasta acá la estructura de la landing NO la decidía nadie: `landing-pages-ai`
 * le pasaba al modelo los once tipos de sección sueltos y le pedía "armá
 * secciones". El modelo elegía cuáles, cuántas y en qué orden, distinto en cada
 * llamada. Y `product.kind` --que dice si es digital o físico-- se le mandaba
 * en el JSON y no se usaba para nada: un curso y unos zapatos salían con la
 * misma página.
 *
 * Eso es al revés de como vende una landing. El orden de una página de venta no
 * es una decisión creativa: es el orden en que una persona necesita las cosas
 * para decidir. Primero qué es y para qué sirve, después por qué creerte,
 * después cuánto cuesta, y recién al final el botón. Cambiar ese orden no da
 * variedad, da una página que no cierra.
 *
 * Acá la estructura es DATO, no salida del modelo. El modelo escribe el texto
 * de cada casilla; la casilla y su lugar ya estaban puestos.
 *
 * ── Digital y físico no se venden igual ───────────────────────────────────
 *
 * No es un detalle de forma. Al que compra un curso hay que decirle quién se lo
 * enseña y cómo lo recibe. Al que compra algo físico hay que decirle cuánto
 * tarda el envío y si paga al recibir --que en Colombia, donde vende el dueño,
 * suele ser LA objeción, no una más--. Por eso `logistica` es obligatoria en
 * las plantillas físicas y ni existe en las digitales.
 *
 * ── Por qué una sección se puede caer ─────────────────────────────────────
 *
 * Cada casilla declara qué HECHO necesita. Si el producto no lo tiene, la
 * sección se cae antes de que el modelo la vea.
 *
 * Es la única defensa que funciona contra la regla del repo de no inventar
 * testimonios, garantías ni plazos: pedirle a un modelo una sección de
 * testimonios de un producto que no tiene testimonios lo empuja a escribirlos.
 * No alcanza con prohibírselo en el prompt --ya está prohibido y los inventa
 * igual--. Si el hueco no existe, no hay nada que llenar.
 *
 * Las obligatorias no se caen nunca: una landing sin precio ni botón no es una
 * landing.
 */

/** Los dos mundos que se venden distinto. */
export type TipoDeProducto = "digital" | "fisico";

/**
 * Qué hecho necesita una sección para poder existir.
 *
 * Se miran contra el producto real, no contra lo que el modelo crea saber.
 */
export type HechoNecesario =
  | "precio"
  | "imagen"
  | "descripcion"
  | "caracteristicas"
  | "testimonios"
  | "garantia"
  | "envio"
  | "autor";

export interface Casilla {
  /** El `type` que entiende el renderer. */
  type: string;
  /** Se cae si falta el hecho. Las obligatorias se quedan siempre. */
  obligatoria: boolean;
  /** Sin este hecho en el producto, la casilla no se ofrece al modelo. */
  requiere?: HechoNecesario;
  /**
   * Qué va acá, en una línea, escrito PARA EL MODELO.
   *
   * Es lo que convierte la plantilla en instrucción: el modelo no elige el
   * lugar, elige las palabras que van en este lugar.
   */
  queVa: string;
}

export interface Plantilla {
  id: string;
  nombre: string;
  para: TipoDeProducto;
  /** Cuándo conviene esta y no otra. Lo lee el modelo y también el dueño. */
  cuando: string;
  casillas: Casilla[];
}

/**
 * ── LAS PLANTILLAS ────────────────────────────────────────────────────────
 *
 * Agregar una es agregar un objeto acá: ni el renderer ni la ruta se tocan.
 * Eso es a propósito -- cuando aparezca una estructura nueva que funcione, se
 * copia como dato y queda disponible el mismo día.
 */
export const PLANTILLAS: Plantilla[] = [
  // ═══ DIGITALES ═══════════════════════════════════════════════════════════
  {
    id: "digital-clasica",
    nombre: "Curso o programa completo",
    para: "digital",
    cuando: "Cursos, programas y membresías donde el comprador necesita ver el contenido antes del precio.",
    casillas: [
      { type: "hero", obligatoria: true, queVa: "La promesa concreta: qué va a lograr y en cuánto tiempo. Sin adjetivos de relleno." },
      { type: "benefits", obligatoria: true, queVa: "Los resultados que se lleva, en lenguaje del cliente, no lista de temas." },
      { type: "how-it-works", obligatoria: true, requiere: "caracteristicas", queVa: "Qué incluye por dentro: módulos, clases o materiales reales del producto." },
      { type: "authority", obligatoria: false, requiere: "autor", queVa: "Quién lo enseña y por qué sabe. Solo datos que estén en el producto." },
      { type: "testimonials", obligatoria: false, requiere: "testimonios", queVa: "Testimonios TEXTUALES del producto. Si no hay, esta sección no existe." },
      { type: "offer", obligatoria: true, requiere: "precio", queVa: "El precio, qué entra por ese precio y cómo se accede." },
      { type: "faq", obligatoria: true, queVa: "Las dudas que frenan la compra: acceso, duración, medios de pago, soporte." },
      { type: "cta", obligatoria: true, queVa: "Un solo paso siguiente, con el mismo verbo que el botón del hero." },
    ],
  },
  {
    id: "digital-directa",
    nombre: "Digital de compra rápida",
    para: "digital",
    cuando: "Ebooks, plantillas y packs baratos: se deciden en un minuto, la página larga los pierde.",
    casillas: [
      { type: "hero", obligatoria: true, queVa: "Qué es y para quién, en una frase. El precio bajo aguanta ser directo." },
      { type: "benefits", obligatoria: true, queVa: "Tres o cuatro cosas que resuelve. Cortas." },
      { type: "offer", obligatoria: true, requiere: "precio", queVa: "Precio y entrega inmediata. Es el corazón de esta plantilla." },
      { type: "faq", obligatoria: false, queVa: "Dos o tres dudas, no más: acá una FAQ larga siembra dudas que no existían." },
      { type: "cta", obligatoria: true, queVa: "El botón y una línea que repita la promesa del hero. Nada más: acá una despedida larga enfría la compra." },
    ],
  },
  {
    id: "digital-autoridad",
    nombre: "Alto valor con experto al frente",
    para: "digital",
    cuando: "Mentorías, consultorías y programas caros: acá se compra a la persona antes que al contenido.",
    casillas: [
      { type: "hero", obligatoria: true, queVa: "La transformación, no el formato. Quien paga caro compra el resultado." },
      { type: "authority", obligatoria: true, requiere: "autor", queVa: "Quién es y qué hizo. En esta plantilla es la sección que vende." },
      { type: "before-after", obligatoria: false, queVa: "El antes y el después, descrito solo con lo que el producto afirma." },
      { type: "benefits", obligatoria: true, queVa: "Qué cambia en su negocio o su vida, concreto." },
      { type: "testimonials", obligatoria: false, requiere: "testimonios", queVa: "Casos reales del producto. Sin inventar nombres ni cifras." },
      { type: "how-it-works", obligatoria: true, requiere: "caracteristicas", queVa: "Cómo se trabaja: formato, frecuencia, qué recibe." },
      { type: "offer", obligatoria: true, requiere: "precio", queVa: "La inversión y todo lo que entra. En precio alto, el detalle tranquiliza." },
      { type: "faq", obligatoria: true, queVa: "Las objeciones caras: tiempo, si le sirve a su caso, qué pasa si no puede seguir." },
      { type: "cta", obligatoria: true, queVa: "El paso siguiente, que acá suele ser hablar antes que pagar." },
    ],
  },

  // ═══ FÍSICOS ═════════════════════════════════════════════════════════════
  {
    id: "fisico-contraentrega",
    nombre: "Físico con pago contra entrega",
    para: "fisico",
    cuando: "El caso normal en Colombia: la duda no es el producto, es si le va a llegar y si paga antes.",
    casillas: [
      { type: "hero", obligatoria: true, requiere: "imagen", queVa: "El producto en foto grande y qué resuelve. Acá la imagen manda." },
      { type: "benefits", obligatoria: true, queVa: "Para qué sirve, en concreto. Nada de adjetivos de catálogo." },
      { type: "before-after", obligatoria: false, queVa: "El resultado de usarlo, solo si el producto lo respalda." },
      { type: "logistics", obligatoria: true, requiere: "envio", queVa: "Cuánto tarda, a dónde llega y que paga al recibir. ES la objeción principal: va antes del precio, no después." },
      { type: "testimonials", obligatoria: false, requiere: "testimonios", queVa: "Compradores reales. Si no hay, se cae: inventarlos acá es fraude." },
      { type: "offer", obligatoria: true, requiere: "precio", queVa: "Precio, y que no paga nada hasta tenerlo en la mano." },
      { type: "faq", obligatoria: true, queVa: "Envío, cambios, tallas o medidas, y qué pasa si no le sirve." },
      { type: "cta", obligatoria: true, queVa: "Pedir ahora, dejando claro que el pago es al recibir." },
    ],
  },
  {
    id: "fisico-visual",
    nombre: "Producto que entra por los ojos",
    para: "fisico",
    cuando: "Ropa, accesorios, decoración y todo lo que se vende mirándolo.",
    casillas: [
      { type: "hero", obligatoria: true, requiere: "imagen", queVa: "La foto a sangre y el nombre. Texto mínimo: estorba." },
      { type: "benefits", obligatoria: true, requiere: "caracteristicas", queVa: "Materiales, medidas y detalles reales del producto." },
      { type: "how-it-works", obligatoria: false, queVa: "Cómo se usa o se cuida, si el producto lo dice." },
      { type: "testimonials", obligatoria: false, requiere: "testimonios", queVa: "Lo que dicen quienes ya lo tienen." },
      { type: "offer", obligatoria: true, requiere: "precio", queVa: "Precio y opciones disponibles." },
      { type: "logistics", obligatoria: true, requiere: "envio", queVa: "Envío y devoluciones, sin letra chica." },
      { type: "cta", obligatoria: true, queVa: "Comprar, y el precio otra vez al lado del botón: quien llegó hasta acá mirando fotos ya no se acuerda." },
    ],
  },
  {
    id: "fisico-comparativa",
    nombre: "Físico que compite contra alternativas",
    para: "fisico",
    cuando: "Cuando el cliente ya vio otras opciones y lo que decide es la diferencia.",
    casillas: [
      { type: "hero", obligatoria: true, requiere: "imagen", queVa: "Qué es y en qué se diferencia, de una." },
      { type: "benefits", obligatoria: true, queVa: "Las ventajas que sostienen esa diferencia." },
      { type: "comparison", obligatoria: true, requiere: "caracteristicas", queVa: "Frente a la alternativa, SOLO con características que el producto tenga. No hablar mal de marcas." },
      { type: "testimonials", obligatoria: false, requiere: "testimonios", queVa: "Quien ya cambió y por qué." },
      { type: "offer", obligatoria: true, requiere: "precio", queVa: "Precio, y por qué vale la diferencia." },
      { type: "logistics", obligatoria: true, requiere: "envio", queVa: "Envío y garantía de devolución." },
      { type: "faq", obligatoria: true, queVa: "Lo que se pregunta quien está comparando." },
      { type: "cta", obligatoria: true, queVa: "El cierre, retomando la diferencia que se mostró en la comparativa." },
    ],
  },
];

/**
 * Normaliza el `kind` del catálogo.
 *
 * ⚠️ En la base conviven `fisico`, `physical`, `digital`, `service` y
 * `dropshipping`: el campo se fue llenando desde pantallas distintas. Un
 * `kind === "fisico"` a secas se le escapa la mitad de los productos.
 *
 * Los servicios van por el camino digital: no se envían, se prestan.
 */
export function tipoDeProducto(kind: unknown): TipoDeProducto {
  const k = String(kind || "").trim().toLowerCase();
  if (k === "fisico" || k === "físico" || k === "physical" || k === "dropshipping") return "fisico";
  return "digital";
}

/**
 * Lo que se mira para decidir.
 *
 * ⚠️ Se toma el producto REAL de la base, no lo que el modelo crea saber. Los
 * campos son los que existen en `schema/products.ts`; se comprobó uno por uno.
 */
export interface HechosDelProducto {
  price?: unknown;
  imageUrl?: unknown;
  description?: unknown;
  features?: unknown;
  kind?: unknown;
  /** Si hay link de pago, el cliente paga antes. Si no, paga al recibir. */
  paymentLink?: unknown;
}

/** El nombre comercial del negocio, que es la única autoridad que tenemos. */
export interface Negocio {
  brandName?: unknown;
}

/**
 * Qué hechos tiene de verdad.
 *
 * ── Los que NUNCA van a estar ─────────────────────────────────────────────
 *
 * `testimonios` y `garantia` no son columnas de `products` ni de ninguna otra
 * tabla: no existen en el producto. Así que las secciones que los piden se caen
 * SIEMPRE, y eso está bien -- es la regla del repo de no fabricar testimonios ni
 * garantías, aplicada donde de verdad funciona. El día que el dueño pueda
 * cargarlos, se agrega el campo acá y las secciones aparecen solas.
 *
 * ── Los dos que se deducen ────────────────────────────────────────────────
 *
 * `envio`: un producto físico se envía. No hace falta un campo que lo diga; lo
 * dice el `kind`. (El contenido de esa sección es otro asunto: el prompt le
 * prohíbe expresamente inventar plazos.)
 *
 * `autor`: la autoridad del negocio es su marca. No hay una tabla de expertos,
 * pero `tenants.brandName` sí existe y es un dato real.
 */
export function hechosQueTiene(
  p: HechosDelProducto | null | undefined,
  negocio?: Negocio | null,
): Set<HechoNecesario> {
  const hay = new Set<HechoNecesario>();
  if (!p) return hay;

  const lleno = (v: unknown): boolean => {
    if (v === null || v === undefined) return false;
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === "number") return Number.isFinite(v) && v > 0;
    const t = String(v).trim();
    // "0" y "0.00" llegan como texto desde una columna numeric de Postgres.
    return t.length > 0 && t !== "0" && !/^0+(?:[.,]0+)?$/.test(t);
  };

  if (lleno(p.price)) hay.add("precio");
  if (lleno(p.imageUrl)) hay.add("imagen");
  if (lleno(p.description)) hay.add("descripcion");
  if (lleno(p.features)) hay.add("caracteristicas");
  if (tipoDeProducto(p.kind) === "fisico") hay.add("envio");
  if (lleno(negocio?.brandName)) hay.add("autor");
  return hay;
}

/**
 * Elige la plantilla.
 *
 * `pedida` gana siempre: si el dueño eligió una en el panel, no se la
 * discutimos. Lo que sí se respeta es el tipo de producto -- una plantilla con
 * logística para un curso pediría un envío que no existe.
 */
export function elegirPlantilla(
  producto: HechosDelProducto | null | undefined,
  pedida?: string | null,
  negocio?: Negocio | null,
): Plantilla {
  const tipo = tipoDeProducto(producto?.kind);
  const delTipo = PLANTILLAS.filter((p) => p.para === tipo);

  const elegida = pedida ? delTipo.find((p) => p.id === pedida) : null;
  if (elegida) return elegida;

  const hechos = hechosQueTiene(producto, negocio);
  const precio = Number(producto?.price);

  if (tipo === "fisico") {
    // La señal real de contraentrega es que NO haya link de pago: si el cliente
    // no puede pagar online, paga cuando lo recibe. Es lo que de verdad
    // distingue las dos páginas, y sale de un campo que existe.
    const pagaAntes = String(producto?.paymentLink || "").trim().length > 0;
    return delTipo.find((p) => p.id === (pagaAntes ? "fisico-visual" : "fisico-contraentrega"))!;
  }

  // El precio decide el registro: lo barato se decide rápido, lo caro necesita
  // que primero le crean a quien lo vende.
  if (Number.isFinite(precio) && precio >= 300000 && hechos.has("autor")) {
    return delTipo.find((p) => p.id === "digital-autoridad")!;
  }
  if (Number.isFinite(precio) && precio > 0 && precio < 50000) {
    return delTipo.find((p) => p.id === "digital-directa")!;
  }
  return delTipo.find((p) => p.id === "digital-clasica")!;
}

/** Las casillas que sobreviven con los hechos que hay. */
export function casillasQueAplican(
  plantilla: Plantilla,
  producto: HechosDelProducto | null | undefined,
  negocio?: Negocio | null,
): Casilla[] {
  const hechos = hechosQueTiene(producto, negocio);
  return plantilla.casillas.filter((c) => c.obligatoria || !c.requiere || hechos.has(c.requiere));
}

/**
 * El pedazo de prompt que fija la estructura.
 *
 * Va numerado y con el `type` exacto porque lo que vuelve se valida contra
 * estos nombres: si el modelo devuelve otro `type`, la sección se descarta y
 * queda un hueco en la página del dueño.
 */
export function bloqueDePlantilla(
  plantilla: Plantilla,
  producto: HechosDelProducto | null | undefined,
  negocio?: Negocio | null,
): string {
  const casillas = casillasQueAplican(plantilla, producto, negocio);
  const lista = casillas
    .map((c, i) => `${i + 1}. type="${c.type}" — ${c.queVa}`)
    .join("\n");

  return (
    `ESTRUCTURA OBLIGATORIA (plantilla "${plantilla.nombre}")\n` +
    `Devolvé EXACTAMENTE estas ${casillas.length} secciones, en este orden, con estos type:\n\n` +
    `${lista}\n\n` +
    `No agregues secciones, no las saques y no cambies el orden. Ya se decidió cuáles ` +
    `van según lo que este producto tiene de verdad.\n` +
    `Tu trabajo es escribir el contenido de cada una usando SOLO datos del producto. ` +
    `Si para una casilla no te alcanza la información, escribí menos — nunca la completes ` +
    `con algo que el producto no dice.\n` +
    // Sin esto el modelo rellena la sección de envío con "llega en 24-48 horas",
    // que no sale de ningún dato: no hay tabla de envíos en el sistema.
    `Para la sección de logística: NO inventes plazos, ciudades, transportadoras ni ` +
    `costos de envío. Ninguno de esos datos está en el sistema. Escribí solo la ` +
    `condición de pago que corresponda y dejá los detalles para que el negocio los ` +
    `complete.\n`
  );
}
