const { execSync } = require('child_process');
function sh(c) { try { return execSync(c, {encoding:'utf8',shell:'cmd.exe',timeout:60000}).trim(); } catch(e){ return 'ERR '+(e.stdout||'').split('\n').slice(0,8).join(' | '); } }
console.log('=== componentes frontend con facebook/meta/connect ===');
console.log(sh('cd C:/Users/ADMIN/Videos/Agent-Sales-Bot && dir /b /s artifacts\\ventas-pro\\src\\components 2>NUL | findstr /i "face whats connect integra meta"'));

console.log('=== referencias a connect-facebook / fb_status / connect en paginas ===');
console.log(sh('cd C:/Users/ADMIN/Videos/Agent-Sales-Bot && findstr /s /n /i "connect-facebook ConnectFacebook facebook" artifacts\\ventas-pro\\src\\pages\\*.tsx 2>NUL'));

console.log('=== whatsapp manager por tenant (primeras 80 lineas) ===');
console.log(sh('cd C:/Users/ADMIN/Videos/Agent-Sales-Bot && powershell -Command "Get-Content artifacts/api-server/src/lib/whatsappManagerByTenant.ts -TotalCount 80"'));
