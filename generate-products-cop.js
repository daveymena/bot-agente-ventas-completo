const fs = require('fs');

// Leer el archivo existente
const oldProducts = JSON.parse(fs.readFileSync('products-full.json', 'utf8'));

// Descripciones detalladas por tipo de producto
const descriptions = {
  "COMICS CONDORITO": "Colección completa de comics de Condorito. Cientos de historias clásicas del icónico personaje chileno en formato digital de alta calidad.",
  "PACK IDIOMAS": "Megapack de cursos de idiomas (inglés, francés, alemán, italiano, portugués). Incluye audios, videos, ejercicios y material didáctico completo.",
  "CURSO LETTERING": "Aprende lettering y caligrafía moderna desde cero. Técnicas de brush lettering, composición y proyectos prácticos para diseñadores.",
  "FOTOMONTAJE": "Domina el fotomontaje publicitario profesional. Composición, integración de elementos, iluminación y efectos en Photoshop con proyectos reales.",
  "DISEÑO EDITORIAL": "Curso completo de diseño editorial. Maquetación, tipografía, retículas, composición y producción de libros, revistas y publicaciones.",
  "LOGOTIPOS": "Diseño profesional de logotipos con retículas. Teoría del color, geometría, construcción y presentación de identidades visuales.",
  "MARCA": "Crea y gestiona marcas desde cero. Estrategia, posicionamiento, identidad visual, manual de marca y aplicaciones prácticas.",
  "INDESIGN": "Domina Adobe InDesign desde lo básico hasta nivel avanzado. Maquetación, estilos, tablas, publicaciones digitales e impresión profesional.",
  "ANIMACIÓN": "Animación express para redes sociales. After Effects, motion graphics, transiciones, efectos y optimización para plataformas digitales.",
  "APLICACIÓN": "Diseño de interfaces móviles (UI/UX). Wireframes, prototipos, interacción, usabilidad y diseño de experiencias para apps.",
  "ILUSTRACIÓN": "Del dibujo tradicional a la ilustración digital. Anatomía, perspectiva, color, técnicas digitales y desarrollo de estilo propio.",
  "VIDEO": "Producción y edición de video profesional. Cámaras, iluminación, audio, edición en Premiere/Final Cut y postproducción completa.",
  "FOTOGRAFIA": "Fotografía profesional completa. Técnica, composición, iluminación, equipos, edición y fotografía para diferentes géneros.",
  "PHOTOSHOP WEB": "Photoshop para diseño web. Interfaces, mockups, exportación de assets, optimización y trabajo colaborativo con desarrolladores.",
  "ECOMMERCE": "Crea y gestiona tiendas online exitosas. Plataformas, marketing, logística, pagos, atención al cliente y estrategias de ventas.",
  "INTERFACES": "Diseño de interfaces móviles modernas. Material Design, iOS Guidelines, animaciones, microinteracciones y prototipado.",
  "DESARROLLO WEB": "Desarrollo web full stack. HTML, CSS, JavaScript, frameworks modernos, backend, bases de datos y despliegue de aplicaciones.",
  "MUEBLES": "15,000 planos profesionales para carpintería. Muebles de sala, cocina, dormitorio, oficina y proyectos comerciales con medidas exactas.",
  "VIDEOJUEGOS": "Creación de videojuegos completa. Unity/Unreal, programación, diseño de niveles, mecánicas, arte 2D/3D y publicación.",
  "3D": "Master en animación 3D. Modelado, texturizado, rigging, animación de personajes, iluminación y render profesional.",
  "RETOQUE": "Retoque fotográfico profesional de retratos. Piel, ojos, cabello, color, luz, composición y técnicas de belleza editorial.",
  "WORDPRESS": "Master en WordPress. Instalación, temas, plugins, SEO, seguridad, optimización, WooCommerce y creación de sitios profesionales.",
  "PILATES": "Pilates completo para acondicionamiento físico. Ejercicios, rutinas, corrección postural, flexibilidad y fortalecimiento corporal.",
  "CIBERSEGURIDAD": "Ciberseguridad desde cero. Ethical hacking, análisis de vulnerabilidades, seguridad en redes, criptografía y pentesting.",
  "LOCUCIÓN": "Locución profesional. Técnica vocal, respiración, dicción, interpretación, grabación y mercado del voice over.",
  "LINUX": "Administración de servidores Linux. Instalación, configuración, seguridad, bash, redes, servicios web y resolución de problemas.",
  "CAR AUDIO": "Car audio profesional. Instalación, amplificadores, subwoofers, procesadores, acústica vehicular y ajustes avanzados.",
  "PRESETS": "Presets profesionales para Lightroom. Packs para retratos, paisajes, bodas, moda, producto y diferentes estilos fotográficos.",
  "PLAYSTATION": "Reparación de consolas PlayStation (PS2, PS3, PS4, PS5). Diagnóstico, soldadura, reballing y solución de fallas comunes.",
  "CELULARES": "Reparación de celulares. Diagnóstico de fallas, cambio de pantallas, baterías, micro soldadura, software y liberación.",
  "PROGRAMACIÓN": "Pack completo de programación. Python, JavaScript, Java, C++, frameworks, bases de datos, algoritmos y proyectos reales.",
  "MARKETING": "Marketing digital completo. SEO, SEM, redes sociales, email marketing, analítica, estrategias y gestión de campañas.",
  "SEO": "SEO y marketing digital desde cero. Posicionamiento web, keyword research, link building, contenido y herramientas profesionales.",
  "CINEMA": "Cinema 4D completo. Modelado, animación, motion graphics, materiales, iluminación, render y integración con After Effects.",
  "ILLUSTRATOR": "Adobe Illustrator master. Herramientas vectoriales, diseño de logos, ilustración, tipografía y producción gráfica profesional.",
  "REPOSTERIA": "Repostería y pastelería profesional. Recetas, técnicas, decoración, fondant, cupcakes, tortas temáticas y negocios.",
  "EXCEL": "Excel completo de básico a avanzado. Fórmulas, tablas dinámicas, macros, VBA, dashboards y automatización de procesos.",
  "OFFICE": "Microsoft Office completo. Word, Excel, PowerPoint, Outlook, Access, técnicas avanzadas y productividad profesional.",
  "AFTER EFFECTS": "After Effects master. Motion graphics, efectos visuales, composición, tracking, rotoscopia y animación profesional.",
  "VRAY": "V-Ray para arquitectura. Materiales, iluminación, render fotorrealista, optimización y postproducción de imágenes arquitectónicas.",
  "SKETCHUP": "SketchUp completo. Modelado 3D, arquitectura, renders, plugins, Layout y presentación de proyectos arquitectónicos.",
  "REVIT": "Revit BIM completo. Modelado arquitectónico, estructural, MEP, familias, documentación, colaboración y gestión de proyectos.",
  "AUTOCAD": "AutoCAD 2D y 3D completo. Dibujo técnico, arquitectura, mecánica, bloques dinámicos, layouts y producción de planos.",
  "PIANO": "Curso completo de piano desde cero. Teoría musical, lectura de partituras, técnica, repertorio clásico, jazz y pop. Ideal para principiantes y nivel intermedio.",
  "DEFAULT": "Curso completo con contenido actualizado y de alta calidad. Incluye material didáctico, ejercicios prácticos y acceso permanente."
};

