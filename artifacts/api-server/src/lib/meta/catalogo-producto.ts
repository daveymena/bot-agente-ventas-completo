/**
 * Payload de un producto para el catálogo de Meta (Marketing API /products).
 *
 * Campos según la referencia de Meta: `name` y `retailer_id` identifican el
 * producto; `description`, `price`, `image_url`, `url`, `availability` y
 * `condition` son obligatorios. Antes el sistema mandaba `title` y `sku`,
 * que no son los nombres de Meta, y dejaba `image_url` y `url` vacíos cuando
 * faltaban. Aquí se valida antes de enviar y se dice el motivo exacto.
 */

export interface ProductoParaCatalogo {
  id: number;
  name: string;
  description?: string | null;
  price: number | string;
  imageUrl?: string | null;
  isActive?: boolean;
}

export interface OpcionesCatalogo {
  /** Dominio público de la app, sin barra final. Ej: https://ventasproia.com */
  appUrl: string;
  moneda: string;
  marca: string;
}

export type ResultadoPayload =
  | { ok: true; payload: Record<string, string> }
  | { ok: false; motivos: string[] };

const MAX_NOMBRE = 100;
const MAX_DESCRIPCION = 5000;

function httpsAbsoluta(url: unknown): string | null {
  if (typeof url !== "string") return null;
  const u = url.trim();
  return /^https:\/\/[^\s]+$/i.test(u) ? u : null;
}

export function payloadProductoCatalogo(p: ProductoParaCatalogo, op: OpcionesCatalogo): ResultadoPayload {
  const motivos: string[] = [];

  const nombre = String(p.name ?? "").replace(/\s+/g, " ").trim();
  if (!nombre) motivos.push("le falta el nombre");

  const precio = Number(p.price);
  if (!Number.isFinite(precio) || precio <= 0) motivos.push("el precio no es válido (debe ser mayor que cero)");

  const imagen = httpsAbsoluta(p.imageUrl);
  if (!imagen) motivos.push("no tiene imagen pública (https); Meta la exige");

  const base = String(op.appUrl || "").replace(/\/$/, "");
  const enlace = httpsAbsoluta(`${base}/p/${p.id}`);
  if (!enlace) motivos.push("APP_URL no es una dirección https pública: no se puede armar el enlace del producto");

  // Meta pide descripción: si falta, se usa el nombre antes que dejarla vacía.
  const descripcion = String(p.description ?? "").replace(/\s+/g, " ").trim();

  if (motivos.length) return { ok: false, motivos };

  return {
    ok: true,
    payload: {
      name: nombre.slice(0, MAX_NOMBRE),
      retailer_id: `PROD-${p.id}`,
      description: (descripcion || nombre).slice(0, MAX_DESCRIPCION),
      price: `${Math.round(precio)} ${op.moneda}`,
      image_url: imagen as string,
      url: enlace as string,
      availability: p.isActive === false ? "out of stock" : "in stock",
      condition: "new",
      brand: op.marca.slice(0, 100) || "VentasPro",
    },
  };
}
