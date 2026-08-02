const { execSync } = require('child_process');
function sh(c) { try { return execSync(c, {encoding:'utf8',shell:'cmd.exe',timeout:60000}).trim(); } catch(e){ return 'ERR '+(e.stdout||'').split('\n').slice(0,6).join(' | '); } }
console.log(sh('node C:/Users/ADMIN/Videos/Agent-Sales-Bot/edit_index.js'));
console.log(sh('cd C:/Users/ADMIN/Videos/Agent-Sales-Bot && git diff artifacts/api-server/src/routes/index.ts | head -30'));
