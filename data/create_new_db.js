const path = require('path');
const projectRoot = path.resolve(__dirname, '..');
const initSqlJs = require(path.join(projectRoot, 'node_modules/sql.js'));
const fs = require('fs');

(async () => {
  const srcPath = path.join(projectRoot, 'data', 'tecnovariedades.db');

  const SQL = await initSqlJs();
  const buffer = fs.readFileSync(srcPath);

  const srcDb = new SQL.Database(buffer);
  const schema = srcDb.exec("SELECT sql FROM sqlite_master WHERE type='table' AND sql IS NOT NULL AND name NOT LIKE 'sqlite_%'");
  const srcDb2 = new SQL.Database(buffer);
  const tables = srcDb2.exec("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
  const tableNames = tables[0].values.map(r => r[0]);

  const output = [];

  for (const row of schema[0].values) {
    output.push(row[0] + ';');
  }
  output.push('');

  for (const name of tableNames) {
    const colInfo = srcDb.exec(`PRAGMA table_info(${name})`);
    const colNames = colInfo[0].values.map(c => c[1]);
    const rows = srcDb.exec(`SELECT * FROM ${name}`);
    if (!rows.length) continue;

    for (const row of rows[0].values) {
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

  const sqlPath = path.join(projectRoot, 'data', 'migrate_full.sql');
  fs.writeFileSync(sqlPath, output.join('\n') + '\n', 'utf8');
  console.log(`SQL exportado: ${sqlPath} (${output.length} lineas)`);

  srcDb.close();
  srcDb2.close();

  console.log('Creando nueva base de datos...');
  const newDb = new SQL.Database();

  for (const stmt of output) {
    if (stmt.trim()) {
      try {
        newDb.run(stmt);
      } catch(e) {
        if (!stmt.startsWith('INSERT')) {
          console.error(`Error en: ${stmt.substring(0, 60)}: ${e.message}`);
        }
      }
    }
  }

  const newPath = path.join(projectRoot, 'data', 'tecnovariedades_nueva.db');
  const newData = newDb.export();
  fs.writeFileSync(newPath, Buffer.from(newData));

  const verifyDb = new SQL.Database(fs.readFileSync(newPath));
  const verifyTables = verifyDb.exec("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
  console.log('\nNueva DB creada con tablas:');
  let total = 0;
  for (const row of verifyTables[0].values) {
    const count = verifyDb.exec(`SELECT COUNT(*) FROM ${row[0]}`)[0].values[0][0];
    console.log(`  ${row[0]}: ${count}`);
    total += count;
  }
  console.log(`\nTotal registros: ${total}`);

  verifyDb.close();
  newDb.close();
})();
