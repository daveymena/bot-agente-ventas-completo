/**
 * EL MÉTODO DE VENTA: lo que hay que saber para elegir, costear, montar,
 * pautar y leer un producto, condensado de un curso completo y marcado según
 * de dónde sale cada regla.
 *
 * Pedido del dueño (01-10-2026), después de gastar 108.806 COP en Meta sin
 * una sola venta: "condensar el curso completo para que el sistema tenga claro
 * lo que debe hacer, cómo pautar, cómo crear creativos, todo".
 *
 * Fuente: "Curso Completo para hacer DROPSHIPPING o E-COMMERCE en 2026",
 * Iván Caicedo (YouTube, playlist PLqeoihMm_f4O0jh4IDwnia5XKpN7HuH31,
 * 16 capítulos), transcrito y leído completo el 2026-10-01. El resumen largo,
 * capítulo por capítulo, está en CURSO_DROPSHIPPING_2026_CONDENSADO.md.
 *
 * ── Cómo leer la marca de cada regla ─────────────────────────────────────
 *
 *   · "autor"      — lo dice el autor desde su experiencia. Él vende la
 *                    formación y es afiliado de varias de las herramientas que
 *                    nombra, así que sus cifras son DICHAS, no medidas por
 *                    nosotros. Sirven de punto de partida, no de verdad.
 *   · "verificado" — coincide con documentación oficial o con lo que ya
 *                    medimos en esta cuenta.
 *   · "hipotesis"  — inferencia nuestra para adaptar el método a VentasPro
 *                    (venta por WhatsApp, productos digitales). Hay que medirla.
 *
 * ── Lo que NO entra, a propósito ─────────────────────────────────────────
 *
 * El curso también enseña cosas que este sistema no va a recomendar nunca:
 * pautar con perfiles prestados o comprados, "cuentas infinitas" con datos
 * ficticios, proxies para esquivar bloqueos, "eludir" las políticas de
 * productos de laboratorio, fabricar reseñas y caras de clientes con IA, o
 * "últimas unidades" sin que sea cierto. Está listado en `NO_SE_HACE`, y la
 * herramienta lo repite cuando el tema lo roza: el resto del motor ya prohíbe
 * inventar testimonios, stock y precios (ver business-context.ts y
 * publicidad-persuasiva.ts).
 *
 * El módulo es PURO: entran números, salen decisiones. Las cuentas (precio con
 * devoluciones, punto de equilibrio, diagnóstico del embudo) se prueban sin
 * Meta ni base. El modelo redacta; acá se decide lo que tiene que salir exacto.
 */

export type Fuente = "autor" | "verificado" | "hipotesis";

export interface Regla {
  texto: string;
  fuente: Fuente;
  /** Capítulo del curso de donde sale (0 = adaptación propia). */
  cap: number;
}

export const TEMAS = [
  "producto", "costeo", "landing", "creativos", "pauta", "metricas", "whatsapp", "no_se_hace",
] as const;
export type Tema = (typeof TEMAS)[number];

const r = (texto: string, fuente: Fuente, cap: number): Regla => ({ texto, fuente, cap });

/**
 * El orden importa: es el orden en que se trabaja un producto. Cada tema es
 * corto a propósito: viaja como resultado de herramienta por Groq, que corta
 * en 8.000 tokens por minuto.
 */
