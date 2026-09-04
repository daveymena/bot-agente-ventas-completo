const { execSync } = require('child_process');
function sh(c) { try { return execSync(c, {encoding:'utf8',shell:'cmd.exe',timeout:30000}).trim(); } catch(e){ return 'ERR '+(e.stdout||'').split('\n').slice(0,3).join(' | '); } }
console.log(sh('curl -s -k -m 20 -H "Host: tecnoia-bot-agenwhatsapp.2xs2bu.easypanel.host" https://144.91.112.79/ | findstr /i "<title>"'));
