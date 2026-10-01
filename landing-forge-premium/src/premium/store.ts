/**
 * Normalización de los datos que llegan de la API pública de la tienda.
 *
 * Reglas:
 *  - Las rutas relativas (`/uploads/...`, `/images/...`) se vuelven absolutas
 *    anteponiendo STORE_BASE.
 *  - El precio llega como string `"60000.00"` y sale como número.
 *  - Las imágenes se deduplican y `product.image` siempre va de primera.
 */

import type { Product, ProductKind, ProductOption, RelatedProduct, StoreInfo } from './types';
import { toNumberOr } from './format';

export const STORE_BASE =
  (typeof process !== 'undefined' && process.env?.STORE_BASE) || 'https://ventasproia.com';

export const STORE_SLUG =
  (typeof process !== 'undefined' && process.env?.STORE_SLUG) || 'sofia-premium';

/** `/uploads/products/173.jpg` -> `https://ventasproia.com/uploads/products/173.jpg` */
export function absoluteUrl(path: unknown, base: string = STORE_BASE): string | null {
  if (typeof path !== 'string') return null;
  const p = path.trim();
  if (!p) return null;
  if (/^(https?:)?\/\//i.test(p)) return p.startsWith('//') ? `https:${p}` : p;
  if (p.startsWith('data:')) return p;
  const clean = p.startsWith('/') ? p : `/${p}`;
  return `${base.replace(/\/+$/, '')}${clean}`;
}

function str(v: unknown, fallback = ''): string {
  if (v === null || v === undefined) return fallback;
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return fallback;
}

function strOrNull(v: unknown): string | null {
  const s = str(v, '').trim();
  return s ? s : null;
}

function kindOf(v: unknown, product: Record<string, unknown>): ProductKind {
  const k = str(v, '').toLowerCase();
  if (k === 'digital' || k === 'service' || k === 'servicio') {
    return k === 'servicio' ? 'service' : (k as ProductKind);
  }
  // Heurística de respaldo: si tiene link de entrega/pago y no tiene peso, es digital
  if (product.deliveryLink || product.drive_folder_id) return 'digital';
  return 'physical';
}

function normalizeOptions(raw: unknown): ProductOption[] | null {
  if (!raw) return null;
  let data: unknown = raw;
  if (typeof raw === 'string') {
    try {
      data = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  const out: ProductOption[] = [];
  if (Array.isArray(data)) {
    for (const item of data) {
      if (!item || typeof item !== 'object') continue;
      const o = item as Record<string, unknown>;
      const name = str(o.name ?? o.nombre ?? o.title ?? o.label).trim();
      const rawValues = o.values ?? o.valores ?? o.options ?? o.opciones;
      const values = Array.isArray(rawValues)
        ? rawValues.map((v) => str(v).trim()).filter(Boolean)
        : typeof rawValues === 'string'
          ? rawValues.split(/[,|]/).map((v) => v.trim()).filter(Boolean)
          : [];
      if (name && values.length) out.push({ name, values });
    }
  } else if (data && typeof data === 'object') {
    for (const [name, rawValues] of Object.entries(data as Record<string, unknown>)) {
      const values = Array.isArray(rawValues)
        ? rawValues.map((v) => str(v).trim()).filter(Boolean)
        : typeof rawValues === 'string'
          ? rawValues.split(/[,|]/).map((v) => v.trim()).filter(Boolean)
          : [];
      if (name && values.length) out.push({ name, values });
    }
  }
  return out.length ? out : null;
}

function normalizeFeatures(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((f) => str(f).trim()).filter(Boolean).slice(0, 12);
  }
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map((f) => str(f).trim()).filter(Boolean).slice(0, 12);
    } catch {
      return raw.split(/\n|•|·/).map((f) => f.trim()).filter(Boolean).slice(0, 12);
    }
  }
  return [];
}

