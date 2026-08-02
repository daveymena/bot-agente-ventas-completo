const { execSync } = require('child_process');
function sh(c) { try { return execSync(c, {encoding:'utf8',shell:'cmd.exe',timeout:60000}).trim(); } catch(e){ return 'ERR '+(e.stdout||'').split('\n').slice(0,8).join(' | '); } }
console.log('=== tenants schema (columna metadata/paymentMethods) ===');
console.log(sh('cd C:/Users/ADMIN/Videos/Agent-Sales-Bot && findstr /s /n /i "metadata paymentMethods" packages\\db\\src\\*.ts artifacts\\api-server\\src\\db\\*.ts 2>NUL'));
console.log('');
console.log('=== componentes de conexion Facebook en frontend ===');
console.log(sh('cd C:/Users/ADMIN/Videos/Agent-Sales-Bot && dir /b /o-d artifacts\\ventas-pro\\src\\components\\*facebook* artifacts\\ventas-pro\\src\\components\\*messenger* 2>NUL'));
console.log('');
console.log('=== settings.tsx (secciones y donde van PaymentCredentials) ===');
console.log(sh('cd C:/Users/ADMIN/Videos/Agent-Sales-Bot && powershell -Command "Get-Content artifacts/ventas-pro/src/pages/settings.tsx -TotalCount 200"'));
