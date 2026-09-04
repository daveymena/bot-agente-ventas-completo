const { execSync } = require('child_process');
function sh(c) { try { return execSync(c, {encoding:'utf8',shell:'cmd.exe',timeout:45000}).trim(); } catch(e){ return 'ERR '+(e.stdout||'').split('\n').slice(0,3).join(' | '); } }
console.log('--- CURL EXISTE? ---');
console.log(sh('curl --version | findstr /i curl'));
console.log('--- CURL DIRECTO AL DOMINIO ---');
console.log(sh('curl -s -m 20 -o NUL -w "dom: HTTP %{http_code} time %{time_total} err %{errormsg}" https://tecnoia-bot-agenwhatsapp.2xs2bu.easypanel.host/'));
console.log('--- CURL A LA IP REAL (144.91.112.79) con Host ---');
console.log(sh('curl -s -k -m 20 -o NUL -w "ipreal: HTTP %{http_code} time %{time_total} err %{errormsg}" -H "Host: tecnoia-bot-agenwhatsapp.2xs2bu.easypanel.host" https://144.91.112.79/'));
console.log('--- CURL A LA IP 72.251.7.23 con Host ---');
console.log(sh('curl -s -k -m 20 -o NUL -w "ip72: HTTP %{http_code} time %{time_total} err %{errormsg}" -H "Host: tecnoia-bot-agenwhatsapp.2xs2bu.easypanel.host" https://72.251.7.23/'));
console.log('--- TCP 443 a ambas IPs ---');
console.log(sh('powershell -Command "Test-NetConnection 144.91.112.79 -Port 443 -InformationLevel Quiet"'));
console.log(sh('powershell -Command "Test-NetConnection 72.251.7.23 -Port 443 -InformationLevel Quiet"'));
console.log('--- IP PUBLICA DEL PC ---');
console.log(sh('curl -s -m 15 https://api.ipify.org'));