export const METODO: Record<Exclude<Tema, "no_se_hace">, { titulo: string; reglas: Regla[] }> = {
  producto: {
    titulo: "Elegir qué vender",
    reglas: [
      r("La única característica que importa al empezar es la DEMANDA: que ya se esté vendiendo ese producto o uno muy parecido. Las listas de 'efecto wow, recompra, resuelve un problema' engañan al principiante.", "autor", 4),
      r("Primero se mira qué vende el mercado y DESPUÉS se busca el producto en el proveedor. Nunca al revés.", "autor", 1),
      r("Biblioteca de anuncios de Meta: país del negocio, buscar 'paga en casa', 'pago contraentrega', 'envío gratis', 'descuento hoy' o el nicho, y filtrar anuncios ACTIVOS que llevan 15 a 30 días al aire. Si alguien sigue pagando un anuncio 15 días, le está dejando plata. Más de ~2 meses ya es demanda vieja.", "autor", 1),
      r("TikTok Creative Center → Top Ads: país, últimos 30 días, idioma del mercado, objetivo conversión. Señales a favor: anuncio reciente, presupuesto alto y muchos likes (cientos a miles).", "autor", 4),
      r("Kalodata muestra lo que factura en TikTok Shop de EE. UU.; se puede traer a LATAM por anuncios. No mirar solo la primera página: en la página 5 todavía hay productos que facturan mucho y nadie trae.", "autor", 10),
      r("Traer productos de otro país solo si las condiciones se parecen: nada de productos de invierno a un país sin estaciones.", "autor", 4),
      r("Antes de montarlo, confirmar con el proveedor al menos 100 unidades en stock.", "autor", 5),
      r("Probar en tandas: 10 productos para empezar, montados de a 5, y después unos 3 por semana. El aprendizaje sale de exponer muchos productos, no de pulir uno.", "autor", 4),
      r("No vale la pena gastar en marketing cuando no se controla el stock, cuando hay muchos vendedores del mismo producto o cuando la ganancia por venta es muy baja.", "autor", 16),
      r("Guardar los anuncios que funcionan (archivo, no el link: los borran) en una planilla con el id del producto en el proveedor. Son la base para copiar el ángulo y mejorarlo.", "autor", 1),
    ],
  },
  costeo: {
    titulo: "Costear para no perder plata",
    reglas: [
      r("Con pago contraentrega un pedido no es una venta: es una venta POTENCIAL. Solo se gana cuando el cliente recibe y paga.", "autor", 11),
      r("Un pedido CANCELADO antes de despachar pierde el costo de publicidad de ese pedido. Uno DEVUELTO pierde la publicidad Y el flete. El producto no se pierde: vuelve al proveedor.", "autor", 11),
      r("Por eso el precio se calcula con un 'seguro': el flete se divide por el % que se entrega de lo despachado, y el costo de publicidad por el % que se entrega de lo pedido. Usar la herramienta: metodo_de_venta {tema:'costeo', costoProducto, fleteBase, cpaObjetivo}.", "autor", 11),
      r("Margen objetivo: 20% del precio de venta.", "autor", 11),
      r("Porcentajes de partida del autor (devolución sobre lo despachado): Colombia 25%, Ecuador y Perú 30%, México, Chile, Guatemala, España y Argentina 35%. Cancelados 10-20%. Se reemplazan por los de la tienda apenas haya datos.", "autor", 11),
      r("Antes de escalar un producto que vendió bien el primer día: hacer las cuentas con un escenario pesimista (solo 40% entregado). Si así no pierde, se puede subir de a poco.", "autor", 11),
      r("Control diario: pedidos del día, cancelados, % de devolución, gasto en publicidad de todas las cuentas → ganancia real del día. El costo por venta del administrador de anuncios NO es el costo real.", "autor", 11),
      r("Producto digital (Drive, link): no hay flete ni devolución; el pago es antes de entregar. El costeo se reduce a precio − costo de publicidad por venta cerrada − comisión de la pasarela.", "hipotesis", 0),
    ],
  },
  landing: {
    titulo: "La página que vende",
    reglas: [
      r("Modelo AIDA: la Atención la gana el ANUNCIO (primeros 3 s). La página trabaja Interés (qué es, qué resuelve), Deseo (imaginarse usándolo: reseñas, antes/después, casos) y Acción (botón siempre a mano).", "autor", 5),
      r("Se diseña para celular: casi todo el tráfico viene de redes en el teléfono.", "autor", 2),
      r("Lo primero que se ve decide si la persona se queda: título corto, PRECIO GRANDE, variantes en desplegable, sin selector de cantidad ni carrito. Ese primer pantallazo es lo que más se optimiza.", "autor", 6),
      r("Cada beneficio tiene que entenderse SIN leer: GIFs de 3 s como máximo mostrando el beneficio, infografía, fotos del producto en uso.", "autor", 5),
      r("Textos en formato título con beneficio + una línea corta. Listas para beneficios y características, cada lista con su emoji fijo. Preguntas frecuentes al final (envío, devolución, tallas).", "autor", 5),
      r("Botón de compra pegado ABAJO de la pantalla (ahí llega el pulgar), de color que contraste con la tienda (negro o rojo), texto claro tipo 'Pedir ahora · Paga en casa'.", "autor", 3),
      r("Formulario de contraentrega en un solo paso. Pedir el teléfono 'con WhatsApp' avisando que por ahí llega la confirmación, y una casilla 'confirmo que mis datos son correctos'.", "autor", 3),
      r("Velocidad: de 100 clics deberían llegar ~80 a ver la página. Si llegan 60, se pierden ventas. Las páginas hechas con código cargan más rápido que las armadas con imágenes.", "autor", 15),
      r("No gastar 2 horas en la página antes de validar: una página mínima hecha rápido. Sin visitas → el problema es el producto o el creativo. Con visitas y sin ventas → recién ahí se mejora la página.", "autor", 15),
      r("Políticas de devolución, privacidad, términos y envío publicadas: sin ellas las plataformas bloquean la cuenta publicitaria.", "autor", 3),
      r("Precio tachado, 'últimas unidades', garantía y reseñas SOLO si son verdad y están cargados en el producto. El curso los usa como decorado; acá un dato no cargado es una prohibición.", "verificado", 6),
      r("Mapa de calor (Microsoft Clarity, gratis) para ver hasta dónde baja la gente y dónde abandona.", "autor", 5),
      r("Orden que repite el autor: imagen o GIF → título con el beneficio → una línea corta, y otra vez. Todos los GIF del mismo formato (cuadrado). Con Clarity mide que ~50% se va en el primer scroll y ~70% en el segundo: lo importante va arriba.", "autor", 19),
      r("Cada duda que frena la compra se responde con una imagen: cómo se usa (paso a paso), cómo se lava o se carga, guía de tallas, qué trae la caja.", "autor", 19),
      r("Nombre del producto = nombre propio + beneficio ('Juicy Pro · extractor ultra rápido y silencioso'), no el nombre del proveedor.", "autor", 18),
      r("De dónde salen los activos: fotos del proveedor (Dropi/Woo), fotos y videos del fabricante en AliExpress/Alibaba (los GIF se cortan de esos videos), y la landing de OTRO país como modelo de estructura y textos. Copiar a quien vende lo mismo en tu mismo mercado no sirve: ya tiene la audiencia.", "autor", 16),
      r("Una prueba del autor (un producto, 3 campañas iguales) vendió con la landing por secciones en HTML con imágenes de IA y no con la de solo imágenes. Es un caso, no una regla.", "autor", 0),
    ],
  },
  creativos: {
    titulo: "Creativos que encuentran comprador",
    reglas: [
      r("Con Andromeda (Meta) y TikTok, el CREATIVO es la segmentación: la plataforma mira el video cuadro por cuadro y decide a quién mostrarlo. Ya no se segmenta a mano.", "autor", 8),
      r("Diversidad creativa: 6 a 9 piezas RADICALMENTE distintas (otra persona, otra edad, otro lugar, otra narrativa, otros 3 primeros segundos). Si se parecen, la plataforma los muestra a la misma gente y no amplía audiencia.", "autor", 8),
      r("El cambio más poderoso es el gancho: los 3 primeros segundos. Tomas de 3-4 s como máximo.", "autor", 8),
      r("El formato también segmenta: UGC, tipo podcast, entrevista callejera, demostración, antes/después. El mismo producto en otro formato le llega a otra gente.", "autor", 16),
      r("Cómo variar un anuncio ganador: transcribir su audio, pedir 3 variaciones del texto, grabar la voz (o cambiarla con IA), nuevos subtítulos con el color de la marca, logo como marca de agua, y cambiar el gancho con tomas de otros videos del mismo producto.", "autor", 8),
      r("Siempre incluir una versión muy parecida al anuncio original que ya vende (con otra narrativa): es la más validada.", "autor", 8),
      r("Copiar/adaptar vale la pena cuando el anuncio es reciente (días) y ya tiene gasto alto en otro mercado: nadie lo saturó todavía en el nuestro.", "autor", 16),
      r("Si el producto es una solución única que nadie ofrece, un solo creativo puede bastar. La diversidad importa cuando hay competencia.", "autor", 16),
      r("Estructura de guion que usa el autor: dolor en pregunta → 'el problema no es X, es Y' → el producto → 2-3 beneficios → llamada a la acción.", "autor", 14),
      r("Video con IA: imagen de la persona con el producto (pedir 'foto con celular' da más realismo), video frase por frase y tomas de apoyo de cerca del producto. Una persona generada con IA puede PRESENTAR el producto; no puede decir que lo compró ni hacerse pasar por cliente.", "verificado", 14),
      r("Texto del anuncio: el autor desaconseja poner 'envío gratis' o 'paga en casa' porque la competencia busca esas palabras en la biblioteca y te copia.", "autor", 12),
    ],
  },
  pauta: {
    titulo: "Cómo montar y probar la campaña",
    reglas: [
      r("Pautar desde un PORTAFOLIO COMERCIAL con su cuenta publicitaria, nunca desde la cuenta personal. Agregar un segundo administrador: si cierran el perfil, se pierde todo.", "autor", 12),
      r("Cuenta publicitaria en la moneda de la tarjeta (evita el recargo bancario), método de pago cargado desde el principio y verificación en dos pasos activa antes de pautar.", "autor", 12),
      r("Píxel conectado a la cuenta publicitaria (si no, la campaña de ventas no deja elegir el evento). Un solo evento por etapa del embudo, para que no se dupliquen.", "autor", 7),
      r("La señal de COMPRA tiene que ser real. Una compra de prueba o un 'Purchase' enviado sin pago verificado le enseña a Meta a buscar gente que no compra.", "verificado", 0),
      r("Prueba de producto del autor: UNA campaña de Ventas, presupuesto Advantage+ a nivel campaña (~60.000 COP/día), un conjunto con público abierto, optimizando la compra, y 2 a 6 anuncios distintos dentro.", "autor", 12),
      r("Lo único que se toca del público: excluir lugares sin cobertura o con muchas devoluciones (en Colombia: San Andrés, Leticia/Amazonas, zonas difíciles del Chocó) y edad mínima ~20.", "autor", 12),
      r("Apagar ubicaciones de baja calidad (en TikTok: Pangle y CapCut; en Meta, el equivalente es Audience Network): traen clics que no compran.", "autor", 7),
      r("Llamadas a la acción de compra ('Comprar', 'Pedir ahora'); quitar 'Más información'.", "autor", 7),
      r("Las pruebas A/B se hacen en campañas separadas, no dentro de la misma.", "autor", 12),
      r("Nombre de campaña: fecha de arranque + producto + tipo (ej. '2026-10-05 Corrector ADV+').", "autor", 12),
      r("No borrar campañas que gastaron: se apagan. Borrar daña los informes de la cuenta.", "autor", 12),
      r("Programar el arranque a las 5 a. m. del día siguiente.", "autor", 12),
      r("Corte del autor para productos de catálogo: si se gastó 40-50% del presupuesto del día sin una venta, se apaga. Cada venta paga un CPA más de prueba. No rendirse antes de ~30 productos probados.", "autor", 29),
      r("Para comparar landings o creativos se arman campañas SEPARADAS (o ABO, un creativo por conjunto): así el gasto de cada una se ve aparte en el control diario.", "autor", 28),
      r("Escalar sin reiniciar el aprendizaje: subir 20% como máximo y esperar 48 h entre cambios (ver reglas-de-pauta.ts).", "verificado", 0),
      r("Destino WhatsApp: el autor manda a la web porque no quiere atender chats. En VentasPro el chat ES la venta; la prueba se mide por costo por conversación y % de conversaciones que terminan en pago.", "hipotesis", 0),
    ],
  },
  metricas: {
    titulo: "Leer los números",
    reglas: [
      r("La métrica que manda es el COSTO POR VENTA (CPA). Si está por debajo del punto de equilibrio, el producto deja plata aunque el resto se vea mal.", "autor", 13),
      r("Punto de equilibrio = lo presupuestado para publicidad por venta + la ganancia por venta. Ni gana ni pierde.", "autor", 13),
      r("CPM (costo por mil impresiones): qué tan caro es mostrar el anuncio. Buscar menos de ~30.000 COP; alrededor de 10.000 o menos es muy bueno. Si es alto: mejorar el anuncio para que genere interacción.", "autor", 13),
      r("CTR de enlace: buscar más de 2%. Si es menor: más llamado a la acción, urgencia u oferta EN EL ANUNCIO.", "autor", 13),
      r("Visitas a la página / clics en el enlace: 70% o más. Menos es página lenta o clics de baja calidad.", "autor", 13),
      r("Conversión de la página (ventas / visitas): contraentrega 3-4% mínimo; pago anticipado desde 1,5%. Con 3% hacen falta ~35 visitas por pedido: con menos visitas todavía no se puede juzgar la página.", "autor", 15),
      r("Pagos iniciados / visitas: 10-30%. Compras / pagos iniciados: 20-30%.", "autor", 13),
      r("Antes del clic es terreno de la plataforma (se mejora el anuncio). Después del clic es terreno propio (página, oferta, vendedor): ahí está la plata.", "autor", 13),
      r("Para diagnosticar con números: metodo_de_venta {tema:'metricas', gasto, impresiones, clics, visitas, conversaciones, ventas, puntoEquilibrio}.", "hipotesis", 0),
    ],
  },
  whatsapp: {
    titulo: "Lo que el curso le enseña al vendedor de WhatsApp",
    reglas: [
      r("En contraentrega la confirmación por WhatsApp es la que separa un pedido de un cancelado: cada cancelado es publicidad perdida. Confirmar datos completos antes de despachar.", "autor", 11),
      r("Si el cliente no va a recibir, se cancela ANTES de despachar: un pedido devuelto cuesta el flete además de la publicidad.", "autor", 11),
      r("La página y el chat tienen que responder TODAS las dudas antes de que las pregunten: envío, tiempo, devolución, garantía real, tallas.", "autor", 5),
      r("Muchas conversaciones baratas y ninguna venta quiere decir que el anuncio trabaja y la fuga está en el chat (respuesta, precio, confianza, seguimiento): se arregla el vendedor antes de subir presupuesto.", "hipotesis", 0),
      r("El aviso de compra a Meta sale cuando el pago está VERIFICADO, no cuando el cliente dice 'lo quiero'.", "verificado", 0),
      r("Decir en la página 'te escribimos por WhatsApp para confirmar tu pedido' sube la confianza; la confirmación va DESPUÉS del pedido, no antes (si no, se atienden chats que no compran).", "autor", 20),
      r("La casilla 'confirmo que mis datos son reales y voy a recibir' y pedir punto de referencia en la dirección bajan las devoluciones.", "autor", 13),
    ],
  },
};

