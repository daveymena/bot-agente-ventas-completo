import initSqlJs from 'sql.js';
import { readFileSync } from 'fs';

async function run() {
  const SQL = await initSqlJs();
  const filebuffer = readFileSync('./local.db');
  const db = new SQL.Database(filebuffer);
  
  const res = db.exec('SELECT id, name, description, imageUrl, category, isActive FROM products;');
  
  if (res.length > 0) {
    const columns = res[0].columns;
    const values = res[0].values;
    const items = values.map(val => {
      const obj = {};
      columns.forEach((col, i) => {
        obj[col] = val[i];
      });
      return obj;
    });
    console.log(JSON.stringify(items, null, 2));
  } else {
    console.log('No products found.');
  }
}

run().catch(console.error);
