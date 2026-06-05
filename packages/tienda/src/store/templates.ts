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
      { name: 'Laptop UltraBook Pro', description: 'Potente laptop con 16GB RAM y 512GB SSD', price: 899.99, image: 'https://images.unsplash.com/photo-1496181133206-80ce9b88a853?w=800', category: 'Laptops', type: 'physical' },
      { name: 'Teclado Mecánico RGB', description: 'Teclado mecánico con switches Cherry MX', price: 129.99, image: 'https://images.unsplash.com/photo-1511467687858-23d96c32e4ae?w=800', category: 'Periféricos', type: 'physical' },
      { name: 'Audífonos Noise Cancelling', description: 'Cancelación de ruido activa y 30h batería', price: 249.99, image: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800', category: 'Audífonos', type: 'physical' },
      { name: 'Cargador Rápido USB-C', description: 'Carga rápida 65W para laptops y smartphones', price: 39.99, image: 'https://images.unsplash.com/photo-1583394838336-acd977736f90?w=800', category: 'Cargadores', type: 'physical' },
      { name: 'Smartwatch Deportivo', description: 'Monitor de actividad, GPS y resistencia al agua', price: 199.99, image: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800', category: 'Gadgets', type: 'physical' },
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
      { name: 'Vestido Elegante', description: 'Vestido de noche con diseño moderno y elegante', price: 89.99, image: 'https://images.unsplash.com/photo-1595777457583-95e059d581b8?w=800', category: 'Ropa', type: 'physical' },
      { name: 'Zapatillas Casual Premium', description: 'Cómodas zapatillas para uso diario', price: 119.99, image: 'https://images.unsplash.com/photo-1549298916-b41d501d3772?w=800', category: 'Zapatos', type: 'physical' },
      { name: 'Bolso Tote de Cuero', description: 'Bolso espacioso de cuero genuino', price: 159.99, image: 'https://images.unsplash.com/photo-1584917865442-de89df76afd3?w=800', category: 'Bolsos', type: 'physical' },
      { name: 'Collar Minimalista', description: 'Collar de plata con diseño geométrico', price: 49.99, image: 'https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?w=800', category: 'Joyas', type: 'physical' },
      { name: 'Gafas de Sol Aviador', description: 'Gafas de sol con protección UV400', price: 79.99, image: 'https://images.unsplash.com/photo-1572635196237-14b3f281503f?w=800', category: 'Accesorios', type: 'physical' },
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
      { name: 'Curso de Marketing Digital', description: 'Aprende estrategias de marketing desde cero', price: 49.99, image: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=800', category: 'Cursos', type: 'digital' },
      { name: 'Ebook Crecimiento Personal', description: 'Guía completa para alcanzar tus metas', price: 19.99, image: 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=800', category: 'Ebooks', type: 'digital' },
      { name: 'Pack de Plantillas Web', description: '50 plantillas responsive para tu negocio', price: 39.99, image: 'https://images.unsplash.com/photo-1507238691740-187a5b1d37b8?w=800', category: 'Plantillas', type: 'digital' },
      { name: 'Curso de Fotografía', description: 'Domina tu cámara y edición profesional', price: 59.99, image: 'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?w=800', category: 'Cursos', type: 'digital' },
      { name: 'Software de Productividad', description: 'Herramienta premium para gestión de proyectos', price: 99.99, image: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=800', category: 'Software', type: 'digital' },
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
      { name: 'Pizza Familiar 4 Quesos', description: 'Pizza grande con mozzarella, gorgonzola, parmesano y ricotta', price: 24.99, image: 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=800', category: 'Pizzas', type: 'physical' },
      { name: 'Hamburguesa Gourmet', description: 'Carne angus, queso cheddar, bacon y cebolla caramelizada', price: 18.99, image: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=800', category: 'Combos', type: 'physical' },
      { name: 'Smoothie de Frutas', description: 'Bebida natural con frutas frescas del día', price: 7.99, image: 'https://images.unsplash.com/photo-1553530666-ba11a7da3888?w=800', category: 'Bebidas', type: 'physical' },
      { name: 'Cheesecake New York', description: 'Cheesecake cremoso con salsa de frutos rojos', price: 9.99, image: 'https://images.unsplash.com/photo-1533134242443-d4fd215305ad?w=800', category: 'Postres', type: 'physical' },
      { name: 'Catering Ejecutivo (10 pax)', description: 'Menú ejecutivo para 10 personas con bebida incluida', price: 149.99, image: 'https://images.unsplash.com/photo-1555244162-803834f70033?w=800', category: 'Catering', type: 'physical' },
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
      { name: 'Consultoría Estratégica 1hr', description: 'Sesión de consultoría personalizada para tu negocio', price: 99.99, image: 'https://images.unsplash.com/photo-1552664730-d307ca884978?w=800', category: 'Consultoría', type: 'digital' },
      { name: 'Branding Completo', description: 'Diseño de identidad corporativa: logo, colores y manual', price: 499.99, image: 'https://images.unsplash.com/photo-1561070791-2526d30994b5?w=800', category: 'Diseño', type: 'digital' },
      { name: 'Desarrollo de Landing Page', description: 'Landing page profesional con diseño responsive', price: 299.99, image: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=800', category: 'Desarrollo', type: 'digital' },
      { name: 'Asesoría Legal Empresarial', description: 'Consulta legal especializada para emprendedores', price: 149.99, image: 'https://images.unsplash.com/photo-1450101499163-c8848c66ca85?w=800', category: 'Asesoría', type: 'digital' },
      { name: 'Plan de Marketing Digital', description: 'Estrategia completa de marketing para 3 meses', price: 399.99, image: 'https://images.unsplash.com/photo-1557838923-2985c318be48?w=800', category: 'Marketing', type: 'digital' },
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
      { name: 'Crema Facial Anti-Edad', description: 'Crema hidratante con ácido hialurónico y vitamina C', price: 45.99, image: 'https://images.unsplash.com/photo-1570194065650-d99fb4ee8e39?w=800', category: 'Cuidado Facial', type: 'physical' },
      { name: 'Paleta de Sombras Profesional', description: 'Paleta con 24 colores de alta pigmentación', price: 39.99, image: 'https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=800', category: 'Maquillaje', type: 'physical' },
      { name: 'Multivitamínico Diario', description: 'Suplemento nutricional con vitaminas y minerales', price: 29.99, image: 'https://images.unsplash.com/photo-1550572017-edd951b55104?w=800', category: 'Suplementos', type: 'physical' },
      { name: 'Kit de Aromaterapia', description: 'Aceites esenciales con difusor ultrasónico', price: 59.99, image: 'https://images.unsplash.com/photo-1600612253971-422e7f7faeb6?w=800', category: 'Aromaterapia', type: 'physical' },
      { name: 'Suscripción Bienestar Mensual', description: 'Caja mensual con productos seleccionados de bienestar', price: 34.99, image: 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=800', category: 'Bienestar', type: 'physical' },
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
      { name: 'Sofá Seccional Moderno', description: 'Sofá de tela premium con cojines viscoelásticos', price: 899.99, image: 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=800', category: 'Muebles', type: 'physical' },
      { name: 'Set de Sartenes Antiadherentes', description: 'Juego de 5 sartenes con recubrimiento cerámico', price: 79.99, image: 'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=800', category: 'Cocina', type: 'physical' },
      { name: 'Maceta Decorativa XL', description: 'Maceta de cerámica esmaltada para interiores', price: 49.99, image: 'https://images.unsplash.com/photo-1485955900006-10f4d324d411?w=800', category: 'Jardín', type: 'physical' },
      { name: 'Estantería Modular', description: 'Sistema de estanterías ajustables con diseño nórdico', price: 129.99, image: 'https://images.unsplash.com/photo-1594026112284-02bb6f3352fe?w=800', category: 'Muebles', type: 'physical' },
      { name: 'Organizador de Escritorio', description: 'Set completo de organización con bandejas y portalápices', price: 34.99, image: 'https://images.unsplash.com/photo-1498050108023-c5249f4df085?w=800', category: 'Organización', type: 'physical' },
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
      { name: 'Leggings Premium Fitness', description: 'Leggings de compresión con tecnología DryFit', price: 59.99, image: 'https://images.unsplash.com/photo-1575052814086-f385e2e2ad1b?w=800', category: 'Ropa Deportiva', type: 'physical' },
      { name: 'Pesas Ajustables 20kg', description: 'Juego de mancuernas con discos intercambiables', price: 199.99, image: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=800', category: 'Equipamiento', type: 'physical' },
      { name: 'Bote de Proteína Whey 2kg', description: 'Proteína de suero de leche con sabor a chocolate', price: 49.99, image: 'https://images.unsplash.com/photo-1593095948071-474c5cc2c1cf?w=800', category: 'Suplementos', type: 'physical' },
      { name: 'Esterilla Yoga Premium', description: 'Esterilla antideslizante con 6mm de grosor', price: 39.99, image: 'https://images.unsplash.com/photo-1601925260368-ae2f83cf8b7f?w=800', category: 'Accesorios', type: 'physical' },
      { name: 'Plan Nutricional Personalizado', description: 'Plan de alimentación adaptado a tus objetivos fitness', price: 79.99, image: 'https://images.unsplash.com/photo-1490645935967-10de6ba17061?w=800', category: 'Nutrición', type: 'digital' },
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
