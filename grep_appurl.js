const { execSync } = require('child_process');
function sh(c) { try { return execSync(c, {encoding:'utf8',shell:'cmd.exe',timeout:60000}).trim(); } catch(e){ return 'ERR '+(e.stdout||'').split('\n').slice(0,3).join(' | '); } }
console.log('=== Uso de APP_URL en codigo ===');
console.log(sh('cd C:/Users/ADMIN/Videos/Agent-Sales-Bot && findstr /s /i /n "APP_URL" artifacts\\api-server\\src\\*.ts'));
console.log('');
console.log('=== deploy actual: updateAppDeploy/github ref ===');
