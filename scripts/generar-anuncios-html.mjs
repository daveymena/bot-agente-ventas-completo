import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');

async function main() {
  const productsFile = path.join(rootDir, 'products-full.json');
  const templateFile = path.join(rootDir, 'scripts', 'templates', 'ad-template.html');
  const outDir = path.join(rootDir, 'data', 'ads_html');
  
  await fs.mkdir(outDir, { recursive: true });
  const data = JSON.parse(await fs.readFile(productsFile, 'utf-8'));
  let htmlContent = await fs.readFile(templateFile, 'utf-8');

  console.log('Iniciando Puppeteer...');
  // Opciones para Puppeteer
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  
  // Fijar tamaño exacto
  await page.setViewport({ width: 1080, height: 1080, deviceScaleFactor: 1 });

  // Vamos a procesar solo 3 para probar como acordamos
  const testData = data.slice(0, 3);
  
  console.log(`Generando ${testData.length} imágenes de prueba...`);

  for (const product of testData) {
    const nameUpper = product.name.toUpperCase();
    
    // Determinar precio
    let priceText = "MEGAPACK $20.000 COP";
    if (nameUpper.includes("MEGAPACK COMPLETO") || nameUpper.includes("TODO LOS CURSOS")) {
      priceText = "MEGAPACK $60.000 COP";
    }

    // Datos a inyectar en el HTML
    const pageData = {
      title: nameUpper,
      price: priceText,
      features: product.features || []
    };

    // Reemplazar la variable en el HTML
    const dataString = JSON.stringify(pageData);
    const injectedHtml = htmlContent.replace(
      'const data = window.__INJECTED_DATA__ || {',
      `const data = ${dataString}; //`
    );

    await page.setContent(injectedHtml, { waitUntil: 'load', timeout: 60000 });

    // Esperar a que carguen las fuentes de Google
    await page.evaluate(async () => {
      await document.fonts.ready;
    });

    const safeName = product.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const filePath = path.join(outDir, `${product.id}_${safeName}.png`);
    
    await page.screenshot({ path: filePath, type: 'png', omitBackground: true });
    
    console.log(`✅ Imagen generada: ${filePath}`);
  }

  await browser.close();
  console.log("🎉 Prueba finalizada. Revisa la carpeta data/ads_html");
}

main().catch(console.error);
