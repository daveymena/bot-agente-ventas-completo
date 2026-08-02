const { execSync } = require('child_process');
function sh(c) { try { return execSync(c, {encoding:'utf8',shell:'cmd.exe',timeout:300000}).trim(); } catch(e){ return 'ERR '+(e.stdout||'').split('\n').slice(0,20).join(' | '); } }
console.log('=== BUILD API SERVER ===');
console.log(sh('cd C:/Users/ADMIN/Videos/Agent-Sales-Bot/artifacts/api-server && npm run build 2>&1 | head -80'));
