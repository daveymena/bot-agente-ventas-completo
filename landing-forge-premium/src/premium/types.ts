/**
 * Landing Forge Premium – VentasProIA
 * Tipos del motor de plantillas.
 *
 * Todo el motor trabaja con estos tipos. Son serializables a JSON para que el
 * generador existente pueda guardar, versionar y editar las landings.
 */

/* ------------------------------------------------------------------ */
/* Catálogo                                                            */
/* ------------------------------------------------------------------ */

export type ProductKind = 'physical' | 'digital' | 'service';

export interface StoreInfo {
  name: string;
  slug: string;
  logo: string | null;
  whatsappPhone: string;
  pixelId: string | null;
  colors?: { primary?: string | null; secondary?: string | null } | null;
  socialLinks?: Record<string, string> | null;
}

/** Variante del producto: `{ nombre: "Talla", valores: ["S","M","L"] }` */
export interface ProductOption {
  name: string;
  values: string[];
}

export interface RelatedProduct {
  id: number | string;
  name: string;
  price: number;
  image: string | null;
  category?: string | null;
}

export interface Product {
  id: number | string;
  name: string;
  description: string;
  /** Precio base del catálogo, ya normalizado a número. */
  price: number;
  currency: string;
  /** Imagen principal, siempre absoluta. */
  image: string | null;
  /** Galería completa (incluye `image` en primera posición), siempre absolutas. */
  images: string[];
  video: string | null;
  category: string;
  kind: ProductKind;
  linea?: string | null;
  sku?: string | null;
  features: string[];
  /** Digitales: link de pago con entrega inmediata. */
  paymentLink?: string | null;
  opciones?: ProductOption[] | null;
}

/** Respuesta cruda del endpoint público (antes de normalizar). */
export interface RawProductPayload {
  store: Record<string, unknown>;
  product: Record<string, unknown>;
  related?: Array<Record<string, unknown>>;
}

/* ------------------------------------------------------------------ */
/* Sistema de diseño                                                   */
/* ------------------------------------------------------------------ */

export type ThemeId = 'clean-luxe' | 'bold-sport' | 'soft-wellness' | 'dark-tech';

export interface ThemeFonts {
  /** Nombre de la familia para títulos tal como la pide Google Fonts. */
  headingFamily: string;
  bodyFamily: string;
  /** Stack CSS completo. */
  headingStack: string;
  bodyStack: string;
  /** URL de Google Fonts con display=swap. */
  href: string;
}

export interface ThemeTokens {
  /** Color de marca principal (botones, acentos fuertes). */
  primary: string;
  primaryHover: string;
  /** Texto sobre el color primario. */
  onPrimary: string;
  /** Acento secundario (píldoras, subrayados, números grandes). */
  accent: string;
  accentSoft: string;
  onAccent: string;
  /** Fondo de página. */
  bg: string;
  /** Superficie alterna (secciones con fondo distinto). */
  surface: string;
  /** Superficie elevada (tarjetas). */
  surfaceRaised: string;
  text: string;
  textMuted: string;
  border: string;
  /** Fondo del contenedor de fotos de producto. */
  productBg: string;
  productBgAlt: string;
  success: string;
  danger: string;
  radiusSm: string;
  radiusMd: string;
  radiusLg: string;
  radiusPill: string;
  shadowSm: string;
  shadowMd: string;
  shadowLg: string;
  /** Sombra de contacto bajo el producto. */
  shadowContact: string;
  maxWidth: string;
}

export interface Theme {
  id: ThemeId;
  name: string;
  tagline: string;
  dark: boolean;
  fonts: ThemeFonts;
  tokens: ThemeTokens;
  /** Títulos en mayúsculas (Bold Sport). */
  uppercaseHeadings: boolean;
  /** Formas orgánicas SVG de fondo (Soft Wellness). */
  organicShapes: boolean;
  /** Tarjetas con borde translúcido + glass (Dark Tech). */
  glass: boolean;
  /** Degradados sutiles de fondo. */
  gradients: boolean;
  /** Categorías del catálogo que disparan este tema automáticamente. */
  suggestFor: string[];
}

