/**
 * Taxonomía de categorías para productos FÍSICOS.
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
  { nombre: "Deporte y fitness", icono: "🏋️", claves: ["rueda abdominal", "abdominal", "fitness", "gym", "gimnasio", "crossfit", "lazo", "theratubo", "elastic", "banda", "deport", "entrenamiento", "yoga", "pesas", "mancuerna"] },
  { nombre: "Hogar y organización", icono: "🏠", claves: ["organizador", "organizadora", "zapatos", "bolsos", "hogar", "ruedas para muebles", "mueble", "closet", "armario", "cortina", "colgador", "gancho", "estante", "repisa", "led solar", "luz led", "lampara", "lámpara"] },
  { nombre: "Cocina", icono: "🍳", claves: ["cocina", "licuadora", "batidora", "afilador", "cuchillo", "sarten", "sartén", "olla", "termo", "vaso", "botella", "cafetera", "picador", "rallador", "esterilizador"] },
  { nombre: "Limpieza", icono: "🧽", claves: ["desengrasante", "desinfectante", "limpiador", "lavaplatos", "desmanchador", "limpieza", "jabon", "jabón", "detergente", "escoba", "trapeador", "guante multiusos"] },
  { nombre: "Belleza y cuidado personal", icono: "💄", claves: ["belleza", "cabello", "pelo", "tratamiento", "brillo", "locion", "loción", "crema", "hidrat", "nutricion", "nutrición", "callos", "removedor", "maquillaje", "uñas", "unas", "cera", "depil", "afeit", "barba", "piel", "facial"] },
  { nombre: "Moda y accesorios", icono: "👜", claves: ["bolso", "morral", "mochila", "canguro", "billetera", "cartera", "riñonera", "rinonera", "reloj", "gafas", "gorra", "cinturon", "cinturón", "collar", "pulsera", "colgante", "anillo", "arete", "bisuter", "joya", "cuarzo", "chakra", "amatista", "aventurina", "jaspe", "orgonita", "moda", "ropa", "camisa", "camiseta", "pantalon", "pantalón", "brasier", "zapat", "tenis", "sandalia"] },
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
  const nombre = sinTildes(e.nombre);
  const prov = sinTildes(e.categoriaProveedor || "");
  const desc = sinTildes(String(e.descripcion || "").slice(0, 400));
  let mejor: { nombre: string; puntos: number } | null = null;
  for (const c of CATEGORIAS_FISICAS) {
    let puntos = 0;
    for (const k of c.claves) {
      const kk = sinTildes(k);
      if (nombre.includes(kk)) puntos += 2;
      if (prov.includes(kk)) puntos += 1;
      else if (desc.includes(kk)) puntos += 0.5;
    }
    if (puntos > 0 && (!mejor || puntos > mejor.puntos)) mejor = { nombre: c.nombre, puntos };
  }
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
