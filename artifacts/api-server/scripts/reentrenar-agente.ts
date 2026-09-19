/**
 * REENTRENAR EL VENDEDOR DE WHATSAPP DESDE CERO (consola)
 *
 * La lógica vive en src/lib/reentrenar-agente.ts (la misma que usa Atlas con
 * la herramienta `agente_reentrenar`). Ver ahí qué borra y qué siembra.
 *
 * Uso (desde artifacts/api-server, contra la base que diga el .env):
 *   npx tsx scripts/reentrenar-agente.ts                 → muestra qué haría
 *   npx tsx scripts/reentrenar-agente.ts --aplicar       → lo hace
 *   npx tsx scripts/reentrenar-agente.ts --tenant 2 --aplicar
 */
import { ensureDbReady } from "@workspace/db";

await ensureDbReady();
const { planDeReentrenamiento, aplicarReentrenamiento } = await import("../src/lib/reentrenar-agente");

const argv = process.argv.slice(2);
const APLICAR = argv.includes("--aplicar");
const TENANT = Number(argv[argv.indexOf("--tenant") + 1]) || 1;

console.log(`\n🧠 Reentrenar el vendedor de WhatsApp — negocio ${TENANT} — ${APLICAR ? "APLICANDO" : "SIMULACIÓN (agregá --aplicar para hacerlo)"}\n`);
const plan = await planDeReentrenamiento(TENANT);
console.log(`1) Lecciones automáticas a borrar: ${plan.lecciones.length}`);
for (const l of plan.lecciones.slice(0, 5)) console.log(`   · [${l.id}] ${l.title.slice(0, 90)}`);
if (plan.lecciones.length > 5) console.log(`   · … y ${plan.lecciones.length - 5} más`);
console.log(`\n2) Prompt base → ${plan.agentes.length} agente(s): ${plan.agentes.map((a) => a.name).join(", ") || "(ninguno)"}`);
console.log(`   tenants.agent_prompt actual: ${plan.agentPromptActual ? `${plan.agentPromptActual} caracteres → se vacía` : "(vacío)"}`);
console.log(`\n3) Conocimiento base: se reemplazan ${plan.baseVieja.length} fila(s) [base] por ${plan.conocimiento.length} nuevas`);
for (const f of plan.conocimiento) console.log(`   · ${f.pregunta}${f.productId ? ` (producto ${f.productId})` : " (todos)"}`);
for (const o of plan.omitidas) console.log(`   ⚠️ ${o}`);

if (!APLICAR) {
  console.log("\nNada cambió. Para aplicar: npx tsx scripts/reentrenar-agente.ts --aplicar\n");
  process.exit(0);
}
const hecho = await aplicarReentrenamiento(TENANT);
console.log(`\n✅ Listo: ${hecho.lecciones.length} lecciones borradas, prompt base en ${hecho.agentes.length} agente(s), ${hecho.conocimiento.length} respuestas base cargadas.`);
console.log("   Aplica en el próximo mensaje. Para borrar también las conversaciones: scripts/reset-conversations.ts\n");
process.exit(0);