/* ------------------------------------------------------------------ */
/* Copy                                                                */
/* ------------------------------------------------------------------ */

/** Nivel de conciencia del público (Eugene Schwartz, simplificado a 3). */
export type Awareness = 'cold' | 'problem' | 'product';

/** Ángulo de venta. */
export type Angle = 'pain' | 'desire' | 'saving' | 'gift' | 'status';

export interface CopyStep {
  title: string;
  text: string;
}

export interface CopyBundle {
  announcement: string;
  heroEyebrow: string;
  headline: string;
  subheadline: string;
  bullets: string[];
  ctaPrimary: string;
  ctaSecondary: string;
  benefitsEyebrow: string;
  benefitsTitle: string;
  problemEyebrow: string;
  problemTitle: string;
  problemText: string;
  solutionTitle: string;
  solutionText: string;
  howEyebrow: string;
  howTitle: string;
  steps: CopyStep[];
  bundlesEyebrow: string;
  bundlesTitle: string;
  bundlesSubtitle: string;
  reviewsEyebrow: string;
  reviewsTitle: string;
  guaranteeTitle: string;
  guaranteeText: string;
  shippingTitle: string;
  faqTitle: string;
  formEyebrow: string;
  formTitle: string;
  formSubtitle: string;
  relatedTitle: string;
  closingTitle: string;
  closingText: string;
  /** Advertorial */
  articleKicker: string;
  articleTitle: string;
  articleStandfirst: string;
  articleAuthor: string;
  articleBody: string[];
  listicleTitle: string;
  listicleItems: CopyStep[];
  /** Digital */
  curriculumTitle: string;
  curriculum: string[];
  forWho: string[];
  notForWho: string[];
  /** Servicio */
  serviceIncludes: string[];
}

/* ------------------------------------------------------------------ */
/* Oferta y contenido editable                                         */
/* ------------------------------------------------------------------ */

export interface Bundle {
  id: string;
  /** Cantidad de unidades. */
  qty: number;
  label: string;
  /** Precio TOTAL del paquete. */
  price: number;
  compareAt?: number | null;
  badge?: string | null;
  highlight?: boolean;
  note?: string | null;
}

export interface Bonus {
  id: string;
  title: string;
  description: string;
  /** Valor tachado, en COP. */
  value?: number | null;
}

/** Reseña REAL cargada a mano en el panel. Nunca se autogenera. */
export interface Review {
  id: string;
  name: string;
  city: string;
  text: string;
  stars: 1 | 2 | 3 | 4 | 5;
  /** Foto opcional del cliente (URL). */
  photo?: string | null;
  date?: string | null;
  verified?: boolean;
}

export interface FaqItem {
  id: string;
  q: string;
  a: string;
}

export interface Offer {
  price: number;
  compareAt: number | null;
  currency: string;
  freeShipping: boolean;
  /** Pago contra entrega (solo físicos). */
  cod: boolean;
  financing: { addi: boolean; sistecredito: boolean };
  bundles: Bundle[];
  bonuses: Bonus[];
  guaranteeDays: number;
  /** Fecha real de fin de promoción (ISO). Si es null, no hay cuenta regresiva. */
  deadline: string | null;
  /** Digitales: link de pago. Si falta, el CTA va a WhatsApp. */
  paymentLink: string | null;
  shippingEta: string;
}

export interface SocialProof {
  /** Número real de clientes. Si es null, no se muestra. */
  customers: number | null;
  rating: number | null;
  ratingCount: number | null;
}

export interface Tracking {
  pixelId: string | null;
  /** Token de Conversions API (se usa solo desde el servidor). */
  capiToken: string | null;
  /** Evento al enviar el pedido. */
  conversionEvent: 'Lead' | 'Purchase';
  testEventCode: string | null;
}

/* ------------------------------------------------------------------ */
/* Secciones y documento                                               */
/* ------------------------------------------------------------------ */

