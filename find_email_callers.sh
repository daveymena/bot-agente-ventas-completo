const { execSync } = require('child_process');
function sh(c) { try { return execSync(c, {encoding:'utf8',shell:'cmd.exe',timeout:60000}).trim(); } catch(e){ return 'ERR '+(e.stdout||'').split('\n').slice(0,8).join(' | '); } }
console.log('=== callers de funciones email.ts ===');
for fn in sendOrderConfirmationEmail sendVerificationEmail sendPasswordResetEmail sendActivationTokenEmail sendPasswordChangeConfirmationEmail verifyEmailService; do
  echo "--- $fn ---"
  grep -rn "$fn" artifacts/api-server/src/routes artifacts/api-server/src/lib --include=*.ts | grep -v "email.ts:" | head -6
done
