import { db, products, ensureDbReady } from "@workspace/db";
import { eq } from "drizzle-orm";

// Descripciones detalladas sin mencionar certificados ni suscripciones
const productDescriptions: Record<string, string> = {
  "COMICS CONDORITO": "Colección completa de comics de Condorito en formato digital. Incluye cientos de historias clásicas y divertidas del icónico personaje chileno. Perfecto para toda la familia. Contenido en alta calidad para disfrutar en cualquier dispositivo.",
  
  "PACK IDIOMAS": "Megapack completo de cursos de idiomas: inglés, francés, alemán, italiano, portugués y más. Incluye material de audio, video, ejercicios interactivos y guías didácticas. Desde nivel básico hasta avanzado. Aprende a tu propio ritmo con acceso permanente.",
  
  "CURSO LETTERING": "Aprende el arte del lettering y caligrafía moderna desde cero. Incluye técnicas de brush lettering, composición tipográfica, proyectos prácticos y más de 50 ejemplos descargables. Ideal para diseñadores, artistas y emprendedores creativos.",
  
  "FOTOMONTAJE": "Domina el fotomontaje publicitario profesional con Photoshop. Aprende composición avanzada, integración de elementos, manejo de iluminación, corrección de color y efectos especiales. Incluye proyectos reales del mundo publicitario y recursos descargables.",
  
  "EDITORIAL": "Curso completo de diseño editorial. Maquetación profesional, uso de retículas, tipografía avanzada, composición de páginas y producción de libros, revistas y publicaciones digitales e impresas. Incluye plantillas y recursos.",
  
  "LOGOTIPO": "Diseño profesional de logotipos con retículas. Aprende teoría del color, geometría aplicada, construcción de marcas, manual de identidad visual y presentación de proyectos a clientes. Incluye más de 100 ejemplos de análisis.",
  
  "MARCA": "Crea y gestiona marcas completas desde cero. Incluye estrategia de marca, posicionamiento, identidad visual, manual de marca, aplicaciones prácticas y gestión de marca en el tiempo. Con casos de estudio reales.",
  
  "INDESIGN": "Domina Adobe InDesign desde lo básico hasta nivel avanzado. Maquetación profesional, estilos de párrafo y carácter, tablas, publicaciones digitales, documentos interactivos e impresión profesional. Incluye proyectos completos.",
  
  "ANIMACIÓN": "Animación express para redes sociales con After Effects. Motion graphics, transiciones, efectos visuales, optimización para Instagram, Facebook, TikTok y más. Incluye plantillas editables y recursos.",
  
  "APLICACIÓN": "Diseño de interfaces móviles y aplicaciones (UI/UX). Wireframes, prototipos interactivos, diseño de experiencia de usuario, usabilidad, Material Design, iOS Guidelines y herramientas de diseño. Con proyectos reales.",
  
  "ILUSTRACIÓN": "Del dibujo tradicional a la ilustración digital profesional. Anatomía, perspectiva, color, luz y sombra, técnicas digitales en Photoshop e Illustrator, desarrollo de estilo propio. Más de 40 horas de contenido.",
  
  "VIDEO": "Producción y edición de video profesional. Manejo de cámaras, iluminación, audio, edición en Premiere Pro/Final Cut, color grading, postproducción y efectos visuales. Incluye proyectos de diferentes géneros.",
  
  "FOTOGRAFIA": "Fotografía profesional completa. Técnica fotográfica, composición, iluminación natural y artificial, manejo de equipos, edición y retoque, fotografía de productos, retratos, paisajes y más.",
  
  "PHOTOSHOP WEB": "Photoshop especializado en diseño web. Diseño de interfaces, mockups de sitios web, exportación de assets optimizados, trabajo con desarrolladores y mejores prácticas de diseño web responsive.",
  
  "ECOMMERCE": "Crea y gestiona tiendas online exitosas. Plataformas ecommerce, estrategias de marketing, logística y envíos, pasarelas de pago, atención al cliente, optimización de conversiones y análisis de métricas.",
  
  "DESARROLLO": "Desarrollo web full stack completo. HTML5, CSS3, JavaScript, frameworks modernos (React, Vue), backend con Node.js, bases de datos, APIs RESTful y despliegue de aplicaciones. Con proyectos reales.",
  
  "MUEBLES": "15,000 planos profesionales para carpintería. Incluye muebles de sala, cocina, dormitorio, baño, oficina y proyectos comerciales. Todos con medidas exactas, cortes detallados y listas de materiales.",
  
  "VIDEOJUEGOS": "Creación de videojuegos desde cero. Unity o Unreal Engine, programación de mecánicas, diseño de niveles, arte 2D/3D, animación, sonido, testing y publicación en diferentes plataformas.",
  
  "3D": "Master en animación 3D profesional. Modelado, texturizado, rigging de personajes, animación, iluminación, partículas, física, render fotorrealista y composición. Software: Blender, Maya o 3ds Max.",
  
  "RETOQUE": "Retoque fotográfico profesional especializado en retratos. Técnicas de piel, ojos, cabello, maquillaje digital, corrección de color, manejo de luz, composición y estándares de la industria de belleza.",
  
  "WORDPRESS": "Master en WordPress completo. Instalación, configuración, temas premium, plugins esenciales, SEO, seguridad, optimización de velocidad, WooCommerce y creación de sitios empresariales.",
  
  "PILATES": "Pilates completo para acondicionamiento físico. Ejercicios para todos los niveles, rutinas específicas, corrección postural, flexibilidad, fortalecimiento del core y rehabilitación. Videos en alta definición.",
  
  "CIBERSEGURIDAD": "Ciberseguridad y ethical hacking. Análisis de vulnerabilidades, seguridad en redes, pentesting, criptografía, seguridad web, Linux para hackers y herramientas profesionales de seguridad.",
  
  "LOCUCIÓN": "Locución profesional y voice over. Técnica vocal, respiración diafragmática, dicción, interpretación, manejo de micrófono, edición de audio, demo reel y estrategias para conseguir trabajo.",
  
  "LINUX": "Administración de servidores Linux profesional. Instalación, configuración, bash scripting, seguridad, redes, servicios web (Apache, Nginx), bases de datos y resolución de problemas.",
  
  "CAR AUDIO": "Car audio profesional. Instalación completa, amplificadores, subwoofers, procesadores de señal, acústica vehicular, ajustes DSP, certificación técnica y troubleshooting.",
  
  "PRESETS": "Colección de presets profesionales para Lightroom. Más de 1000 presets para retratos, paisajes, bodas, moda, producto, arquitectura y diferentes estilos fotográficos. Compatibles con todas las versiones.",
  
  "PLAYSTATION": "Reparación de consolas PlayStation (PS2, PS3, PS4, PS5). Diagnóstico de fallas, soldadura, reballing de chips, cambio de lectores ópticos, firmware y solución de errores comunes.",
  
  "CELULARES": "Reparación de celulares profesional. Diagnóstico de fallas de hardware y software, cambio de pantallas, baterías, conectores, micro soldadura, liberación y actualización de software.",
  
  "PROGRAMACIÓN": "Pack completo de programación. Incluye Python, JavaScript, Java, C++, frameworks modernos, bases de datos SQL y NoSQL, algoritmos, estructuras de datos y proyectos reales completos.",
  
  "MARKETING": "Marketing digital completo. SEO, SEM, Google Ads, Facebook Ads, Instagram, redes sociales, email marketing, copywriting, analítica web, embudos de venta y estrategias avanzadas.",
  
  "SEO": "SEO y posicionamiento web profesional. Keyword research, SEO on-page y off-page, link building, contenido SEO, Google Search Console, Analytics, herramientas profesionales y casos de éxito.",
  
  "CINEMA": "Cinema 4D completo. Modelado 3D, animación, motion graphics, materiales procedurales, iluminación avanzada, render con Octane/Redshift e integración con After Effects.",
  
  "ILLUSTRATOR": "Adobe Illustrator master. Herramientas vectoriales avanzadas, diseño de logos e identidades, ilustración vectorial, tipografía, packaging y producción gráfica profesional.",
  
  "REPOSTERIA": "Repostería y pastelería profesional. Recetas detalladas, técnicas de decoración, fondant, buttercream, cupcakes, tortas temáticas, macarons, postres finos y gestión de negocio.",
  
  "EXCEL": "Excel completo de básico a avanzado. Fórmulas y funciones, tablas dinámicas, gráficos, macros, VBA, Power Query, Power Pivot, dashboards interactivos y automatización de procesos.",
  
  "OFFICE": "Microsoft Office completo. Word avanzado, Excel profesional, PowerPoint impactante, Outlook productivo, Access bases de datos y técnicas de productividad empresarial.",
  
  "AFTER EFFECTS": "After Effects master. Motion graphics profesional, efectos visuales avanzados, composición, tracking, rotoscopia, animación de personajes, plugins esenciales y producción completa.",
  
  "VRAY": "V-Ray para arquitectura. Materiales fotorrealistas, iluminación natural y artificial, render de interiores y exteriores, optimización, postproducción y presentación de proyectos.",
  
  "SKETCHUP": "SketchUp completo para arquitectura. Modelado 3D eficiente, plugins esenciales, V-Ray/Enscape, Layout para planos, presentación de proyectos y workflows profesionales.",
  
  "REVIT": "Revit BIM completo. Modelado arquitectónico, estructural y MEP, familias paramétricas, documentación, colaboración BIM, Dynamo, renders y gestión completa de proyectos.",
  
  "AUTOCAD": "AutoCAD 2D y 3D completo. Dibujo técnico arquitectónico y mecánico, bloques dinámicos, atributos, layouts, ploteo, normas y estándares, productividad y proyectos reales.",
  
  "PIANO": "Curso completo de piano desde cero hasta nivel intermedio-avanzado. Teoría musical completa, lectura de partituras, técnica pianística, repertorio clásico, jazz, pop, acordes y acompañamiento. Más de 100 piezas musicales incluidas.",
  
  "INGLES": "Curso completo de inglés desde nivel básico hasta avanzado. Gramática, vocabulario, pronunciación, conversación, listening, reading, writing. Incluye audios nativos, ejercicios interactivos y simulacros de exámenes internacionales.",
  
  "HACKING": "Hacking ético y seguridad informática avanzada. Pentesting, análisis de vulnerabilidades, exploits, seguridad en aplicaciones web, wireless hacking, ingeniería social y metodologías profesionales.",
  
  "MEGAPACK": "🚀 MEGAPACK COMPLETO 81 EN 1 - Acceso total a TODOS los cursos de la plataforma. Más de 3000 horas de contenido en video, miles de recursos descargables, proyectos prácticos y acceso permanente a toda la biblioteca. El paquete definitivo para aprender múltiples habilidades.",
  
  "DEFAULT": "Curso completo con contenido de alta calidad. Incluye material teórico y práctico, recursos descargables, proyectos reales y acceso permanente. Aprende a tu propio ritmo con contenido estructurado y profesional."
};

async function fixDescriptions() {
  console.log("🔧 Actualizando descripciones de productos...\n");

  await ensureDbReady();
  console.log("✅ Base de datos lista\n");

  const allProducts = await db.select().from(products);
  console.log(`📊 Total de productos: ${allProducts.length}\n`);

  let updated = 0;

  for (const product of allProducts) {
    // Buscar descripción personalizada
    let newDescription = productDescriptions.DEFAULT;
    
    const upperName = product.name.toUpperCase();
    for (const [key, desc] of Object.entries(productDescriptions)) {
      if (upperName.includes(key)) {
        newDescription = desc;
        break;
      }
    }

    // Actualizar solo si es diferente
    if (product.description !== newDescription) {
      await db
        .update(products)
        .set({ description: newDescription })
        .where(eq(products.id, product.id));
      
      updated++;
      console.log(`✅ ${updated}. ${product.name}`);
    }
  }

  console.log(`\n✅ Completado! ${updated} descripciones actualizadas.`);
  process.exit(0);
}

fixDescriptions().catch((e) => {
  console.error("❌ Error:", e.message);
  process.exit(1);
});
