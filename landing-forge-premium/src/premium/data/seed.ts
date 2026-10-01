/**
 * Datos de prueba — tomados tal cual de la API pública de la tienda
 * https://ventasproia.com/api/public/products/sofia-premium
 *
 * Sirven de respaldo cuando la API no responde (red caída, despliegue local
 * sin salida a internet) para que el panel y la vista previa sigan funcionando.
 * Son productos REALES del catálogo: las fotos apuntan a la tienda.
 */

import type { RawProductPayload } from '../types';

export const SEED_STORE = {
  name: 'VentasProIA',
  slug: 'sofia-premium',
  logo: null,
  colors: { primary: '#428581', secondary: '#00ffff' },
  whatsappPhone: '573042748687',
  pixelId: '1193902929595904',
  socialLinks: {},
};

/** Catálogo de respaldo (subconjunto real y variado del catálogo de 133 productos). */
export const SEED_PRODUCTS: Array<Record<string, unknown>> = [
  {
    id: 173,
    name: 'AB Roller Fitness Wheel',
    description:
      'Rueda abdominal de diseño grueso con mango antideslizante. Sirve para tonificar y fortalecer los músculos del abdomen sin necesidad de ir al gimnasio. Se usa apoyando la rueda en el suelo, agarrando el mango y rodando hacia adelante y regresando manteniendo la zona central contraída.',
    price: '60000.00',
    image: '/uploads/products/173.jpg?v=1790864466525',
    images: [
      'https://ventasproia.com/uploads/products/173.jpg?v=1790864466525',
      'https://d39ru7awumhhs2.cloudfront.net/colombia/products/1620647/1736545027D_NQ_NP_2X_944314-MLU71458008402_092023-F[1].webp',
    ],
    category: 'Deporte y fitness',
    kind: 'physical',
    linea: 'dropshipping',
    currency: 'COP',
    sku: null,
    features: [
      '🛞 Rueda gruesa que brinda mayor estabilidad',
      '🤲 Mango antideslizante para un agarre seguro',
      '💪 Fortalece y tonifica los músculos abdominales',
      '🏠 Ideal para entrenar en casa sin equipamiento extra',
      '📏 Diseño compacto y fácil de almacenar',
    ],
    paymentLink: null,
    opciones: null,
  },
  {
    id: 172,
    name: 'Tapete Yoga Pilates Fitness',
    description:
      'Son utilizadas para realizar ejercicios de yoga, pilates, aeróbicos, estiramientos y otros entrenamientos de piso.\nMaterial: suelen estar fabricadas con materiales como PVC, espuma o caucho, proporcionando una superficie antideslizante.\nCaracterísticas: ofrecen comodidad, soporte y tracción adecuada durante el ejercicio, ayudando a mantener la alineación correcta del cuerpo.',
    price: '70000.00',
    image: '/uploads/products/172.jpg?v=1790864465479',
    images: ['https://ventasproia.com/uploads/products/172.jpg?v=1790864465479'],
    category: 'Deporte y fitness',
    kind: 'physical',
    linea: 'dropshipping',
    currency: 'COP',
    sku: null,
    features: [],
    paymentLink: null,
    opciones: [{ name: 'Color', values: ['Negro', 'Morado', 'Azul'] }],
  },
  {
    id: 170,
    name: 'Rueda Ejercicio Fitness Abdominal Cintura',
    description:
      'La Rueda de Ejercicio Fitness para Abdominales es una herramienta versátil que te permite fortalecer varios grupos musculares, incluidos los abdominales, la cintura, los brazos y los hombros. Consiste en una rueda con mangos a ambos lados que te permite realizar ejercicios de rodilla, plancha y balanceo. Al usarla de manera regular puedes mejorar tu fuerza central, estabilidad y resistencia muscular. Además es portátil y fácil de usar en casa o en cualquier lugar donde desees entrenar.',
    price: '75000.00',
    image: '/uploads/products/170.jpg?v=1790864467047',
    images: ['https://ventasproia.com/uploads/products/170.jpg?v=1790864467047'],
    category: 'Deporte y fitness',
    kind: 'physical',
    linea: 'dropshipping',
    currency: 'COP',
    sku: null,
    features: [
      'Mangos ergonómicos para un agarre cómodo y seguro',
      'Ayuda a mejorar la fuerza central y la estabilidad',
      'Ideal para ejercicios de rodilla, plancha y balanceo',
      'Portátil y fácil de usar en casa',
      'Construcción robusta y duradera',
    ],
    paymentLink: null,
    opciones: null,
  },
  {
    id: 169,
    name: 'Mochila Elegante para Mujer',
    description:
      'Esta mochila elegante para mujer está diseñada para acompañarte en cada momento: oficina, universidad, viajes, citas o salidas casuales. Su acabado en cuero PU texturizado de alta calidad le aporta un look refinado, mientras que sus detalles metálicos dorados elevan su estilo a otro nivel.\n✨ Diseño exclusivo tipo europeo\n✨ Compacta por fuera, espaciosa por dentro\n✨ Ideal para uso diario sin perder elegancia\nGracias a su sistema de cierre seguro y compartimentos estratégicamente ubicados, podrás llevar tus pertenencias con tranquilidad y organización.',
    price: '85000.00',
    image: '/images/products/169.jpg',
    images: ['https://ventasproia.com/images/products/169.jpg'],
    category: 'Moda y accesorios',
    kind: 'physical',
    linea: 'dropshipping',
    currency: 'COP',
    sku: null,
    features: [],
    paymentLink: null,
    opciones: [{ name: 'Color', values: ['Negro', 'Café', 'Beige'] }],
  },
  {
    id: 168,
    name: 'Mochila Transportadora para Mascotas',
    description:
      'Lleva a tu mascota cómoda y segura a donde vayas. Mochila transportadora con burbuja transparente 360°, ideal para gatos, perros pequeños y mascotas de hasta 15 libras (7 kg). Perfecta para el veterinario, viajes cortos, mudanzas y paseos.',
    price: '109900.00',
    image: '/images/products/168.jpg',
    images: ['https://ventasproia.com/images/products/168.jpg'],
    category: 'Mascotas',
    kind: 'physical',
    linea: 'dropshipping',
    currency: 'COP',
    sku: null,
    features: [
      '🧊 Burbuja 360°: ve todo su alrededor',
      '🌬️ 9 rejillas de ventilación: aire constante',
      '🎒 Sistema 3 en 1: mochila delantera, trasera o bolso',
      '💧 Oxford impermeable con marco anti-impactos',
      '🏋️‍♀️ Pesa solo 2.4 lb, con correas acolchadas',
      '🚚 Envío a todo Colombia, pago contraentrega',
    ],
    paymentLink: null,
    opciones: null,
  },
  {
    id: 167,
    name: 'Mochila de Viaje con Canguro',
    description:
      'Mochila de viaje de gran capacidad para hombre con compartimento para zapatos. Es una mochila versátil diseñada para viajes, negocios y actividades al aire libre.\nCapacidad y compartimentos: gran capacidad de 40L, se expande y abre como una maleta. Incluye múltiples compartimentos, un compartimento independiente para zapatos y una funda para portátil de hasta 17 pulgadas.\nMaterial y diseño: fabricada con material duradero e impermeable. Correas ajustables, hebillas y cremalleras resistentes.',
    price: '102500.00',
    image: '/images/products/167.jpg',
    images: ['https://ventasproia.com/images/products/167.jpg'],
    category: 'Moda y accesorios',
    kind: 'physical',
    linea: 'dropshipping',
    currency: 'COP',
    sku: null,
    features: [],
    paymentLink: null,
    opciones: null,
  },
  {
    id: 151,
    name: 'Bolso Mochila Deportiva Futbol Deportes',
    description:
      'Bolso mochila deportiva con compartimento independiente para los guayos y espacio separado para la ropa húmeda. Pensado para entrenamiento, gimnasio y partidos de fin de semana.',
    price: '95900.00',
    image: '/images/products/151.jpg',
    images: ['https://ventasproia.com/images/products/151.jpg'],
    category: 'Deporte y fitness',
    kind: 'physical',
    linea: 'dropshipping',
    currency: 'COP',
    sku: null,
    features: [],
    paymentLink: null,
    opciones: null,
  },
  {
    id: 149,
    name: 'Kit de Bandas de Ejercicio 11 Pcs',
    description:
      'Kit de 11 piezas con bandas de resistencia de distintos niveles, manijas, anclaje para puerta y correas para tobillo. Permite entrenar todo el cuerpo en casa ocupando el espacio de un cajón.',
    price: '40900.00',
    image: '/images/products/149.jpg',
    images: ['https://ventasproia.com/images/products/149.jpg'],
    category: 'Deporte y fitness',
    kind: 'physical',
    linea: 'dropshipping',
    currency: 'COP',
    sku: null,
    features: [],
    paymentLink: null,
    opciones: null,
  },
  {
    id: 129,
    name: 'Portátil HP 14-DQ6101DX | Intel N150 | 4GB DDR5 | 128GB UFS | 14" HD',
    description:
      'El más económico del lote: ideal para estudiar, navegar y hacer videollamadas sin gastar de más.\n🔹 Intel Processor N150 con 4 GB DDR5 y 128 GB UFS (más rápido que el almacenamiento eMMC tradicional).\n🔹 Pantalla 14" HD con webcam integrada.\n🔹 Windows 11 funcional, color Natural Silver, liviano y fácil de transportar.\n🔹 Garantía de 12 meses.',
    price: '849900.00',
    image: '/images/products/129.jpg',
    images: ['https://ventasproia.com/images/products/129.jpg'],
    category: 'Computadores y portátiles',
    kind: 'physical',
    linea: 'fisico',
    currency: 'COP',
    sku: null,
    features: [
      'Procesador Intel Processor N150',
      'Memoria RAM 4 GB DDR5',
      'Almacenamiento 128 GB UFS',
      'Pantalla 14" HD',
      'Webcam integrada',
      'Windows 11 funcional',
      'Garantía 12 meses',
    ],
    paymentLink: '',
    opciones: null,
  },
  {
    id: 126,
    name: 'Portátil Lenovo V14 Gen 4 AMN | Ryzen 3 7320U | 16GB | 256GB SSD',
    description:
      'Portátil para el trabajo y el estudio del día a día, con memoria de sobra para multitarea.\n🔹 AMD Ryzen 3 7320U (4 núcleos / 8 hilos, hasta 4.1 GHz).\n🔹 16 GB LPDDR5 a 5500 MHz y 256 GB SSD M.2 NVMe: sistema ágil al abrir programas.\n🔹 Pantalla 14" Full HD (1920 x 1080) con gráficos AMD Radeon 610M.\n🔹 Wi-Fi 6 y Bluetooth 5.2, Windows 11 funcional, color Arctic Grey y garantía de 12 meses.',
    price: '1427000.00',
    image: '/images/products/126.jpg',
    images: ['https://ventasproia.com/images/products/126.jpg'],
    category: 'Computadores y portátiles',
    kind: 'physical',
    linea: 'fisico',
    currency: 'COP',
    sku: null,
    features: [
      'Procesador AMD Ryzen 3 7320U',
      '16 GB LPDDR5-5500 MHz',
      '256 GB SSD M.2 NVMe',
      'Pantalla 14" Full HD 1920x1080',
      'Gráficos AMD Radeon 610M',
      'Wi-Fi 6 y Bluetooth 5.2',
      'Windows 11 funcional',
      'Garantía 12 meses',
    ],
    paymentLink: '',
    opciones: null,
  },
  {
    id: 123,
    name: 'CURSO DE PIANO COMPLETO',
    description:
      'Curso completo de piano de cero a avanzado. Aprende a tocar desde la primera clase con 19 módulos en video: presentación, ejercicios básicos, independencia de manos, 5 valses de Alberto Martínez, piezas para piano, teoría musical aplicada, lenguaje musical, baladas, 8 canciones con patrones de acompañamiento, fraseo y expresión, lectura rítmica (24 lecciones), balada nivel avanzado, pop, blues, jazz, improvisación con progresiones y escalas, acompañamiento y música clásica moderna. Ideal para principiantes y avanzados, todas las edades. 100% online y descargable: estudia sin internet. Acceso ilimitado de por vida.',
    price: '60000.00',
    image: 'https://drive.google.com/thumbnail?sz=w400&id=1iJVjNXCt7So7Ay_zT9SqeBRMqqeZfnVu',
    images: [],
    category: 'Música',
    kind: 'digital',
    linea: 'digital',
    currency: 'COP',
    sku: null,
    features: [
      '19 módulos en video HD',
      'De cero a avanzado',
      'Valses, baladas, blues, jazz y pop',
      'Teoría musical aplicada',
      'Partituras y ejercicios',
      'Acceso de por vida',
    ],
    paymentLink: null,
    opciones: null,
  },
  {
    id: 104,
    name: 'DJ PRODUCCIÓN MUSICAL',
    description:
      'DJ y producción musical: mezcla, beatmatching, producción en Ableton/FL Studio y masterización. De principiante a DJ profesional.',
    price: '20000.00',
    image: '/images/products/104.jpg',
    images: ['https://ventasproia.com/images/products/104.jpg'],
    category: 'Música',
    kind: 'digital',
    linea: 'digital',
    currency: 'COP',
    sku: null,
    features: ['Acceso permanente', 'Contenido actualizable', 'Soporte técnico', 'Descargas ilimitadas'],
    paymentLink: null,
    opciones: null,
  },
  {
    id: 96,
    name: 'GUITARRA ACÚSTICA',
    description:
      'Guitarra acústica: acordes, escalas, técnicas de punteo, rasgueo y canciones populares. Aprende a tocar desde cero, a tu propio ritmo.',
    price: '20000.00',
    image: '/images/products/96.jpg',
    images: ['https://ventasproia.com/images/products/96.jpg'],
    category: 'Música',
    kind: 'digital',
    linea: 'digital',
    currency: 'COP',
    sku: null,
    features: ['Acceso permanente', 'Contenido actualizable', 'Soporte técnico', 'Descargas ilimitadas'],
    paymentLink: null,
    opciones: null,
  },
  {
    id: 66,
    name: 'CURSO LOCUCIÓN PROFESIONAL',
    description:
      'Aprende locución profesional: técnicas de voz, dicción, respiración y locución comercial. Ideal para narradores, locutores y creadores de contenido de audio.',
    price: '20000.00',
    image: '/images/products/66.jpg',
    images: ['https://ventasproia.com/images/products/66.jpg'],
    category: 'Música',
    kind: 'digital',
    linea: 'digital',
    currency: 'COP',
    sku: null,
    features: ['Acceso permanente', 'Contenido actualizable', 'Soporte técnico', 'Descargas ilimitadas'],
    paymentLink: null,
    opciones: null,
  },
  {
    id: 42,
    name: 'PACK IDIOMAS',
    description:
      'Aprende 5 idiomas desde casa: Francés, Alemán, Italiano, Portugués y Japonés nivel básico. Curso completo con audios, pronunciación y ejercicios interactivos. Ideal para viajeros y profesionales que quieren expandir sus horizontes.',
    price: '20000.00',
    image: '/images/products/42.jpg',
    images: ['https://ventasproia.com/images/products/42.jpg'],
    category: 'Idiomas',
    kind: 'digital',
    linea: 'digital',
    currency: 'COP',
    sku: null,
    features: [
      'Acceso permanente',
      'Contenido actualizable',
      'Soporte técnico',
      'Descargas ilimitadas',
      'Cursos de conversación',
      'Gramática y pronunciación',
    ],
    paymentLink: null,
    opciones: null,
  },
  {
    id: 44,
    name: 'CURSO FOTOMONTAJE PUBLICITARIO',
    description:
      'Domina el fotomontaje publicitario con Photoshop. Composición de imágenes, capas, máscaras, efectos visuales y retoque profesional. Crea anuncios impactantes para redes sociales y campañas publicitarias.',
    price: '20000.00',
    image: '/images/products/44.jpg',
    images: ['https://ventasproia.com/images/products/44.jpg'],
    category: 'Fotografía',
    kind: 'digital',
    linea: 'digital',
    currency: 'COP',
    sku: null,
    features: [
      'Acceso permanente',
      'Contenido actualizable',
      'Soporte técnico',
      'Descargas ilimitadas',
      'Edición profesional',
      'Técnicas avanzadas',
    ],
    paymentLink: null,
    opciones: null,
  },
];

