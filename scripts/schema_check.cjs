const initSqlJs = require('sql.js');
const fs = require('fs');
initSqlJs().then(SQL => {
  const buf = fs.readFileSync('./data/tecnovariedades_nueva.db');
  const db = new SQL.Database(buf);
  console.log("--- TABLES ---");
  const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
  tables[0].values.forEach(v => console.log(v[0]));
  console.log("\n--- PRODUCTS SCHEMA ---");
  const schema = db.exec("SELECT sql FROM sqlite_master WHERE name='products'");
  if (schema.length > 0) console.log(schema[0].values[0][0]);
  console.log("\n--- FIRST 5 PRODUCTS ---");
  const rows = db.exec("SELECT * FROM products LIMIT 5");
  if (rows.length > 0) {
    rows[0].values.forEach(v => {
      const o = {};
      rows[0].columns.forEach((c,i) => o[c]=v[i]);
      console.log(JSON.stringify(o));
    });
  }
});
