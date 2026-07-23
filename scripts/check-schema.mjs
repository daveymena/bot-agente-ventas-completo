import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: false });

async function main() {
  const tables = ['activity_events', 'leads', 'conversations', 'messages', 'product_categories'];
  for (const t of tables) {
    const r = await pool.query({
      text: 'SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position',
      values: [t]
    });
    console.log('=== ' + t + ' ===');
    r.rows.forEach(c => console.log('  ' + c.column_name + ' (' + c.data_type + ', nullable=' + c.is_nullable + ')'));
  }
  await pool.end();
}

main().catch(console.error);
