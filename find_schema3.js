const { execSync } = require('child_process');
function sh(c) { try { return execSync(c, {encoding:'utf8',shell:'cmd.exe',timeout:60000}).trim(); } catch(e){ return 'ERR '+(e.stdout||'').split('\n').slice(0,12).join(' | '); } }
console.log('=== listar packages ===');
console.log(sh('cd C:/Users/ADMIN/Videos/Agent-Sales-Bot && dir /b packages 2>NUL'));
console.log('');
console.log('=== buscar schema en todo el repo ===');
console.log(sh('cd C:/Users/ADMIN/Videos/Agent-Sales-Bot && for /r %f in (schema*.ts) do @echo %f'));
console.log('');
console.log('=== grep "paymentMethods" en .ts (raiz) ===');
console.log(sh('cd C:/Users/ADMIN/Videos/Agent-Sales-Bot && findstr /s /n /m "paymentMethods" *.ts packages\\*.ts artifacts\\api-server\\src\\*.ts 2>NUL'));
