import https from 'https';

const BASE = 'tecnoia-bot-agenwhatsapp.2xs2bu.easypanel.host';
const agent = new https.Agent({ rejectUnauthorized: false });

function request(method, path, body, cookie) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: BASE, path, method,
      headers: {
        'Content-Type': 'application/json',
        ...(cookie ? { Cookie: cookie } : {}),
      },
      agent,
    };
    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: data,
        });
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function main() {
  // Login
  const login = await request('POST', '/api/auth/login', {
    email: 'daveymena16@gmail.com',
    password: '6715320D'
  });
  const setCookie = login.headers['set-cookie'];
  const cookie = Array.isArray(setCookie) ? setCookie.join('; ') : setCookie;
  console.log('Login:', login.status, cookie ? 'cookie received' : 'no cookie');

  const endpoints = [
    '/api/dashboard/summary',
    '/api/dashboard/messages-timeline',
    '/api/categories',
  ];

  for (const ep of endpoints) {
    const r = await request('GET', ep, null, cookie);
    console.log(`\n=== ${ep} -> ${r.status} ===`);
    try {
      const parsed = JSON.parse(r.body);
      console.log(JSON.stringify(parsed, null, 2).substring(0, 500));
    } catch {
      console.log(r.body.substring(0, 500));
    }
  }
}

main().catch(console.error);
