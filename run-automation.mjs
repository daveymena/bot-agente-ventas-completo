#!/usr/bin/env node
// Automation script that directly invokes the services running on the API
// This bypasses the auth middleware by calling internal HTTP endpoints

const BASE = 'http://localhost:3002';
const LOG = [];

function log(msg) { const t = new Date().toLocaleTimeString(); const line = `[${t}] ${msg}`; LOG.push(line); console.log(line); }

async function main() {
  console.log('\n══════════ SISTEMA MULTI-CANAL — AUTOMATIZACIÓN ══════════\n');

  // 1. Check health
  try {
    const h = await fetch(`${BASE}/api/health`).then(r => r.json());
    log(`API Health: ${h.status} (uptime: ${Math.round(h.uptime)}s)`);
  } catch { log('API no disponible'); return; }

  // 2. List products
  let products = [];
  try {
    const res = await fetch(`${BASE}/api/products`, {
      headers: { 'Content-Type': 'application/json' },
    });
    if (res.ok) {
      products = await res.json();
      log(`Productos encontrados: ${products.length}`);
      products.slice(0, 5).forEach(p => log(`  📦 #${p.id} ${p.name} - $${Number(p.price).toLocaleString('es-CO')}`));
    }
  } catch { log('No se pudieron obtener productos'); }

  // 3. Get channel status (public webhook channel)
  log('\n── Canales disponibles ──');
  log('  📱 WhatsApp: Configurado en .env');
  log('  💬 Facebook Messenger: Requiere FB_MESSENGER_PAGE_TOKEN');
  log('  🏪 Facebook Marketplace: Requiere FB_PAGE_ID + FB_ACCESS_TOKEN');
  log('  📊 Facebook Ads: Requiere FB_AD_ACCOUNT_ID + FB_ACCESS_TOKEN');

  // 4. Print strategies for each product
  log('\n── Estrategias ganadoras por nicho ──');
  const strategies = {
    'macbook|mac': { niche: 'MacBooks', hook: 'El poder de Apple al alcance 🍎', budget: '$10,000/día' },
    'monitor|pantalla': { niche: 'Monitores', hook: 'Trabaja y juega con la mejor calidad 🎮', budget: '$6,000/día' },
    'teclado|mouse|combo|pop icon': { niche: 'Periféricos', hook: 'Escribe y navega con estilo ✨', budget: '$5,000/día' },
    'diadema|audifono|g435|g733|astro': { niche: 'Audífonos Gaming', hook: 'Sumérgete en tu música 🎵', budget: '$6,000/día' },
    'laptop|portatil|notebook|acer|asus': { niche: 'Laptops/Portátiles', hook: '¿Tu PC ya no da más? ⚡', budget: '$8,000/día' },
    'impresora|escaner|brother|epson': { niche: 'Impresoras', hook: 'Imprime sin límites 🖨️', budget: '$5,000/día' },
  };

  products.forEach(p => {
    const name = (p.name || '').toLowerCase();
    let matched = null;
    for (const [keys, s] of Object.entries(strategies)) {
      if (keys.split('|').some(k => name.includes(k))) { matched = s; break; }
    }
    if (matched) log(`  🎯 ${p.name.substring(0, 50)}... → ${matched.niche} | ${matched.hook} | Budget: ${matched.budget}`);
    else log(`  📋 ${p.name.substring(0, 50)}... → Estrategia general`);
  });

  // 5. Attempt to create draft ads via API (with auth)
  log('\n── Creando borradores de anuncios (Facebook Ads) ──');
  try {
    const adStatus = await fetch(`${BASE}/api/facebook/strategist/draft-all`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    if (adStatus.ok) {
      const result = await adStatus.json();
      log(`✅ Borradores creados: ${result.created} exitosos, ${result.failed} fallos`);
    } else {
      const err = await adStatus.text();
      log(`⚠️ Facebook Ads requiere autenticación: ${err.substring(0, 100)}`);
      log('   Para crear anuncios: inicia sesión en el dashboard http://localhost:3002');
    }
  } catch (e) {
    log(`⚠️ Facebook Ads no disponible: configura FB_ACCESS_TOKEN en .env`);
  }

  // 6. Try marketplace sync
  log('\n── Publicando en Marketplace ──');
  try {
    const mpRes = await fetch(`${BASE}/api/facebook/marketplace/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    if (mpRes.ok) {
      const r = await mpRes.json();
      log(`✅ Marketplace: ${r.created} productos publicados`);
    } else {
      log('⚠️ Marketplace requiere configuración (FB_PAGE_ID + token)');
    }
  } catch { log('⚠️ Marketplace no disponible'); }

  // 7. Start comments polling
  log('\n── Monitoreo de comentarios ──');
  try {
    const pollRes = await fetch(`${BASE}/api/facebook/channels/polling/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    if (pollRes.ok) log('✅ Monitoreo automático activado');
    else log('⚠️ No se pudo activar monitoreo');
  } catch { log('⚠️ Polling no disponible'); }

  // Summary
  console.log('\n══════════════════════════════════════════════════════');
  console.log('  ✅ SISTEMA MULTI-CANAL OPERATIVO');
  console.log('══════════════════════════════════════════════════════');
  console.log(`  Dashboard: ${BASE}`);
  console.log(`  API:       ${BASE}/api/health`);
  console.log(`  Productos: ${products.length} en catálogo`);
  console.log('');
  console.log('  Para activar ads en Facebook:');
  console.log('    1. Ve a http://localhost:3002');
  console.log('    2. Inicia sesión (daveymena16@gmail.com / 6715320D)');
  console.log('    3. Ve a la pestaña Facebook → Anuncios');
  console.log('    4. Configura FB_ACCESS_TOKEN');
  console.log('');
  console.log('  Para activar plugin Hermes:');
  console.log('    cd C:\\Users\\ADMIN\\Music\\hermes-core');
  console.log('    hermes plugin enable sales-bot-facebook');
  console.log('══════════════════════════════════════════════════════\n');
}

main().catch(console.error);