export const NO_SE_HACE: string[] = [
  "Pautar con perfiles prestados, comprados o de familiares (va contra las reglas de Meta y se pierde la cuenta).",
  "Crear 'cuentas infinitas' con documentos o NIT ficticios, o usar proxies y navegadores antidetección para esquivar bloqueos.",
  "'Eludir' las políticas de publicidad de suplementos o productos de laboratorio.",
  "Fabricar reseñas, nombres y caras de clientes con IA y mostrarlos como compradores reales.",
  "Poner 'últimas unidades', 'oferta solo hoy', precio tachado o garantía sin que sea verdad.",
  "Mandar compras de prueba al píxel de producción: contaminan la señal que Meta usa para encontrar compradores.",
];

// ─────────────────────────────────────────────────────────────────────────
// Cuentas
// ─────────────────────────────────────────────────────────────────────────

export interface EntradaPrecio {
  costoProducto: number;
  /** Flete de un envío, sin el seguro de devoluciones. 0 en digitales. */
  fleteBase?: number;
  /** Lo que se acepta pagar por venta EN EL ADMINISTRADOR DE ANUNCIOS. */
  cpaObjetivo: number;
  /** % de lo despachado que se entrega (el resto se devuelve). Defecto 75 (Colombia). */
  entregaPct?: number;
  /** % de los pedidos que se cancelan antes de despachar. Defecto 10. */
  canceladosPct?: number;
  /** % del precio que queda de ganancia. Defecto 20. */
  margenPct?: number;
  /** Costos fijos prorrateados por pedido (plataforma, comisiones). */
  otrosPorPedido?: number;
}

