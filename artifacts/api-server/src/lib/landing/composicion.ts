/**
 * ============================================================
 * COMPOSICIÓN: qué MODELO de página es y cómo se dibuja cada bloque
 * ============================================================
 *
 * Pedido del dueño (01-10-2026): "no me gusta que sean estáticas y que siempre
 * genere lo mismo; necesito uno capaz de generar distintas formas, modelos y
 * tipos de landing" y, en el mismo día: "los estilos deben adaptarse a
 * dropshipping, servicios o digitales y a sus nichos; hay que investigar qué
 * se está vendiendo y que la IA sepa cuál adoptar según lo que más vende".
 *
 * Lo que había: `design-system.ts` declaraba 19 familias con "layouts
 * preferidos" por sección, pero el renderer que publica (renderer-v3) NO los
 * leía. Dibujaba siempre la misma página y la familia solo cambiaba colores.
 *
 * Acá se separan dos decisiones:
 *
 *   · la FAMILIA (design-system.ts) decide la piel: color, tipografía, aire.
 *     Se elige por el NICHO (elegirFamilia).
 *   · el MODELO de página (este archivo) decide el esqueleto: cómo es el
 *     hero, los beneficios, la oferta, las preguntas, el cierre. Se elige por
 *     el TIPO DE NEGOCIO, el nicho, el precio y --cuando hay datos-- por lo
 *     que de verdad vendió en esta tienda.
 *
 * ── La semilla ────────────────────────────────────────────────────────────
 *
 * Cada landing guarda `modelo` y `semilla` en `design`. Con la misma semilla
 * el resultado es siempre el mismo (lo publicado es lo que se aprobó). "Otra
 * composición" = otra semilla. Sin modelo ni semilla sale "clasica", para que
 * ninguna landing ya publicada cambie sola.
 *
 * Es data pura: no renderiza, no llama a ningún modelo, no toca la base.
 */

export type ModeloId =
  | "clasica"
  | "tienda-directa";

/** Cómo se vende: decide qué modelos tienen sentido. */
export type TipoDeNegocio = "dropshipping" | "fisico" | "digital" | "servicio";

export type BloqueId = "hero" | "benefits" | "feature" | "logistics" | "offer" | "faq" | "cta" | "gallery";

/** Las variantes que el renderer sabe dibujar, por bloque. Cada una es HTML propio. */
export const VARIANTES: Record<BloqueId, readonly string[]> = {
  hero: ["split", "centrado", "a-sangre", "producto", "editorial", "oferta"],
  benefits: ["bento", "numerada", "checklist", "zigzag", "iconos", "split-foto"],
  feature: ["fila", "pasos", "tarjeta-ancha"],
  logistics: ["tarjetas", "iconos-fila", "lista"],
  offer: ["tarjeta-foto", "ticket", "banda", "minimal"],
  faq: ["dos-columnas", "acordeon", "split"],
  cta: ["tarjeta", "banda", "minimal"],
  gallery: ["mosaico", "carrusel", "grilla"],
} as const;

export interface ModeloDePagina {
  id: ModeloId;
  /** Para mostrarle al dueño. */
  nombre: string;
  /** Cuándo conviene, en una línea. */
  cuando: string;
  /** Para qué tipos de negocio tiene sentido. */
  para: TipoDeNegocio[];
  /** Columna angosta en los bloques de texto (lectura tipo artículo). */
  angosto?: boolean;
  /** Variantes válidas por bloque. La semilla elige una de cada lista. */
  bloques: Record<BloqueId, string[]>;
}

const TODOS: TipoDeNegocio[] = ["dropshipping", "fisico", "digital", "servicio"];

