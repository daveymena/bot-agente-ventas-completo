const fs = require('fs');
const path = require('path');

function replaceInDir(dir) {
  fs.readdirSync(dir).forEach(file => {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      replaceInDir(fullPath);
    } else if (fullPath.endsWith('.ts')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      let modified = false;

      // Clean duplicate safeISO imports
      if (content.includes('import { safeISO } from "../lib/date-utils";')) {
        content = content.replace(/import \{ safeISO \} from "\.\.\/lib\/date-utils";\r?\n?/g, '');
        content = 'import { safeISO } from "../lib/date-utils";\n' + content;
        modified = true;
      }

      // Fix row.safeISO() 
      if (content.includes('row.safeISO(')) {
        content = content.replace(/row\.safeISO\((.*?)\)/g, 'safeISO(row.$1)');
        modified = true;
      }

      // Remove undefined imports or errors if needed
      // "src/routes/payments.ts(54,62): error TS2345: Argument of type 'number' is not assignable to parameter of type 'Record<string, any>'."
      // "src/routes/pricing.ts(32,22): error TS7030: Not all code paths return a value."
      
      if (modified) {
        fs.writeFileSync(fullPath, content);
        console.log('Fixed', fullPath);
      }
    }
  });
}

replaceInDir('artifacts/api-server/src/routes');
