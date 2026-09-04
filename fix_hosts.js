const { execSync } = require('child_process');
function sh(c) { try { return execSync(c, {encoding:'utf8',shell:'cmd.exe',timeout:30000}).trim(); } catch(e){ return 'ERR '+(e.stdout||'').split('\n').slice(0,3).join(' | '); } }
// check current hosts
console.log('--- HOSTS ACTUAL (lineas relevantes) ---');
console.log(sh('findstr /i "easypanel 2xs2bu tecnoia" C:\\Windows\\System32\\drivers\\etc\\hosts'));
