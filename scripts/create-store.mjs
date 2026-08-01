import { Pool } from 'pg';

const pool = new Pool({ 
  connectionString: process.env.DATABASE_URL, 
  ssl: false 
});

async function main() {
  // Verificar si ya existe
  const existing = await pool.query(`SELECT * FROM stores WHERE tenant_id = 1 AND slug = 'sofia-premium'`);
  if (existing.rows.length > 0) {
    console.log('STORE already exists:', JSON.stringify(existing.rows[0], null, 2));
    return;
  }
  
  const r = await pool.query(
    `INSERT INTO stores (tenant_id, name, slug, theme)
     VALUES (1, 'TecnoVariedades', 'sofia-premium', '{}')
     RETURNING *`
  );
  console.log('STORE created:', JSON.stringify(r.rows[0], null, 2));
  await pool.end();
}

main().catch(console.error);