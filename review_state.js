const { execSync } = require('child_process');
function sh(c) { try { return execSync(c, {encoding:'utf8',shell:'cmd.exe',timeout:60000}).trim(); } catch(e){ return 'ERR '+(e.stdout||'').split('\n').slice(0,5).join(' | '); } }
console.log('=== GIT STATUS ===');
console.log(sh('cd C:/Users/ADMIN/Videos/Agent-Sales-Bot && git status'));
console.log('=== GIT LOG (ultimos 8) ===');
console.log(sh('cd C:/Users/ADMIN/Videos/Agent-Sales-Bot && git log --oneline -8'));
console.log('=== REMOTE ===');
console.log(sh('cd C:/Users/ADMIN/Videos/Agent-Sales-Bot && git remote -v'));