export type SectionType =
  | 'announcement-bar'
  | 'hero-product'
  | 'trust-marquee'
  | 'benefits-bento'
  | 'problem-solution'
  | 'how-it-works'
  | 'bundle-picker'
  | 'reviews'
  | 'guarantee'
  | 'shipping-info'
  | 'faq'
  | 'order-form'
  | 'related-products'
  | 'footer'
  | 'article-header'
  | 'article-body'
  | 'listicle'
  | 'article-offer'
  | 'digital-hero'
  | 'digital-access'
  | 'digital-audience'
  | 'digital-curriculum'
  | 'digital-bonuses'
  | 'digital-price-anchor'
  | 'digital-final-cta'
  | 'service-hero'
  | 'service-process'
  | 'service-includes'
  | 'service-portfolio'
  | 'service-plans'
  | 'sticky-cta'
  | 'whatsapp-float'
  | 'countdown';

export interface SectionSpec<P = Record<string, unknown>> {
  id: string;
  type: SectionType;
  hidden?: boolean;
  props?: P;
}

export type TemplateId = 'cod-product' | 'advertorial' | 'digital-course' | 'service-whatsapp';

export interface TemplateMeta {
  id: TemplateId;
  name: string;
  description: string;
  /** Para qué tipo de oferta se sugiere. */
  kinds: ProductKind[];
  /** Nivel de conciencia ideal. */
  awareness: Awareness[];
  sections: () => SectionSpec[];
}

export interface Utm {
  source: string;
  medium: string;
  campaign: string;
  content?: string;
  term?: string;
}

export interface LandingSettings {
  awareness: Awareness;
  angle: Angle;
  /** Emojis en los textos tipo anuncio (los íconos del diseño siempre son SVG). */
  emojisInCopy: boolean;
  offer: Offer;
  socialProof: SocialProof;
  reviews: Review[];
  faq: FaqItem[];
  copy: CopyBundle;
  tracking: Tracking;
  /** POST con el JSON del pedido. */
  webhookUrl: string | null;
  utm: Utm;
  whatsappPhone: string;
  /** Texto de la política de cambios/devoluciones. */
  returnPolicy: string;
  legalName: string;
  /** Mostrar la franja "pago contra entrega" (se apaga sola en digitales). */
  showCod: boolean;
}

/**
 * Documento de landing. Es el JSON que guarda el generador.
 * `{ theme, sections: [{ type, props }] }` tal como lo pide la integración.
 */
export interface LandingDocument {
  version: 1;
  id: string;
  slug: string;
  title: string;
  template: TemplateId;
  theme: ThemeId;
  /** Override del color de acento sobre el tema. */
  accent: string | null;
  store: StoreInfo;
  product: Product;
  related: RelatedProduct[];
  settings: LandingSettings;
  sections: SectionSpec[];
  createdAt: string;
  updatedAt: string;
}

/** Config que recibe `renderLanding(product, store, config)`. */
export interface RenderConfig {
  slug: string;
  title?: string;
  template: TemplateId;
  theme: ThemeId;
  accent?: string | null;
  related?: RelatedProduct[];
  settings: LandingSettings;
  sections: SectionSpec[];
  /** Modo vista previa: desactiva pixel y webhooks reales. */
  preview?: boolean;
  /** URL canónica de la landing publicada. */
  canonicalUrl?: string | null;
  /**
   * El HTML se va a servir fuera de esta app ("Descargar HTML").
   * En ese caso no se puede contar con `/api/store/*` y el pedido se manda
   * directo al webhook configurado.
   */
  standalone?: boolean;
  /**
   * Base absoluta de la API (`https://tu-dominio`). Permite que el HTML
   * exportado siga usando el relé de pedidos y la Conversions API.
   */
  apiBase?: string | null;
}

/* ------------------------------------------------------------------ */
/* Pedido                                                              */
/* ------------------------------------------------------------------ */

export interface OrderPayload {
  landingSlug: string;
  productId: number | string;
  productName: string;
  quantity: number;
  bundleId: string | null;
  variant: Record<string, string> | null;
  total: number;
  currency: string;
  customer: {
    name: string;
    phone: string;
    department: string;
    city: string;
    address: string;
    neighborhood: string;
    notes: string;
  };
  attribution: {
    utm_source?: string;
    utm_medium?: string;
    utm_campaign?: string;
    utm_content?: string;
    utm_term?: string;
    fbclid?: string;
    referrer?: string;
    landingUrl?: string;
  };
  createdAt: string;
}
