import fs from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const initSqlJs = require('C:/dev/bot-agente/node_modules/.pnpm/sql.js@1.11.0/node_modules/sql.js');

const sqlText = fs.readFileSync('C:/dev/bot-agente/data/migrate_full.sql', 'utf8');
// Cada statement empieza con "INSERT INTO ..." al inicio de línea; partimos ahí
// para reconstruir statements multilínea (descripciones con saltos de línea).
const chunks = sqlText.split(/\r?\n(?=INSERT INTO )/i);
const inserts = chunks.filter(c => /^\s*INSERT INTO products\s/i.test(c)).map(c => c.trim());
console.log('INSERTs de productos encontrados:', inserts.length);

const SQL = await initSqlJs();
const db = new SQL.Database();
db.run(`CREATE TABLE products (id INTEGER PRIMARY KEY, tenant_id INTEGER, name TEXT, description TEXT, price REAL, currency TEXT, sku TEXT, category_id INTEGER, category TEXT, kind TEXT, image_url TEXT, highlight TEXT, features TEXT, payment_link TEXT, delivery_link TEXT, is_active INTEGER, metadata TEXT, created_at TEXT)`);

let ok = 0, fail = 0;
for (const ins of inserts) {
  try { db.run(ins.replace(/;\s*$/, '') ); ok++; } catch (e) { fail++; if (fail <= 3) console.log('  fallo:', e.message.slice(0, 80)); }
}
console.log('Insertados OK:', ok, '| fallidos:', fail);

const res = db.exec('SELECT id,name,description,price,currency,category,kind,image_url,features,delivery_link,metadata FROM products ORDER BY id');
const rows = res[0] ? res[0].values : [];
const cols = res[0] ? res[0].columns : [];
const idx = (c) => cols.indexOf(c);

const out = rows.map(r => {
  let features = [];
  try { const f = r[idx('features')]; features = f ? (typeof f === 'string' ? JSON.parse(f) : f) : []; } catch {}
  let drive_folder_id = null;
  try { const m = r[idx('metadata')]; const mo = m ? JSON.parse(m) : {}; drive_folder_id = mo.drive_folder_id || null; } catch {}
  return {
    id: r[idx('id')],
    name: r[idx('name')],
    description: r[idx('description')] || '',
    price: r[idx('price')],
    currency: r[idx('currency')] || 'COP',
    category: r[idx('category')] || 'General',
    kind: r[idx('kind')] || 'digital',
    image_url: r[idx('image_url')] || `/images/products/${r[idx('id')]}.jpg`,
    features: Array.isArray(features) ? features : [],
    deliveryLink: r[idx('delivery_link')] || '',
    drive_folder_id,
  };
});

console.log('\n=== MUESTRA (nombre | precio | moneda) ===');
for (const p of out.slice(0, 10)) console.log(' -', p.name.slice(0, 38).padEnd(40), '|', p.price, p.currency);
const prices = [...new Set(out.map(p => p.price))].sort((a, b) => a - b);
console.log('\nprecios distintos:', prices.join(', '));
console.log('total productos:', out.length);

fs.writeFileSync('C:/dev/bot-agente/products-full.json', JSON.stringify(out, null, 2));
console.log('\n✅ products-full.json regenerado con datos REALES (COP)');
