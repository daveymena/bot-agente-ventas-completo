const data = require('./productos-completos-cop.json');

console.log(`\n📦 Total de productos: ${data.length}\n`);

console.log('📊 Productos por categoría:');
const cats = {};
data.forEach(p => cats[p.category] = (cats[p.category] || 0) + 1);
Object.entries(cats).sort((a,b) => b[1] - a[1]).forEach(([cat, count]) => {
  console.log(`   ${cat}: ${count} productos`);
});

console.log(`\n💰 Últimos 5 productos (incluye megapack):`);
data.slice(-5).forEach(p => {
  console.log(`\n${p.id}. ${p.name}`);
  console.log(`   Precio: ${p.price.toLocaleString('es-CO')} COP`);
  console.log(`   Categoría: ${p.category}`);
  console.log(`   Descripción: ${p.description.substring(0, 80)}...`);
});

console.log(`\n\n🎯 Producto PIANO (Megapack completo):`);
const piano = data.find(p => p.price === 60000);
if (piano) {
  console.log(`   ID: ${piano.id}`);
  console.log(`   Nombre: ${piano.name}`);
  console.log(`   Precio: ${piano.price.toLocaleString('es-CO')} COP`);
  console.log(`   Descripción: ${piano.description}`);
}
