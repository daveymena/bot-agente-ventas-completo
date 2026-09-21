// ============================================================
// PLANTILLAS DE NEGOCIO PARA LA PLATAFORMA SaaS
// ============================================================

export interface BusinessTemplate {
  id: string;
  name: string;
  icon: string;
  description: string;
  agentType: string;
  tone: string;
  businessProfile: {
    nicho: string;
    entrega: { metodo: string; plazo: string; detalle: string };
    garantia: { dias: number; descripcion: string };
    noPuede: string[];
    loQueDebeSaber: string[];
    modoCatalogo: "digital" | "fisico" | "mixto";
  };
}

export const BUSINESS_TEMPLATES: BusinessTemplate[] = [
  {
    id: "courses",
    name: "Cursos y Educación",
    icon: "🎓",
    description: "Academias, cursos online, talleres, capacitaciones",
    agentType: "courses",
    tone: "educational",
    businessProfile: {
      nicho: "cursos, educación, formación, talleres, capacitación",
      entrega: { metodo: "enlace de descarga", plazo: "inmediato", detalle: "Acceso por Google Drive al confirmar el pago." },
      garantia: { dias: 7, descripcion: "7 días de garantía. Si no es como se describe, devolución del dinero." },
      noPuede: ["prometer certificación oficial si no está configurado", "dar clases en vivo", "prometer empleo o resultados garantizados"],
      loQueDebeSaber: ["Cursos 100% digitales, acceso de por vida", "Entrega inmediata por enlace", "Garantía 7 días", "Precios en pesos colombianos"],
      modoCatalogo: "digital",
    },
  },
  {
    id: "dropshipping",
    name: "Productos Físicos / Dropshipping",
    icon: "📦",
    description: "Tiendas online, gadgets, accesorios, artículos del hogar",
    agentType: "dropshipping",
    tone: "energetic",
    businessProfile: {
      nicho: "productos físicos, gadgets, accesorios, hogar, tecnología",
      entrega: { metodo: "transportadora", plazo: "3 a 5 días hábiles", detalle: "Envío a domicilio por transportadora. Pago contraentrega." },
      garantia: { dias: 7, descripcion: "7 días de garantía. Si no funciona, lo cambias o devuelves." },
      noPuede: ["prometer entrega el mismo día", "inventar stock", "enviar fuera de Colombia"],
      loQueDebeSaber: ["Envío solo a Colombia", "Pago contraentrega al recibir", "Tiempo de entrega 3-5 días hábiles", "Datos: nombre, dirección, ciudad, teléfono, cédula"],
      modoCatalogo: "fisico",
    },
  },
  {
    id: "services",
    name: "Servicios / Consultoría",
    icon: "💼",
    description: "Marketing, diseño, desarrollo, consultoría empresarial",
    agentType: "services",
    tone: "professional",
    businessProfile: {
      nicho: "servicios, consultoría, marketing, diseño, desarrollo web",
      entrega: { metodo: "según servicio", plazo: "según alcance", detalle: "Entrega según cronograma acordado. Incluye revisiones." },
      garantia: { dias: 0, descripcion: "Satisfacción garantizada. Revisiones incluidas según el plan." },
      noPuede: ["prometer resultados específicos sin datos", "dar asesoría gratuita completa", "inventar casos de éxito"],
      loQueDebeSaber: ["Servicios profesionales con cronograma definido", "Incluye revisiones según plan", "Pago anticipado o parcial", "Reuniones de seguimiento incluidas"],
      modoCatalogo: "digital",
    },
  },
  {
    id: "clinic",
    name: "Clínica / Consultorio",
    icon: "🏥",
    description: "Clínicas médicas, odontología, dermatología, psicología",
    agentType: "clinic",
    tone: "caring",
    businessProfile: {
      nicho: "clínicas, consultorios, salud, medicina, odontología, psicología",
      entrega: { metodo: "cita presencial o virtual", plazo: "según disponibilidad", detalle: "Cita agendada con profesional. Confirmación por WhatsApp." },
      garantia: { dias: 0, descripcion: "Servicio profesional con estándares médicos." },
      noPuede: ["diagnosticar por WhatsApp", "recetar medicamentos", "prometer curaciones", "dar consejos médicos sin ser profesional"],
      loQueDebeSaber: ["Agendamiento de citas 24/7", "Confirmación automática", "Recordatorios antes de la cita", "No se dan diagnósticos por WhatsApp"],
      modoCatalogo: "digital",
    },
  },
  {
    id: "gym",
    name: "Gimnasio / Fitness",
    icon: "💪",
    description: "Gimnasios, centros deportivos, entrenamiento personal",
    agentType: "gym",
    tone: "motivating",
    businessProfile: {
      nicho: "gimnasios, fitness, entrenamiento, deporte, salud",
      entrega: { metodo: "membresía presencial", plazo: "inmediato", detalle: "Acceso al gimnasio al activar membresía." },
      garantia: { dias: 0, descripcion: "Clase de prueba gratuita. Sin compromiso." },
      noPuede: ["prometer resultados físicos específicos", "diagnosticar condiciones médicas", "dar planes de dieta sin ser nutricionista"],
      loQueDebeSaber: ["Planes mensuales cancelables", "Clase de prueba gratuita", "Entrenadores certificados", "Horarios de clases grupales"],
      modoCatalogo: "fisico",
    },
  },
  {
    id: "restaurant",
    name: "Restaurante / Food Service",
    icon: "🍽️",
    description: "Restaurantes, cafeterías, food trucks, domicilios",
    agentType: "restaurant",
    tone: "warm",
    businessProfile: {
      nicho: "restaurantes, comida, pedidos, domicilios, reservas",
      entrega: { metodo: "domicilio o recoger", plazo: "30-60 minutos", detalle: "Domicilio o recogida en local. Tiempo estimado según pedido." },
      garantia: { dias: 0, descripcion: "Calidad garantizada. Si no gusta, lo reemplazamos." },
      noPuede: ["inventar platillos que no estén en el menú", "prometer tiempos que no puedan cumplir", "dar información nutricional sin base"],
      loQueDebeSaber: ["Pedidos por WhatsApp", "Domicilio y recogida", "Reservas de mesas", "Menú del día y especiales"],
      modoCatalogo: "fisico",
    },
  },
  {
    id: "real_estate",
    name: "Inmobiliaria",
    icon: "🏠",
    description: "Venta y arrendamiento de propiedades",
    agentType: "real_estate",
    tone: "professional",
    businessProfile: {
      nicho: "inmobiliarias, propiedades, apartamentos, casas, arriendos",
      entrega: { metodo: "visita presencial o virtual", plazo: "según agenda", detalle: "Tour por la propiedad. Asesoría en crédito hipotecario." },
      garantia: { dias: 0, descripcion: "Asesoría inmobiliaria profesional. Trazabilidad del proceso." },
      noPuede: ["inventar disponibilidad", "prometer aprobación de crédito", "ocultar defectos de la propiedad"],
      loQueDebeSaber: ["Venta y arrendamiento", "Tour virtuales disponibles", "Asesoría en crédito hipotecario", "Documentación legal incluida"],
      modoCatalogo: "fisico",
    },
  },
  {
    id: "legal",
    name: "Despacho Legal / Abogados",
    icon: "⚖️",
    description: "Servicios jurídicos, derecho familiar, laboral, civil",
    agentType: "legal",
    tone: "formal",
    businessProfile: {
      nicho: "abogados, despacho legal, derecho, asesoría jurídica",
      entrega: { metodo: "consulta presencial o virtual", plazo: "según disponibilidad", detalle: "Consulta con abogado especialista. Primera consulta con costo." },
      garantia: { dias: 0, descripcion: "Confidencialidad y profesionalismo garantizados." },
      noPuede: ["dar asesoría legal completa por WhatsApp", "prometer resultados en casos", "opinionar sobre casos en curso"],
      loQueDebeSaber: ["Primera consulta con costo", "Diversas áreas del derecho", "Confidencialidad absoluta", "Agenda con abogados especialistas"],
      modoCatalogo: "digital",
    },
  },
  {
    id: "veterinary",
    name: "Veterinaria / Mascotas",
    icon: "🐾",
    description: "Servicios veterinarios, productos para mascotas",
    agentType: "veterinary",
    tone: "caring",
    businessProfile: {
      nicho: "veterinarias, mascotas, animales, cuidado animal",
      entrega: { metodo: "cita veterinaria o productos", plazo: "según disponibilidad", detalle: "Cita con veterinario o entrega de productos para mascotas." },
      garantia: { dias: 0, descripcion: "Servicio veterinario profesional." },
      noPuede: ["diagnosticar por WhatsApp", "recetar medicamentos", "minimizar síntomas"],
      loQueDebeSaber: ["Consultas veterinarias", "Vacunación y desparasitación", "Productos para mascotas", "Emergencias 24/7"],
      modoCatalogo: "mixto",
    },
  },
  {
    id: "beauty",
    name: "Salón de Belleza / Estética",
    icon: "💅",
    description: "Peluquería, manicure, spa, estética",
    agentType: "beauty",
    tone: "friendly",
    businessProfile: {
      nicho: "salones de belleza, peluquería, estética, spa, manicure",
      entrega: { metodo: "cita presencial", plazo: "según disponibilidad", detalle: "Cita agendada en el salón. Confirmación por WhatsApp." },
      garantia: { dias: 0, descripcion: "Satisfacción garantizada. Rehacemos el servicio si no gusta." },
      noPuede: ["prometer resultados específicos", "dar consejos de salud sin ser profesional", "inventar servicios que no existen"],
      loQueDebeSaber: ["Citas por WhatsApp", "Servicios de peluquería y estética", "Horarios disponibles", "Productos utilizados"],
      modoCatalogo: "fisico",
    },
  },
  {
    id: "automotive",
    name: "Automotriz / Taller",
    icon: "🚗",
    description: "Concesionarios, talleres mecánicos, repuestos",
    agentType: "automotive",
    tone: "professional",
    businessProfile: {
      nicho: "automotriz, talleres mecánicos, concesionarios, repuestos",
      entrega: { metodo: "servicio presencial", plazo: "según diagnóstico", detalle: "Diagnóstico y reparación en taller. Cotización previa." },
      garantia: { dias: 30, descripcion: "Garantía en mano de obra y repuestos." },
      noPuede: ["inventar tiempos de reparación", "prometer aprobación de crédito vehicular", "ocultar fallas detectadas"],
      loQueDebeSaber: ["Diagnóstico gratuito", "Cotización sin compromiso", "Repuestos originales y genéricos", "Garantía en servicios"],
      modoCatalogo: "fisico",
    },
  },
  {
    id: "education",
    name: "Academia / Escuela",
    icon: "📚",
    description: "Escuelas, academias de idiomas, centros de capacitación",
    agentType: "education",
    tone: "educational",
    businessProfile: {
      nicho: "academias, escuelas, idiomas, capacitación, educación",
      entrega: { metodo: "clases presenciales o virtuales", plazo: "según calendario", detalle: "Clases en horarios definidos. Inscripción abierta." },
      garantia: { dias: 0, descripcion: "Primera clase de prueba gratuita." },
      noPuede: ["prometer certificaciones oficiales sin aval", "garantizar aprendizaje", "inventar grupos que no existen"],
      loQueDebeSaber: ["Clases presenciales y virtuales", "Niveles principiante a avanzado", "Horarios flexibles", "Profesores certificados"],
      modoCatalogo: "digital",
    },
  },
  {
    id: "subscriptions",
    name: "Suscripciones / Membresías",
    icon: "⭐",
    description: "Planes recurrentes, membresías, acceso premium",
    agentType: "subscriptions",
    tone: "friendly",
    businessProfile: {
      nicho: "suscripciones, membresías, planes recurrentes, acceso premium",
      entrega: { metodo: "acceso digital", plazo: "inmediato", detalle: "Activación inmediata de la suscripción. Cancelación flexible." },
      garantia: { dias: 7, descripcion: "7 días de prueba. Si no gusta, cancela sin costo." },
      noPuede: ["inventar beneficios que no existen", "comprometer plazos de permanencia", "cobrar sin autorización"],
      loQueDebeSaber: ["Planes mensuales y anuales", "Cancelación en cualquier momento", "Acceso inmediato tras pago", "Beneficios según plan elegido"],
      modoCatalogo: "digital",
    },
  },
];

