export {};
// diag: ¿el rótulo "✨ BENEFICIOS PRINCIPALES" de la ficha REAL ya no se cuela?
import { puntosReales, planDeAnuncio } from "../src/lib/anuncio-por-modelo";

const REAL = `👶💕 Todo lo que tu bebé necesita, organizado en un solo lugar.
La Pañalera Mochila Multifuncional 2 en 1 es el accesorio ideal para padres modernos. Su innovador diseño permite convertirla fácilmente en una práctica cuna portátil para cambiar pañales o brindar un espacio cómodo de descanso para tu bebé durante viajes, paseos o salidas.
Cuenta con múltiples compartimentos para organizar pañales, teteros, ropa, juguetes, toallitas y accesorios esenciales, manteniendo todo al alcance de la mano.
✨ Elegante, espaciosa, resistente al agua y diseñada para acompañarte en cada aventura con tu bebé.
✨ BENEFICIOS PRINCIPALES`;

const p: any = { name: "Pañalera Mochila Multifuncional 2 En 1", description: REAL, price: 110990, currency: "COP", kind: "physical", features: [] };

console.log("== puntosReales con la ficha REAL ==");
const puntos = puntosReales(p, "✔️");
console.log(puntos);
console.log("\n¿el rótulo está en la salida?:", puntos.some((t) => /BENEFICIOS PRINCIPALES/i.test(t)));

const plan = planDeAnuncio(p, { envio: { costo: "incluido", pago: "contraentrega", plazo: "3 a 5 días hábiles" } } as any);
console.log("\n== primaryText ==");
console.log(plan.primaryText);
console.log("\nheadline:", plan.headline);
console.log("description:", plan.description);
process.exit(0);