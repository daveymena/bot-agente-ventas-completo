#!/usr/bin/env node

/**
 * Script para ejecutar en el servidor del bot
 * Re-descarga imágenes de productos físicos desde Dropi/WooCommerce
 * 
 * Uso: node fix-images-server.mjs
 */

import { db, products } from "@workspace/db";
import { eq } from "drizzle-orm";
import { saveProductImage } from "./lib/image-store.js";
import { dropiGetProduct, dropiProductImages } from "./lib/dropi.js";
import { existsSync } from "node:fs";
import path from "node:path";

const IMAGES_DIR = process.env.IMAGE_STORE_DIR || "data/images";

async function fixPhysicalImages() {
  console.log("🔧 Fixing physical product images...\n");

  // Get all physical products
  const allProducts = await db.select().from(products);
  const physical = allProducts.filter(p => p.kind === "physical");
  
  console.log(`Found ${physical.length} physical products\n`);

  let fixed = 0;
  let skipped = 0;
  let failed = 0;

  for (const product of physical) {
    // Check if image already exists on disk
    const imgPath = path.join(IMAGES_DIR, "products", `${product.id}.jpg`);
    if (existsSync(imgPath)) {
      skipped++;
      continue;
    }

    // Try to get original URL from metadata
    let originalUrl = null;
    try {
      const meta = JSON.parse(product.metadata || "{}");
      if (meta.imageUrls && Array.isArray(meta.imageUrls) && meta.imageUrls.length > 0) {
        originalUrl = meta.imageUrls[0];
      } else if (meta.source === "dropi" && meta.dropiProductId) {
        const dropiResult = await dropiGetProduct(meta.dropiProductId);
        if (dropiResult.ok && dropiResult.data) {
          const urls = dropiProductImages(dropiResult.data);
          if (urls.length > 0) originalUrl = urls[0];
        }
      }
    } catch (e) {
      // Invalid metadata, skip
    }

    if (!originalUrl) {
      failed++;
      console.log(`❌ ID ${product.id}: no URL found`);
      continue;
    }

    // Download and save
    const saved = await saveProductImage(originalUrl, product.id);
    if (saved) {
      await db.update(products).set({ imageUrl: saved }).where(eq(products.id, product.id));
      fixed++;
      console.log(`✅ ID ${product.id}: image restored`);
    } else {
      failed++;
      console.log(`❌ ID ${product.id}: download failed`);
    }
  }

  console.log(`\n📊 Results:`);
  console.log(`  Fixed: ${fixed}`);
  console.log(`  Skipped (already ok): ${skipped}`);
  console.log(`  Failed: ${failed}`);
}

fixPhysicalImages().catch(console.error);
