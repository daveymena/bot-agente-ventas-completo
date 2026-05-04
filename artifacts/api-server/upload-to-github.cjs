const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const repoPath = 'C:\\Users\\ADMIN\\Videos\\Agent-Sales-Bot';

try {
  process.chdir(repoPath);
  console.log(`📂 Cambiado a ${repoPath}`);

  // 1. Limpiar Git
  if (fs.existsSync('.git')) {
    fs.rmSync('.git', { recursive: true, force: true });
    console.log('🗑️ Historial de Git antiguo eliminado');
  }

  // 2. Asegurar .gitignore
  const gitignoreContent = `
node_modules/
.env
artifacts/api-server/.env
*.db
tecnovariedades.db
.baileys-auth/
dist/
build/
.venv/
venv/
.gemini/
`;
  fs.writeFileSync('.gitignore', gitignoreContent);
  console.log('🛡️ .gitignore configurado');

  // 3. Subir de nuevo
  execSync('git init', { stdio: 'inherit' });
  execSync('git remote add origin https://github.com/daveymena/bot-agente-ventas-completo.git', { stdio: 'inherit' });
  execSync('git add .', { stdio: 'inherit' });
  execSync('git commit -m "Initial clean commit: Sofía Sales Agent Optimization"', { stdio: 'inherit' });
  execSync('git push -f origin master || git push -f origin main', { stdio: 'inherit' });

  console.log('✅ ¡Código subido con éxito a GitHub!');
} catch (error) {
  console.error('❌ Error durante la subida:', error.message);
}
