const { execSync } = require('child_process');
function sh(c) { try { return execSync(c, {encoding:'utf8',shell:'cmd.exe',timeout:90000}).trim(); } catch(e){ return 'ERR '+(e.stdout||'').split('\n').slice(0,6).join(' | '); } }
console.log('=== CURRENT BRANCH ===');
console.log(sh('cd C:/Users/ADMIN/Videos/Agent-Sales-Bot && git branch --show-current'));
console.log('=== MASTER vs origin/claude/hol-a155f3 ===');
console.log(sh('cd C:/Users/ADMIN/Videos/Agent-Sales-Bot && git rev-parse master origin/claude/hol-a155f3'));
console.log('=== WORKTREES ===');
console.log(sh('cd C:/Users/ADMIN/Videos/Agent-Sales-Bot && git worktree list'));
