const { execSync } = require('child_process');
function sh(c) { try { return execSync(c, {encoding:'utf8',shell:'cmd.exe',timeout:60000}).trim(); } catch(e){ return 'ERR '+(e.stdout||'').split('\n').slice(0,8).join(' | '); } }
console.log('=== TenantContext / paymentMethods / parseFacebookMeta en tenantManager ===');
console.log(sh('cd C:/Users/ADMIN/Videos/Agent-Sales-Bot && findstr /n /i "paymentMethods parseFacebookMeta TenantContext interface payment" artifacts\\api-server\\src\\lib\\tenantManager.ts | head -40'));
console.log('');
console.log('=== payment-credentials.ts (ruta) ===');
console.log(sh('cd C:/Users/ADMIN/Videos/Agent-Sales-Bot && git show 2f96ac9:artifacts/api-server/src/routes/payment-credentials.ts'));
