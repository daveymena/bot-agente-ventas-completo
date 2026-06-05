#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('\n' + '='.repeat(80));
console.log('🔍 DIAGNÓSTICO COMPLETO DEL SISTEMA - Agent-Sales-Bot');
console.log('='.repeat(80) + '\n');

const issues = [];
const warnings = [];
const improvements = [];

// 1. Verificar estructura de carpetas
console.log('📁 Verificando estructura de carpetas...');
const requiredDirs = [
  'artifacts/api-server',
  'artifacts/ventas-pro',
  'lib/db',
  'lib/api-zod',
  'packages'
];

requiredDirs.forEach(dir => {
  if (fs.existsSync(dir)) {
    console.log(`  ✅ ${dir}`);
  } else {
    console.log(`  ❌ ${dir} - FALTA`);
    issues.push(`Carpeta faltante: ${dir}`);
  }
});

// 2. Verificar archivos de configuración críticos
console.log('\n⚙️  Verificando archivos de configuración...');
const configFiles = [
  '.env',
  'package.json',
  'pnpm-workspace.yaml',
  'tsconfig.json',
  'Dockerfile'
];

configFiles.forEach(file => {
  if (fs.existsSync(file)) {
    const size = fs.statSync(file).size;
    console.log(`  ✅ ${file} (${size} bytes)`);
  } else {
    console.log(`  ❌ ${file} - FALTA`);
    issues.push(`Archivo faltante: ${file}`);
  }
});

// 3. Verificar variables de entorno críticas
console.log('\n🔐 Verificando variables de entorno...');
const envFile = '.env';
if (fs.existsSync(envFile)) {
  const envContent = fs.readFileSync(envFile, 'utf-8');
  const requiredEnvVars = [
    'DATABASE_URL',
    'PORT',
    'GITHUB_TOKEN',
    'NVIDIA_API_KEY',
    'OPENROUTER_API_KEY'
  ];

  requiredEnvVars.forEach(varName => {
    if (envContent.includes(varName)) {
      const hasValue = envContent.includes(`${varName}=`) && 
                      !envContent.includes(`${varName}=your-`);
      if (hasValue) {
        console.log(`  ✅ ${varName} - Configurado`);
      } else {
        console.log(`  ⚠️  ${varName} - Placeholder`);
        warnings.push(`${varName} tiene valor placeholder`);
      }
    } else {
      console.log(`  ❌ ${varName} - NO ENCONTRADO`);
      issues.push(`Variable de entorno faltante: ${varName}`);
    }
  });
}

// 4. Verificar dependencias principales
console.log('\n📦 Verificando dependencias principales...');
const packageJsonPath = 'artifacts/api-server/package.json';
if (fs.existsSync(packageJsonPath)) {
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
  const criticalDeps = [
    'express',
    '@whiskeysockets/baileys',
    'drizzle-orm',
    'zod',
    'pino'
  ];

  criticalDeps.forEach(dep => {
    if (packageJson.dependencies[dep]) {
      console.log(`  ✅ ${dep} - ${packageJson.dependencies[dep]}`);
    } else {
      console.log(`  ❌ ${dep} - FALTA`);
      issues.push(`Dependencia faltante: ${dep}`);
    }
  });
}

// 5. Verificar archivos de rutas
console.log('\n🛣️  Verificando rutas API...');
const routesDir = 'artifacts/api-server/src/routes';
if (fs.existsSync(routesDir)) {
  const routes = fs.readdirSync(routesDir).filter(f => f.endsWith('.ts'));
  console.log(`  ✅ ${routes.length} rutas encontradas`);
  if (routes.length < 10) {
    warnings.push(`Solo ${routes.length} rutas encontradas (esperadas 15+)`);
  }
} else {
  issues.push('Carpeta de rutas no encontrada');
}

// 6. Verificar base de datos
console.log('\n🗄️  Verificando configuración de BD...');
const dbConfigPath = 'lib/db/drizzle.config.ts';
if (fs.existsSync(dbConfigPath)) {
  console.log(`  ✅ Configuración Drizzle encontrada`);
} else {
  issues.push('Configuración Drizzle no encontrada');
}

// 7. Verificar scripts de build
console.log('\n🔨 Verificando scripts de build...');
const rootPackageJson = JSON.parse(fs.readFileSync('package.json', 'utf-8'));
const requiredScripts = ['build', 'dev', 'typecheck'];
requiredScripts.forEach(script => {
  if (rootPackageJson.scripts[script]) {
    console.log(`  ✅ Script '${script}' definido`);
  } else {
    console.log(`  ❌ Script '${script}' - FALTA`);
    issues.push(`Script faltante: ${script}`);
  }
});

// 8. Verificar archivos de documentación
console.log('\n📚 Verificando documentación...');
const docFiles = [
  'ARCHITECTURE_COMPLETE.md',
  'FINAL_SUMMARY.md',
  'README_INICIO_RAPIDO.md'
];

docFiles.forEach(file => {
  if (fs.existsSync(file)) {
    console.log(`  ✅ ${file}`);
  } else {
    console.log(`  ⚠️  ${file} - No encontrado`);
  }
});

// 9. Verificar archivos de prueba
console.log('\n🧪 Verificando archivos de prueba...');
const testFiles = fs.readdirSync('.').filter(f => f.startsWith('test-') && f.endsWith('.js'));
console.log(`  ✅ ${testFiles.length} archivos de prueba encontrados`);

// 10. Verificar tamaño de node_modules
console.log('\n💾 Verificando tamaño de dependencias...');
if (fs.existsSync('node_modules')) {
  try {
    const size = execSync('du -sh node_modules 2>nul || echo "N/A"', { encoding: 'utf-8' }).trim();
    console.log(`  ℹ️  node_modules: ${size}`);
  } catch (e) {
    console.log(`  ℹ️  node_modules: Presente`);
  }
}

// RESUMEN
console.log('\n' + '='.repeat(80));
console.log('📊 RESUMEN DEL DIAGNÓSTICO');
console.log('='.repeat(80) + '\n');

console.log(`❌ ERRORES CRÍTICOS: ${issues.length}`);
if (issues.length > 0) {
  issues.forEach(issue => console.log(`   • ${issue}`));
}

console.log(`\n⚠️  ADVERTENCIAS: ${warnings.length}`);
if (warnings.length > 0) {
  warnings.forEach(warning => console.log(`   • ${warning}`));
}

console.log(`\n✅ ESTADO: ${issues.length === 0 ? 'SISTEMA LISTO' : 'REQUIERE CORRECCIONES'}`);

// Recomendaciones
console.log('\n' + '='.repeat(80));
console.log('💡 RECOMENDACIONES DE MEJORA');
console.log('='.repeat(80) + '\n');

const recommendations = [
  '1. Ejecutar: pnpm install (para instalar todas las dependencias)',
  '2. Ejecutar: pnpm run build (para compilar el proyecto)',
  '3. Ejecutar: pnpm run typecheck (para verificar tipos TypeScript)',
  '4. Configurar variables de entorno en .env con valores reales',
  '5. Ejecutar: pnpm run dev (para iniciar en desarrollo)',
  '6. Verificar conexión a PostgreSQL',
  '7. Ejecutar migraciones de BD: pnpm run db:migrate',
  '8. Ejecutar tests: pnpm run test'
];

recommendations.forEach(rec => console.log(`  ${rec}`));

console.log('\n' + '='.repeat(80) + '\n');

process.exit(issues.length > 0 ? 1 : 0);
