const { execSync } = require('child_process');
function sh(c) { try { return execSync(c, {encoding:'utf8',shell:'cmd.exe',timeout:45000}).trim(); } catch(e){ return 'ERR '+(e.stdout||'').split('\n').slice(0,3).join(' | '); } }
console.log('--- IP DEL PC ---');
console.log(sh('nslookup tecnoia-bot-agenwhatsapp.2xs2bu.easypanel.host') || sh('ping -n 1 tecnoia-bot-agenwhatsapp.2xs2bu.easypanel.host'));
console.log('--- TRACERT/PING ---');
console.log(sh('ping -n 2 tecnoia-bot-agenwhatsapp.2xs2bu.easypanel.host'));
console.log('--- HTTP TEST CON POWERSHELL ---');
const ps = `try { $r = Invoke-WebRequest -Uri 'https://tecnoia-bot-agenwhatsapp.2xs2bu.easypanel.host/' -TimeoutSec 20 -UseBasicParsing; Write-Output ('HTTP ' + $r.StatusCode + ' len=' + $r.Content.Length) } catch { Write-Output ('ERROR: ' + $_.Exception.Message) }`;
const fs = require('fs');
fs.writeFileSync('C:/Users/ADMIN/Videos/Agent-Sales-Bot/httptest.ps1', ps);
console.log(sh('powershell -ExecutionPolicy Bypass -File C:/Users/ADMIN/Videos/Agent-Sales-Bot/httptest.ps1'));
