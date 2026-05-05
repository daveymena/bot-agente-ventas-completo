#!/usr/bin/env node

import { existsSync, readdirSync, statSync } from 'fs';
import { resolve } from 'path';

console.log('🔍 DIAGNÓSTICO DE FRONTEND');
console.log('='.repeat(50));
console.log('');

// 1. Variables de entorno
console.log('📍 1. Variables de entorno:');
console.log(`   NODE_ENV: ${process.env.NODE_ENV || 'undefined'}`);
console.log(`   PORT: ${process.env.PORT || 'undefined'}`);
console.log(`   PWD: ${process.cwd()}`);
console.log('');

// 2. Determinar path del frontend
const isProduction = process.env.NODE_ENV === 'production';
const frontendPath = isProduction
  ? '/app/artifacts/ventas-pro/dist/public'
  : resolve(process.cwd(), '../../ventas-pro/dist/public');

console.log('📍 2. Path del frontend:');
console.log(`   Calculado: ${frontendPath}`);
console.log(`   Existe: ${existsSync(frontendPath) ? '✅' : '❌'}`);
console.log('');

// 3. Verificar estructura
const paths = [
  '/app',
  '/app/artifacts',
  '/app/artifacts/ventas-pro',
  '/app/artifacts/ventas-pro/dist',
  '/app/artifacts/ventas-pro/dist/public',
  '/app/artifacts/api-server',
  '/app/artifacts/api-server/dist',
];

console.log('📍 3. Estructura de directorios:');
for (const p of paths) {
  const exists = existsSync(p);
  console.log(`   ${exists ? '✅' : '❌'} ${p}`);
  if (exists) {
    try {
      const files = readdirSync(p);
      console.log(`      Archivos: ${files.slice(0, 5).join(', ')}${files.length > 5 ? '...' : ''}`);
    } catch (e) {
      console.log(`      Error leyendo: ${e.message}`);
    }
  }
}
console.log('');

// 4. Verificar archivos críticos
console.log('📍 4. Archivos críticos:');
const criticalFiles = [
  '/app/artifacts/ventas-pro/dist/public/index.html',
  '/app/artifacts/api-server/dist/index.mjs',
];

for (const file of criticalFiles) {
  const exists = existsSync(file);
  console.log(`   ${exists ? '✅' : '❌'} ${file}`);
  if (exists) {
    try {
      const stats = statSync(file);
      console.log(`      Tamaño: ${stats.size} bytes`);
    } catch (e) {
      console.log(`      Error: ${e.message}`);
    }
  }
}
console.log('');

// 5. Recomendaciones
console.log('📍 5. Recomendaciones:');
if (!existsSync(frontendPath)) {
  console.log('   ❌ El frontend no existe en el path esperado');
  console.log('   💡 Verifica que el Dockerfile construye el frontend:');
  console.log('      RUN pnpm --filter "@workspace/ventas-pro" run build');
} else if (!existsSync('/app/artifacts/ventas-pro/dist/public/index.html')) {
  console.log('   ❌ index.html no existe');
  console.log('   💡 El build del frontend puede haber fallado');
} else {
  console.log('   ✅ Todo parece estar en orden');
  console.log('   💡 Si aún no funciona, revisa los logs del servidor');
}
console.log('');
console.log('='.repeat(50));
