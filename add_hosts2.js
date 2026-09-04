const { execSync } = require('child_process');
function sh(c) { try { return execSync(c, {encoding:'utf8',shell:'cmd.exe',timeout:30000}).trim(); } catch(e){ return 'ERR '+(e.stdout||'').split('\n').slice(0,3).join(' | '); } }
const lines = [
  '144.91.112.79  tecnoia-bot-agenwhatsapp.2xs2bu.easypanel.host',
  '144.91.112.79  2xs2bu.easypanel.host'
];
const content = lines.join('\r\n') + '\r\n';
// method 1: append via type with echo (may work if permissions allow)
console.log(sh('echo ' + content.replace(/\r\n/g, ' ') + ' | powershell -Command "$s=@\\\"'+content+'\\\"; Add-Content -Path C:\\\\Windows\\\\System32\\\\drivers\\\\etc\\\\hosts -Value $s"'));
console.log('--- retry simple ---');
console.log(sh('powershell -ExecutionPolicy Bypass -Command "Add-Content -Path \'C:\\Windows\\System32\\drivers\\etc\\hosts\' -Value \'144.91.112.79  tecnoia-bot-agenwhatsapp.2xs2bu.easypanel.host\'"'));
console.log('--- verify ---');
console.log(sh('findstr /i "tecnoia" C:\\Windows\\System32\\drivers\\etc\\hosts'));
