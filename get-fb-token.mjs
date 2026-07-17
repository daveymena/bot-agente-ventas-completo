#!/usr/bin/env node
import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENV_PATH = path.join(__dirname, '.env');
const CRED_PATH = path.join(__dirname, 'fb_credentials.json');

async function main() {
  console.log('\n══════════════ EXTRACTOR DE TOKENS DE FACEBOOK ══════════════\n');

  // 1. Connect to existing Chrome
  console.log('Conectando a Chrome (puerto 9222)...');
  const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null });
  const pages = await browser.pages();
  console.log(`Pestañas abiertas: ${pages.length}`);

  // 2. Find or create Facebook tab
  let fbPage = pages.find(p => p.url().includes('facebook.com'));
  if (!fbPage) {
    console.log('No hay pestaña de Facebook. Abriendo...');
    fbPage = await browser.newPage();
    await fbPage.goto('https://www.facebook.com', { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 3000));
  } else {
    console.log('Pestaña de Facebook encontrada');
    await fbPage.bringToFront();
    await new Promise(r => setTimeout(r, 2000));
  }

  // 3. Check login status
  const url = fbPage.url();
  const bodyText = await fbPage.evaluate(() => document.body.innerText.substring(0, 2000));
  const isLoggedIn = !url.includes('login') && !bodyText.includes('Iniciar sesión') && !bodyText.includes('Log In');
  console.log(`Sesión de Facebook: ${isLoggedIn ? '✅ ACTIVA' : '❌ NO INICIADA'}`);

  if (!isLoggedIn) {
    console.log('\n⚠️  No has iniciado sesión en Facebook.');
    console.log('   Abriendo página de login...');
    await fbPage.goto('https://www.facebook.com/login', { waitUntil: 'networkidle2', timeout: 30000 });
    console.log('   Por favor, inicia sesión manualmente en la ventana de Chrome.');
    console.log('   Esperando hasta 60 segundos...');
    
    let loggedIn = false;
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 2000));
      const currentUrl = fbPage.url();
      if (!currentUrl.includes('login') && !currentUrl.includes('checkpoint')) {
        loggedIn = true;
        console.log('   ✅ Login detectado!');
        break;
      }
      if (i % 5 === 0) console.log(`   Esperando... (${(i+1)*2}s)`);
    }
    
    if (!loggedIn) {
      console.log('❌ No se detectó login. Abortando.');
      await browser.disconnect();
      process.exit(1);
    }
  }

  // 4. Extract tokens from the page
  console.log('\nExtrayendo tokens de la página...');
  
  const fbData = await fbPage.evaluate(() => {
    const scripts = document.querySelectorAll('script');
    let token = '';
    let bmId = '';
    let adAccountId = '';
    let pageId = '';
    let pixelId = '';

    for (const script of scripts) {
      const text = script.textContent || '';
      if (!token && (text.includes('EAAC') || text.includes('EAA'))) {
        const m = text.match(/EAA[A-Za-z0-9%._-]+/);
        if (m) token = m[0];
      }
      if (!adAccountId && text.includes('act_')) {
        const m = text.match(/act_(\d+)/);
        if (m) adAccountId = m[1];
      }
      if (!pageId && (text.includes('"pageID":"') || text.includes('"page_id":"'))) {
        const m = text.match(/"page(?:ID|_id)":"(\d+)"/);
        if (m) pageId = m[1];
      }
      if (!pixelId && (text.includes('"pixelId":"') || text.includes('"pixel_id":"'))) {
        const m = text.match(/"pixel(?:Id|_id)":"(\d+)"/);
        if (m) pixelId = m[1];
      }
    }
    
    return { token, bmId, adAccountId, pageId, pixelId };
  });

  console.log('\n── Datos encontrados en la página ──');
  console.log(`  Token:       ${fbData.token ? fbData.token.substring(0, 20) + '...' + fbData.token.slice(-5) + ' (' + fbData.token.length + ' chars)' : '❌ No encontrado'}`);
  console.log(`  Page ID:     ${fbData.pageId || '❌ No encontrado'}`);
  console.log(`  Ad Account:  ${fbData.adAccountId || '❌ No encontrado'}`);
  console.log(`  Pixel ID:    ${fbData.pixelId || '❌ No encontrado'}`);
  console.log(`  BM ID:       ${fbData.bmId || '❌ No encontrado'}`);

  // 5. If no token, go to Business Manager
  if (!fbData.token) {
    console.log('\nNavegando a Business Manager para obtener más datos...');
    
    try {
      await fbPage.goto('https://business.facebook.com/overview/', { waitUntil: 'networkidle2', timeout: 30000 });
      await new Promise(r => setTimeout(r, 3000));
      
      const bmData = await fbPage.evaluate(() => {
        const text = document.body.innerText;
        const scripts = document.querySelectorAll('script');
        let token = '';
        let bm = '';
        let adAct = '';
        
        for (const s of scripts) {
          const t = s.textContent || '';
          if (!token && (t.includes('EAAC') || t.includes('EAA'))) {
            const m = t.match(/EAA[A-Za-z0-9%._-]+/);
            if (m) token = m[0];
          }
          if (!bm && t.includes('"business":{"id":"')) {
            const m = t.match(/"business":{"id":"(\d+)"/);
            if (m) bm = m[1];
          }
        }
        
        const actMatches = text.match(/act_\d+/g);
        if (actMatches) adAct = [...new Set(actMatches)][0]?.replace('act_', '');
        
        return { token, bmId: bm, adAccountId: adAct };
      });
      
      if (bmData.token) fbData.token = bmData.token;
      if (bmData.bmId) fbData.bmId = bmData.bmId;
      if (bmData.adAccountId) fbData.adAccountId = bmData.adAccountId;
      
      console.log(`  Token (BM):  ${bmData.token ? bmData.token.substring(0, 20) + '...' : '❌'}`);
      console.log(`  BM ID:       ${bmData.bmId || '❌'}`);
      console.log(`  Ad Account:  ${bmData.adAccountId || '❌'}`);
    } catch (e) {
      console.log(`  Error navegando a BM: ${e.message}`);
    }
  }

  // 6. If still no token, try Graph API Explorer
  if (!fbData.token) {
    console.log('\nIntentando obtener token desde Graph API Explorer...');
    try {
      await fbPage.goto('https://developers.facebook.com/tools/accesstoken/', { waitUntil: 'networkidle2', timeout: 30000 });
      await new Promise(r => setTimeout(r, 3000));
      
      const gToken = await fbPage.evaluate(() => {
        const text = document.body.innerText;
        const m = text.match(/EAA[A-Za-z0-9%._-]+/);
        return m ? m[0] : '';
      });
      
      if (gToken) {
        fbData.token = gToken;
        console.log('  Token encontrado en Graph API Explorer!');
      }
    } catch (e) {
      console.log(`  Error: ${e.message}`);
    }
  }

  // 7. Save credentials
  const creds = {
    accessToken: fbData.token || '',
    pageId: fbData.pageId || '',
    adAccountId: fbData.adAccountId || '',
    pixelId: fbData.pixelId || '',
    bmId: fbData.bmId || '',
    lastUpdated: new Date().toISOString(),
  };

  fs.writeFileSync(CRED_PATH, JSON.stringify(creds, null, 2));
  console.log(`\n✅ Credenciales guardadas en ${CRED_PATH}`);

  // 8. Update .env
  if (creds.accessToken || creds.pageId || creds.adAccountId) {
    let envContent = '';
    try { envContent = fs.readFileSync(ENV_PATH, 'utf8'); } catch { envContent = ''; }
    
    const updates = {};
    if (creds.accessToken) updates['FB_ACCESS_TOKEN'] = creds.accessToken;
    if (creds.pageId) updates['FB_PAGE_ID'] = creds.pageId;
    if (creds.adAccountId) updates['FB_AD_ACCOUNT_ID'] = creds.adAccountId;
    if (creds.pixelId) updates['FB_PIXEL_ID'] = creds.pixelId;
    
    for (const [key, val] of Object.entries(updates)) {
      const regex = new RegExp(`^${key}=.*$`, 'm');
      if (envContent.match(regex)) {
        envContent = envContent.replace(regex, `${key}=${val}`);
      } else {
        envContent += `\n${key}=${val}`;
      }
    }
    
    fs.writeFileSync(ENV_PATH, envContent);
    console.log('✅ .env actualizado con las credenciales de Facebook');
  }

  // 9. Summary
  const hasAll = creds.accessToken && creds.pageId && creds.adAccountId;
  console.log(`\n${'═'.repeat(50)}`);
  if (hasAll) {
    console.log('  ✅ CONFIGURACIÓN COMPLETA');
    console.log('  Ya puedes usar Facebook Ads, Messenger, Marketplace y Comments');
    console.log(`  Dashboard: http://localhost:3002`);
  } else {
    console.log('  ⚠️  FALTAN DATOS. Completa manualmente en el dashboard:');
    if (!creds.accessToken) console.log('    - Access Token: https://developers.facebook.com/tools/accesstoken/');
    if (!creds.pageId) console.log('    - Page ID: https://business.facebook.com/select/?product=pages');
    if (!creds.adAccountId) console.log('    - Ad Account: https://business.facebook.com/select/?product=ads');
  }
  console.log(`${'═'.repeat(50)}\n`);

  await browser.disconnect();
}

main().catch(e => { console.error(`\n❌ Error: ${e.message}`); process.exit(1); });
