import fs from "fs";
import path from "path";
import initSqlJs from "sql.js";

async function run() {
  console.log("Iniciando actualización de descripciones...");
  
  // 1. Cargar el JSON detallado
  const catalogPath = "C:\\Users\\ADMIN\\.gemini\\antigravity\\brain\\1028b6d2-028c-4886-9424-9e5180426d2a\\CATALOGO_DETALLADO_81_ULTIMATE.json";
  const rawData = fs.readFileSync(catalogPath, "utf-8");
  const catalog = JSON.parse(rawData);
  
  // 2. Inicializar BD
  const SQL = await initSqlJs();
  const dbPath = path.resolve("data/tecnovariedades.db");
  const buffer = fs.readFileSync(dbPath);
  const db = new SQL.Database(buffer);
  
  // 3. Obtener todos los productos de la BD
  const res = db.exec("SELECT id, name FROM products WHERE tenant_id = 1");
  if (!res.length) {
    console.log("No se encontraron productos.");
    return;
  }
  
  const products = res[0].values;
  let successCount = 0;
  
  for (const [id, name] of products) {
    // Buscar en el catálogo el que mejor coincida
    // name en la BD es ej: "CURSO LETTERING DESDE CERO"
    const nameStr = name.toUpperCase().trim();
    let match = catalog.find(c => c.nombre_carpeta.toUpperCase().includes(nameStr) || c.titulo_comercial.toUpperCase().includes(nameStr) || nameStr.includes(c.titulo_comercial.toUpperCase()));
    
    // Fallback para nombres cortos que puedan estar parcialmente
    if (!match) {
        match = catalog.find(c => {
            const parts = nameStr.split(" ").filter(p => p.length > 3);
            return parts.some(p => c.titulo_comercial.toUpperCase().includes(p));
        });
    }

    if (match) {
      const ficha = match.ficha_tecnica;
      const richDescription = `${ficha.emoji} ${ficha.descripcion}
📦 Contiene: ${ficha.secciones} secciones (${ficha.clases})
⏱️ Duración/Tamaño: ${ficha.duracion}
✨ Beneficios:
${ficha.beneficios.map(b => "- " + b).join("\n")}`;

      db.run("UPDATE products SET description = ? WHERE id = ?", [richDescription, id]);
      successCount++;
    } else {
      console.log(`No se encontró coincidencia en JSON para: ${name}`);
    }
  }
  
  // 4. Actualizar también el MEGAPACK COMPLETO
  db.run(`UPDATE products SET description = '🚀 ACCESO TOTAL VIP (81 EN 1)
Obtén acceso a la colección completa de todos nuestros cursos, plantillas y herramientas digitales con un solo pago.
📦 Contiene: +81 Megapacks Premium
⏱️ Acceso: De por vida
✨ Beneficios:
- Descarga ilimitada vía Google Drive
- Todas las categorías incluidas (Diseño, Programación, Negocios, etc.)
- Actualizaciones de por vida
- Soporte prioritario' WHERE name LIKE '%MEGAPACK COMPLETO 81 EN 1%' AND tenant_id = 1`);
  
  console.log(`Guardando cambios en la base de datos... (${successCount} descripciones actualizadas)`);
  fs.writeFileSync(dbPath, Buffer.from(db.export()));
  console.log("¡Proceso completado!");
}

run().catch(console.error);
