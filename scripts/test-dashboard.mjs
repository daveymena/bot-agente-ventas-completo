import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: false });

async function main() {
  // Simulate the dashboard/summary endpoint logic
  const leadsRes = await pool.query('SELECT * FROM leads');
  const allLeads = leadsRes.rows;
  console.log('totalLeads:', allLeads.length);

  const wonLeads = allLeads.filter(l => l.stage === 'won');
  const wonDeals = wonLeads.length;
  console.log('wonDeals:', wonDeals);

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);
  const revenueThisMonth = wonLeads
    .filter(l => new Date(l.created_at) >= startOfMonth)
    .reduce((acc, l) => acc + Number(l.value), 0);
  console.log('revenueThisMonth:', revenueThisMonth, typeof revenueThisMonth);

  const totalLeads = allLeads.length;
  const conversionRate = totalLeads === 0 ? 0 : Math.round((wonDeals / totalLeads) * 100);
  console.log('conversionRate:', conversionRate);

  const convRes = await pool.query('SELECT * FROM conversations');
  console.log('activeConversations:', convRes.rows.filter(c => c.status !== 'closed').length);

  // Test SQL count query
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const todayMsgs = await pool.query({
    text: 'SELECT count(*) FROM messages WHERE created_at >= $1',
    values: [startOfDay.toISOString()]
  });
  console.log('todayMsgs count:', todayMsgs.rows[0].count, typeof todayMsgs.rows[0].count);

  // Test messages-timeline query  
  const days = 14;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));
  try {
    const timeline = await pool.query({
      text: `SELECT to_char(created_at, 'YYYY-MM-DD') as day, role, count(*) as count 
             FROM messages 
             WHERE created_at >= $1 
             GROUP BY to_char(created_at, 'YYYY-MM-DD'), role 
             ORDER BY day`,
      values: [start.toISOString()]
    });
    console.log('Timeline rows:', timeline.rows.length);
    timeline.rows.forEach(r => console.log('  ', r.day, r.role, r.count));
  } catch (e) {
    console.error('Timeline error:', e.message);
  }

  await pool.end();
}

main().catch(console.error);