export interface Precio {
  precioSugerido: number;
  fleteConDevoluciones: number;
  cpaCosteado: number;
  gananciaPorEntregado: number;
  /** CPA máximo en el administrador de anuncios con el que se queda en cero. */
  cpaPuntoEquilibrio: number;
  pedidosParaEntregarDiez: number;
  supuestos: string;
}

/** Un 0 es un dato válido para cancelados ("no cancelan"), no para entregas: dividir por 0 no tiene sentido. */
const pct = (v: number | undefined, defecto: number, admiteCero = false) => {
  if (v === undefined || v === null) return defecto / 100;
  const n = Number(v);
  const valido = Number.isFinite(n) && n <= 100 && (admiteCero ? n >= 0 : n > 0);
  return (valido ? n : defecto) / 100;
};
const redondear = (n: number) => Math.round(n);

/**
 * La calculadora del capítulo 11. El costo del producto NO lleva seguro (si no
 * se entrega, vuelve al proveedor). El flete se reparte entre lo que se
 * entrega de lo despachado; la publicidad, entre lo que se entrega de todo lo
 * pedido.
 *
 * El autor resta los cancelados al % de entrega (70% − 10% = 60%); acá se
 * multiplican (0,9 × 0,7 = 63%), que es la cuenta exacta. La diferencia es de
 * unos pocos pesos y queda del lado prudente en el ejemplo del curso.
 */
