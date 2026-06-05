#!/usr/bin/env node

/**
 * Script de verificación del sistema de pagos
 * Verifica que todos los componentes estén funcionando correctamente
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const BASE_URL = 'http://localhost:3002';
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function success(message) {
  log(`✅ ${message}`, 'green');
}

function error(message) {
  log(`❌ ${message}`, 'red');
}

function info(message) {
  log(`ℹ️  ${message}`, 'cyan');
}

function warning(message) {
  log(`⚠️  ${message}`, 'yellow');
}

async function testHealthCheck() {
  info('Verificando que el servidor está corriendo...');
  try {
    const response = await fetch(`${BASE_URL}/api/health`);
    const data = await response.json();
    
    if (response.ok && data.status === 'ok') {
      success('Servidor está corriendo correctamente');
      return true;
    } else {
      error('Servidor respondió pero con estado incorrecto');
      return false;
    }
  } catch (err) {
    error(`Servidor no está corriendo: ${err.message}`);
    error('Por favor inicia el servidor con: npm run dev');
    return false;
  }
}

async function testGetPlans() {
  info('Verificando endpoint GET /api/pricing...');
  try {
    const response = await fetch(`${BASE_URL}/api/pricing`);
    const data = await response.json();
    
    if (response.ok && data.plans && Array.isArray(data.plans)) {
      success(`Endpoint GET /api/pricing funciona (${data.plans.length} planes encontrados)`);
      
      // Verificar que los planes tienen la estructura correcta
      const plan = data.plans[0];
      if (plan.id && plan.name && typeof plan.price === 'number') {
        success('Estructura de planes es correcta');
      } else {
        warning('Estructura de planes parece incorrecta');
      }
      
      return true;
    } else {
      error('Endpoint GET /api/pricing falló');
      console.log('Response:', data);
      return false;
    }
  } catch (err) {
    error(`Error en GET /api/pricing: ${err.message}`);
    return false;
  }
}

async function testUpgradeEndpointWithoutAuth() {
  info('Verificando que POST /api/pricing/upgrade requiere autenticación...');
  try {
    const response = await fetch(`${BASE_URL}/api/pricing/upgrade`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        newPlan: 'starter',
        billingCycle: 'monthly',
        paymentMethod: 'mercadopago',
      }),
    });
    
    if (response.status === 401) {
      success('Endpoint POST /api/pricing/upgrade requiere autenticación correctamente');
      return true;
    } else {
      warning(`Endpoint devolvió status ${response.status} en lugar de 401`);
      return false;
    }
  } catch (err) {
    error(`Error en POST /api/pricing/upgrade: ${err.message}`);
    return false;
  }
}

async function testDatabaseTables() {
  info('Verificando que las tablas de base de datos existen...');
  
  // Importar pg
  try {
    const pg = await import('pg');
    const { Client } = pg.default;
    
    const client = new Client({
      host: '79.143.187.160',
      port: 5432,
      user: 'postgres',
      password: '6715320Dvd',
      database: 'tecnovariedades-db',
    });
    
    await client.connect();
    
    // Verificar tabla subscriptions
    const subsResult = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'subscriptions'
      );
    `);
    
    if (subsResult.rows[0].exists) {
      success('Tabla "subscriptions" existe');
    } else {
      error('Tabla "subscriptions" NO existe');
    }
    
    // Verificar tabla payment_transactions
    const txResult = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'payment_transactions'
      );
    `);
    
    if (txResult.rows[0].exists) {
      success('Tabla "payment_transactions" existe');
    } else {
      error('Tabla "payment_transactions" NO existe');
    }
    
    await client.end();
    return true;
  } catch (err) {
    error(`Error verificando base de datos: ${err.message}`);
    return false;
  }
}

async function testEnvironmentVariables() {
  info('Verificando variables de entorno...');
  
  const requiredVars = [
    'MERCADO_PAGO_ACCESS_TOKEN',
    'PAYPAL_CLIENT_ID',
    'PAYPAL_CLIENT_SECRET',
    'PAYPAL_MODE',
  ];
  
  let allPresent = true;
  
  for (const varName of requiredVars) {
    if (process.env[varName]) {
      success(`Variable ${varName} está configurada`);
    } else {
      error(`Variable ${varName} NO está configurada`);
      allPresent = false;
    }
  }
  
  return allPresent;
}

async function testWebhookEndpoints() {
  info('Verificando que los endpoints de webhooks existen...');
  
  const webhooks = [
    '/api/webhooks/subscription/mercadopago',
    '/api/webhooks/subscription/paypal',
  ];
  
  let allExist = true;
  
  for (const webhook of webhooks) {
    try {
      const response = await fetch(`${BASE_URL}${webhook}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      
      // Los webhooks deben responder (aunque sea con error por datos inválidos)
      if (response.status !== 404) {
        success(`Webhook ${webhook} existe`);
      } else {
        error(`Webhook ${webhook} NO existe (404)`);
        allExist = false;
      }
    } catch (err) {
      error(`Error verificando webhook ${webhook}: ${err.message}`);
      allExist = false;
    }
  }
  
  return allExist;
}

async function runAllTests() {
  log('\n🧪 INICIANDO VERIFICACIÓN DEL SISTEMA DE PAGOS\n', 'blue');
  
  const results = {
    healthCheck: await testHealthCheck(),
    getPlans: false,
    upgradeAuth: false,
    database: false,
    envVars: false,
    webhooks: false,
  };
  
  if (results.healthCheck) {
    results.getPlans = await testGetPlans();
    results.upgradeAuth = await testUpgradeEndpointWithoutAuth();
    results.webhooks = await testWebhookEndpoints();
  }
  
  // Tests que no requieren servidor
  results.database = await testDatabaseTables();
  
  // Resumen
  log('\n📊 RESUMEN DE VERIFICACIÓN\n', 'blue');
  
  const total = Object.keys(results).length;
  const passed = Object.values(results).filter(r => r).length;
  const failed = total - passed;
  
  log(`Total de pruebas: ${total}`, 'cyan');
  log(`Pasadas: ${passed}`, 'green');
  log(`Fallidas: ${failed}`, failed > 0 ? 'red' : 'green');
  
  if (failed === 0) {
    log('\n🎉 ¡TODAS LAS PRUEBAS PASARON! El sistema está funcionando correctamente.\n', 'green');
  } else {
    log('\n⚠️  Algunas pruebas fallaron. Revisa los errores arriba.\n', 'yellow');
  }
  
  // Instrucciones finales
  log('📝 PRÓXIMOS PASOS:\n', 'blue');
  log('1. Asegúrate de que el servidor backend está corriendo:', 'cyan');
  log('   cd artifacts/api-server && npm run dev\n', 'reset');
  log('2. Asegúrate de que el frontend está compilado:', 'cyan');
  log('   cd artifacts/ventas-pro && npm run build\n', 'reset');
  log('3. Abre el navegador en: http://localhost:5173/pricing', 'cyan');
  log('4. Inicia sesión si no lo has hecho', 'cyan');
  log('5. Selecciona un plan y prueba el pago\n', 'cyan');
  
  process.exit(failed > 0 ? 1 : 0);
}

// Ejecutar tests
runAllTests().catch(err => {
  error(`Error fatal: ${err.message}`);
  console.error(err);
  process.exit(1);
});