export function normalizeStore(raw: unknown, base: string = STORE_BASE): StoreInfo {
  const s = (raw ?? {}) as Record<string, unknown>;
  const colors = (s.colors ?? null) as Record<string, unknown> | null;
  return {
    name: str(s.name, 'VentasProIA'),
    slug: str(s.slug, STORE_SLUG),
    logo: absoluteUrl(s.logo, base),
    whatsappPhone: str(s.whatsappPhone ?? s.whatsapp_phone ?? s.phone, '').replace(/\D/g, ''),
    pixelId: strOrNull(s.pixelId ?? s.pixel_id),
    colors: colors
      ? { primary: strOrNull(colors.primary), secondary: strOrNull(colors.secondary) }
      : null,
    socialLinks: (s.socialLinks ?? null) as Record<string, string> | null,
  };
}

export function normalizeProduct(raw: unknown, base: string = STORE_BASE): Product {
  const p = (raw ?? {}) as Record<string, unknown>;

  const mainImage = absoluteUrl(p.image ?? p.image_url ?? p.imageUrl ?? p.thumbnail, base);
  const gallery: string[] = [];
  if (mainImage) gallery.push(mainImage);
  const rawImages = p.images;
  if (Array.isArray(rawImages)) {
    for (const img of rawImages) {
      const url = absoluteUrl(typeof img === 'string' ? img : (img as Record<string, unknown>)?.url, base);
      if (url && !gallery.includes(url)) gallery.push(url);
    }
  }

  return {
    id: (p.id as number | string) ?? 0,
    name: str(p.name ?? p.title, 'Producto'),
    description: str(p.description ?? p.descripcion),
    price: toNumberOr(p.price, 0),
    currency: str(p.currency, 'COP'),
    image: mainImage,
    images: gallery,
    video: absoluteUrl(p.video, base),
    category: str(p.category ?? p.categoria, 'General'),
    kind: kindOf(p.kind, p),
    linea: strOrNull(p.linea),
    sku: strOrNull(p.sku),
    features: normalizeFeatures(p.features),
    paymentLink: strOrNull(p.paymentLink ?? p.payment_link ?? p.deliveryLink),
    opciones: normalizeOptions(p.opciones ?? p.options ?? p.variants),
  };
}

export function normalizeRelated(raw: unknown, base: string = STORE_BASE): RelatedProduct[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      const r = (item ?? {}) as Record<string, unknown>;
      return {
        id: (r.id as number | string) ?? 0,
        name: str(r.name, ''),
        price: toNumberOr(r.price, 0),
        image: absoluteUrl(r.image ?? r.image_url, base),
        category: strOrNull(r.category),
      };
    })
    .filter((r) => r.name);
}

export interface NormalizedProductPayload {
  store: StoreInfo;
  product: Product;
  related: RelatedProduct[];
}

export function normalizeProductPayload(raw: unknown, base: string = STORE_BASE): NormalizedProductPayload {
  const data = (raw ?? {}) as Record<string, unknown>;
  return {
    store: normalizeStore(data.store, base),
    product: normalizeProduct(data.product, base),
    related: normalizeRelated(data.related, base),
  };
}

export interface NormalizedCatalog {
  store: StoreInfo;
  products: Product[];
}

export function normalizeCatalog(raw: unknown, base: string = STORE_BASE): NormalizedCatalog {
  const data = (raw ?? {}) as Record<string, unknown>;
  const list = Array.isArray(data.products) ? data.products : Array.isArray(data) ? data : [];
  return {
    store: normalizeStore(data.store, base),
    products: list.map((p) => normalizeProduct(p, base)),
  };
}

/** Enlace de WhatsApp con mensaje prellenado. */
export function waLink(phone: string, message: string): string {
  const clean = (phone || '').replace(/\D/g, '');
  return `https://wa.me/${clean}?text=${encodeURIComponent(message)}`;
}

/** Enlace a la ficha del producto en la tienda. */
export function storeProductUrl(slug: string, id: number | string, base: string = STORE_BASE): string {
  return `${base.replace(/\/+$/, '')}/tienda/${slug}?producto=${id}`;
}
