import https from 'https';

const BASE = '2xs2bu.easypanel.io';

function request(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: BASE,
      path: '/api' + path,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
      },
      rejectUnauthorized: false,
    };
    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function main() {
  // Login
  console.log('Logging in to Easypanel...');
  const login = await request('POST', '/auth/login', {
    email: 'daveymena162@gmail.com',
    password: '6715320D.',
  });
  console.log('Login:', login.status, login.body.substring(0, 200));

  if (login.status !== 200) {
    console.error('Login failed');
    return;
  }

  const data = JSON.parse(login.body);
  // Token might be in data.token or in set-cookie header
  let token = data.token;
  console.log('Token found:', token ? token.substring(0, 20) + '...' : 'no token');
  console.log('Full login response:', JSON.stringify(data, null, 2));

  if (!token) {
    console.log('No token in response body, trying with cookie...');
  }

  // Get services
  const services = await request('GET', '/services', null, token);
  console.log('\nServices:', services.status, services.body.substring(0, 500));

  if (services.status === 200) {
    const svcs = JSON.parse(services.body);
    console.log('\nAll services:', JSON.stringify(svcs, null, 2).substring(0, 2000));
  }
}

main().catch(console.error);
