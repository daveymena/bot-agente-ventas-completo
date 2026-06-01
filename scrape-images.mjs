import fs from "fs";
import path from "path";
import axios from "axios";
import initSqlJs from "sql.js";

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function downloadImage(url, destPath) {
  try {
    const response = await axios.get(url, { responseType: 'arraybuffer', timeout: 8000 });
    fs.writeFileSync(destPath, response.data);
    return true;
  } catch (error) {
    console.error(`Error descargando imagen desde ${url}: ${error.message}`);
    return false;
  }
}

async function run() {
  console.log("Iniciando scraper de imágenes...");
  const SQL = await initSqlJs();
  const dbPath = path.resolve("data/tecnovariedades.db");
  const buffer = fs.readFileSync(dbPath);
  const db = new SQL.Database(buffer);
  
  const res = db.exec("SELECT id, name FROM products WHERE tenant_id = 1");
  if (!res.length) {
    console.log("No se encontraron productos.");
    return;
  }
  
  const products = res[0].values;
  console.log(`Encontrados ${products.length} productos.`);
  
  const outDir = path.resolve("artifacts/ventas-pro/public/images/products");
  
  let successCount = 0;
  for (const [id, name] of products) {
    console.log(`Buscando imagen para: [${id}] ${name}...`);
    
    // Si el nombre tiene "PACK" o "CURSO", buscar sin agregar cosas redundantes
    // Agregamos "portada" para que salgan portadas o carátulas.
    const query = encodeURIComponent(`"${name}" portada curso pack`);
    const url = `https://www.bing.com/images/search?q=${query}&form=HDRSC2&first=1&cw=1177&ch=759`;
    
    try {
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
        }
      });
      
      const match = response.data.match(/murl&quot;:&quot;(http.*?)&quot;/);
      if (match && match[1]) {
        let imageUrl = match[1];
        // Quitar posibles escapes HTML extra en el JSON 
        imageUrl = imageUrl.replace(/&amp;/g, '&');
        console.log(`  -> Encontrada: ${imageUrl}`);
        
        const destPath = path.join(outDir, `${id}.jpg`);
        const downloaded = await downloadImage(imageUrl, destPath);
        
        if (downloaded) {
          db.run("UPDATE products SET image_url = ? WHERE id = ?", [`/images/products/${id}.jpg`, id]);
          successCount++;
        }
      } else {
        console.log(`  -> No se encontró imagen para ${name}.`);
      }
    } catch (error) {
      console.error(`  -> Error buscando en Bing: ${error.message}`);
    }
    
    // Esperar un poco para no saturar Bing
    await delay(1000);
  }
  
  console.log(`Guardando cambios en la base de datos... (${successCount} actualizadas)`);
  fs.writeFileSync(dbPath, Buffer.from(db.export()));
  console.log("¡Proceso completado!");
}

run().catch(console.error);
