/**
 * ¿Razona las dudas o repite maquetas? Con la IA REAL, base LOCAL.
 *
 * Regla del dueño (24-09-2026): cada maqueta (ficha, precio, pago, entrega)
 * sale UNA vez. Si el cliente vuelve a preguntar tiene una duda: se responde
 * razonando con los datos del producto, no pegando la maqueta de nuevo.
 * Además imprime lo que diría la nota de voz (texto + frase de cada maqueta).
 *
 *   pnpm --filter @workspace/api-server exec tsx scripts/simular-dudas.ts [producto]
 */
import { ensureDbReady } from "@workspace/db";
await ensureDbReady();
const { cargarCatalogoDelNegocio, cargarGuion, cargarVozDelNegocio, cargarConocimiento } = await import("../src/lib/motor-nuevo/adaptador");
const { crearClienteLLM, armarCadena } = await import("../src/lib/motor-nuevo/cliente-llm");
const { responder } = await import("../src/lib/motor-nuevo/motor");
const { estadoInicial } = await import("../src/lib/motor-nuevo/estado-conversacion");

const TENANT = 1;
const BUSCAR = (process.argv[2] || "corrector").toLowerCase();
const catalogo = await cargarCatalogoDelNegocio(TENANT);
const producto = catalogo.find((p) => p.name.toLowerCase().includes(BUSCAR));
if (!producto) { console.log(`No está "${BUSCAR}" en la base local`); process.exit(1); }
const voz = await cargarVozDelNegocio(TENANT);
const conocimiento = await cargarConocimiento(TENANT);
const llm = crearClienteLLM({ cadena: await armarCadena({ tenantId: TENANT }), tenantId: TENANT });

const GUION = /curso/.test(BUSCAR)
  ? [`hola, me interesa el ${BUSCAR}`, "cuánto vale?", "cuánto era que valía? no te entendí", "y eso me sirve si nunca he tocado nada?", "me vuelves a mandar la info?", "cómo me llega?"]
  : [`hola, me interesa el ${BUSCAR}`, "cuánto vale?", "cuánto era que valía? no te entendí", "y me sirve si tengo escoliosis?", "de qué material es? se nota debajo de la ropa?", "me vuelves a mandar la info?"];

let estado = estadoInicial(999998);
const historial: { role: "customer" | "agent"; content: string; createdAt: Date }[] = [];
const maquetas: string[] = [];
for (const texto of GUION) {
  historial.push({ role: "customer", content: texto, createdAt: new Date() });
  console.log(`\n${"─".repeat(70)}\n👤 ${texto}`);
  const guion = await cargarGuion(TENANT, catalogo, estado.productoEnFoco);
  const r = await responder({ llm, estado, historial, catalogo, conocimiento, guion, voz });
  estado = r.estado;
  const hablado: string[] = [];
  for (const p of r.partes as any[]) {
    if (p.kind === "text") { console.log(`🤖 ${String(p.content).trim()}`); hablado.push(p.content); }
    else {
      const clave = `${p.seccion}#${p.productId}`;
      console.log(`🧩 [maqueta ${clave}]${maquetas.includes(clave) ? "  ⚠️ REPETIDA" : ""}`);
      maquetas.push(clave);
      if (p.hablado) hablado.push(p.hablado);
    }
  }
  console.log(`   🎙️ voz: "${hablado.join(" ").replace(/\s+/g, " ").trim().slice(0, 300)}"`);
  const negadas = r.traza.filter((t) => /NO se volvió a enviar/.test(String(t.resultado)));
  console.log(`   · herramientas: ${r.traza.map((t) => t.herramienta).join(", ") || "ninguna"}${negadas.length ? ` · ${negadas.length} maqueta(s) frenada(s) → razonó` : ""} · tokens entrada ${r.uso.entrada} (caché ${r.uso.cacheados}) salida ${r.uso.salida}`);
  historial.push({ role: "agent", content: (r.partes as any[]).filter((p) => p.kind === "text").map((p) => p.content).join("\n"), createdAt: new Date() });
}
const repetidas = maquetas.filter((m, i) => maquetas.indexOf(m) !== i);
console.log(`\n${"═".repeat(70)}\nMaquetas enviadas: ${maquetas.join(", ")}\nRepetidas: ${repetidas.length ? repetidas.join(", ") : "ninguna ✅"}`);
process.exit(0);
