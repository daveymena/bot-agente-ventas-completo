const fs = require('fs');
const content = [
  '# FIX TEMPORAL EasyPanel - anadido el ' + new Date().toLocaleDateString('es-ES'),
  '144.91.112.79  tecnoia-bot-agenwhatsapp.2xs2bu.easypanel.host',
  '144.91.112.79  2xs2bu.easypanel.host',
  '',
  '# (quitar estas 3 lineas cuando EasyPanel arregle su proxy)'
].join('\r\n');
fs.writeFileSync('C:/Users/ADMIN/Videos/Agent-Sales-Bot/agregar_a_hosts.txt', content);
console.log('guia escrita en el PC: C:/Users/ADMIN/Videos/Agent-Sales-Bot/agregar_a_hosts.txt');
