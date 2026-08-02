const { execSync } = require('child_process');
function sh(c) { try { return execSync(c, {encoding:'utf8',shell:'cmd.exe',timeout:45000}).trim(); } catch(e){ return 'ERR '+(e.stdout||'').split('\n').slice(0,3).join(' | '); } }

const lines = [
  '144.91.112.79  tecnoia-bot-agenwhatsapp.2xs2bu.easypanel.host',
  '144.91.112.79  2xs2bu.easypanel.host',
  '144.91.112.79  bot-agenwhatsapp.2xs2bu.easypanel.host',
  '144.91.112.79  opencode1-operato.2xs2bu.easypanel.host',
  '144.91.112.79  agent-opencode1-operato.2xs2bu.easypanel.host'
];
const hostfile = 'C:\\Windows\\System32\\drivers\\etc\\hosts';

// build a script that appends with admin elevation via PowerShell Start-Process -Verb RunAs
const ps = `
$h = @'
${lines.join('\n')}
'@
Add-Content -Path 'C:\\Windows\\System32\\drivers\\etc\\hosts' -Value $h
Write-Output 'DONE'
`;
const fs = require('fs');
fs.writeFileSync('C:/Users/ADMIN/Videos/Agent-Sales-Bot/addhosts.ps1', ps);
console.log('script written');
console.log('--- probando con elevacion ---');
const out = sh('powershell -Command "Start-Process powershell -ArgumentList \'-ExecutionPolicy Bypass -File C:\\Users\\ADMIN\\Videos\\Agent-Sales-Bot\\addhosts.ps1\' -Verb RunAs -Wait"');
console.log(out);
