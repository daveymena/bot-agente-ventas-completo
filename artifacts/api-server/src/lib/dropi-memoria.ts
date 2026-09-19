/**
 * Corrige la memoria de Atlas sobre Dropi.
 *
 * 19-09-2026: Atlas seguía diciendo "la API de Dropi rechaza el token del
 * panel, no puedo leer el catálogo ni el costo" cuando desde hoy el catálogo,
 * el detalle, los pedidos y el margen se leen directo (cabeceras estilo
 * WordPress). Esa frase venía de memorias viejas de sus sesiones. Acá se
 * borran las que afirman eso y se deja un hecho vigente, una sola vez por
 * negocio con token.
 */
import { db, tenants, architectMemory } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import { logger } from "./logger";

const TITULO = "Dropi directo: catálogo, costo, pedidos y margen se leen con el token del negocio";
const HECHO = [
  "Desde el 19-09-2026 la API de Dropi (api.dropi.co/integrations) SÍ responde con el token del negocio: catálogo (dropi_buscar), detalle con fotos y stock, pedidos reales con flete y transportadora (dropi_pedidos) y ganancia por producto (dropi_margen = precio − costo del proveedor − flete con recaudo medido en pedidos reales).",
  "Nunca digas que Dropi rechaza el token del panel ni que no podés saber el costo o el margen: usá dropi_margen / dropi_pedidos. Los pedidos también salen directo a Dropi (WooCommerce queda de respaldo).",
].join(" ");

export async function corregirMemoriaDeDropi(): Promise<void> {
  try {
    const filas = await db.select().from(tenants);
    for (const t of filas as any[]) {
      const tenantId = Number(t.id);
      if (!t?.apiKeys?.dropi?.apiKey) continue;
      const borradas = await db.delete(architectMemory).where(and(
        eq(architectMemory.tenantId, tenantId),
        sql`(${architectMemory.content} ~* 'rechaza (el|los|ese) token|no acepta tokens|dropi.{0,40}rechaza|access denied.{0,40}(panel|token)' or ${architectMemory.title} ~* 'rechaza (el|los) token')`,
      )).returning({ id: architectMemory.id });
      const [ya] = await db.select({ id: architectMemory.id }).from(architectMemory).where(and(eq(architectMemory.tenantId, tenantId), eq(architectMemory.title, TITULO))).limit(1);
      if (!ya) {
        await db.insert(architectMemory).values({ tenantId, sessionId: `learning_${Date.now()}`, memoryType: "fact", title: TITULO, content: HECHO, tags: ["dropi", "margen", "pedidos"], metadata: { origen: "dropi-memoria", en: new Date().toISOString() }, importance: 9 } as any);
      }
      if (borradas.length || !ya) logger.info({ tenantId, borradas: borradas.length, hechoNuevo: !ya }, "[DropiMemoria] memoria de Atlas sobre Dropi corregida");
    }
  } catch (e: any) {
    logger.warn({ err: e?.message }, "[DropiMemoria] no se pudo corregir la memoria");
  }
}

export function iniciarCorreccionDeMemoriaDropi(): void {
  setTimeout(() => { void corregirMemoriaDeDropi(); }, Number(process.env.DROPI_MEMORIA_PRIMERA_MS || 45000)).unref?.();
}
