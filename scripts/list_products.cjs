const initSqlJs = require('sql.js');
const fs = require('fs');
initSqlJs().then(SQL => {
  const buf = fs.readFileSync('./data/tecnovariedades_nueva.db');
  const db = new SQL.Database(buf);
  const rows = db.exec("SELECT id, name, price, category, description FROM products WHERE isActive = 1");
  if (rows.length > 0) {
    const cols = rows[0].columns;
    rows[0].values.forEach(v => {
      const obj = {};
      cols.forEach((c, i) => obj[c] = v[i]);
      console.log(`${obj.id}|${obj.name}|${obj.price}|${obj.category}|${(obj.description||'').substring(0,100)}`);
    });
  }
  console.log('---ALL PRODUCTS---');
  const all = db.exec("SELECT id, name, price, category, isActive FROM products");
  if (all.length > 0) {
    const ac = all[0].columns;
    all[0].values.forEach(v => {
      const o = {};
      ac.forEach((c, i) => o[c] = v[i]);
      console.log(`${o.id}|${o.name}|${o.price}|${o.category}|${o.isActive}`);
    });
  }
});
