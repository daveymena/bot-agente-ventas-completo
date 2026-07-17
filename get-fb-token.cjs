const puppeteer = require('C:\\Users\\ADMIN\\Music\\Hello-World\\web-operator\\node_modules\\puppeteer');
const fs = require('fs');
const path = require('path');

const ENV_PATH = path.join(__dirname, '.env');
const CRED_PATH = path.join(__dirname, 'fb_credentials.json');

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  console.log('\n══════════════ EXTRACTOR DE TOKENS DE FACEBOOK ══════════════\n');

  console.log('Conectando a Chrome (puerto 9222)...');
  const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null });
  const pages = await browser.pages();
  console.log('Pestañas abiertas: ' + pages.length);

  let fbPage = pages.find(p => p.url().includes('facebook.com'));
  if (!fbPage) {
    console.log('No hay pestaña de Facebook. Abriendo...');
    fbPage = await browser.newPage();
    await fbPage.goto('https://www.facebook.com', { waitUntil: 'networkidle2', timeout: 30000 });
    await sleep(3000);
  } else {
    console.log('Pestaña de Facebook encontrada');
    await fbPage.bringToFront();
    await sleep(2000);
  }

  const url = fbPage.url();
  const bodyText = await fbPage.evaluate(() => document.body.innerText.substring(0, 2000));
  const isLoggedIn = !url.includes('login') && !bodyText.includes('Iniciar sesi') && !bodyText.includes('Log In');
  console.log('Sesi\u00f3n de Facebook: ' + (isLoggedIn ? '✅ ACTIVA' : '❌ NO INICIADA'));

  if (!isLoggedIn) {
    console.log('\n⚠️  No has iniciado sesi\u00f3n en Facebook.');
    console.log('   Abriendo p\u00e1gina de login...');
    await fbPage.goto('https://www.facebook.com/login', { waitUntil: 'networkidle2', timeout: 30000 });
    console.log('   Por favor, inicia sesi\u00f3n manualmente en la ventana de Chrome.');
    console.log('   Esperando hasta 60 segundos...');

    let loggedIn = false;
    for (let i = 0; i < 30; i++) {
      await sleep(2000);
      const cu = fbPage.url();
      if (!cu.includes('login') && !cu.includes('checkpoint')) { loggedIn = true; console.log('   ✅ Login detectado!'); break; }
      if (i % 5 === 0) console.log('   Esperando... (' + ((i+1)*2) + 's)');
    }
    if (!loggedIn) { console.log('❌ No se detect\u00f3 login.'); await browser.disconnect(); process.exit(1); }
  }

  console.log('\nExtrayendo tokens de la p\u00e1gina...');

  let fbData = await fbPage.evaluate(() => {
    const scripts = document.querySelectorAll('script');
    let token = '', bmId = '', adAccountId = '', pageId = '', pixelId = '';
    for (const s of scripts) {
      const t = s.textContent || '';
      if (!token && (t.includes('EAAC') || t.includes('EAA'))) { const m = t.match(/EAA[A-Za-z0-9%._-]+/); if (m) token = m[0]; }
      if (!adAccountId && t.includes('act_')) { const m = t.match(/act_(\d+)/); if (m) adAccountId = m[1]; }
      if (!pageId && (t.includes('"pageID":"') || t.includes('"page_id":"'))) { const m = t.match(/"page(?:ID|_id)":"(\d+)"/); if (m) pageId = m[1]; }
      if (!pixelId && (t.includes('"pixelId":"') || t.includes('"pixel_id":"'))) { const m = t.match(/"pixel(?:Id|_id)":"(\d+)"/); if (m) pixelId = m[1]; }
    }
    return { token, bmId, adAccountId, pageId, pixelId };
  });

  console.log('\n── Datos encontrados en la p\u00e1gina ──');
  console.log('  Token:       ' + (fbData.token ? fbData.token.substring(0,20) + '...' + fbData.token.slice(-5) + ' (' + fbData.token.length + ' chars)' : '❌ No encontrado'));
  console.log('  Page ID:     ' + (fbData.pageId || '❌ No encontrado'));
  console.log('  Ad Account:  ' + (fbData.adAccountId || '❌ No encontrado'));

  if (!fbData.token) {
    console.log('\nNavegando a Business Manager...');
    try {
      await fbPage.goto('https://business.facebook.com/overview/', { waitUntil: 'networkidle2', timeout: 30000 });
      await sleep(3000);
      const bmData = await fbPage.evaluate(() => {
        const scripts = document.querySelectorAll('script'); let t='', b='', a='';
        for (const s of scripts) {
          const c = s.textContent || '';
          if (!t && (c.includes('EAAC') || c.includes('EAA'))) { const m = c.match(/EAA[A-Za-z0-9%._-]+/); if(m) t=m[0]; }
          if (!b && c.includes('"business":{"id":"')) { const m = c.match(/"business":{"id":"(\d+)"/); if(m) b=m[1]; }
        }
        const am = document.body.innerText.match(/act_\d+/g);
        if(am) a = [...new Set(am)][0]?.replace('act_','');
        return {token:t, bmId:b, adAccountId:a};
      });
      if (bmData.token) fbData.token = bmData.token;
      if (bmData.bmId) fbData.bmId = bmData.bmId;
      if (bmData.adAccountId) fbData.adAccountId = bmData.adAccountId;
      console.log('  Token (BM):  ' + (bmData.token ? bmData.token.substring(0,20) + '...' : '❌'));
    } catch(e) { console.log('  Error: ' + e.message); }
  }

  if (!fbData.token) {
    console.log('\nIntentando Graph API Explorer...');
    try {
      await fbPage.goto('https://developers.facebook.com/tools/accesstoken/', { waitUntil: 'networkidle2', timeout: 30000 });
      await sleep(3000);
      const gt = await fbPage.evaluate(() => { const m = document.body.innerText.match(/EAA[A-Za-z0-9%._-]+/); return m ? m[0] : ''; });
      if (gt) fbData.token = gt;
    } catch(e) { console.log('  Error: ' + e.message); }
  }

  const creds = {
    accessToken: fbData.token || '',
    pageId: (fbData.pageId || '').replace(/[^0-9]/g,''),
    adAccountId: (fbData.adAccountId || '').replace(/[^0-9]/g,''),
    pixelId: fbData.pixelId || '',
    bmId: fbData.bmId || '',
    lastUpdated: new Date().toISOString(),
  };

  fs.writeFileSync(CRED_PATH, JSON.stringify(creds, null, 2));
  console.log('\n✅ Credenciales guardadas en ' + CRED_PATH);

  if (creds.accessToken || creds.pageId || creds.adAccountId) {
    let envContent = '';
    try { envContent = fs.readFileSync(ENV_PATH, 'utf8'); } catch { envContent = ''; }
    const updates = {};
    if (creds.accessToken) updates['FB_ACCESS_TOKEN'] = creds.accessToken;
    if (creds.pageId) updates['FB_PAGE_ID'] = creds.pageId;
    if (creds.adAccountId) updates['FB_AD_ACCOUNT_ID'] = creds.adAccountId;
    if (creds.pixelId) updates['FB_PIXEL_ID'] = creds.pixelId;
    for (const [k, v] of Object.entries(updates)) {
      const re = new RegExp(`^${k}=.*$`, 'm');
      if (envContent.match(re)) { envContent = envContent.replace(re, `${k}=${v}`); }
      else { envContent += `\n${k}=${v}`; }
    }
    fs.writeFileSync(ENV_PATH, envContent);
    console.log('✅ .env actualizado con credenciales de Facebook');
  }

  const hasAll = creds.accessToken && creds.pageId && creds.adAccountId;
  console.log('\n' + '='.repeat(50));
  if (hasAll) {
    console.log('  ✅ CONFIGURACI\u00d3N COMPLETA DE FACEBOOK');
    console.log('  Token:    ' + creds.accessToken.substring(0,15) + '...');
    console.log('  Page ID:  ' + creds.pageId);
    console.log('  Ad Acct:  ' + creds.adAccountId);
  } else {
    console.log('  ⚠️  FALTAN DATOS:');
    if (!creds.accessToken) console.log('    - Access Token: https://developers.facebook.com/tools/accesstoken/');
    if (!creds.pageId) console.log('    - Page ID: https://business.facebook.com/select/?product=pages');
    if (!creds.adAccountId) console.log('    - Ad Account: https://business.facebook.com/select/?product=ads');
  }
  console.log('='.repeat(50) + '\n');

  await browser.disconnect();
}

main().catch(e => { console.error('\n❌ Error: ' + e.message); process.exit(1); });
