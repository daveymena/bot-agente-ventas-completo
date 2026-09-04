const { execSync } = require('child_process');
function sh(c) { try { return execSync(c, {encoding:'utf8',shell:'cmd.exe',timeout:60000}).trim(); } catch(e){ return 'ERR '+(e.stdout||'').split('\n').slice(0,6).join(' | '); } }
console.log('=== BRANCHES (todas) ===');
console.log(sh('cd C:/Users/ADMIN/Videos/Agent-Sales-Bot && git branch -a'));
console.log('=== STATUS ===');
console.log(sh('cd C:/Users/ADMIN/Videos/Agent-Sales-Bot && git status -sb'));
console.log('=== COMMITS RECIENTES de claude/ en remote ===');
console.log(sh('cd C:/Users/ADMIN/Videos/Agent-Sales-Bot && git log --oneline -5 origin/claude/hol-a155f3 2>&1'));
console.log('=== LOG reciente todo ===');
console.log(sh('cd C:/Users/ADMIN/Videos/Agent-Sales-Bot && git log --oneline -12 --all'));
console.log('=== CAMBIOS SIN COMMIT en codigo (diff stat) ===');
console.log(sh('cd C:/Users/ADMIN/Videos/Agent-Sales-Bot && git diff --stat HEAD'));
