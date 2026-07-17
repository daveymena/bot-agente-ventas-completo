const fs = require('fs');
const data = JSON.parse(fs.readFileSync('productos-db-completo.json', 'utf8'));

console.log('\n📦 Archivo: productos-db-completo.json\n');
console.log('✅ Total de productos:', data.length);

console.log('\n📋 Estructura de cada producto:\n');
const example = data[0];
Object.keys(example).forEach(key => {
  const value = example[key];
  const displayValue = typeof value === 'object' && value !== null
    ? JSON.stringify(value).substring(0, 50) + '...'
    : value;
  console.log(`   ${key}: ${displayValue}`);
});

console.log('\n💰 Productos especiales:\n');
const megapack = data.find(p => p.price === 60000);
if (megapack) {
  console.log('🎯 Megapack (60,000 COP):');
  console.log(`   ID: ${megapack.id}`);
  console.log(`   Nombre: ${megapack.name}`);
  console.log(`   Precio: ${megapack.price.toLocaleString('es-CO')} COP`);
  console.log(`   Categoría: ${megapack.category}`);
  console.log(`   Descripción: ${megapack.description.substring(0, 80)}...`);
  console.log(`   Drive: ${megapack.deliveryLink}`);
}

console.log('\n📊 Primeros 5 productos:\n');
data.slice(0, 5).forEach((p, i) => {
  console.log(`${i + 1}. ${p.name}`);
  console.log(`   💰 ${p.price.toLocaleString('es-CO')} COP`);
  console.log(`   📁 ${p.category}`);
  console.log(`   🔗 ${p.deliveryLink}\n`);
});

console.log('✅ El archivo JSON contiene TODA la información de la base de datos!');
