import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const { Client } = pg;

const client = new Client({
  host: '79.143.187.160',
  port: 5432,
  database: 'tecnovariedades-db',
  user: 'postgres',
  password: '6715320Dvd',
});

async function runMigration() {
  try {
    await client.connect();
    console.log('✅ Conectado a la base de datos');

    const sql = fs.readFileSync(
      path.join(__dirname, 'migrations', 'add_woocommerce_integration.sql'),
      'utf8'
    );

    console.log('📝 Ejecutando migración...');
    await client.query(sql);
    console.log('✅ Migración ejecutada exitosamente');

  } catch (error) {
    console.error('❌ Error ejecutando migración:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runMigration();
