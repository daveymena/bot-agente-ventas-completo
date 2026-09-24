/**
 * Muestra el anuncio que armaría el estratega para un producto de la base
 * LOCAL (texto, creativo recomendado, objetivo y métrica). No publica nada.
 *
 *   pnpm --filter @workspace/api-server exec tsx scripts/ver-anuncio.ts corrector
 */
import { ensureDbReady, products } from "@workspace/db";
import { like } from "drizzle-orm";

const { db } = await ensureDbReady();
const { AdStrategist } = await import("../src/lib/ad-strategist");
const buscar = process.argv[2] || "corrector";
const [p] = await db.select().from(products).where(like(products.name, `%${buscar}%`)).limit(1);
if (!p) { console.log(`No está "${buscar}" en la base local`); process.exit(1); }

const s = new AdStrategist();
const r = await s.generateAdCopy(s.getStrategyForProduct(p), p);
console.log(`\n=== ${p.name} (${r.strategy.modelo}) ===\n`);
console.log(`TEXTO PRINCIPAL:\n${r.primaryText}\n`);
console.log(`TÍTULO: ${r.headline}\nDESCRIPCIÓN: ${r.description}\n`);
console.log(`OBJETIVO: ${r.strategy.objetivoRecomendado} · MÉTRICA: ${r.strategy.metricaClave}`);
console.log(`CREATIVO: ${r.strategy.creativo?.formato}`);
for (const paso of r.strategy.creativo?.estructura || []) console.log(`  · ${paso}`);
process.exit(0);