export function precioDeVenta(e: EntradaPrecio): Precio {
  const entrega = pct(e.entregaPct, 75);
  const cancel = pct(e.canceladosPct, 10, true);
  const margen = pct(e.margenPct, 20);
  const flete = Math.max(0, Number(e.fleteBase) || 0);
  const otros = Math.max(0, Number(e.otrosPorPedido) || 0);
  const costo = Math.max(0, Number(e.costoProducto) || 0);
  const cpa = Math.max(0, Number(e.cpaObjetivo) || 0);

  const efectividad = (1 - cancel) * entrega;
  const fleteConDevoluciones = flete / entrega;
  const cpaCosteado = cpa / efectividad;
  const costos = costo + fleteConDevoluciones + cpaCosteado + otros;
  const precio = costos / (1 - margen);
  const ganancia = precio - costos;
  // Con el precio fijado, ¿hasta cuánto puede subir el CPA del administrador
  // antes de que la ganancia llegue a cero?
  const cpaPuntoEquilibrio = (precio - costo - fleteConDevoluciones - otros) * efectividad;

  return {
    precioSugerido: redondear(precio),
    fleteConDevoluciones: redondear(fleteConDevoluciones),
    cpaCosteado: redondear(cpaCosteado),
    gananciaPorEntregado: redondear(ganancia),
    cpaPuntoEquilibrio: redondear(cpaPuntoEquilibrio),
    pedidosParaEntregarDiez: Math.ceil(10 / efectividad),
    supuestos: `entrega ${Math.round(entrega * 100)}% de lo despachado, ${Math.round(cancel * 100)}% cancelados, margen ${Math.round(margen * 100)}%`,
  };
}