/** Payload de catálogo de respaldo, con la misma forma que la API. */
export const SEED_CATALOG = {
  store: SEED_STORE,
  products: SEED_PRODUCTS,
};

/** Relacionados de respaldo por producto (refleja lo que devuelve la API real). */
const SEED_RELATED: Record<string, Array<Record<string, unknown>>> = {
  '173': [
    { id: 151, name: 'Bolso Mochila Deportiva Futbol Deportes', price: '95900.00', image: '/images/products/151.jpg', category: 'Deporte y fitness' },
    { id: 172, name: 'Tapete Yoga Pilates Fitness', price: '70000.00', image: '/uploads/products/172.jpg?v=1790864465479', category: 'Deporte y fitness' },
    { id: 170, name: 'Rueda Ejercicio Fitness Abdominal Cintura', price: '75000.00', image: '/uploads/products/170.jpg?v=1790864467047', category: 'Deporte y fitness' },
    { id: 149, name: 'Kit de Bandas de Ejercicio 11 Pcs', price: '40900.00', image: '/images/products/149.jpg', category: 'Deporte y fitness' },
  ],
  '123': [
    { id: 104, name: 'DJ PRODUCCIÓN MUSICAL', price: '20000.00', image: '/images/products/104.jpg', category: 'Música' },
    { id: 96, name: 'GUITARRA ACÚSTICA', price: '20000.00', image: '/images/products/96.jpg', category: 'Música' },
    { id: 66, name: 'CURSO LOCUCIÓN PROFESIONAL', price: '20000.00', image: '/images/products/66.jpg', category: 'Música' },
  ],
};

/** Devuelve un payload de producto de respaldo con la forma exacta de la API. */
export function seedProductPayload(id: number | string): RawProductPayload | null {
  const product = SEED_PRODUCTS.find((p) => String(p.id) === String(id));
  if (!product) return null;
  const related =
    SEED_RELATED[String(id)] ??
    SEED_PRODUCTS.filter((p) => p.category === product.category && String(p.id) !== String(id))
      .slice(0, 4)
      .map((p) => ({ id: p.id, name: p.name, price: p.price, image: p.image, category: p.category }));
  return { store: SEED_STORE, product, related };
}

/** Los dos ejemplos que pidió el brief, listos para la vista previa. */
export const DEMO_PHYSICAL_ID = 173;
export const DEMO_DIGITAL_ID = 123;
