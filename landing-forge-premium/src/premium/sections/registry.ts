/**
 * Registro de secciones: `type` -> renderer.
 * El generador existente puede guardar una landing como
 * `{ theme, sections: [{ type, props }] }` y este registro la resuelve.
 */

import type { SectionType } from '../types';
import type { SectionRenderer } from './shared';

import {
  announcementBar,
  benefitsBento,
  bundlePicker,
  countdownSection,
  faqSection,
  footerSection,
  guaranteeSection,
  heroProduct,
  howItWorks,
  orderForm,
  problemSolution,
  relatedProducts,
  reviewsSection,
  shippingInfo,
  stickyCta,
  trustMarquee,
  whatsappFloat,
} from './core';

import { articleBody, articleHeader, articleOffer, listicle } from './article';

import {
  digitalAccess,
  digitalAudience,
  digitalBonuses,
  digitalCurriculum,
  digitalFinalCta,
  digitalHero,
  digitalPriceAnchor,
} from './digital';

import {
  serviceHero,
  serviceIncludes,
  servicePlans,
  servicePortfolio,
  serviceProcess,
} from './service';

export const SECTION_REGISTRY: Record<SectionType, SectionRenderer> = {
  'announcement-bar': announcementBar,
  'hero-product': heroProduct,
  'trust-marquee': trustMarquee,
  'benefits-bento': benefitsBento,
  'problem-solution': problemSolution,
  'how-it-works': howItWorks,
  'bundle-picker': bundlePicker,
  reviews: reviewsSection,
  guarantee: guaranteeSection,
  'shipping-info': shippingInfo,
  faq: faqSection,
  'order-form': orderForm,
  'related-products': relatedProducts,
  footer: footerSection,
  'article-header': articleHeader,
  'article-body': articleBody,
  listicle: listicle,
  'article-offer': articleOffer,
  'digital-hero': digitalHero,
  'digital-access': digitalAccess,
  'digital-audience': digitalAudience,
  'digital-curriculum': digitalCurriculum,
  'digital-bonuses': digitalBonuses,
  'digital-price-anchor': digitalPriceAnchor,
  'digital-final-cta': digitalFinalCta,
  'service-hero': serviceHero,
  'service-process': serviceProcess,
  'service-includes': serviceIncludes,
  'service-portfolio': servicePortfolio,
  'service-plans': servicePlans,
  'sticky-cta': stickyCta,
  'whatsapp-float': whatsappFloat,
  countdown: countdownSection,
};

/** Etiquetas para el panel (reordenar / ocultar secciones). */
export const SECTION_LABELS: Record<SectionType, string> = {
  'announcement-bar': 'Barra superior',
  'hero-product': 'Hero con galería',
  'trust-marquee': 'Franja de sellos (marquee)',
  'benefits-bento': 'Beneficios (bento)',
  'problem-solution': 'Problema → solución',
  'how-it-works': 'Cómo se usa (3 pasos)',
  'bundle-picker': 'Paquetes por cantidad',
  reviews: 'Reseñas reales',
  guarantee: 'Garantía',
  'shipping-info': 'Envío y entrega',
  faq: 'Preguntas frecuentes',
  'order-form': 'Formulario contra entrega',
  'related-products': 'Productos relacionados',
  footer: 'Cierre y pie de página',
  'article-header': 'Artículo: titular',
  'article-body': 'Artículo: cuerpo',
  listicle: 'Listicle (razones)',
  'article-offer': 'Artículo: bloque de oferta',
  'digital-hero': 'Hero del curso (mockup)',
  'digital-access': 'Acceso inmediato',
  'digital-audience': 'Para quién es / no es',
  'digital-curriculum': 'Qué vas a aprender',
  'digital-bonuses': 'Bonos',
  'digital-price-anchor': 'Precio ancla',
  'digital-final-cta': 'CTA final del curso',
  'service-hero': 'Hero del servicio',
  'service-process': 'Proceso en pasos',
  'service-includes': 'Qué incluye',
  'service-portfolio': 'Galería del servicio',
  'service-plans': 'Planes y precios',
  'sticky-cta': 'Barra de compra fija',
  'whatsapp-float': 'Botón flotante de WhatsApp',
  countdown: 'Cuenta regresiva (fecha real)',
};

/** Secciones que no se pueden reordenar en el panel (van fijas al final). */
export const PINNED_SECTIONS: SectionType[] = ['sticky-cta', 'whatsapp-float'];
