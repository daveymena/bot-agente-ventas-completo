/**
 * Taxonomía de categorías: una lista cerrada para FÍSICOS y otra para
 * DIGITALES (abajo). Un curso y una licuadora nunca comparten categoría.
 *
 * Pedido del dueño (19-09-2026): "no podemos usar nombres a lo loco, hay que
 * ponerle nombre real a cada cosa". Hasta acá cada importación traía la
 * categoría del proveedor tal cual ("General", "Otro", "Dropshipping",
 * "Vaporizadores", "bebes y materno"…): 25 nombres distintos para 62
 * productos, ninguno pensado para el comprador.
 *
 * Esta es la lista cerrada. El curador de IA elige de acá; si la IA no está
 * o devuelve otra cosa, se clasifica por palabras clave del nombre y de la
 * categoría del proveedor; y solo si nada calza queda en "Otros".
 */
export interface CategoriaCanonica { nombre: string; icono: string; claves: string[] }

export const CATEGORIAS_FISICAS: CategoriaCanonica[] = [
  { nombre: "Salud y bienestar", icono: "🩺", claves: ["postura", "ortoped", "cervical", "lumbar", "rodillera", "tensiometro", "tensiómetro", "masaje", "masajeador", "termico", "térmico", "faja", "cintura", "salud", "bienestar", "dolor", "alivio", "vibraci", "corrector", "almohada", "cojin", "cojín", "digital con voz"] },
  { nombre: "Deporte y fitness", icono: "🏋️", claves: ["rueda abdominal", "abdominal", "fitness", "gym", "gimnasio", "crossfit", "lazo", "theratubo", "elastic", "banda", "deport", "entrenamiento", "yoga", "pesas", "mancuerna", "futbol", "balon"] },
  { nombre: "Hogar y organización", icono: "🏠", claves: ["organizador", "organizadora", "zapatos", "bolsos", "hogar", "ruedas para muebles", "mueble", "closet", "armario", "cortina", "colgador", "gancho", "estante", "repisa", "led solar", "luz led", "lampara", "lámpara"] },
  { nombre: "Cocina", icono: "🍳", claves: ["cocina", "licuadora", "batidora", "afilador", "cuchillo", "sarten", "sartén", "olla", "termo", "vaso", "botella", "cafetera", "picador", "rallador", "esterilizador"] },
  { nombre: "Limpieza", icono: "🧽", claves: ["desengrasante", "desinfectante", "limpiador", "lavaplatos", "desmanchador", "limpieza", "jabon", "jabón", "detergente", "escoba", "trapeador", "guante multiusos"] },
  { nombre: "Belleza y cuidado personal", icono: "💄", claves: ["belleza", "cabello", "pelo", "tratamiento", "brillo", "locion", "loción", "crema", "hidrat", "nutricion", "nutrición", "callos", "removedor", "maquillaje", "uñas", "unas", "cera", "depil", "afeit", "barba", "piel", "facial"] },
  { nombre: "Moda y accesorios", icono: "👜", claves: ["bolso", "morral", "mochila", "canguro", "billetera", "cartera", "riñonera", "rinonera", "reloj", "gafas", "gorra", "cinturon", "cinturón", "collar", "pulsera", "colgante", "anillo", "arete", "bisuter", "joya", "cuarzo", "chakra", "amatista", "aventurina", "jaspe", "orgonita", "moda", "ropa", "camisa", "camiseta", "pantalon", "pantalón", "brasier", "zapat", "tenis", "sandalia"] },
  // Agregada el 30-09-2026: no existía, y 22 portátiles quedaron repartidos
  // entre "Otros", "Cocina", "Moda y accesorios" y "Papelería y oficina".
  { nombre: "Computadores y portátiles", icono: "💻", claves: ["portatil", "laptop", "notebook", "computador", "computadora", "chromebook", "macbook", "all in one", "todo en uno", "pc gamer", "vivobook", "ideapad", "thinkpad", "zenbook", "pavilion", "ryzen", "intel", "core i3", "core i5", "core i7", "core i9", "celeron", "pentium", "athlon"] },
  { nombre: "Tecnología y accesorios", icono: "🔌", claves: ["audifono", "audífono", "auricular", "parlante", "bluetooth", "cargador", "cable", "usb", "celular", "smartwatch", "camara", "cámara", "linterna", "tactica", "táctica", "recargable", "power bank", "teclado", "mouse", "tecnolog", "electr", "vaporizador", "proyector", "drone", "dron"] },
  { nombre: "Bebés y maternidad", icono: "🍼", claves: ["bebe", "bebé", "materno", "maternidad", "pañal", "panal", "pañalera", "tetero", "biberon", "biberón", "coche", "cuna", "mordedor", "niño", "nino", "niña", "infantil"] },
  { nombre: "Mascotas", icono: "🐾", claves: ["mascota", "perro", "gato", "transportador", "collar para", "correa", "comedero", "bebedero", "arena"] },
  { nombre: "Herramientas y automotor", icono: "🔧", claves: ["cojin moto", "cojín moto", "herramienta", "taladro", "destornillador", "compresor", "psi", "moto", "carro", "auto", "vehiculo", "vehículo", "renovador", "porcelanizador", "llanta", "bujia", "bujía", "gato hidraulico", "kit de", "multimetro", "multímetro"] },
  { nombre: "Camping y aire libre", icono: "🏕️", claves: ["camping", "carpa", "sleeping", "aire libre", "senderismo", "playa", "piscina", "inflable", "hamaca"] },
  { nombre: "Juguetes y entretenimiento", icono: "🧸", claves: ["juguete", "juego", "peluche", "lego", "rompecabezas", "muñec", "munec", "didactico", "didáctico", "montessori", "cuaderno", "caligraf"] },
  { nombre: "Papelería y oficina", icono: "🖊️", claves: ["papeler", "oficina", "escritorio", "agenda", "libreta", "lapicero", "boligrafo", "bolígrafo", "marcador", "impresora"] },
  { nombre: "Libros y espiritualidad", icono: "📖", claves: ["libro", "meditacion", "meditación", "oracion", "oración", "biblia", "jesus", "jesús", "espiritual", "devocional"] },
  { nombre: "Alimentos y suplementos", icono: "🥗", claves: ["suplemento", "vitamina", "fibra", "detox", "desintox", "colageno", "colágeno", "proteina", "proteína", "prunex", "alimento", "snack", "capsula", "cápsula"] },
  { nombre: "Otros", icono: "📦", claves: [] },
];

