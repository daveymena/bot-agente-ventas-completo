const path = require('path');

// sql.js is in pnpm store - find it
const sqlJsPath = path.resolve('./node_modules/sql.js');
console.log('sql.js path:', sqlJsPath);

const initSqlJs = require(sqlJsPath);
const fs = require('fs');

(async () => {
  const dbPath = './data/tecnovariedades.db';
  const SQL = await initSqlJs();
  const buffer = fs.readFileSync(dbPath);
  const db = new SQL.Database(buffer);
  
  const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
  const tableNames = tables[0].values.map(r => r[0]);
  console.log('Tablas:', tableNames.join(', '));
  
  const output = [];
  let totalRows = 0;
  
  for (const name of tableNames) {
    const colInfo = db.exec(`PRAGMA table_info(${name})`);
    const colNames = colInfo[0].values.map(c => c[1]);
    const rows = db.exec(`SELECT * FROM ${name}`);
    if (!rows.length) continue;
    
    const data = rows[0].values;
    totalRows += data.length;
    
    for (const row of data) {
      const keys = [];
      const vals = [];
      for (let i = 0; i < colNames.length; i++) {
        let val = row[i];
        keys.push(colNames[i]);
        if (val === null || val === undefined) vals.push('NULL');
        else if (typeof val === 'number') vals.push(val.toString());
        else vals.push(`'${val.toString().replace(/'/g, "''")}'`);
      }
      output.push(`INSERT INTO ${name} (${keys.join(', ')}) VALUES (${vals.join(', ')});`);
    }
  }
  
  const sqlPath = './data/migrate_data.sql';
  fs.writeFileSync(sqlPath, output.join('\n') + '\n', 'utf8');
  console.log(`✅ Exportado: ${sqlPath} (${output.length} INSERTs, ${totalRows} filas)`);
  
  db.close();
})();
