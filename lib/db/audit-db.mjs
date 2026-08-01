import initSqlJs from 'sql.js';
import { readFileSync } from 'fs';
async function run() {
  const SQL = await initSqlJs();
  const db = new SQL.Database(readFileSync('../../data/tecnovariedades.db'));
  console.log('=== AGENTS ===');
  const agents = db.exec('SELECT * FROM agents LIMIT 3;');
  if (agents.length > 0) {
    console.log('Columns:', agents[0].columns.join(', '));
    agents[0].values.forEach(v => console.log(JSON.stringify(v)));
  }
  console.log('\n=== SETTINGS ===');
  const settings = db.exec('SELECT * FROM settings LIMIT 1;');
  if (settings.length > 0) {
    console.log('Columns:', settings[0].columns.join(', '));
    settings[0].values.forEach(v => console.log(JSON.stringify(v)));
  }
  console.log('\n=== PRODUCT COUNTS BY CATEGORY ===');
  const cats = db.exec('SELECT count(*) as total, category FROM products WHERE is_active = 1 GROUP BY category ORDER BY total DESC;');
  if (cats.length > 0) cats[0].values.forEach(v => console.log(v[0], '-', v[1]));
  console.log('\n=== RECENT CONVERSATIONS ===');
  const convos = db.exec('SELECT id, lead_id, agent_id, current_stage, created_at FROM conversations ORDER BY created_at DESC LIMIT 5;');
  if (convos.length > 0) convos[0].values.forEach(v => console.log(JSON.stringify(v)));
  console.log('\n=== RECENT LEADS ===');
  const leads = db.exec('SELECT id, name, phone, source, created_at FROM leads ORDER BY created_at DESC LIMIT 5;');
  if (leads.length > 0) leads[0].values.forEach(v => console.log(JSON.stringify(v)));
}
run();
