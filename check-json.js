const data = require('./products-full.json');
console.log('Total productos en JSON:', data.length);
console.log('\nPrimeros 5 productos:');
data.slice(0, 5).forEach((p, i) => {
  console.log(`\n${i + 1}. ${p.name}`);
  console.log(`   Precio: $${p.price}`);
  console.log(`   Categoría: ${p.category}`);
  console.log(`   Drive URL: ${p.drive_url}`);
});
