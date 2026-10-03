/**
 * REPRODUCCIÓN del fallo del probador: "dice que no lo tiene" con productos
 * que SÍ existen, y "el precio de lo que se está hablando" equivocado.
 *
 * Método: cada producto del catálogo REAL (exportado de producción el
 * 04-10) se usa como CONSULTA; la búsqueda debería devolverlo A ÉL MISMO
 * en el primer puesto. Los que no se encuentran a sí mismos (o el que lo
 * pisó otro) = los casos rotos de verdad, con la fila completa para ver
 * por qué el match falló.
 */
import { readFileSync } from "node:fs";
import { puntuarCoincidencias } from "../src/lib/motor-nuevo/herramientas";

const catalogoReal = JSON.parse(readFileSync("scripts/catalogo-real.json", "utf8")) as any[];
// El tipo que puntuarCoincidencias espera: {id,name,description,categoria,opciones,disponible,price,currency}
const catalogo = catalogoReal.map((p: any) => ({
  id: p.id, name: p.name, description: p.description, categoria: p.category,
  opciones: [], disponible: p.isActive !== false, price: Number(p.price) || 0, currency: p.currency,
}));

let solo = 0, pisado = 0, ausente = 0;
const rotas: any[] = [];
for (const p of catalogo) {
  const r = puntuarCoincidencias(p.name, catalogo, 5);
  const top = r[0];
  if (!top) { ausente++; rotas.push({ consulta: p.name, id: p.id, hallado: "NADA" }); continue; }
  if (top.p.id === p.id) { solo++; continue; }
  pisado++;
  rotas.push({
    consulta: p.name,
    suId: p.id,
    quedoPrimero: `${top.p.id} · ${top.p.name} (${top.puntos.toFixed(1)} pts)`,
    suPuntaje: puntuarCoincidencias(p.name, catalogo, 50).find((x: any) => x.p.id === p.id)?.puntos ?? 0,
  });
}
console.log(`se encuentra a sí mismo primero: ${solo}`);
console.log(`encontrado pero PISADO por otro: ${pisado}`);
console.log(`queda FUERA del resultado: ${ausente}`);
console.log("");
for (const r of rotas.slice(0, 14)) console.log(JSON.stringify(r, null, 1));
process.exit(0);