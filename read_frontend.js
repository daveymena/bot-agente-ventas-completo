const { execSync } = require('child_process');
function sh(c) { try { return execSync(c, {encoding:'utf8',shell:'cmd.exe',timeout:60000}).trim(); } catch(e){ return 'ERR '+(e.stdout||'').split('\n').slice(0,8).join(' | '); } }
console.log('=== settings.tsx (donde se monta el componente) ===');
console.log(sh('cd C:/Users/ADMIN/Videos/Agent-Sales-Bot && git show 2f96ac9:artifacts/ventas-pro/src/pages/settings.tsx | findstr /n /i "payment credenciales"'));
console.log('');
console.log('=== payment-credentials.tsx (primeras 120 lineas) ===');
console.log(sh('cd C:/Users/ADMIN/Videos/Agent-Sales-Bot && git show 2f96ac9:artifacts/ventas-pro/src/components/payment-credentials.tsx | more +1 | findstr /n "^" | findstr "^[1-9]0*:" | head -120'));
console.log('');
console.log('=== payment-credentials.tsx (titulos/secciones/inputs, 120+ lineas) ===');
console.log(sh('cd C:/Users/ADMIN/Videos/Agent-Sales-Bot && git show 2f96ac9:artifacts/ventas-pro/src/components/payment-credentials.tsx | findstr /n /i "h2 h3 input label button name= placeholder type="'));
