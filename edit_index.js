const fs = require('fs');
const path = 'C:/Users/ADMIN/Videos/Agent-Sales-Bot/artifacts/api-server/src/routes/index.ts';
let content = fs.readFileSync(path, 'utf8');

// 1. Add imports
content = content.replace(
  'import paymentCredentialsRouter from "./payment-credentials";',
  'import paymentCredentialsRouter from "./payment-credentials";\nimport facebookCredentialsRouter from "./facebook-credentials";\nimport emailCredentialsRouter from "./email-credentials";'
);

// 2. Add router mounts after paymentCredentialsRouter
content = content.replace(
  'router.use("/payments", paymentCredentialsRouter);',
  'router.use("/payments", paymentCredentialsRouter);\nrouter.use("/facebook", facebookCredentialsRouter);\nrouter.use("/email", emailCredentialsRouter);'
);

fs.writeFileSync(path, content);
console.log("index.ts updated");
