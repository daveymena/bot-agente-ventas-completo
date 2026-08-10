import { placeholderImage } from "../lib/placeholder-image";
export interface StoreTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  colors: {
    primary: string;
    secondary: string;
  };
  categories: string[];
  defaultProducts: {
    name: string;
    description: string;
    price: number;
    image: string;
    category: string;
    type: 'digital' | 'physical' | 'dropshipping';
  }[];
  configOverrides: {
    storeName: string;
    fontFamily: string;
    borderRadius: 'none' | 'md' | '2xl' | 'full';
    theme: 'light' | 'dark' | 'glass' | 'corporate';
    showHero: boolean;
    showWizard: boolean;
    showCategories: boolean;
  };
}

export const storeTemplates: StoreTemplate[] = [
  {
    id: 'tecnologia',
    name: 'Tecnología',
    description: 'Gadgets, accesorios y equipos electrónicos',
    icon: '💻',
    colors: { primary: '#2563eb', secondary: '#7c3aed' },
    categories: ['Laptops', 'Periféricos', 'Audífonos', 'Cargadores', 'Gadgets'],
    defaultProducts: [
      { name: 'Laptop UltraBook Pro', description: 'Potente laptop con 16GB RAM y 512GB SSD', price: 899.99, image: placeholderImage("Tecnología"), category: 'Laptops', type: 'physical' },
      { name: 'Teclado Mecánico RGB', description: 'Teclado mecánico con switches Cherry MX', price: 129.99, image: placeholderImage("Teclado Mecánico RGB"), category: 'Periféricos', type: 'physical' },
      { name: 'Audífonos Noise Cancelling', description: 'Cancelación de ruido activa y 30h batería', price: 249.99, image: placeholderImage("Audífonos Noise Cancelling"), category: 'Audífonos', type: 'physical' },
      { name: 'Cargador Rápido USB-C', description: 'Carga rápida 65W para laptops y smartphones', price: 39.99, image: placeholderImage("Cargador Rápido USB-C"), category: 'Cargadores', type: 'physical' },
      { name: 'Smartwatch Deportivo', description: 'Monitor de actividad, GPS y resistencia al agua', price: 199.99, image: placeholderImage("Smartwatch Deportivo"), category: 'Gadgets', type: 'physical' },
    ],
    configOverrides: {
      storeName: 'TechStore',
      fontFamily: 'Inter',
      borderRadius: 'md',
      theme: 'light',
      showHero: true,
      showWizard: true,
      showCategories: true,
    },
  },
  {
    id: 'moda',
    name: 'Moda',
    description: 'Ropa, calzado y accesorios de moda',
    icon: '👗',
    colors: { primary: '#ec4899', secondary: '#f43f5e' },
    categories: ['Ropa', 'Zapatos', 'Accesorios', 'Bolsos', 'Joyas'],
    defaultProducts: [
      { name: 'Vestido Elegante', description: 'Vestido de noche con diseño moderno y elegante', price: 89.99, image: placeholderImage("Moda"), category: 'Ropa', type: 'physical' },
      { name: 'Zapatillas Casual Premium', description: 'Cómodas zapatillas para uso diario', price: 119.99, image: placeholderImage("Zapatillas Casual Premium"), category: 'Zapatos', type: 'physical' },
      { name: 'Bolso Tote de Cuero', description: 'Bolso espacioso de cuero genuino', price: 159.99, image: placeholderImage("Bolso Tote de Cuero"), category: 'Bolsos', type: 'physical' },
      { name: 'Collar Minimalista', description: 'Collar de plata con diseño geométrico', price: 49.99, image: placeholderImage("Collar Minimalista"), category: 'Joyas', type: 'physical' },
      { name: 'Gafas de Sol Aviador', description: 'Gafas de sol con protección UV400', price: 79.99, image: placeholderImage("Gafas de Sol Aviador"), category: 'Accesorios', type: 'physical' },
    ],
    configOverrides: {
      storeName: 'FashionMode',
      fontFamily: 'Inter',
      borderRadius: '2xl',
      theme: 'light',
      showHero: true,
      showWizard: false,
      showCategories: true,
    },
  },
  {
    id: 'cursos',
    name: 'Cursos Digitales',
    description: 'Ebooks, cursos online y contenido digital',
    icon: '📚',
    colors: { primary: '#059669', secondary: '#0d9488' },
    categories: ['Cursos', 'Ebooks', 'Plantillas', 'Software', 'Música'],
    defaultProducts: [
      { name: 'Curso de Marketing Digital', description: 'Aprende estrategias de marketing desde cero', price: 49.99, image: placeholderImage("Cursos Digitales"), category: 'Cursos', type: 'digital' },
      { name: 'Ebook Crecimiento Personal', description: 'Guía completa para alcanzar tus metas', price: 19.99, image: placeholderImage("Ebook Crecimiento Personal"), category: 'Ebooks', type: 'digital' },
      { name: 'Pack de Plantillas Web', description: '50 plantillas responsive para tu negocio', price: 39.99, image: placeholderImage("Pack de Plantillas Web"), category: 'Plantillas', type: 'digital' },
      { name: 'Curso de Fotografía', description: 'Domina tu cámara y edición profesional', price: 59.99, image: placeholderImage("Curso de Fotografía"), category: 'Cursos', type: 'digital' },
      { name: 'Software de Productividad', description: 'Herramienta premium para gestión de proyectos', price: 99.99, image: placeholderImage("Software de Productividad"), category: 'Software', type: 'digital' },
    ],
    configOverrides: {
      storeName: 'AcademiaDigital',
      fontFamily: 'Inter',
      borderRadius: 'md',
      theme: 'light',
      showHero: true,
      showWizard: true,
      showCategories: true,
    },
  },
  {
    id: 'comida',
    name: 'Comida & Bebida',
    description: 'Restaurantes, cafetería y servicio de catering',
    icon: '🍕',
    colors: { primary: '#ea580c', secondary: '#dc2626' },
    categories: ['Pizzas', 'Bebidas', 'Postres', 'Combos', 'Catering'],
    defaultProducts: [
      { name: 'Pizza Familiar 4 Quesos', description: 'Pizza grande con mozzarella, gorgonzola, parmesano y ricotta', price: 24.99, image: placeholderImage("Comida & Bebida"), category: 'Pizzas', type: 'physical' },
      { name: 'Hamburguesa Gourmet', description: 'Carne angus, queso cheddar, bacon y cebolla caramelizada', price: 18.99, image: placeholderImage("Hamburguesa Gourmet"), category: 'Combos', type: 'physical' },
      { name: 'Smoothie de Frutas', description: 'Bebida natural con frutas frescas del día', price: 7.99, image: placeholderImage("Smoothie de Frutas"), category: 'Bebidas', type: 'physical' },
      { name: 'Cheesecake New York', description: 'Cheesecake cremoso con salsa de frutos rojos', price: 9.99, image: placeholderImage("Cheesecake New York"), category: 'Postres', type: 'physical' },
      { name: 'Catering Ejecutivo (10 pax)', description: 'Menú ejecutivo para 10 personas con bebida incluida', price: 149.99, image: placeholderImage("Catering Ejecutivo (10 pax)"), category: 'Catering', type: 'physical' },
    ],
    configOverrides: {
      storeName: 'Sabores del Mundo',
      fontFamily: 'Inter',
      borderRadius: '2xl',
      theme: 'corporate',
      showHero: true,
      showWizard: true,
      showCategories: true,
    },
  },
  {
    id: 'servicios',
    name: 'Servicios Profesionales',
    description: 'Consultoría, diseño, desarrollo y asesorías',
    icon: '💼',
    colors: { primary: '#1e293b', secondary: '#334155' },
    categories: ['Consultoría', 'Diseño', 'Desarrollo', 'Asesoría', 'Marketing'],
    defaultProducts: [
      { name: 'Consultoría Estratégica 1hr', description: 'Sesión de consultoría personalizada para tu negocio', price: 99.99, image: placeholderImage("Servicios Profesionales"), category: 'Consultoría', type: 'digital' },
      { name: 'Branding Completo', description: 'Diseño de identidad corporativa: logo, colores y manual', price: 499.99, image: placeholderImage("Branding Completo"), category: 'Diseño', type: 'digital' },
      { name: 'Desarrollo de Landing Page', description: 'Landing page profesional con diseño responsive', price: 299.99, image: placeholderImage("Desarrollo de Landing Page"), category: 'Desarrollo', type: 'digital' },
      { name: 'Asesoría Legal Empresarial', description: 'Consulta legal especializada para emprendedores', price: 149.99, image: placeholderImage("Asesoría Legal Empresarial"), category: 'Asesoría', type: 'digital' },
      { name: 'Plan de Marketing Digital', description: 'Estrategia completa de marketing para 3 meses', price: 399.99, image: placeholderImage("Plan de Marketing Digital"), category: 'Marketing', type: 'digital' },
    ],
    configOverrides: {
      storeName: 'ProServicios',
      fontFamily: 'Inter',
      borderRadius: 'md',
      theme: 'corporate',
      showHero: true,
      showWizard: true,
      showCategories: true,
    },
  },
  {
    id: 'salud',
    name: 'Salud & Belleza',
    description: 'Cosméticos, suplementos y bienestar',
    icon: '💄',
    colors: { primary: '#d946ef', secondary: '#f472b6' },
    categories: ['Cuidado Facial', 'Maquillaje', 'Suplementos', 'Aromaterapia', 'Bienestar'],
    defaultProducts: [
      { name: 'Crema Facial Anti-Edad', description: 'Crema hidratante con ácido hialurónico y vitamina C', price: 45.99, image: placeholderImage("Salud & Belleza"), category: 'Cuidado Facial', type: 'physical' },
      { name: 'Paleta de Sombras Profesional', description: 'Paleta con 24 colores de alta pigmentación', price: 39.99, image: placeholderImage("Paleta de Sombras Profesional"), category: 'Maquillaje', type: 'physical' },
      { name: 'Multivitamínico Diario', description: 'Suplemento nutricional con vitaminas y minerales', price: 29.99, image: placeholderImage("Multivitamínico Diario"), category: 'Suplementos', type: 'physical' },
      { name: 'Kit de Aromaterapia', description: 'Aceites esenciales con difusor ultrasónico', price: 59.99, image: placeholderImage("Kit de Aromaterapia"), category: 'Aromaterapia', type: 'physical' },
      { name: 'Suscripción Bienestar Mensual', description: 'Caja mensual con productos seleccionados de bienestar', price: 34.99, image: placeholderImage("Suscripción Bienestar Mensual"), category: 'Bienestar', type: 'physical' },
    ],
    configOverrides: {
      storeName: 'BellezaNatural',
      fontFamily: 'Inter',
      borderRadius: '2xl',
      theme: 'light',
      showHero: true,
      showWizard: true,
      showCategories: true,
    },
  },
  {
    id: 'hogar',
    name: 'Hogar & Decoración',
    description: 'Muebles, decoración y artículos para el hogar',
    icon: '🏠',
    colors: { primary: '#92400e', secondary: '#d97706' },
    categories: ['Muebles', 'Decoración', 'Cocina', 'Jardín', 'Organización'],
    defaultProducts: [
      { name: 'Sofá Seccional Moderno', description: 'Sofá de tela premium con cojines viscoelásticos', price: 899.99, image: placeholderImage("Hogar & Decoración"), category: 'Muebles', type: 'physical' },
      { name: 'Set de Sartenes Antiadherentes', description: 'Juego de 5 sartenes con recubrimiento cerámico', price: 79.99, image: placeholderImage("Set de Sartenes Antiadherentes"), category: 'Cocina', type: 'physical' },
      { name: 'Maceta Decorativa XL', description: 'Maceta de cerámica esmaltada para interiores', price: 49.99, image: placeholderImage("Maceta Decorativa XL"), category: 'Jardín', type: 'physical' },
      { name: 'Estantería Modular', description: 'Sistema de estanterías ajustables con diseño nórdico', price: 129.99, image: placeholderImage("Estantería Modular"), category: 'Muebles', type: 'physical' },
      { name: 'Organizador de Escritorio', description: 'Set completo de organización con bandejas y portalápices', price: 34.99, image: placeholderImage("Organizador de Escritorio"), category: 'Organización', type: 'physical' },
    ],
    configOverrides: {
      storeName: 'Hogar&Estilo',
      fontFamily: 'Inter',
      borderRadius: 'md',
      theme: 'light',
      showHero: true,
      showWizard: true,
      showCategories: true,
    },
  },
  {
    id: 'deportes',
    name: 'Deportes & Fitness',
    description: 'Equipamiento deportivo, ropa fitness y accesorios',
    icon: '🏋️',
    colors: { primary: '#16a34a', secondary: '#0d9488' },
    categories: ['Ropa Deportiva', 'Equipamiento', 'Suplementos', 'Accesorios', 'Nutrición'],
    defaultProducts: [
      { name: 'Leggings Premium Fitness', description: 'Leggings de compresión con tecnología DryFit', price: 59.99, image: placeholderImage("Deportes & Fitness"), category: 'Ropa Deportiva', type: 'physical' },
      { name: 'Pesas Ajustables 20kg', description: 'Juego de mancuernas con discos intercambiables', price: 199.99, image: placeholderImage("Pesas Ajustables 20kg"), category: 'Equipamiento', type: 'physical' },
      { name: 'Bote de Proteína Whey 2kg', description: 'Proteína de suero de leche con sabor a chocolate', price: 49.99, image: placeholderImage("Bote de Proteína Whey 2kg"), category: 'Suplementos', type: 'physical' },
      { name: 'Esterilla Yoga Premium', description: 'Esterilla antideslizante con 6mm de grosor', price: 39.99, image: placeholderImage("Esterilla Yoga Premium"), category: 'Accesorios', type: 'physical' },
      { name: 'Plan Nutricional Personalizado', description: 'Plan de alimentación adaptado a tus objetivos fitness', price: 79.99, image: placeholderImage("Plan Nutricional Personalizado"), category: 'Nutrición', type: 'digital' },
    ],
    configOverrides: {
      storeName: 'FitZone',
      fontFamily: 'Inter',
      borderRadius: 'md',
      theme: 'light',
      showHero: true,
      showWizard: true,
      showCategories: true,
    },
  },
];
