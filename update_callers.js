const fs = require('fs');

// webhooks.ts
let content = fs.readFileSync('C:/Users/ADMIN/Videos/Agent-Sales-Bot/artifacts/api-server/src/routes/webhooks.ts', 'utf8');
content = content.replace(
  'from "../lib/email";',
  'import { sendOrderConfirmationEmail } from "../lib/email";\nimport { credencialesEmailDe } from "../lib/tenant-email-credentials";'
);
content = content.replace(
  `await sendOrderConfirmationEmail(
            relatedConvo.customerEmail,
            relatedConvo.contactName || "Cliente",
            product.name,
            product.imageUrl || null,
            product.deliveryLink,
            parseFloat(paymentData.transaction_amount || "0"),
            product.currency || "COP",
            String(paymentId),
            "mercadopago"
          );`,
  `await sendOrderConfirmationEmail(
            relatedConvo.customerEmail,
            relatedConvo.contactName || "Cliente",
            product.name,
            product.imageUrl || null,
            product.deliveryLink,
            parseFloat(paymentData.transaction_amount || "0"),
            product.currency || "COP",
            String(paymentId),
            "mercadopago",
            credencialesEmailDe(req.tenant as any)
          );`
);
fs.writeFileSync('C:/Users/ADMIN/Videos/Agent-Sales-Bot/artifacts/api-server/src/routes/webhooks.ts', content);
console.log("webhooks.ts updated");

// auth.ts
content = fs.readFileSync('C:/Users/ADMIN/Videos/Agent-Sales-Bot/artifacts/api-server/src/routes/auth.ts', 'utf8');
content = content.replace(
  'import { generateVerificationCode, sendPasswordResetEmail, sendPasswordChangeConfirmationEmail } from "../lib/email";',
  'import { generateVerificationCode, sendPasswordResetEmail, sendPasswordChangeConfirmationEmail } from "../lib/email";\nimport { credencialesEmailDe } from "../lib/tenant-email-credentials";'
);
content = content.replace(
  'await sendPasswordResetEmail(tenant.email, code, tenant.name);',
  'await sendPasswordResetEmail(tenant.email, code, tenant.name, credencialesEmailDe(tenant));'
);
content = content.replace(
  'await sendPasswordChangeConfirmationEmail(tenant.email, tenant.name);',
  'await sendPasswordChangeConfirmationEmail(tenant.email, tenant.name, credencialesEmailDe(tenant));'
);
fs.writeFileSync('C:/Users/ADMIN/Videos/Agent-Sales-Bot/artifacts/api-server/src/routes/auth.ts', content);
console.log("auth.ts updated");

// subscription-webhooks.ts
content = fs.readFileSync('C:/Users/ADMIN/Videos/Agent-Sales-Bot/artifacts/api-server/src/routes/subscription-webhooks.ts', 'utf8');
content = content.replace(
  'import { sendActivationTokenEmail } from "../lib/email";',
  'import { sendActivationTokenEmail } from "../lib/email";\nimport { credencialesEmailDe } from "../lib/tenant-email-credentials";'
);
content = content.replace(
  `const emailSent = await sendActivationTokenEmail(
      tenant.email,
      subscription.activationToken,
      planName,
      tenant.name || tenant.email.split("@")[0]
    );`,
  `const emailSent = await sendActivationTokenEmail(
      tenant.email,
      subscription.activationToken,
      planName,
      tenant.name || tenant.email.split("@")[0],
      credencialesEmailDe(tenant)
    );`
);
fs.writeFileSync('C:/Users/ADMIN/Videos/Agent-Sales-Bot/artifacts/api-server/src/routes/subscription-webhooks.ts', content);
console.log("subscription-webhooks.ts updated");
