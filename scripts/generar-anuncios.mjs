import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');

async function main() {
  const productsFile = path.join(rootDir, 'products-full.json');
  const outDir = path.join(rootDir, 'data', 'ads');
  
  await fs.mkdir(outDir, { recursive: true });
  const data = JSON.parse(await fs.readFile(productsFile, 'utf-8'));
  
  console.log(`Iniciando generación para ${data.length} productos usando Pollinations.ai (API Gratuita)...`);
  
  for (const product of data) {
    const nameUpper = product.name.toUpperCase();
    
    // Filtrar el megapack de piano
    if (nameUpper.includes("PIANO")) {
      console.log(`⏭️ Saltando ${product.name} (Ya creado)`);
      continue;
    }
    
    // Definir el precio
    let priceText = "$20.000 COP";
    if (nameUpper.includes("MEGAPACK COMPLETO") || nameUpper.includes("TODO LOS CURSOS")) {
      priceText = "$60.000 COP";
    }

    // Crear el prompt con todas las instrucciones del usuario
    const prompt = `Fotografía hiperrealista publicitaria y premium. 
Escena: Una persona muy motivada y profesional interactuando con un curso o producto sobre "${product.name}". Debe aparecer la persona y también elementos del producto (pantallas, libros, cámara, diseño, etc según el contexto).
ESTRICTAMENTE ESCRIBIR ESTOS TEXTOS EN ESPAÑOL Y RESALTADOS:
- Título principal enorme, centrado y brillante: "${product.name}"
- Subtítulo en la parte inferior: "MEGAPACK ${priceText}"
El texto debe ser lo más importante de la imagen, con perfecta ortografía.`;

    console.log(`🎨 Generando: ${product.name} | Precio: ${priceText}`);
    
    try {
      const seed = Math.floor(Math.random() * 1000000);
      const encodedPrompt = encodeURIComponent(prompt);
      // Nologo = true para quitar la marca de agua de pollinations
      const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1080&height=1080&nologo=true&seed=${seed}`;
      
      const imageRes = await fetch(imageUrl);
      
      if (!imageRes.ok) {
        throw new Error(`Error HTTP: ${imageRes.status}`);
      }

      const buffer = await imageRes.arrayBuffer();
      
      const safeName = product.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
      const filePath = path.join(outDir, `${product.id}_${safeName}.png`);
      
      await fs.writeFile(filePath, Buffer.from(buffer));
      console.log(`✅ Guardado exitosamente: ${filePath}`);
    } catch (error) {
      console.error(`❌ Error al generar ${product.name}:`, error.message);
    }
    
    // Pausa pequeña
    await new Promise(r => setTimeout(r, 2000));
  }
  
  console.log("🎉 ¡Proceso finalizado! Todas las imágenes están en la carpeta data/ads");
}

main().catch(console.error);
