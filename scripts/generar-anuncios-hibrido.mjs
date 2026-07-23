import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');

async function main() {
  const productsFile = path.join(rootDir, 'products-full.json');
  const templateFile = path.join(rootDir, 'scripts', 'templates', 'ad-template.html');
  const outDir = path.join(rootDir, 'data', 'ads_hybrid');
  
  await fs.mkdir(outDir, { recursive: true });
  const data = JSON.parse(await fs.readFile(productsFile, 'utf-8'));
  let htmlContent = await fs.readFile(templateFile, 'utf-8');

  console.log('Iniciando Sistema Híbrido (IA + HTML)...');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1080, height: 1080, deviceScaleFactor: 1 });

  // Procesar TODOS los productos
  const testData = data;
  
  console.log(`Generando ${testData.length} imágenes híbridas definitivas...`);

  for (const product of testData) {
    const nameUpper = product.name.toUpperCase();
    
    // 1. Determinar precio
    let priceText = "MEGAPACK $20.000 COP";
    if (nameUpper.includes("MEGAPACK COMPLETO") || nameUpper.includes("TODO LOS CURSOS")) {
      priceText = "MEGAPACK $60.000 COP";
    }

    // 2. Generar Fondo con la IA (Pollinations)
    console.log(`Pidiendo fondo a la IA para: ${product.name}...`);
    const aiPrompt = `Fotografía hiperrealista y detallada de una persona profesional e inspiradora trabajando y estudiando un curso de "${product.name}". La persona está frente a monitores, laptops o elementos relacionados con el tema. Estilo corporativo premium, retrato hermoso con iluminación de estudio cinemática. MUY IMPORTANTE: NO escribir letras, sin texto, sin palabras en la imagen.`;
    const seed = Math.floor(Math.random() * 100000);
    const bgUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(aiPrompt)}?width=1080&height=1080&nologo=true&seed=${seed}`;

    // 3. Inyectar en el HTML
    const pageData = {
      title: nameUpper,
      price: priceText,
      features: product.features || [],
      bgUrl: bgUrl // La plantilla usará esta imagen de fondo
    };

    const dataString = JSON.stringify(pageData);
    const injectedHtml = htmlContent.replace(
      'const data = window.__INJECTED_DATA__ || {',
      `const data = ${dataString}; //`
    );

    // Cargar la página y esperar a que todo cargue (incluyendo la imagen de fondo de la IA)
    await page.setContent(injectedHtml, { waitUntil: 'load', timeout: 60000 });

    const safeName = product.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const filePath = path.join(outDir, `${product.id}_${safeName}.png`);
    
    // Tomar fotografía
    await page.screenshot({ path: filePath, type: 'png' });
    
    console.log(`✅ Anuncio Híbrido completado: ${filePath}`);
  }

  await browser.close();
  console.log("🎉 Prueba Híbrida finalizada. Revisa la carpeta data/ads_hybrid");
}

main().catch(console.error);
