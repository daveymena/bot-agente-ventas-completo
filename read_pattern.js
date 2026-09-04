const { execSync } = require('child_process');
function sh(c) { try { return execSync(c, {encoding:'utf8',shell:'cmd.exe',timeout:60000}).trim(); } catch(e){ return 'ERR '+(e.stdout||'').split('\n').slice(0,8).join(' | '); } }
console.log('=== tenant-payment-credentials.ts ===');
console.log(sh('cd C:/Users/ADMIN/Videos/Agent-Sales-Bot && git show 2f96ac9:artifacts/api-server/src/lib/tenant-payment-credentials.ts'));
