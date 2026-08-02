const { execSync } = require('child_process');
function sh(c) { try { return execSync(c, {encoding:'utf8',shell:'cmd.exe',timeout:90000}).trim(); } catch(e){ return 'ERR '+(e.stdout||'').split('\n').slice(0,6).join(' | '); } }
console.log('=== CHECKOUT claude/hol-a155f3 ===');
console.log(sh('cd C:/Users/ADMIN/Videos/Agent-Sales-Bot && git checkout -b claude/hol-a155f3 origin/claude/hol-a155f3 2>&1'));
console.log('=== STATUS ===');
console.log(sh('cd C:/Users/ADMIN/Videos/Agent-Sales-Bot && git status -sb | head -3'));