export const MODELOS: Record<ModeloId, ModeloDePagina> = {
  clasica: {
    id: "clasica", nombre: "Clásica",
    cuando: "La página de siempre: hero en dos columnas, tarjetas y oferta con foto.",
    para: TODOS,
    bloques: {
      hero: ["split"], benefits: ["bento"], feature: ["fila"], logistics: ["tarjetas"],
      offer: ["tarjeta-foto"], faq: ["dos-columnas"], cta: ["tarjeta"], gallery: ["mosaico"],
    },
  },
  // ── EL CONCEPTO (decisión del dueño, 03-10-2026) ─────────────────────────
  // "los otros estilos y familias no me gustan, elimínalos; manejemos esos
  // conceptos, solo variarían posiciones, imágenes y repeticiones." Un solo
  // modelo de página para TODOS los tipos de negocio: producto al frente,
  // pricebox con el ahorro (si hay precio lista real), sellos reales y el
  // formulario de pedido contraentrega al cierre. La VARIACIÓN no viene de
  // cambiar de concepto: viene de las VARIANTES por bloque (la posición del
  // hero, el orden de los beneficios, la disposición de la galería) — el
  // admin fuerza con `layout` en la sección, la semilla sorteó el resto.
  "tienda-directa": {
    id: "tienda-directa", nombre: "Tienda directa",
    cuando: "El concepto del negocio: el producto y el precio arriba con compra en el primer scroll, sellos reales y formulario de pedido. Para físicos, digitales y servicios.",
    para: TODOS,
    bloques: {
      hero: ["producto", "oferta"], benefits: ["iconos", "checklist", "numerada"], feature: ["pasos", "fila", "tarjeta-ancha"],
      logistics: ["iconos-fila", "tarjetas"], offer: ["ticket", "tarjeta-foto"], faq: ["acordeon", "dos-columnas"],
      cta: ["banda", "tarjeta"], gallery: ["grilla", "carrusel", "mosaico"],
    },
  },
};

export const MODELOS_ELEGIBLES: readonly ModeloId[] = (Object.keys(MODELOS) as ModeloId[]).filter((m) => m !== "clasica");

// ─────────────────────────────────────────────────────────────────────────
// EVIDENCIA: qué se usa y qué vende, por tipo de negocio (investigado el
// 2026-10-01). Cada peso dice de dónde sale. Niveles como pide CLAUDE.md:
//   verificado     — dato publicado con método (muestra, cómo se midió)
//   reportado      — cifra de un proveedor o agencia que vende el servicio
//   hipotesis      — criterio nuestro, sin medición todavía
// Detalle y enlaces: LANDINGS_EVIDENCIA_2026.md (raíz del repo).
// ─────────────────────────────────────────────────────────────────────────

export interface Evidencia {
  modelo: ModeloId;
  peso: number;
  porque: string;
  nivel: "verificado" | "reportado" | "hipotesis";
}

export const EVIDENCIA: Record<TipoDeNegocio, Evidencia[]> = {
  dropshipping: [
    { modelo: "tienda-directa", peso: 3, nivel: "verificado", porque: "Unbounce (15.981 landings de ecommerce): las de menos de 300 palabras convierten mejor; producto y precio arriba con formulario de un paso." },
  ],
  fisico: [
    { modelo: "tienda-directa", peso: 3, nivel: "verificado", porque: "Unbounce: en ecommerce, menos de 300 palabras y lectura fácil convierten mejor." },
  ],
  digital: [
    { modelo: "tienda-directa", peso: 3, nivel: "reportado", porque: "Guías de cursos (LearnWorlds, ClickFunnels): la oferta clara y el temario concreto arriba; el concepto del negocio (03-10) unifica el esqueleto." },
  ],
  servicio: [
    { modelo: "tienda-directa", peso: 3, nivel: "reportado", porque: "Invoca 2025 (60M llamadas): el botón de contacto arriba, a mitad y al final — el concepto lo trae en hero, oferta y cierre." },
  ],
};

/**
 * El nicho (la familia que eligió elegirFamilia por las palabras del
 * producto) empuja hacia los modelos que le quedan. Multiplica el peso; no
 * elige solo.
 */
