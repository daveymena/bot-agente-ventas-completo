/** Prueba local del motor de video: genera el anuncio del primer producto físico (o el id que se pase). */
import { ensureDbReady, products } from "@workspace/db";
import { eq } from "drizzle-orm";
await ensureDbReady?.();
const { db } = await import("@workspace/db");
const id = Number(process.argv[2]) || 0;
const [p] = id ? await db.select().from(products).where(eq(products.id, id)).limit(1) : await db.select().from(products).limit(1);
if (!p) { console.log("sin producto"); process.exit(1); }
console.log("Producto:", (p as any).id, (p as any).name, "tenant", (p as any).tenantId);
const { generarVideoDeAnuncio } = await import("../src/lib/video-anuncio");
const t0 = Date.now();
const r = await generarVideoDeAnuncio(Number((p as any).tenantId), Number((p as any).id));
console.log(JSON.stringify({ ...r, ms: Date.now() - t0 }, null, 2).slice(0, 2500));
process.exit(r.ok ? 0 : 1);
