const { execSync } = require('child_process');
function sh(c) { try { return execSync(c, {encoding:'utf8',shell:'cmd.exe',timeout:60000}).trim(); } catch(e){ return 'ERR '+(e.stdout||'').split('\n').slice(0,5).join(' | '); } }
console.log('=== DIFF contra HEAD (archivos con cambios sin commitear) ===');
console.log(sh('cd C:/Users/ADMIN/Videos/Agent-Sales-Bot && git diff --stat'));
console.log('=== DIFF staged ===');
console.log(sh('cd C:/Users/ADMIN/Videos/Agent-Sales-Bot && git diff --cached --stat'));
console.log('=== ULTIMA MODIFICACION DE ARCHIVOS .ts (5) ===');
console.log(sh('cd C:/Users/ADMIN/Videos/Agent-Sales-Bot && dir /b /o-d artifacts\\api-server\\src\\lib\\*.ts artifacts\\api-server\\src\\routes\\*.ts 2>NUL'));
console.log('=== git fetch + status actualizado ===');
console.log(sh('cd C:/Users/ADMIN/Videos/Agent-Sales-Bot && git fetch origin 2>&1 && git status -sb | findstr /i ahead behind'));
