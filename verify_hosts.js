const { execSync } = require('child_process');
function sh(c) { try { return execSync(c, {encoding:'utf8',shell:'cmd.exe',timeout:30000}).trim(); } catch(e){ return 'ERR '+(e.stdout||'').split('\n').slice(0,3).join(' | '); } }
console.log('--- HOSTS AHORA ---');
console.log(sh('findstr /i "easypanel tecnoia" C:\\Windows\\System32\\drivers\\etc\\hosts'));
console.log('--- RESOLVER EL DOMINIO AHORA ---');
console.log(sh('nslookup tecnoia-bot-agenwhatsapp.2xs2bu.easypanel.host | findstr /i Address'));
console.log('--- TEST HTTP CON DOMINIO ---');
console.log(sh('curl -s -m 20 -o NUL -w "HTTP %{http_code} time %{time_total} err %{errormsg}" https://tecnoia-bot-agenwhatsapp.2xs2bu.easypanel.host/'));
