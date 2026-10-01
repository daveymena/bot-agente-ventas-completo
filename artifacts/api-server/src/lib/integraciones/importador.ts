/**
 * Importador COMÚN: de ProductoExterno a la tabla `products`.
 *
 * El MISMO mapeo que WooCommerceService.syncProducts (woocommerce.ts):
 * categoriaReal → asegurarCategoria → customerProductCopy → kind real.
 * Upsert por (tenantId, sku): si existe se actualiza, si no se crea.
 */
import { db, products } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { logger } from "../logger";
import { skuDe, type Plataforma, type ProductoExterno, type ResultadoImport } from "./tipos";

export function limpiarHtml(html: unknown): string {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

export async function importarProductos(
  tenantId: number,
  plataforma: Plataforma,
  externos: ProductoExterno[],
  monedaDefecto = "COP",
): Promise<ResultadoImport> {
  const { categoriaReal } = await import("../taxonomia");
  const { asegurarCategoria } = await import("../categorias");
  const { customerProductCopy } = await import("../dropi");
  const res: ResultadoImport = { importados: 0, actualizados: 0, errores: 0, detalles: [] };

  for (const ext of externos) {
    const sku = skuDe(plataforma, ext.idExterno);
    try {
      const nombre = String(ext.nombre || "").trim().slice(0, 200) || `Producto ${ext.idExterno}`;
      const descripcionLimpia = limpiarHtml(ext.descripcion).slice(0, 1200) || nombre;
      const esDigital = !!ext.digital;
      const categoria = esDigital
        ? "General"
        : categoriaReal({
            nombre,
            categoriaSugerida: ext.categoriaSugerida || undefined,
            categoriaProveedor: ext.categoriaSugerida || null,
            descripcion: descripcionLimpia.slice(0, 500),
          });
      const categoryId = await asegurarCategoria(tenantId, categoria, esDigital ? "digital" : "physical");
      const imagenes = (ext.imagenes || []).filter(Boolean).slice(0, 20);
      const fila = {
        tenantId,
        name: nombre,
        description: customerProductCopy(descripcionLimpia, nombre),
        price: String(Number(ext.precio) || 0),
        currency: ext.moneda || monedaDefecto,
        sku,
        category: categoria,
        categoryId,
        kind: esDigital ? "digital" : "physical",
        stock: ext.stock ?? null,
        imageUrl: imagenes[0] || null,
        features: (ext.variantes || []).slice(0, 20),
        isActive: !!ext.activo,
        metadata: JSON.stringify({
          source: plataforma,
          [plataforma]: { id: ext.idExterno, imageUrls: imagenes, videoUrl: ext.videoUrl || null, url: ext.urlOrigen || null, ...ext.extra },
        }),
      } as any;

      const [previo] = await db.select({ id: products.id })
        .from(products)
        .where(and(eq(products.tenantId, tenantId), eq(products.sku, sku)))
        .limit(1);
      if (previo) {
        await db.update(products).set(fila).where(eq(products.id, previo.id));
        res.actualizados++;
      } else {
        await db.insert(products).values(fila);
        res.importados++;
      }
    } catch (e: any) {
      res.errores++;
      res.detalles.push(`${sku}: ${e?.message || e}`.slice(0, 200));
      logger.warn({ tenantId, plataforma, sku, err: e?.message }, "[Integraciones] no se pudo importar el producto");
    }
  }
  logger.info({ tenantId, plataforma, ...res }, "[Integraciones] importación terminada");
  return res;
}