// Generar descripción basada en el nombre del producto
function generateDescription(name) {
  const upperName = name.toUpperCase();
  
  for (const [key, desc] of Object.entries(descriptions)) {
    if (upperName.includes(key)) {
      return desc;
    }
  }
  
  return descriptions.DEFAULT.replace("Curso completo", `${name} - Curso completo`);
}

// Generar categoría basada en el nombre
function generateCategory(name) {
  const upperName = name.toUpperCase();
  
  if (upperName.includes('DISEÑO') || upperName.includes('PHOTOSHOP') || upperName.includes('ILLUSTRATOR') || 
      upperName.includes('LETTERING') || upperName.includes('LOGO')) return 'Diseño Gráfico';
  if (upperName.includes('PROGRAMACIÓN') || upperName.includes('WEB') || upperName.includes('LINUX') || 
      upperName.includes('WORDPRESS')) return 'Programación';
  if (upperName.includes('MARKETING') || upperName.includes('SEO') || upperName.includes('ECOMMERCE')) return 'Marketing';
  if (upperName.includes('OFFICE') || upperName.includes('EXCEL')) return 'Ofimática';
  if (upperName.includes('IDIOMAS') || upperName.includes('INGLES')) return 'Idiomas';
  if (upperName.includes('FOTOGRAFIA') || upperName.includes('FOTOMONTAJE')) return 'Fotografía';
  if (upperName.includes('VIDEO') || upperName.includes('ANIMACIÓN') || upperName.includes('3D') || 
      upperName.includes('CINEMA') || upperName.includes('AFTER')) return 'Audiovisual';
  if (upperName.includes('PIANO') || upperName.includes('MUSICA')) return 'Música';
  if (upperName.includes('CELULAR') || upperName.includes('PLAYSTATION') || upperName.includes('REPARACIÓN')) return 'Tecnología';
  if (upperName.includes('AUTOCAD') || upperName.includes('REVIT') || upperName.includes('SKETCHUP')) return 'Arquitectura';
  if (upperName.includes('REPOSTERIA') || upperName.includes('COCINA')) return 'Gastronomía';
  
  return 'General';
}

// Crear nuevo array de productos con precios en COP
const newProducts = oldProducts.map((product, index) => {
  // El producto "PIANO" (asumiendo que es el megapack completo) vale 60,000 COP
  const isPiano = product.name.toUpperCase().includes('CURSO COMPLETO') || 
                  product.name.toUpperCase() === 'MEGAPACK COMPLETO' ||
                  index === 80; // Último producto
  
  const price = isPiano ? 60000 : 20000;
  
  return {
    id: product.id,
    name: product.name,
    description: generateDescription(product.name),
    price: price,
    currency: "COP",
    category: generateCategory(product.name),
    kind: "digital",
    image_url: product.image_url,
    drive_folder_id: product.drive_folder_id,
    drive_url: product.drive_url,
    features: product.features || ["Acceso permanente", "Descargas ilimitadas", "Soporte incluido", "Actualizaciones gratis"],
    deliveryLink: product.drive_url
  };
});

// Guardar el nuevo archivo
fs.writeFileSync('productos-completos-cop.json', JSON.stringify(newProducts, null, 2), 'utf8');

console.log(`✅ Archivo generado exitosamente con ${newProducts.length} productos`);
console.log(`\n📊 Resumen de precios:`);
console.log(`   - Productos a 20,000 COP: ${newProducts.filter(p => p.price === 20000).length}`);
console.log(`   - Productos a 60,000 COP: ${newProducts.filter(p => p.price === 60000).length}`);

// Mostrar primeros 5 productos
console.log(`\n📦 Primeros 5 productos:`);
newProducts.slice(0, 5).forEach(p => {
  console.log(`\n${p.id}. ${p.name}`);
  console.log(`   💰 ${p.price.toLocaleString('es-CO')} COP`);
  console.log(`   📁 ${p.category}`);
  console.log(`   📝 ${p.description.substring(0, 80)}...`);
});
