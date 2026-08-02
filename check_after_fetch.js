const { execSync } = require('child_process');
function sh(c) { try { return execSync(c, {encoding:'utf8',shell:'cmd.exe',timeout:60000}).trim(); } catch(e){ return 'ERR '+(e.stdout||'').split('\n').slice(0,5).join(' | '); } }
console.log('=== STATUS post-fetch ===');
console.log(sh('cd C:/Users/ADMIN/Videos/Agent-Sales-Bot && git status -sb'));
console.log('=== HEAD local vs origin/master ===');
console.log(sh('cd C:/Users/ADMIN/Videos/Agent-Sales-Bot && git rev-parse HEAD origin/master'));
console.log('=== TEST DOMINIO NUEVO ===');
console.log(sh('curl -s -m 20 -o NUL -w HTTP:%{http_code} time:%{time_total} ip:%{remote_ip} https://ventasproia.com/'));
console.log('=== TITULO ===');
console.log(sh('curl -s -m 20 https://ventasproia.com/ | findstr /i "<title"'));
console.log('=== API HEALTH ===');
console.log(sh('curl -s -m 20 https://ventasproia.com/api/health'));
