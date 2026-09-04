const { execSync } = require('child_process');
function sh(c) { try { return execSync(c, {encoding:'utf8',shell:'cmd.exe',timeout:60000}).trim(); } catch(e){ return 'ERR '+(e.stdout||'').split('\n').slice(0,8).join(' | '); } }
console.log('=== como se guarda metadata.facebook (rutas tenants) ===');
console.log(sh('cd C:/Users/ADMIN/Videos/Agent-Sales-Bot && findstr /s /n /i "metadata.facebook metadata.facebook" artifacts\\api-server\\src\\routes\\*.ts artifacts\\api-server\\src\\lib\\*.ts 2>NUL | findstr /v node_modules | head -30'));
console.log('');
console.log('=== buscar rutas facebook existentes ===');
console.log(sh('cd C:/Users/ADMIN/Videos/Agent-Sales-Bot && dir /b artifacts\\api-server\\src\\routes\\*facebook* 2>NUL'));
console.log('');
console.log('=== settings.tsx lineas 200-330 ===');
console.log(sh('cd C:/Users/ADMIN/Videos/Agent-Sales-Bot && powershell -Command "Get-Content artifacts/ventas-pro/src/pages/settings.tsx | Select-Object -Skip 200 -First 130"'));
