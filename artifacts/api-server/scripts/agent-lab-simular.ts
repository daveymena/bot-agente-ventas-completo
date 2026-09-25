/**
 * AGENT LAB — Script CLI para simular y entrenar agentes.
 *
 * Uso:
 *   pnpm --filter @workspace/api-server exec tsx scripts/agent-lab-simular.ts <tenant> <producto> [arquetipos]
 *
 * Ejemplo:
 *   pnpm --filter @workspace/api-server exec tsx scripts/agent-lab-simular.ts 1 piano NORMAL,DESCONFIADO,PRECIO_SENSIBLE
 *
 * Si no se especifican arquetipos, corre TODOS los 14.
 */

import { ensureDbReady, products } from "@workspace/db";
import { eq } from "drizzle-orm";
import { correrMultiplesSimulaciones } from "../src/lib/motor-nuevo/simulador-agente";
import { obtenerPerfil, ARQUETIPOS_CLIENTE } from "../src/lib/motor-nuevo/cliente-simulado";
import { armarCadena, crearClienteLLM } from "../src/lib/motor-nuevo/cliente-llm";
import { extraerHallazgosDeSimulaciones, agruparHallazgos } from "../src/lib/agent-lab-mejora";

async function main() {
  const TENANT = parseInt(process.argv[2] || "1", 10);
  const PRODUCTO = (process.argv[3] || "piano").toLowerCase();
  const ARQUETIPOS_ARG = process.argv[4] || "";

  console.log(`\n🤖 AGENT LAB — Simulador de entrenamiento`);
  console.log(`   Tenant: ${TENANT}`);
  console.log(`   Producto: ${PRODUCTO}`);

  // Carga contexto
  const { db } = await ensureDbReady();
  const productos = await db
    .select()
    .from(products)
    .where(eq(products.tenantId, TENANT));

  const productoEncontrado = productos.find((p) =>
    (p as any).name.toLowerCase().includes(PRODUCTO),
  );

  if (!productoEncontrado) {
    console.log(`\n❌ Producto "${PRODUCTO}" no encontrado. Disponibles:`);
    for (const p of productos) {
      console.log(`   - ${(p as any).name}`);
    }
    process.exit(1);
  }

  // Arquetipos a simular
  let arquetiposACorrer = Object.values(ARQUETIPOS_CLIENTE);

  if (ARQUETIPOS_ARG.trim()) {
    const claves = ARQUETIPOS_ARG.split(",").map((s) => s.trim().toUpperCase());
    arquetiposACorrer = claves
      .map((clave) => {
        try {
          return obtenerPerfil(clave);
        } catch {
          console.warn(`⚠️  Arquetipo desconocido: ${clave}`);
          return null;
        }
      })
      .filter((a) => a !== null) as any;
  }

  console.log(`   Arquetipos: ${arquetiposACorrer.length}`);
  console.log(`\n${"═".repeat(80)}\n`);

  // Configura LLM
  const llmConfig = {
    cadena: await armarCadena({ tenantId: TENANT }),
    tenantId: TENANT,
  };

  // Corre simulaciones
  console.log(`▶️  Simulando...\n`);
  const resultados = await correrMultiplesSimulaciones({
    tenantId: TENANT,
    perfiles: arquetiposACorrer,
    productoId: (productoEncontrado as any).id,
    llmConfig,
    maxTurnos: 8,
  });

  // Análisis
  const totalTurnos = resultados.reduce((s, r) => s + r.turnos.length, 0);
  const compras = resultados.filter((r) => r.cerroEn === "compra").length;
  const abandonos = resultados.filter((r) => r.cerroEn === "abandono").length;

  console.log(`\n${"═".repeat(80)}\n`);
  console.log(`RESUMEN`);
  console.log(`   Simulaciones: ${resultados.length}`);
  console.log(`   Turnos totales: ${totalTurnos}`);
  console.log(`   Compras: ${compras}/${resultados.length} (${((compras / resultados.length) * 100).toFixed(0)}%)`);
  console.log(`   Abandonos: ${abandonos}/${resultados.length}`);

  // Hallazgos agrupados
  const hallazgos = extraerHallazgosDeSimulaciones(resultados);
  if (hallazgos.length > 0) {
    const agrupados = agruparHallazgos(hallazgos);
    console.log(`\n⚠️  PROBLEMAS DETECTADOS (${hallazgos.length} total):\n`);
    for (const [desc, freq] of Array.from(agrupados.entries()).sort((a, b) => b[1] - a[1])) {
      console.log(`   ${freq > 1 ? `[${freq}x]` : "    "} ${desc}`);
    }
  } else {
    console.log(`\n✅ Sin problemas detectados.`);
  }

  // Detalle por arquetipo
  console.log(`\n${"═".repeat(80)}\n`);
  console.log(`DETALLE POR ARQUETIPO\n`);

  for (const resultado of resultados) {
    const icono =
      resultado.cerroEn === "compra" ? "✅" : resultado.cerroEn === "abandono" ? "❌" : "⏱️";
    console.log(`${icono} ${resultado.perfilCliente.nombre}`);
    console.log(`   Cierre: ${resultado.cerroEn}, ${resultado.turnos.length} turnos`);

    if (resultado.resumenProblemas.length > 0) {
      console.log(`   Problemas:`);
      for (const p of resultado.resumenProblemas.slice(0, 3)) {
        console.log(`     - ${p.problema}`);
      }
      if (resultado.resumenProblemas.length > 3) {
        console.log(`     ... y ${resultado.resumenProblemas.length - 3} más`);
      }
    }
    console.log();
  }

  console.log(`${"═".repeat(80)}\n`);
  console.log(`✅ Simulación completa`);
  console.log(`\nProximos pasos:`);
  console.log(`  1. Si hay problemas, úsalos para mejorar el prompt.`);
  console.log(`  2. Desde Atlas: "simulá clientes difíciles para ${productoEncontrado.name}" (agentlab_simular)`);
  console.log(`  3. "Proponé una mejora" (agentlab_mejorar)`);
  console.log(`  4. "Compará versiones" (agentlab_comparar)`);
  console.log(`  5. "Aplicá la versión" (agentlab_aplicar_version)\n`);
}

main().catch((e) => {
  console.error(`\n💥 Error:`, e.message);
  process.exit(1);
});
