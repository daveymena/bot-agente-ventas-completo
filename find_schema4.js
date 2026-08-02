const { execSync } = require('child_process');
function sh(c) { try { return execSync(c, {encoding:'utf8',shell:'cmd.exe',timeout:60000}).trim(); } catch(e){ return 'ERR '+(e.stdout||'').split('\n').slice(0,12).join(' | '); } }
console.log('=== raiz del repo ===');
console.log(sh('cd C:/Users/ADMIN/Videos/Agent-Sales-Bot && dir /b'));
console.log('');
console.log('=== buscar schema tenant (excluyendo node_modules y .claude) ===');
console.log(sh('cd C:/Users/ADMIN/Videos/Agent-Sales-Bot && dir /b /s /a-d *.ts 2>NUL | findstr /v node_modules | findstr /v ".claude" | findstr /i "schema tenant db"'));
