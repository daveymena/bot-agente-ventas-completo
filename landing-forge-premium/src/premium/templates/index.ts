/**
 * Las 4 plantillas. Cada una es una lista ordenada de secciones con props.
 * El JSON resultante es lo que guarda el generador:
 *   { theme, sections: [{ type, props }] }
 */

import type { ProductKind, SectionSpec, TemplateId, TemplateMeta } from '../types';

function s(type: SectionSpec['type'], props: Record<string, unknown> = {}): SectionSpec {
  return { id: `${type}_${Math.random().toString(36).slice(2, 8)}`, type, props };
}

/* ------------------------------------------------------------------ */
/* A. Producto COD                                                     */
/* ------------------------------------------------------------------ */

export function codProductSections(): SectionSpec[] {
  return [
    s('announcement-bar'),
    s('hero-product'),
    s('trust-marquee'),
    s('benefits-bento'),
    s('problem-solution'),
    s('how-it-works'),
    s('bundle-picker'),
    s('reviews'),
    s('guarantee'),
    s('shipping-info'),
    s('faq'),
    s('order-form'),
    s('related-products'),
    s('footer'),
    s('sticky-cta'),
    s('whatsapp-float'),
  ];
}

/* ------------------------------------------------------------------ */
/* B. Advertorial / Listicle                                           */
/* ------------------------------------------------------------------ */

export function advertorialSections(): SectionSpec[] {
  return [
    s('announcement-bar'),
    s('article-header'),
    s('article-body'),
    s('listicle'),
    s('trust-marquee'),
    s('article-offer'),
    s('reviews'),
    s('bundle-picker'),
    s('guarantee'),
    s('shipping-info'),
    s('faq'),
    s('order-form'),
    s('related-products'),
    s('footer'),
    s('sticky-cta'),
    s('whatsapp-float'),
  ];
}

/* ------------------------------------------------------------------ */
/* C. Curso / Infoproducto                                             */
/* ------------------------------------------------------------------ */

export function digitalCourseSections(): SectionSpec[] {
  return [
    s('announcement-bar'),
    s('digital-hero'),
    s('trust-marquee'),
    s('digital-access'),
    s('digital-audience'),
    s('digital-curriculum'),
    s('digital-bonuses'),
    s('digital-price-anchor'),
    s('reviews'),
    s('guarantee'),
    s('faq'),
    s('digital-final-cta'),
    s('related-products'),
    s('footer'),
    s('sticky-cta'),
    s('whatsapp-float'),
  ];
}

/* ------------------------------------------------------------------ */
/* D. Servicio WhatsApp                                                */
/* ------------------------------------------------------------------ */

export function serviceWhatsappSections(): SectionSpec[] {
  return [
    s('announcement-bar'),
    s('service-hero'),
    s('trust-marquee'),
    s('service-process'),
    s('service-includes'),
    s('service-portfolio'),
    s('service-plans'),
    s('reviews'),
    s('guarantee'),
    s('faq'),
    s('footer'),
    s('sticky-cta'),
    s('whatsapp-float'),
  ];
}

/* ------------------------------------------------------------------ */

export const TEMPLATES: Record<TemplateId, TemplateMeta> = {
  'cod-product': {
    id: 'cod-product',
    name: 'Producto COD',
    description:
      'Para tráfico que ya vio el producto en el anuncio. Hero con galería, paquetes por cantidad y formulario de pago contra entrega.',
    kinds: ['physical'],
    awareness: ['product', 'problem'],
    sections: codProductSections,
  },
  advertorial: {
    id: 'advertorial',
    name: 'Advertorial / Listicle',
    description:
      'Formato de nota periodística para público frío. Historia del problema, por qué fallan las soluciones comunes y el producto como consecuencia lógica.',
    kinds: ['physical', 'digital'],
    awareness: ['cold', 'problem'],
    sections: advertorialSections,
  },
  'digital-course': {
    id: 'digital-course',
    name: 'Curso / Infoproducto',
    description:
      'Para productos digitales. Mockup en marco de laptop y celular, módulos, bonos, precio ancla y acceso inmediato. Sin "pago contra entrega".',
    kinds: ['digital'],
    awareness: ['product', 'problem', 'cold'],
    sections: digitalCourseSections,
  },
  'service-whatsapp': {
    id: 'service-whatsapp',
    name: 'Servicio WhatsApp',
    description:
      'Para servicios. Resultado, proceso, qué incluye, portafolio con fotos de la tienda, planes y CTA de agendamiento.',
    kinds: ['service'],
    awareness: ['problem', 'product'],
    sections: serviceWhatsappSections,
  },
};

export const TEMPLATE_LIST: TemplateMeta[] = [
  TEMPLATES['cod-product'],
  TEMPLATES.advertorial,
  TEMPLATES['digital-course'],
  TEMPLATES['service-whatsapp'],
];

export const TEMPLATE_IDS: TemplateId[] = TEMPLATE_LIST.map((t) => t.id);

/** Sugerencia automática: físico → COD, digital → curso, servicio → servicio. */
export function suggestTemplate(kind: ProductKind): TemplateId {
  if (kind === 'digital') return 'digital-course';
  if (kind === 'service') return 'service-whatsapp';
  return 'cod-product';
}

export function sectionsForTemplate(id: TemplateId): SectionSpec[] {
  return (TEMPLATES[id] ?? TEMPLATES['cod-product']).sections();
}
