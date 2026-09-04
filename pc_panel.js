const { execSync } = require('child_process');
function sh(c) { try { return execSync(c, {encoding:'utf8',shell:'cmd.exe',timeout:30000}).trim(); } catch(e){ return 'ERR '+(e.stdout||'').split('\n').slice(0,3).join(' | '); } }
console.log('--- PANEL EASYPANEL desde PC ---');
console.log(sh('curl -s -m 20 -o NUL -w "panel: HTTP %{http_code} time %{time_total} err %{errormsg}" https://2xs2bu.easypanel.host/'));
console.log('--- DNS del panel desde PC ---');
console.log(sh('nslookup 2xs2bu.easypanel.host | findstr /i Address'));
console.log('--- OTRO SUBDOMINIO (opencode1) ---');
console.log(sh('curl -s -k -m 15 -o NUL -w "operato: HTTP %{http_code} err %{errormsg}" -H "Host: operato.2xs2bu.easypanel.host" https://144.91.112.79/'));
