/**
 * Integraciones con plataformas externas (Shopify, AliExpress, Mercado Libre,
 * Falabella). Diseño decidido con el dueño el 01-10-2026, implementado el
 * mismo día.
 *
 * Reglas:
 *  · Las credenciales viven en `tenants.metadata.integraciones.<plataforma>`,
 *    cifradas con `encryptSecret/decryptSecret` (NO columnas nuevas: el
 *    esquema vive en 3 lugares y no se toca por una integración).
 *  · Importar = copiar a `products` con SKU estable `<origen>-<id>` y el
 *    MISMO mapeo que WooCommerce (categoriaReal, asegurarCategoria,
 *    customerProductCopy, kind real).
 *  · Pedido externo = abrirPedido + guardarDatos + marcarEstado +
 *    avisarAlDueno. NUNCA despacho automático a Dropi ni WhatsApp automático
 *    (riesgo de baneo / doble pedido si la tienda ya usa Dropify).
 */

export type Plataforma = "shopify" | "aliexpress" | "mercadolibre" | "falabella";

export const PLATAFORMAS: Plataforma[] = ["shopify", "aliexpress", "mercadolibre", "falabella"];

/** Lo que guarda cada plataforma en metadata (secretos CIFRADOS con enc:v1:). */
export interface CredencialesIntegracion {
  /** Shopify: tienda.myshopify.com · ML: seller_id · Ali: app_key · Falabella: seller id */
  tienda?: string;
  /** Shopify: shpat_… (app personalizada) · Ali: app_secret cifrado */
  token?: string;
  /** Secreto extra cifrado: webhook secret (Shopify), client_secret (ML), access token (ML/FB) */
  secreto?: string;
  /** ML/Falabella: refresh token cifrado */
  refresh?: string;
  /** ML: vence el access token (ISO) */
  expiraEn?: string;
  /** Moneda de la tienda (Shopify la lee de /shop.json) */
  moneda?: string;
  /** ML/Falabella: id del vendedor (para webhooks sin sesión) */
  vendedorId?: string;
  /** Desactivar sin borrar */
  activa?: boolean;
  actualizadaEn?: string;
}

/** Producto normalizado de CUALQUIER plataforma, listo para `products`. */
export interface ProductoExterno {
  idExterno: string;
  nombre: string;
  descripcion?: string | null;
  precio: number;
  moneda?: string;
  categoriaSugerida?: string | null;
  imagenes: string[];
  videoUrl?: string | null;
  stock?: number | null;
  activo: boolean;
  variantes?: string[];
  urlOrigen?: string | null;
  digital: boolean;
  extra: Record<string, unknown>;
}

/** Pedido normalizado de CUALQUIER plataforma, listo para dropshipping. */
export interface PedidoExterno {
  idExterno: string;
  nombre?: string | null;
  telefono?: string | null;
  documento?: string | null;
  departamento?: string | null;
  ciudad?: string | null;
  direccion?: string | null;
  barrio?: string | null;
  notas?: string | null;
  items: Array<{ idExterno: string; sku?: string | null; nombre: string; cantidad: number; precio: number }>;
  /** "pagado" | "pendiente" — decide si el pedido interno nace confirmado o por confirmar. */
  pagado: boolean;
  metodoPago?: string | null;
}

export interface ResultadoImport {
  importados: number;
  actualizados: number;
  errores: number;
  detalles: string[];
}

export interface ResultadoPedidos {
  creados: number;
  repetidos: number;
  errores: number;
  detalles: string[];
}

export function skuDe(plataforma: Plataforma, idExterno: string | number): string {
  const prefijo: Record<Plataforma, string> = { shopify: "shopify", aliexpress: "ali", mercadolibre: "meli", falabella: "fala" };
  return `${prefijo[plataforma]}-${String(idExterno)}`;
}
