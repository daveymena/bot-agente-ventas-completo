const { execSync } = require('child_process');
function sh(c) { try { return execSync(c, {encoding:'utf8',shell:'cmd.exe',timeout:60000}).trim(); } catch(e){ return 'ERR '+(e.stdout||'').split('\n').slice(0,10).join(' | '); } }
console.log('=== ARCHIVOS del commit 2f96ac9 (MP/PayPal por negocio) ===');
console.log(sh('cd C:/Users/ADMIN/Videos/Agent-Sales-Bot && git show --stat 2f96ac9 | head -40'));
console.log('');
console.log('=== DIFERENCIA 2f96ac9 vs master (resumen por archivo) ===');
console.log(sh('cd C:/Users/ADMIN/Videos/Agent-Sales-Bot && git diff --stat master..2f96ac9 | head -60'));