export interface EntradaEmbudo {
  gasto: number;
  impresiones?: number;
  clics?: number;
  /** Visitas a la página de destino (landing_page_view). */
  visitas?: number;
  /** Conversaciones de WhatsApp iniciadas. */
  conversaciones?: number;
  pagosIniciados?: number;
  ventas?: number;
  /** CPA máximo para no perder plata (sale de precioDeVenta). */
  puntoEquilibrio?: number;
  pagoAnticipado?: boolean;
}

export interface Hallazgo {
  etapa: "anuncio" | "clic" | "pagina" | "chat" | "rentabilidad" | "muestra";
  lectura: string;
  accion: string;
  fuente: Fuente;
}

const n0 = (v: unknown) => Math.max(0, Number(v) || 0);
const cop = (v: number) => `$${Math.round(v).toLocaleString("es-CO")}`;

/**
 * Dice en qué parte del camino se cae la plata. Ordena los hallazgos del
 * primero al último del embudo: arreglar una etapa de abajo no sirve si la de
 * arriba no deja pasar a nadie.
 */
export function diagnosticarEmbudo(e: EntradaEmbudo): Hallazgo[] {
  const gasto = n0(e.gasto), imp = n0(e.impresiones), clics = n0(e.clics);
  const visitas = n0(e.visitas), convs = n0(e.conversaciones), ventas = n0(e.ventas), pagos = n0(e.pagosIniciados);
  const out: Hallazgo[] = [];

  if (imp >= 1000) {
    const cpm = gasto / imp * 1000;
    if (cpm > 30000) out.push({ etapa: "anuncio", lectura: `CPM ${cop(cpm)}: mostrar el anuncio está caro.`, accion: "Mejorar el anuncio para que genere interacción (gancho, formato distinto) antes de tocar el presupuesto.", fuente: "autor" });
    if (clics > 0) {
      const ctr = clics / imp * 100;
      if (ctr < 2) out.push({ etapa: "anuncio", lectura: `CTR ${ctr.toFixed(2)}% (meta: 2% o más).`, accion: "Agregar llamado a la acción y oferta real en el anuncio; probar otros ganchos en los primeros 3 s.", fuente: "autor" });
      // Muchos clics baratos que no hacen nada: tráfico de mala calidad.
      if (ctr > 6 && gasto / clics < 100 && convs === 0 && visitas === 0) {
        out.push({ etapa: "clic", lectura: `CTR ${ctr.toFixed(1)}% con clics a ${cop(gasto / clics)} y ninguna conversación ni visita: clics de baja calidad.`, accion: "Apagar Audience Network y optimizar por conversación/compra, no por clics.", fuente: "hipotesis" });
      }
    }
  }

  if (clics >= 20 && visitas > 0) {
    const llegan = visitas / clics * 100;
    if (llegan < 70) out.push({ etapa: "clic", lectura: `Solo ${Math.round(llegan)}% de los clics llegan a ver la página (meta: 70%).`, accion: "Página lenta o clics accidentales: aligerar la página y revisar ubicaciones.", fuente: "autor" });
  }

  if (visitas > 0) {
    const minima = e.pagoAnticipado ? 1.5 : 3;
    if (visitas < 35 && ventas === 0) {
      out.push({ etapa: "muestra", lectura: `${visitas} visitas: todavía no alcanza para juzgar la página (hacen falta ~35 por pedido).`, accion: "Seguir la prueba hasta tener visitas suficientes o hasta gastar el punto de equilibrio sin ventas.", fuente: "autor" });
    } else {
      const conv = ventas / visitas * 100;
      if (conv < minima) out.push({ etapa: "pagina", lectura: `Conversión de la página ${conv.toFixed(1)}% (mínimo ${minima}%).`, accion: pagos > 0 && pagos / visitas >= 0.1 ? "Inician el pago pero no terminan: revisar el formulario y la confianza al final." : "Mejorar el primer pantallazo: precio visible, beneficio claro, botón abajo, dudas respondidas.", fuente: "autor" });
    }
  }

  if (convs > 0) {
    if (convs >= 30 && ventas === 0) {
      out.push({ etapa: "chat", lectura: `${convs} conversaciones a ${cop(gasto / convs)} cada una y ninguna venta: el anuncio trae gente, la venta se cae en el chat.`, accion: "No subir presupuesto. Leer las conversaciones y ver dónde se cae cada una (precio, confianza, respuesta del vendedor, seguimiento).", fuente: "hipotesis" });
    } else if (convs < 30 && ventas === 0) {
      out.push({ etapa: "muestra", lectura: `${convs} conversaciones sin venta: muestra chica todavía.`, accion: "Revisar igual cada conversación: con pocas es fácil ver si el vendedor respondió bien.", fuente: "hipotesis" });
    }
  }

  if (ventas > 0 && e.puntoEquilibrio) {
    const cpa = gasto / ventas;
    out.push(cpa <= e.puntoEquilibrio
      ? { etapa: "rentabilidad", lectura: `CPA ${cop(cpa)} por debajo del punto de equilibrio (${cop(e.puntoEquilibrio)}).`, accion: "Rentable: mantener y escalar 20% cada 48 h, con el escenario pesimista de entrega hecho.", fuente: "autor" }
      : { etapa: "rentabilidad", lectura: `CPA ${cop(cpa)} por encima del punto de equilibrio (${cop(e.puntoEquilibrio)}): cada venta come ganancia.`, accion: "Bajar el CPA con creativos nuevos o subir el precio; si no se puede, cambiar de producto.", fuente: "autor" });
  } else if (ventas === 0 && e.puntoEquilibrio && gasto >= 2 * e.puntoEquilibrio) {
    out.push({ etapa: "rentabilidad", lectura: `Gastó ${cop(gasto)} (el doble del punto de equilibrio) sin ventas.`, accion: "Cortar la prueba de este producto o creativo.", fuente: "verificado" });
  }

  return out;
}

