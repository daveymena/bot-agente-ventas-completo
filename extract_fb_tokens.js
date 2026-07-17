const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
puppeteer.use(StealthPlugin());

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  console.log('Conectando a Chrome...');
  const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null });
  const pages = await browser.pages();
  let page = pages[0];

  console.log('Navegando a Facebook...');
  await page.goto('https://www.facebook.com', { waitUntil: 'networkidle2', timeout: 30000 });
  await delay(3000);

  const url = page.url();
  console.log('URL:', url);

  const bodyText = await page.evaluate(() => document.body.innerText.substring(0, 1000));
  const isLoggedIn = !url.includes('login') && !bodyText.includes('Iniciar sesión');
  console.log('Sesión iniciada:', isLoggedIn);

  if (!isLoggedIn) {
    console.log('Por favor, inicia sesión manualmente en Facebook. Esperando...');
    for (let i = 0; i < 60; i++) {
      await delay(2000);
      const currentUrl = page.url();
      if (!currentUrl.includes('login') && !currentUrl.includes('checkpoint')) {
        console.log('Login detectado!');
        break;
      }
      if (i % 5 === 0) console.log(`Esperando login... (${i*2}s)`);
    }
  }

  // Go to Business Settings
  console.log('\n=== NAVEGANDO A BUSINESS SETTINGS ===');
  await page.goto('https://business.facebook.com/settings/', { waitUntil: 'networkidle2', timeout: 30000 });
  await delay(3000);
  console.log('URL Business Settings:', page.url());

  // Try to get Business Manager info
  const businessInfo = await page.evaluate(() => {
    const text = document.body.innerText;
    const bmMatch = text.match(/Business Manager.*?\n/);
    return {
      businessManager: bmMatch ? bmMatch[0] : 'No encontrado',
      pageTitle: document.title
    };
  });
  console.log('Business Info:', JSON.stringify(businessInfo, null, 2));

  // Go to Business Manager - get access token from Page
  console.log('\n=== OBTENIENDO TOKEN DE PÁGINA ===');
  await page.goto('https://business.facebook.com/overview/', { waitUntil: 'networkidle2', timeout: 30000 });
  await delay(3000);

  // Try to extract token from the page
  const fbData = await page.evaluate(() => {
    const scripts = document.querySelectorAll('script');
    let token = '';
    let bmId = '';
    let adAccountId = '';
    let pageId = '';
    let pixelId = '';

    for (const script of scripts) {
      const text = script.textContent || '';
      if (text.includes('EAAC') || text.includes('EAA')) {
        const tokenMatch = text.match(/EAA[A-Za-z0-9%._-]+/);
        if (tokenMatch) token = tokenMatch[0];
      }
      if (text.includes('act_')) {
        const adMatch = text.match(/act_\d+/);
        if (adMatch) adAccountId = adMatch[0].replace('act_', '');
      }
      if (text.includes('"pageID":"') || text.includes('"page_id":"')) {
        const pageMatch = text.match(/"page(?:ID|_id)":"(\d+)"/);
        if (pageMatch) pageId = pageMatch[1];
      }
      if (text.includes('"pixelId":"') || text.includes('"pixel_id":"')) {
        const pixelMatch = text.match(/"pixel(?:Id|_id)":"(\d+)"/);
        if (pixelMatch) pixelId = pixelMatch[1];
      }
    }

    return { token, bmId, adAccountId, pageId, pixelId };
  });

  console.log('\n=== DATOS DE FACEBOOK ENCONTRADOS ===');
  console.log(JSON.stringify(fbData, null, 2));

  // If we didn't get a token, go to Graph API Explorer or token page
  if (!fbData.token) {
    console.log('\n=== GENERANDO TOKEN DESDE GRAPH API ===');
    await page.goto('https://developers.facebook.com/tools/accesstoken/', { waitUntil: 'networkidle2', timeout: 30000 });
    await delay(3000);

    const tokenFromPage = await page.evaluate(() => {
      const tokens = [];
      const rows = document.querySelectorAll('table tr');
      rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length >= 2) {
          const tokenText = cells[0].textContent?.trim() || '';
          if (tokenText.startsWith('EAA') || tokenText.startsWith('EAAC')) {
            tokens.push({
              token: tokenText,
              name: cells[1]?.textContent?.trim() || 'Unknown'
            });
          }
        }
      });
      return tokens;
    });

    if (tokenFromPage.length > 0) {
      fbData.token = tokenFromPage[0].token;
      console.log('Token encontrado desde la tabla:', tokenFromPage[0].name);
    } else {
      console.log('No se encontraron tokens en la tabla. Intenta crear uno desde:');
      console.log('https://developers.facebook.com/tools/debug/accesstoken/');
    }
  }

  // Get Page ID from Pages
  console.log('\n=== OBTENIENDO PAGES ===');
  await page.goto('https://business.facebook.com/select/?product=pages', { waitUntil: 'networkidle2', timeout: 30000 });
  await delay(3000);
  const pageUrl = page.url();

  if (!fbData.pageId) {
    const pageInfo = await page.evaluate(() => {
      const pageElements = document.querySelectorAll('[data-pageid], [data-page-id]');
      const ids = [];
      pageElements.forEach(el => {
        const id = el.getAttribute('data-pageid') || el.getAttribute('data-page-id');
        if (id) ids.push(id);
      });
      return { pageElements: ids.length > 0 ? ids : 'No encontrados con data attributes', url: window.location.href };
    });
    console.log('Page Info:', JSON.stringify(pageInfo, null, 2));
    
    if (pageInfo.pageElements.length > 0) {
      fbData.pageId = pageInfo.pageElements[0];
    }
  }

  // Get Ad Account
  console.log('\n=== OBTENIENDO AD ACCOUNT ===');
  await page.goto('https://business.facebook.com/select/?product=ads', { waitUntil: 'networkidle2', timeout: 30000 });
  await delay(3000);

  if (!fbData.adAccountId) {
    const adInfo = await page.evaluate(() => {
      const text = document.body.innerText;
      const adMatches = text.match(/act_\d+/g);
      const bmMatches = text.match(/\b\d{15,}\b/g);
      return {
        adAccounts: adMatches ? [...new Set(adMatches)] : [],
        possibleBMIds: bmMatches ? [...new Set(bmMatches)].slice(0, 5) : []
      };
    });
    console.log('Ad Account Info:', JSON.stringify(adInfo, null, 2));

    if (adInfo.adAccounts.length > 0) {
      fbData.adAccountId = adInfo.adAccounts[0].replace('act_', '');
    }
  }

  // Final output
  console.log('\n========================================');
  console.log('   DATOS FINALES DE FACEBOOK');
  console.log('========================================');
  console.log(JSON.stringify({
    accessToken: fbData.token ? fbData.token.substring(0, 30) + '...' : '❌ No encontrado',
    pageId: fbData.pageId || '❌ No encontrado',
    adAccountId: fbData.adAccountId || '❌ No encontrado',
    pixelId: fbData.pixelId || '❌ No encontrado',
    fullTokenLength: fbData.token ? fbData.token.length : 0,
    _fullToken: fbData.token || ''
  }, null, 2));

  if (fbData.token) {
    fs.writeFileSync('fb_tokens.json', JSON.stringify(fbData, null, 2));
    console.log('\n✅ Tokens guardados en fb_tokens.json');
  }

  console.log('\n⚠️  IMPORTANTE: Si falta algún dato, ve a:');
  console.log('  - Token: https://developers.facebook.com/tools/accesstoken/');
  console.log('  - Page ID: https://business.facebook.com/select/?product=pages');
  console.log('  - Ad Account: https://business.facebook.com/select/?product=ads');
  console.log('  - Pixel: https://business.facebook.com/select/?product=analytics');

  await browser.disconnect();
}

main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });