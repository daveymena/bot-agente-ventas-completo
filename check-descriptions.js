const fs = require('fs');
const data = JSON.parse(fs.readFileSync('productos-db-completo.json', 'utf8'));

console.log('\n📋 Verificando descripciones...\n');

const withCert = data.filter(p => 
  p.description.toLowerCase().includes('certificad') || 
  p.description.toLowerCase().includes('suscripción') ||
  p.description.toLowerCase().includes('suscripcion')
);

console.log(`Total de productos: ${data.length}`);
console.log(`Productos SIN certificados/suscripciones: ${data.length - withCert.length}`);

if (withCert.length > 0) {
  console.log(`\n⚠️  Productos que aún mencionan certificados/suscripciones: ${withCert.length}`);
  withCert.forEach(p => console.log(`   - ${p.name}`));
} else {
  console.log('\n✅ ¡Perfecto! Ningún producto menciona certificados o suscripciones');
}

console.log('\n📦 Ejemplos de descripciones actualizadas:\n');
data.slice(0, 3).forEach((p, i) => {
  console.log(`${i + 1}. ${p.name}`);
  console.log(`   ${p.description.substring(0, 120)}...\n`);
});
