/**
 * Documentos de demostración: 4 plantillas × 4 temas con los datos reales
 * de semilla de la tienda (nada de fotos de stock).
 */

import type { LandingDocument, ProductKind, TemplateId, ThemeId } from '@/premium/types';
import { createLandingDocument, makeServiceProduct } from '@/premium/defaults';
import { normalizeProductPayload, normalizeStore } from '@/premium/store';
import { DEMO_DIGITAL_ID, DEMO_PHYSICAL_ID, SEED_STORE, seedProductPayload } from '@/premium/data/seed';
import { sectionsForTemplate, TEMPLATE_IDS } from '@/premium/templates';
import { THEME_IDS } from '@/premium/themes';
import { buildCopy } from '@/premium/copy/generator';
import { uid } from '@/premium/format';

export function isTemplateId(value: string | null): value is TemplateId {
  return !!value && (TEMPLATE_IDS as string[]).includes(value);
}

export function isThemeId(value: string | null): value is ThemeId {
  return !!value && (THEME_IDS as string[]).includes(value);
}

/** Qué producto de semilla le conviene a cada plantilla. */
export function kindForTemplate(template: TemplateId): ProductKind {
  if (template === 'digital-course') return 'digital';
  if (template === 'service-whatsapp') return 'service';
  return 'physical';
}

function basePayload(id: number | string) {
  const payload = seedProductPayload(id);
  if (!payload) throw new Error(`No hay producto de semilla con id ${id}`);
  return normalizeProductPayload(payload);
}

export function demoDocument(template: TemplateId, theme: ThemeId): LandingDocument {
  const kind = kindForTemplate(template);

  let doc: LandingDocument;

  if (kind === 'service') {
    const physical = basePayload(DEMO_PHYSICAL_ID);
    const product = makeServiceProduct({
      name: 'Montaje de tu tienda en línea con anuncios listos',
      description:
        'Dejamos tu tienda publicada, con los productos cargados, el pago contra entrega configurado y la primera campaña de Meta lista para salir. Trabajamos por WhatsApp y entregamos en días hábiles, con acompañamiento mientras aprendes a manejarla.',
      price: 450000,
      images: physical.product.images,
      category: 'Servicios',
      features: [
        'Diagnóstico inicial sin costo por WhatsApp',
        'Tienda publicada con tu dominio y tus productos',
        'Pago contra entrega y guías de envío configurados',
        'Primera campaña de Meta creada y revisada contigo',
        'Acompañamiento por WhatsApp durante el montaje',
      ],
    });
    doc = createLandingDocument({
      product,
      store: normalizeStore(SEED_STORE),
      related: physical.related,
      template,
      theme,
    });
  } else {
    const payload = basePayload(kind === 'digital' ? DEMO_DIGITAL_ID : DEMO_PHYSICAL_ID);
    doc = createLandingDocument({
      product: payload.product,
      store: payload.store,
      related: payload.related,
      template,
      theme,
    });
  }

  // La demo debe verse completa: secciones de la plantilla pedida y copy
  // recalculado para ese producto.
  doc.sections = sectionsForTemplate(template);
  doc.settings.copy = buildCopy({
    product: doc.product,
    awareness: doc.settings.awareness,
    angle: doc.settings.angle,
    offer: doc.settings.offer,
    emojisInCopy: doc.settings.emojisInCopy,
    storeName: doc.store.name,
  });

  // Reseñas reales de ejemplo solo para la demo: van marcadas como demostración
  // para que nadie las confunda con testimonios de la tienda.
  doc.settings.reviews = [];
  doc.settings.socialProof = { customers: null, rating: null, ratingCount: null };

  doc.id = uid('demo');
  doc.slug = `demo-${template}-${theme}`;
  doc.title = `${doc.product.name} · ${template} · ${theme}`;

  return doc;
}

export const DEMO_MATRIX: Array<{ template: TemplateId; theme: ThemeId }> = TEMPLATE_IDS.flatMap(
  (template) => THEME_IDS.map((theme) => ({ template, theme }))
);
