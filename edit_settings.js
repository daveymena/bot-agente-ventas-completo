const fs = require('fs');
const path = 'C:/Users/ADMIN/Videos/Agent-Sales-Bot/artifacts/ventas-pro/src/pages/settings.tsx';
let content = fs.readFileSync(path, 'utf8');

// 1. Añadir imports
content = content.replace(
  'import { PaymentCredentials } from "@/components/payment-credentials";',
  'import { PaymentCredentials } from "@/components/payment-credentials";\nimport { FacebookCredentials } from "@/components/facebook-credentials";\nimport { EmailCredentials } from "@/components/email-credentials";'
);

// 2. Añadir componentes en el grid
content = content.replace(
  `            {/* Primero de la lista a propósito: sin esto configurado, las
                ventas del negocio se cobran en la cuenta del servidor. */}
            <PaymentCredentials />

            <Card className="rounded-3xl border-0 shadow-lg glass-panel overflow-hidden relative">`,
  `            {/* Primero de la lista a propósito: sin esto configurado, las
                ventas del negocio se cobran en la cuenta del servidor. */}
            <PaymentCredentials />

            <FacebookCredentials />

            <EmailCredentials />

            <Card className="rounded-3xl border-0 shadow-lg glass-panel overflow-hidden relative">`
);

fs.writeFileSync(path, content);
console.log("settings.tsx updated");
