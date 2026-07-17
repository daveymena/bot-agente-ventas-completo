const initSqlJs = require('sql.js');
const fs = require('fs');
initSqlJs().then(SQL => {
  const buf = fs.readFileSync('./data/tecnovariedades_nueva.db');
  const db = new SQL.Database(buf);
  const schema = db.exec("SELECT sql FROM sqlite_master WHERE name='tenants'");
  if (schema.length > 0) console.log(schema[0].values[0][0]);
  const pr = db.exec("SELECT id, name, facebook FROM tenants LIMIT 3");
  if (pr.length > 0) pr[0].values.forEach(v => console.log(JSON.stringify(v)));
});
