const { execSync } = require('child_process');
function sh(c) { try { return execSync(c, {encoding:'utf8',shell:'cmd.exe',timeout:60000}).trim(); } catch(e){ return 'ERR '+(e.stdout||'').split('\n').slice(0,8).join(' | '); } }
console.log('=== tenantManager.ts lineas 1-190 ===');
console.log(sh('cd C:/Users/ADMIN/Videos/Agent-Sales-Bot && powershell -Command "Get-Content artifacts/api-server/src/lib/tenantManager.ts -TotalCount 190"'));
