const { execSync } = require('child_process');
function sh(c) { try { return execSync(c, {encoding:'utf8',shell:'cmd.exe',timeout:90000}).trim(); } catch(e){ return 'ERR '+(e.stdout||'').split('\n').slice(0,6).join(' | '); } }
console.log('=== SWITCH a claude/hol-a155f3 ===');
console.log(sh('cd C:/Users/ADMIN/Videos/Agent-Sales-Bot && git checkout claude/hol-a155f3 2>&1'));
console.log('=== PULL desde origin ===');
console.log(sh('cd C:/Users/ADMIN/Videos/Agent-Sales-Bot && git pull origin claude/hol-a155f3 2>&1'));
console.log('=== HEAD ===');
console.log(sh('cd C:/Users/ADMIN/Videos/Agent-Sales-Bot && git log --oneline -3'));
