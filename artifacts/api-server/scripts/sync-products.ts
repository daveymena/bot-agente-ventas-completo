import { ensureDbReady, products } from "@workspace/db";
import { eq } from "drizzle-orm";
import { runWebSearch } from "../src/lib/app-operator.js";
import { saveProductImage } from "../src/lib/image-store.js";
import { logger } from "../src/lib/logger.js";
// Fetch is global in Node 22

// Función copiada de app-operator para raspar imágenes
async function scrapeImages(url) {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return [];
    const html = await res.text();
    const base = new URL(url);
    const abs = (u) => {
      try { return new URL(u.trim().replace(/&amp;/g, "&"), base).href; } catch { return null; }
    };
    const util = (u) => !/\.svg($|\?)/i.test(u) && !/(sprite|icon|favicon|logo|pixel|avatar|badge|1x1|blank)/i.test(u);
    let urls = [];
    const og = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)?.[1];
    if (og && util(og)) { const a = abs(og); if (a) urls.push(a); }
    for (const m of html.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)) {
      const u = m[1];
      if (util(u)) { const a = abs(u); if (a) urls.push(a); }
    }
    return [...new Set(urls)].slice(0, 10);
  } catch {
    return [];
  }
}

async function run() {
  const { db } = await ensureDbReady();
  const allProducts = await db.select().from(products);
  
  console.log(`Found ${allProducts.length} products. Starting cleanup...`);

  let updated = 0;
  for (const product of allProducts) {
    const isBrokenImage = !product.imageUrl || product.imageUrl.includes('/images/products/');
    const needsInfoCleanup = product.description && (product.description.includes('suspendido') || product.description.includes('rotad') || product.description.includes('informacionnoncorecra'));
    
    if (!isBrokenImage && !needsInfoCleanup) {
      continue; 
    }
    
    console.log(`\nFixing product [${product.id}] ${product.name}...`);
    
    let patch = {};

    // 1. Clean description
    if (needsInfoCleanup) {
      patch.description = `${product.name} - Contenido digital completo, descargable y con acceso de por vida. Aprende a tu propio ritmo.`;
      console.log(`  - Cleaned description`);
    }

    // 2. Fetch new image
    if (isBrokenImage) {
      console.log(`  - Searching web for: ${product.name} curso online portada...`);
      const searchRes = await runWebSearch(`${product.name} curso online portada`, 3);
      let foundImage = null;

      for (const result of searchRes.results) {
        console.log(`    - Scraping ${result.url}...`);
        const imgs = await scrapeImages(result.url);
        if (imgs.length > 0) {
          foundImage = imgs[0];
          break;
        }
      }

      if (foundImage) {
        console.log(`  - Found image: ${foundImage}. Downloading...`);
        const savedUrl = await saveProductImage(foundImage, product.id);
        if (savedUrl) {
          patch.imageUrl = savedUrl;
          console.log(`  - Image saved locally at ${savedUrl}`);
        } else {
          console.log(`  - Failed to download image.`);
        }
      } else {
        console.log(`  - No suitable image found on the web.`);
      }
    }

    if (Object.keys(patch).length > 0) {
      await db.update(products).set(patch).where(eq(products.id, product.id));
      console.log(`  -> Product ${product.id} updated in database.`);
      updated++;
    }
  }

  console.log(`\nCleanup complete! Updated ${updated} products.`);
  process.exit(0);
}

run();