const NICHO: Record<string, Partial<Record<ModeloId, number>>> = {
  suplemento: { "tienda-directa": 1.3 },
  belleza: { "tienda-directa": 1.3 },
  minimal: { "tienda-directa": 1.2 },
  gourmet: { "tienda-directa": 1.2 },
  electronica: { "tienda-directa": 1.3 },
  tecnologia: { "tienda-directa": 1.2 },
  oscura: { "tienda-directa": 1.2 },
  dropshipping: { "tienda-directa": 1.4 },
  familiar: { "tienda-directa": 1.4 },
  fitness: { "tienda-directa": 1.2 },
  educacion: { "tienda-directa": 1.2 },
  premium: { "tienda-directa": 1.2 },
  editorial: { "tienda-directa": 1.2 },
  launch: { "tienda-directa": 1.2 },
  megapack: { "tienda-directa": 1.2 },
  servicios: { "tienda-directa": 1.3 },
  "respuesta-directa": { "tienda-directa": 1.6 },
  ecommerce: { "tienda-directa": 1.5 },
  creativa: { "tienda-directa": 1.2 },
};

/** Umbrales de precio en COP. Lo barato pide página corta; lo caro, explicación y confianza. */
const BARATO_DIGITAL = 60_000;
const CARO_DIGITAL = 300_000;
const CARO_FISICO = 250_000;

function pesoPorPrecio(_tipo: TipoDeNegocio, _modelo: ModeloId, precio: number): number {
  // Un solo concepto: sin umbrales de precio que cambien el esqueleto. La
  // longitud de los TEXTOS la decide el tipo (la plantilla), no el modelo.
  return Number.isFinite(precio) && precio > 0 ? 1 : 1;
}

/** Visitas y pedidos de las landings de la tienda, por modelo. Ver metricas.ts. */
export type RendimientoPorModelo = Partial<Record<ModeloId, { visitas: number; pedidos: number }>>;

/** Con menos visitas que esto, el dato propio es ruido y no se usa. */
export const VISITAS_MINIMAS_POR_MODELO = 150;

/**
 * Lo que vendió en ESTA tienda. Compara la conversión de cada modelo con la
 * media de la tienda, suavizada (como si cada modelo arrancara con 150
 * visitas a la media), y la convierte en un multiplicador entre 0,4 y 3.
 * Un modelo sin visitas suficientes queda en 1: ni premio ni castigo.
 */
export function factorPorRendimiento(modelo: ModeloId, r?: RendimientoPorModelo | null): number {
  if (!r) return 1;
  const filas = Object.values(r).filter(Boolean) as Array<{ visitas: number; pedidos: number }>;
  const totV = filas.reduce((a, x) => a + (x.visitas || 0), 0);
  const totP = filas.reduce((a, x) => a + (x.pedidos || 0), 0);
  const propio = r[modelo];
  if (!propio || propio.visitas < VISITAS_MINIMAS_POR_MODELO || totV <= 0 || totP <= 0) return 1;
  const media = totP / totV;
  const suave = (propio.pedidos + media * VISITAS_MINIMAS_POR_MODELO) / (propio.visitas + VISITAS_MINIMAS_POR_MODELO);
  return Math.min(3, Math.max(0.4, suave / media));
}

/** Traduce lo que guarda la app (modeloDelProducto, detectarTipo, kind) a un tipo de negocio. */
export function tipoDeNegocio(valor: unknown, fisicoDeRespaldo?: boolean): TipoDeNegocio {
  const v = String(valor ?? "").toLowerCase();
  if (/dropship|contraentrega/.test(v)) return "dropshipping";
  if (/servic|cita|asesor|cotiza|captaci/.test(v)) return "servicio";
  if (/fisic|physical|producto|ecommerce/.test(v)) return "fisico";
  if (/digital|curso|suscrip|software|ebook/.test(v)) return "digital";
  return fisicoDeRespaldo ? "fisico" : "digital";
}

