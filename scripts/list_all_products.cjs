const initSqlJs = require('sql.js');
const fs = require('fs');
initSqlJs().then(SQL => {
  const buf = fs.readFileSync('./data/tecnovariedades_nueva.db');
  const db = new SQL.Database(buf);
  const rows = db.exec("SELECT id, name, price, category, description FROM products WHERE is_active = 1 ORDER BY category, name");
  if (rows.length > 0) {
    const cols = rows[0].columns;
    rows[0].values.forEach(v => {
      const o = {};
      cols.forEach((c,i) => o[c]=v[i]);
      console.log(`ID=${o.id} | ${o.name} | $${o.price} | [${o.category}] | ${(o.description||'').substring(0,60)}`);
    });
  }
  console.log("\n--- PRODUCT CATEGORIES ---");
  const cats = db.exec("SELECT id, name FROM product_categories ORDER BY id");
  if (cats.length>0) cats[0].values.forEach(v => console.log(`Cat ${v[0]}: ${v[1]}`));
});
