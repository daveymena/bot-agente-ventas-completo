const fs = require('fs');
const path = 'C:/Users/ADMIN/Videos/Agent-Sales-Bot/artifacts/api-server/src/routes/webhooks.ts';
let content = fs.readFileSync(path, 'utf8');

content = content.replace(
  'import { sendOrderConfirmationEmail } import { sendOrderConfirmationEmail } from "../lib/email";',
  'import { sendOrderConfirmationEmail } from "../lib/email";'
);

fs.writeFileSync(path, content);
console.log("webhooks.ts fixed");
