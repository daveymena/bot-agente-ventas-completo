const { execSync } = require('child_process');
function sh(c) { try { return execSync(c, {encoding:'utf8',shell:'cmd.exe',timeout:60000}).trim(); } catch(e){ return 'ERR '+(e.stdout||'').split('\n').slice(0,8).join(' | '); } }
console.log('=== process.env.FB_ en facebook.ts ===');
console.log(sh('cd C:/Users/ADMIN/Videos/Agent-Sales-Bot && findstr /n /i "process.env.FB_ process.env.MESSENGER process.env.WEBHOOK" artifacts\\api-server\\src\\lib\\facebook.ts'));
console.log('');
console.log('=== proceso.facebook en tenant? como se inyecta (buscar .facebook.) ===');
console.log(sh('cd C:/Users/ADMIN/Videos/Agent-Sales-Bot && findstr /n /i "tenant.facebook facebook.accessToken req.tenant.facebook" artifacts\\api-server\\src\\lib\\facebook.ts'));
console.log('');
console.log('=== SMTP/email env ===');
console.log(sh('cd C:/Users/ADMIN/Videos/Agent-Sales-Bot && findstr /n /i "process.env.SMTP process.env.EMAIL_FROM" artifacts\\api-server\\src\\lib\\email.ts'));
console.log('');
console.log('=== whatsapp env ===');
console.log(sh('cd C:/Users/ADMIN/Videos/Agent-Sales-Bot && findstr /n /i "process.env.WHATSAPP process.env.TRANSFER ADMIN_PHONE" artifacts\\api-server\\src\\lib\\whatsapp.ts'));