export function esModelo(v: unknown): v is ModeloId {
  return typeof v === "string" && v in MODELOS;
}

/** Hash FNV-1a de 32 bits: barato, estable y sin dependencias. */
function hash(texto: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Un número en [0,1) que depende solo de la semilla y de la etiqueta. */
function azar(semilla: string, etiqueta: string): number {
  return hash(`${semilla}::${etiqueta}`) / 0x100000000;
}

function elegir<T>(lista: readonly T[], semilla: string, etiqueta: string): T {
  return lista[Math.floor(azar(semilla, etiqueta) * lista.length) % lista.length];
}

/** Sorteo con pesos, determinístico por semilla. */
function elegirConPeso<T>(opciones: Array<{ valor: T; peso: number }>, semilla: string, etiqueta: string): T {
  const validas = opciones.filter((o) => o.peso > 0);
  const total = validas.reduce((a, o) => a + o.peso, 0);
  let x = azar(semilla, etiqueta) * total;
  for (const o of validas) {
    x -= o.peso;
    if (x < 0) return o.valor;
  }
  return validas[validas.length - 1].valor;
}

/** Una semilla nueva, para "otra composición". */
export function semillaNueva(): string {
  return Math.random().toString(36).slice(2, 10);
}

export interface Composicion {
  modelo: ModeloId;
  nombre: string;
  angosto: boolean;
  variantes: Record<BloqueId, string>;
  /** Por qué este modelo, en una línea, para mostrárselo al dueño. */
  porque: string;
}

export interface PesoDeModelo {
  modelo: ModeloId;
  peso: number;
  porque: string;
}

/**
 * Los modelos candidatos para un producto, con su peso y su porqué:
 * evidencia por tipo de negocio × nicho × precio × lo que vendió en la tienda.
 */
export function pesosDeModelos(opts: {
  tipo: TipoDeNegocio;
  familia?: unknown;
  precio?: unknown;
  rendimiento?: RendimientoPorModelo | null;
}): PesoDeModelo[] {
  const nicho = NICHO[String(opts.familia || "")] || {};
  const precio = Number(opts.precio);
  return EVIDENCIA[opts.tipo].map((e) => {
    const fRend = factorPorRendimiento(e.modelo, opts.rendimiento);
    const peso = e.peso * (nicho[e.modelo] ?? 1) * pesoPorPrecio(opts.tipo, e.modelo, precio) * fRend;
    const extra = fRend > 1.05 ? " En esta tienda viene vendiendo mejor que el promedio." : fRend < 0.95 ? " En esta tienda viene vendiendo por debajo del promedio." : "";
    return { modelo: e.modelo, peso, porque: e.porque + extra };
  }).sort((a, b) => b.peso - a.peso);
}

/**
 * Decide la composición de una página.
 *
 *   · Sin modelo ni semilla → "clasica" (lo ya publicado no cambia).
 *   · Con modelo → ese modelo; la semilla elige la variante de cada bloque.
 *   · Solo semilla → sorteo con pesos entre los modelos del tipo de negocio
 *     (evidencia × nicho × precio × rendimiento propio). El sorteo, y no
 *     "siempre el de más peso", es a propósito: así se siguen probando los
 *     otros y el rendimiento propio tiene de dónde aprender.
 *
 * `fisico` se acepta por compatibilidad: sin `tipo`, físico → "fisico" y el
 * resto → "digital".
 */
export function elegirComposicion(opts: {
  modelo?: unknown;
  semilla?: unknown;
  familia?: unknown;
  fisico?: boolean;
  tipo?: TipoDeNegocio | null;
  precio?: unknown;
  rendimiento?: RendimientoPorModelo | null;
}): Composicion {
  const semilla = String(opts.semilla ?? "").trim();
  const tipo: TipoDeNegocio = opts.tipo || (opts.fisico ? "fisico" : "digital");
  let modelo: ModeloId;
  let porque: string;
  if (esModelo(opts.modelo)) {
    modelo = opts.modelo;
    porque = "Elegido a mano.";
  } else if (!semilla) {
    modelo = "clasica";
    porque = "Sin composición guardada: la página de siempre.";
  } else {
    const pesos = pesosDeModelos({ tipo, familia: opts.familia, precio: opts.precio, rendimiento: opts.rendimiento });
    modelo = elegirConPeso(pesos.map((p) => ({ valor: p.modelo, peso: p.peso })), semilla, "modelo");
    porque = pesos.find((p) => p.modelo === modelo)?.porque || "";
  }
  const m = MODELOS[modelo];
  const variantes = {} as Record<BloqueId, string>;
  for (const bloque of Object.keys(VARIANTES) as BloqueId[]) {
    variantes[bloque] = semilla ? elegir(m.bloques[bloque], semilla, bloque) : m.bloques[bloque][0];
  }
  return { modelo, nombre: m.nombre, angosto: !!m.angosto, variantes, porque };
}

/**
 * La variante de UNA sección: la que pidió el editor si es válida para su
 * bloque; si no, la de la composición. Para que dos secciones del mismo
 * bloque (dos "feature" seguidas) no salgan clonadas, la segunda puede rotar
 * a la siguiente variante del modelo.
 */
export function varianteDeSeccion(
  bloque: BloqueId,
  pedida: unknown,
  comp: Composicion,
  repeticion = 0,
): string {
  const p = String(pedida ?? "").trim();
  if (p && VARIANTES[bloque].includes(p)) return p;
  if (repeticion === 0) return comp.variantes[bloque];
  const lista = MODELOS[comp.modelo].bloques[bloque];
  const base = Math.max(0, lista.indexOf(comp.variantes[bloque]));
  return lista[(base + repeticion) % lista.length];
}

/**
 * Lo que el admin pide sobre la COMPOSICIÓN, leído con código (no con el
 * modelo): "otra composición", "otro diseño", "hacela tipo artículo",
 * "estilo lanzamiento". Devuelve null si el pedido no es de composición, y
 * entonces sigue el camino normal de edición de textos.
 */
export function pedidoDeComposicion(texto: unknown): { modelo?: ModeloId; nueva: boolean } | null {
  const t = String(texto ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  // ── CONTRATO del 03-10-2026 ────────────────────────────────────────────
  // Los estilos que el dueño eliminó ya NO son pedidos de composición: si el
  // admin los nombra, devuelven null y el camino de edición normal atiende
  // (los textos, los colores...), sin cambiar el esqueleto.
  const PALABRAS: Array<[ModeloId, RegExp]> = [
    ["tienda-directa", /\b(tienda directa|tipo tienda|estilo tienda|pagina de producto|tipo shopify|la del concepto)\b/],
    ["clasica", /\b(clasica|como antes|la de siempre)\b/],
  ];
  const pideNueva = /\b(otra (composicion|version|forma|distribucion|estructura|maqueta)|otro (diseno|modelo|layout|estilo de pagina)|cambi\w* (la )?(composicion|estructura|distribucion|maqueta|el diseno|el modelo)|sorprendeme|disena(la)? distinto|otra forma de pagina)\b/.test(t);
  const modelo = PALABRAS.find(([, re]) => re.test(t))?.[0];
  if (!modelo && !pideNueva) return null;
  return { ...(modelo ? { modelo } : {}), nueva: pideNueva || !!modelo };
}

/** Para el selector del editor. */
export function modelosParaElSelector(): Array<{ value: ModeloId; label: string; cuando: string }> {
  return (Object.keys(MODELOS) as ModeloId[]).map((id) => ({ value: id, label: MODELOS[id].nombre, cuando: MODELOS[id].cuando }));
}