// ─────────────────────────────────────────────────────────────────────────
// Lo que ve Atlas
// ─────────────────────────────────────────────────────────────────────────

const ETIQUETA: Record<Fuente, string> = { autor: "autor", verificado: "verificado", hipotesis: "hipótesis" };

export function normalizarTema(t: unknown): Tema | null {
  const s = String(t ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  if (!s) return null;
  if ((TEMAS as readonly string[]).includes(s)) return s as Tema;
  if (/precio|cost|margen|devolu|flete/.test(s)) return "costeo";
  if (/landing|pagina|tienda|web/.test(s)) return "landing";
  if (/creativ|video|hook|gancho|ugc|imagen/.test(s)) return "creativos";
  if (/campa|pauta|anunci|meta|facebook|tiktok|presupuesto/.test(s)) return "pauta";
  if (/metric|cpa|cpm|ctr|embudo|diagnost/.test(s)) return "metricas";
  if (/whats|chat|vendedor|bot/.test(s)) return "whatsapp";
  if (/ganador|winner|nicho|produc/.test(s)) return "producto";
  if (/prohib|no se hace|etic|polit/.test(s)) return "no_se_hace";
  return null;
}

/** El texto de un tema, con la marca de fuente de cada regla. */
export function textoDelTema(tema: Tema): string {
  if (tema === "no_se_hace") return "Lo que NO se recomienda aunque el curso lo enseñe:\n" + NO_SE_HACE.map((x) => `✗ ${x}`).join("\n");
  const t = METODO[tema];
  return `${t.titulo}:\n` + t.reglas.map((x) => `• ${x.texto} [${ETIQUETA[x.fuente]}${x.cap ? `, cap. ${x.cap}` : ""}]`).join("\n");
}

export const INDICE =
  "Temas: producto (qué vender), costeo (precio con devoluciones), landing (página), creativos (videos y ganchos), " +
  "pauta (cómo montar la campaña), metricas (leer y diagnosticar), whatsapp (lo que aplica al vendedor), no_se_hace.";
