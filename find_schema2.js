const { execSync } = require('child_process');
function sh(c) { try { return execSync(c, {encoding:'utf8',shell:'cmd.exe',timeout:60000}).trim(); } catch(e){ return 'ERR '+(e.stdout||'').split('\n').slice(0,8).join(' | '); } }
console.log('=== packages/db estructura ===');
console.log(sh('cd C:/Users/ADMIN/Videos/Agent-Sales-Bot && dir /b /s packages\\db 2>NUL | findstr /i ".ts .js"'));
console.log('');
console.log('=== grep tenants + metadata en todo packages ===');
console.log(sh('cd C:/Users/ADMIN/Videos/Agent-Sales-Bot && findstr /s /n /i "export const tenants" packages\\db\\*.ts packages\\db\\**\\*.ts 2>NUL'));
