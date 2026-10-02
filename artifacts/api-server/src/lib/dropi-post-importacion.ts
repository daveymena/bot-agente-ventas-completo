/**
 * Post-importación de Dropi (idea del dueño 01-10-2026).
 *
 * Al importar un producto NUEVO de Dropi, en segundo plano y sin bloquear:
 *  1. se buscan los activos del fabricante (fotos + video de AliExpress, con
 *     visión; o con la API de afiliados si está conectada),
 *  2. se arma la landing en BORRADOR (nunca publicada sola),
 * y se le avisa al dueño por WhatsApp cuando cada cosa termina.
 *
 * No lanza nada si el producto ya existía (re-importar no duplica trabajo)
 * ni si el producto ya tiene landing (solo faltarían los activos).
 * Nunca lanza: un fallo acá no puede romper la importación.
 */
import { db, landingPages, products } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { logger } from "./logger";

function slugDe(nombre: string): string {
  return (
    String(nombre || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) ||
    "landing"
  );
}

export function lanzarPostImportacion(tenantId: number, productId: number): void {
  void (async () => {
    try {
      const [prod] = await db.select().from(products)
        .where(and(eq(products.id, productId), eq(products.tenantId, tenantId))).limit(1);
      if (!prod) return;
      const nombre = String((prod as any).name || `producto ${productId}`);

      // 1) Activos del fabricante en segundo plano, avisando al terminar.
      try {
        const { buscarActivosEnSegundoPlano } = await import("./activos-fabricante");
        const { avisarAlDueno } = await import("./avisos");
        const estado = buscarActivosEnSegundoPlano(tenantId, productId, async (r) => {
          try {
            if (r.ok && r.activos) {
              await avisarAlDueno(
                tenantId,
                `📸 Activos del fabricante para "${nombre}": ${r.activos.fotos.length} fotos y ${r.activos.clips.length} clips del mismo producto (ya verificados por visión). Revisalos y aprobálos para que entren a la landing.`,
              );
            } else {
              await avisarAlDueno(
                tenantId,
                `📸 No pude traer activos del fabricante para "${nombre}": ${r.error || "sin resultados"}. La landing igual se está armando con las fotos del proveedor.`,
              );
            }
          } catch { /* avisar es accesorio */ }
        });
        logger.info({ tenantId, productId, estado }, "[PostImportacion] búsqueda de activos lanzada");
      } catch (e: any) {
        logger.warn({ err: e?.message, productId }, "[PostImportacion] no se pudo lanzar la búsqueda de activos");
      }

      // 2) Landing en borrador (solo si todavía no tiene ninguna).
      try {
        const [existe] = await db.select({ id: landingPages.id }).from(landingPages)
          .where(and(eq(landingPages.tenantId, tenantId), eq(landingPages.productId, productId)))
          .orderBy(desc(landingPages.id)).limit(1);
        if (existe) {
          logger.info({ tenantId, productId }, "[PostImportacion] ya tiene landing: no se crea otra");
          return;
        }
        const { lanzarGeneracionDeLandingEnSegundoPlano } = await import("./app-operator");
        const slug = `${slugDe(nombre)}-${Date.now().toString(36)}`;
        const [creada] = await db.insert(landingPages).values({
          tenantId, productId, name: `Landing · ${nombre}`.slice(0, 200), slug, status: "draft",
          strategy: { generando: true, desde: new Date().toISOString(), origen: "post-importacion-dropi" },
          sections: [], design: {}, source: { type: "product", productId }, html: null,
        } as any).returning();
        lanzarGeneracionDeLandingEnSegundoPlano(
          { tenantId } as any,
          {
            landingId: (creada as any).id, slug, product: prod,
            instruccion: "Genera una landing page profesional y de alta conversión para este producto recién importado de Dropi.",
            familia: null,
          },
        );
        // Avisar cuando termine (máx. ~7 min esperando; si sigue, el dueño la ve en el panel).
        void (async () => {
          try {
            const { avisarAlDueno } = await import("./avisos");
            const limite = Date.now() + 7 * 60_000;
            while (Date.now() < limite) {
              await new Promise((r) => setTimeout(r, 10_000));
              const [l] = await db.select().from(landingPages).where(eq(landingPages.id, (creada as any).id)).limit(1);
              const strategy: any = (l as any)?.strategy || {};
              if (strategy.generando) continue;
              if (strategy.error) {
                await avisarAlDueno(tenantId, `⚠️ La landing de "${nombre}" no se pudo armar sola: ${String(strategy.error).slice(0, 180)}. Pedímela por acá y la hacemos.`);
              } else {
                await avisarAlDueno(tenantId, `✅ Borrador listo para "${nombre}" (landing ${(creada as any).id}). Mirala en Landing Studio y publicala cuando te guste.`);
              }
              return;
            }
          } catch { /* avisar es accesorio */ }
        })();
        logger.info({ tenantId, productId, landingId: (creada as any).id }, "[PostImportacion] landing en borrador lanzada");
      } catch (e: any) {
        logger.warn({ err: e?.message, productId }, "[PostImportacion] no se pudo lanzar la landing");
      }
    } catch (e: any) {
      logger.warn({ err: e?.message, tenantId, productId }, "[PostImportacion] falló");
    }
  })();
}
