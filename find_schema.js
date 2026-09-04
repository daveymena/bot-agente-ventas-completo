const { execSync } = require('child_process');
function sh(c) { try { return execSync(c, {encoding:'utf8',shell:'cmd.exe',timeout:60000}).trim(); } catch(e){ return 'ERR '+(e.stdout||'').split('\n').slice(0,8).join(' | '); } }
console.log('=== buscar archivo schema de tenants ===');
console.log(sh('cd C:/Users/ADMIN/Videos/Agent-Sales-Bot && where /r . schema.ts 2>NUL | findstr /i db'));
console.log(sh('cd C:/Users/ADMIN/Videos/Agent-Sales-Bot && dir /b /s packages\\db\\src\\*.ts 2>NUL'));
console.log('');
console.log('=== grep metadata/paymentMethods en packages/db ===');
console.log(sh('cd C:/Users/ADMIN/Videos/Agent-Sales-Bot && findstr /s /n /i "metadata paymentMethods" packages\\db\\src\\*.ts'));
