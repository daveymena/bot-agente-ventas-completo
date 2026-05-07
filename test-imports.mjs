#!/usr/bin/env node

/**
 * Script para verificar que los imports funcionan correctamente
 */

console.log('🧪 Verificando imports...\n');

try {
  console.log('1. Importando db...');
  const dbModule = await import('./lib/db/src/schema/index.ts');
  console.log('✅ db importado correctamente');
  
  console.log('\n2. Verificando exports...');
  const exports = Object.keys(dbModule);
  console.log(`   Exports encontrados: ${exports.length}`);
  
  console.log('\n3. Buscando subscriptions...');
  if (dbModule.subscriptions) {
    console.log('✅ subscriptions encontrado');
  } else {
    console.log('❌ subscriptions NO encontrado');
  }
  
  console.log('\n4. Buscando paymentTransactions...');
  if (dbModule.paymentTransactions) {
    console.log('✅ paymentTransactions encontrado');
  } else {
    console.log('❌ paymentTransactions NO encontrado');
  }
  
  console.log('\n5. Todos los exports:');
  exports.forEach(exp => {
    if (exp.includes('subscription') || exp.includes('payment') || exp.includes('Payment')) {
      console.log(`   - ${exp}`);
    }
  });
  
  console.log('\n✅ Verificación completada');
  
} catch (error) {
  console.error('❌ Error:', error.message);
  console.error(error.stack);
  process.exit(1);
}
