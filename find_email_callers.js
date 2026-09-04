const { execSync } = require('child_process');
function sh(c) { try { return execSync(c, {encoding:'utf8',shell:'cmd.exe',timeout:60000}).trim(); } catch(e){ return 'ERR '+(e.stdout||'').split('\n').slice(0,8).join(' | '); } }
const fns = ["sendOrderConfirmationEmail","sendVerificationEmail","sendPasswordResetEmail","sendActivationTokenEmail","sendPasswordChangeConfirmationEmail","verifyEmailService"];
for (const fn of fns) {
  console.log("--- " + fn + " ---");
  console.log(sh('cd C:/Users/ADMIN/Videos/Agent-Sales-Bot && findstr /s /n "' + fn + '" artifacts\\api-server\\src\\routes\\*.ts artifacts\\api-server\\src\\lib\\*.ts 2>NUL | findstr /v "email.ts" | head -6'));
}