export const NOMBRES_CANONICOS = CATEGORIAS_FISICAS.map((c) => c.nombre);

const sinTildes = (s: string) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * ¿La clave aparece como PALABRA (o comienzo de palabra) en el texto?
 *
 * Antes era `texto.includes(clave)`, y clasificaba por pedazos de palabras:
 * "olla" (Cocina) calzaba dentro de "desarr-olla-dor" y "escritorio"
 * (Papelería) en "Windows escritorio". Así terminaron portátiles en Cocina
 * y en Papelería. Ahora la clave tiene que arrancar donde arranca una
 * palabra; sigue sirviendo como prefijo ("deport" calza "deportiva").
 */
function contieneClave(texto: string, clave: string): boolean {
  if (!texto || !clave) return false;
  const k = clave.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${k}`).test(texto);
}

/** Puntaje por categoría: clave en el nombre 2, en la categoría del
 *  proveedor 1, en la descripción 0.5. Gana la que más suma; en empate, la
 *  que va primero en la lista. */
function mejorPorClaves(
  lista: CategoriaCanonica[],
  e: { nombre: string; categoriaProveedor?: string | null; descripcion?: string | null },
): { nombre: string; puntos: number } | null {
  const nombre = sinTildes(e.nombre);
  const prov = sinTildes(e.categoriaProveedor || "");
  const desc = sinTildes(String(e.descripcion || "").slice(0, 400));
  let mejor: { nombre: string; puntos: number } | null = null;
  for (const c of lista) {
    let puntos = 0;
    for (const k of c.claves) {
      const kk = sinTildes(k);
      if (contieneClave(nombre, kk)) puntos += 2;
      if (contieneClave(prov, kk)) puntos += 1;
      else if (contieneClave(desc, kk)) puntos += 0.5;
    }
    if (puntos > 0 && (!mejor || puntos > mejor.puntos)) mejor = { nombre: c.nombre, puntos };
  }
  return mejor;
}

/** Cuántas claves de esta categoría aparecen en el NOMBRE del producto. */
function respaldoDelNombre(lista: CategoriaCanonica[], categoria: string, nombre: string): number {
  const c = lista.find((x) => x.nombre === categoria);
  if (!c) return 0;
  const n = sinTildes(nombre);
  return c.claves.filter((k) => contieneClave(n, sinTildes(k))).length * 2;
}

/** ¿El texto ya es una categoría canónica (con o sin tildes/mayúsculas)? */
export function categoriaCanonica(nombre: string | null | undefined): string | null {
  const n = sinTildes(nombre || "").trim();
  if (!n) return null;
  const c = CATEGORIAS_FISICAS.find((x) => sinTildes(x.nombre) === n);
  if (c) return c.nombre;
  // Sinónimos habituales del curador viejo y de los proveedores.
  const alias: Record<string, string> = {
    "hogar": "Hogar y organización", "belleza": "Belleza y cuidado personal", "deporte": "Deporte y fitness", "deportes": "Deporte y fitness",
    "ropa deportiva": "Deporte y fitness", "tecnologia": "Tecnología y accesorios", "moda": "Moda y accesorios", "bisuteria": "Moda y accesorios",
    "bebes y ninos": "Bebés y maternidad", "bebes y materno": "Bebés y maternidad", "salud": "Salud y bienestar", "bienestar": "Salud y bienestar",
    "vehiculos": "Herramientas y automotor", "herramientas": "Herramientas y automotor", "camping": "Camping y aire libre", "cocina": "Cocina",
    "mascotas": "Mascotas", "otro": "Otros", "otros": "Otros",
  };
  return alias[n] || null;
}

/**
 * Clasifica por palabras clave. Se cuentan las claves que calzan en el
 * nombre (pesan doble) y en la categoría del proveedor; gana la que más suma.
 * Devuelve null si nada calza (el que llama decide si va a "Otros").
 */
export function clasificarPorClaves(e: { nombre: string; categoriaProveedor?: string | null; descripcion?: string | null }): string | null {
  const mejor = mejorPorClaves(CATEGORIAS_FISICAS, e);
  // La categoría del proveedor, si ya es canónica o un alias, vale como empate a favor.
  const deProveedor = categoriaCanonica(e.categoriaProveedor);
  if (!mejor) return deProveedor && deProveedor !== "Otros" ? deProveedor : null;
  return mejor.nombre;
}

/** Categoría final con nombre real: canónica > claves > "Otros". */
export function categoriaReal(e: { nombre: string; categoriaSugerida?: string | null; categoriaProveedor?: string | null; descripcion?: string | null }): string {
  // "Otros" nunca manda: si el curador o el proveedor dicen "Otro(s)", primero
  // se intenta por palabras clave (medido: "Cojín Moto Viajero" venía como
  // "Otro" del proveedor y quedaba en Otros teniendo "moto" en el nombre).
  const sugerida = categoriaCanonica(e.categoriaSugerida);
  if (sugerida && sugerida !== "Otros") return sugerida;
  const porClaves = clasificarPorClaves(e);
  if (porClaves) return porClaves;
  const deProveedor = categoriaCanonica(e.categoriaProveedor);
  return deProveedor || sugerida || "Otros";
}

export function iconoDeCategoria(nombre: string): string {
  return CATEGORIAS_FISICAS.find((c) => c.nombre === nombre)?.icono || "📦";
}

// ─── DIGITALES ──────────────────────────────────────────────────────────────
/**
 * Lista cerrada para productos digitales (cursos, packs, plantillas).
 *
 * Medido el 30-09-2026 en sofia-premium: 53 de 66 digitales estaban en
 * "General", incluidos cursos de diseño teniendo la categoría "Diseño
 * Gráfico" al lado. Los nombres reusan los que el dueño ya había creado
 * (Diseño Gráfico, Programación, Marketing, Fotografía, Idiomas, Música,
 * Construcción, Tecnología, Educación, Salud y Deporte, Libros, Megapacks
 * Digitales) para no renombrarle nada; se suman los que faltaban.
 *
 * El orden importa en los empates: "Diseño de aplicación móvil" suma igual
 * en Diseño y en Programación, y va a Diseño porque está primero.
 */
export const CATEGORIAS_DIGITALES: CategoriaCanonica[] = [
  { nombre: "Diseño Gráfico", icono: "🎨", claves: ["diseno", "grafic", "photoshop", "illustrator", "indesign", "canva", "logotip", "lettering", "ilustracion", "dibujo", "tipograf", "editorial", "interfaces", "visual", "reticula", "branding"] },
  { nombre: "Fotografía", icono: "📷", claves: ["fotograf", "fotomontaje", "lightroom", "preset", "retoque", "retrato"] },
  { nombre: "Video y animación", icono: "🎬", claves: ["video", "premiere", "filmora", "after effects", "cinema 4d", "animacion", "3d", "edicion de video", "youtube"] },
  { nombre: "Programación", icono: "💻", claves: ["program", "desarrollo web", "web", "wordpress", "python", "javascript", "java", "linux", "servidor", "hacking", "ciberseguridad", "videojuego", "sql", "base de datos", "app"] },
  { nombre: "Office y software", icono: "🗂️", claves: ["office", "excel", "word", "powerpoint", "instalador", "software", "programas"] },
  { nombre: "Marketing", icono: "📈", claves: ["marketing", "seo", "redes sociales", "ecommerce", "e-commerce", "tienda online", "ventas", "marca", "publicidad", "facebook ads", "copywriting"] },
  { nombre: "Negocios y finanzas", icono: "💼", claves: ["contabil", "finanz", "emprend", "negocio", "administracion", "trading", "inversion"] },
  { nombre: "Idiomas", icono: "🗣️", claves: ["ingles", "idioma", "frances", "aleman", "italiano", "portugues", "oxford"] },
  { nombre: "Música", icono: "🎹", claves: ["musica", "musical", "piano", "guitarra", "dj", "canto", "bateria", "locucion"] },
  { nombre: "Construcción", icono: "🏗️", claves: ["construccion", "arquitect", "ingenier", "revit", "bim", "autocad", "metrado", "planos", "expediente", "obra", "vivienda", "drywall"] },
  { nombre: "Tecnología", icono: "🛠️", claves: ["reparacion", "celular", "play station", "playstation", "consola", "ensamblaje", "armado de computadora", "electronica"] },
  { nombre: "Oficios", icono: "🔧", claves: ["mecanica", "moto", "car audio", "carpinter", "mueble", "soldadura", "electricidad", "plomeria", "barberia"] },
  { nombre: "Salud y Deporte", icono: "💪", claves: ["fitness", "fit", "pilates", "yoga", "entrenamiento", "gimnasio", "nutricion", "salud", "guerrero"] },
  { nombre: "Cocina y gastronomía", icono: "🍲", claves: ["gastronom", "cocina", "reposteria", "panaderia", "recetas", "chef"] },
  { nombre: "Plantillas e imprimibles", icono: "🖨️", claves: ["plantilla", "imprimible", "editable", "infografia", "sublimad", "album", "invitacion", "cuadros"] },
  { nombre: "Educación", icono: "🎓", claves: ["preuniversitario", "psicolog", "memoria", "terapia", "autismo", "aula virtual", "pedagog", "docente", "matematica"] },
  { nombre: "Mascotas", icono: "🐾", claves: ["perro", "gato", "mascota", "adiestramiento"] },
  { nombre: "Libros", icono: "📚", claves: ["libro", "ebook", "comic"] },
  { nombre: "Megapacks Digitales", icono: "🎁", claves: ["megapack", "81 en 1"] },
  { nombre: "General", icono: "⚡", claves: [] },
];

export const NOMBRES_DIGITALES = CATEGORIAS_DIGITALES.map((c) => c.nombre);

/** Nombre digital canónico, sin importar tildes/mayúsculas ("Musica" → "Música"). */
export function categoriaDigitalCanonica(nombre: string | null | undefined): string | null {
  const n = sinTildes(nombre || "").trim();
  if (!n) return null;
  const c = CATEGORIAS_DIGITALES.find((x) => sinTildes(x.nombre) === n);
  if (c) return c.nombre;
  const alias: Record<string, string> = {
    "otros": "General", "otro": "General", "varios": "General", "sin categoria": "General",
    "diseno": "Diseño Gráfico", "fotografia y video": "Fotografía", "video": "Video y animación",
    "megapacks": "Megapacks Digitales", "megapack": "Megapacks Digitales", "cocina": "Cocina y gastronomía",
    "office": "Office y software", "salud": "Salud y Deporte", "deporte": "Salud y Deporte",
  };
  return alias[n] || null;
}

/** Categoría digital por claves; "General" si nada calza. */
export function categoriaRealDigital(e: { nombre: string; categoriaSugerida?: string | null; descripcion?: string | null }): string {
  const sugerida = categoriaDigitalCanonica(e.categoriaSugerida);
  if (sugerida && sugerida !== "General") return sugerida;
  return mejorPorClaves(CATEGORIAS_DIGITALES, e)?.nombre || "General";
}

const esCajonGenerico = (n: string) => /^(general|otros?|varios|sin categoria|default)?$/.test(sinTildes(n).trim());

/**
 * ¿Hay que mover este producto de categoría? Devuelve la nueva, o null.
 *
 * La regla, igual para físicos y digitales:
 *   1. En un cajón genérico ("General", "Otros", vacío) → a la que calce por
 *      claves, si alguna calza.
 *   2. Misma categoría con otra ortografía ("Musica") → la canónica
 *      ("Música"), para que no haya dos.
 *   3. En una categoría de la lista que su NOMBRE no respalda, y el nombre
 *      SÍ respalda otra → a esa. Un portátil en "Cocina" se mueve; una
 *      mochila deportiva en "Deporte y fitness" no, aunque "mochila" sea
 *      también de Moda: su nombre respalda donde está.
 *   4. Una categoría que el dueño inventó y no está en la lista no se toca:
 *      es decisión suya.
 */
export function categoriaCorregida(e: { kind: string; actual: string | null | undefined; nombre: string; descripcion?: string | null }): string | null {
  const digital = e.kind !== "physical";
  const lista = digital ? CATEGORIAS_DIGITALES : CATEGORIAS_FISICAS;
  const actual = String(e.actual || "").trim();
  const canon = digital ? categoriaDigitalCanonica(actual) : categoriaCanonica(actual);

  if (esCajonGenerico(actual) || canon === "Otros" || canon === "General") {
    const porClaves = mejorPorClaves(lista, { nombre: e.nombre, descripcion: e.descripcion });
    return porClaves ? porClaves.nombre : null;
  }
  if (!canon) return null;              // la inventó el dueño
  if (canon !== actual) return canon;   // la misma, escrita distinto

  const porNombre = mejorPorClaves(lista, { nombre: e.nombre });
  if (!porNombre || porNombre.nombre === canon) return null;
  // Se mueve solo si otra categoría tiene MÁS respaldo en el nombre que la
  // actual. "Portátil ASUS … Incluye Morral + Mouse" respalda Moda por
  // "morral" (2) pero Computadores por "portátil", "vivobook" y "core i5"
  // (6): se mueve. "Bolso Mochila Deportiva" empata Moda con Deporte: se
  // queda donde el dueño lo puso.
  return porNombre.puntos > respaldoDelNombre(lista, canon, e.nombre) ? porNombre.nombre : null;
}

// ─── LÍNEA DEL PRODUCTO ─────────────────────────────────────────────────────
/**
 * De dónde sale el producto y cómo llega al cliente:
 *
 *   digital       → se entrega por enlace o correo.
 *   dropshipping  → físico que despacha un proveedor (Dropi).
 *   fisico        → físico del propio negocio (stock propio, WooCommerce…).
 *   servicio      → se agenda.
 *
 * `kind` no alcanza para separar dropshipping de stock propio: los dos son
 * "physical". Lo que los distingue es de dónde vino, y eso lo deja escrito
 * la importación de Dropi en metadata (source / dropiProductId).
 */
export type Linea = "digital" | "dropshipping" | "fisico" | "servicio";

export function lineaDeProducto(p: { kind?: string | null; metadata?: unknown }): Linea {
  const kind = String(p.kind || "digital");
  if (kind === "servicio" || kind === "service") return "servicio";
  if (kind !== "physical") return "digital";
  let m: any = p.metadata;
  if (typeof m === "string") { try { m = JSON.parse(m); } catch { m = null; } }
  const deDropi = !!m && (String(m.source || "").toLowerCase() === "dropi" || Number(m.dropiProductId) > 0);
  return deDropi ? "dropshipping" : "fisico";
}