/**
 * Busca la plantilla más parecida al texto dado.
 * Si nada coincide, devuelve la primera (cursos).
 */
export function findBestTemplate(text: string): BusinessTemplate {
  const t = text.toLowerCase();
  const patterns: { id: string; re: RegExp }[] = [
    { id: "clinic", re: /cl[ií]nica|consultorio|m[eé]dico|doctor|salud|odontolog|psicolog|dermatolog/ },
    { id: "gym", re: /gimnasio|fitness|entrenamiento|crossfit|yoga|spinning|deporte/ },
    { id: "restaurant", re: /restaurante|comida|domicilio|men[uú]|pedido|cafetería/ },
    { id: "real_estate", re: /inmobiliaria|apartamento|casa|arriendo|propiedad|cr[eé]dito hipotecario/ },
    { id: "legal", re: /abogado|despacho|legal|divorcio|custodia|laboral|penal|derecho/ },
    { id: "veterinary", re: /veterinaria|mascota|perro|gato|vacuna|animal/ },
    { id: "beauty", re: /belleza|sal[oó]n|peluquer|manicure|spa|est[eé]tica|uñas/ },
    { id: "automotive", re: /automotriz|taller|mec[aá]nico|carro|vehiculo|concesionario/ },
    { id: "education", re: /academia|escuela|idioma|clase|nivel|profesor/ },
    { id: "subscriptions", re: /suscripci[oó]n|membres[ií]a|recurrente|plan mensual|premium/ },
    { id: "services", re: /servicio|consultor|dise[nñ]o|desarrollo|marketing|agencia/ },
    { id: "dropshipping", re: /dropship|producto f[ií]sico|env[ií]o|contraentrega|gadget|accesorio/ },
    { id: "courses", re: /curso|formaci[oó]n|educaci[oó]n|capacitaci[oó]n|taller|ebook|megapack/ },
  ];
  for (const { id, re } of patterns) {
    if (re.test(t)) {
      const found = BUSINESS_TEMPLATES.find((t) => t.id === id);
      if (found) return found;
    }
  }
  return BUSINESS_TEMPLATES[0]; // Default: cursos
}
