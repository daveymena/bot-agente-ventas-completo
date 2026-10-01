/**
 * Valores por defecto de la oferta y del documento de landing.
 * Todo es editable desde el panel; esto solo da un punto de partida sensato.
 */

import type {
  Angle,
  Awareness,
  Bundle,
  LandingDocument,
  LandingSettings,
  Offer,
  Product,
  RelatedProduct,
  StoreInfo,
  TemplateId,
  ThemeId,
} from './types';
import { prettyPrice, slugify, uid } from './format';
import { buildCopy, defaultFaq } from './copy/generator';
import { suggestTheme } from './themes';
import { sectionsForTemplate, suggestTemplate } from './templates';

/** Paquetes por cantidad con descuento progresivo (1 / 2 / 3). */
export function defaultBundles(price: number, kind: Product['kind']): Bundle[] {
  if (kind !== 'physical') return [];
  const p2 = prettyPrice(price * 2 * 0.86);
  const p3 = prettyPrice(price * 3 * 0.78);
  return [
    { id: 'pack1', qty: 1, label: '1 unidad', price, compareAt: null, badge: null, highlight: false, note: null },
    {
      id: 'pack2',
      qty: 2,
      label: 'Pack x2',
      price: p2,
      compareAt: price * 2,
      badge: 'Más vendido',
      highlight: true,
      note: 'El que más piden',
    },
    {
      id: 'pack3',
      qty: 3,
      label: 'Pack x3',
      price: p3,
      compareAt: price * 3,
      badge: 'Mejor precio',
      highlight: false,
      note: 'Ideal para regalar',
    },
  ];
}

/** Planes de servicio por defecto. */
export function defaultServicePlans(price: number): Bundle[] {
  return [
    { id: 'plan_basico', qty: 1, label: 'Esencial', price, compareAt: null, badge: null, highlight: false, note: 'Lo necesario para arrancar' },
    { id: 'plan_pro', qty: 1, label: 'Profesional', price: prettyPrice(price * 2.2), compareAt: null, badge: 'Más contratado', highlight: true, note: 'El que elige la mayoría' },
    { id: 'plan_full', qty: 1, label: 'Integral', price: prettyPrice(price * 4), compareAt: null, badge: null, highlight: false, note: 'Acompañamiento completo' },
  ];
}

export function defaultOffer(product: Product): Offer {
  const price = product.price || 0;
  const isPhysical = product.kind === 'physical';
  return {
    price,
    // El precio tachado sugerido es +40 % redondeado; el usuario lo ajusta o lo quita.
    compareAt: price > 0 ? prettyPrice(price * 1.4) : null,
    currency: product.currency || 'COP',
    freeShipping: isPhysical,
    cod: isPhysical,
    financing: { addi: false, sistecredito: false },
    bundles:
      product.kind === 'service' ? defaultServicePlans(price) : defaultBundles(price, product.kind),
    bonuses:
      product.kind === 'digital'
        ? [
            {
              id: uid('bonus'),
              title: 'Grupo de soporte por WhatsApp',
              description: 'Canal directo para resolver dudas mientras avanzas con el curso.',
              value: 50000,
            },
            {
              id: uid('bonus'),
              title: 'Material descargable',
              description: 'Ejercicios y recursos para practicar sin estar conectado.',
              value: 40000,
            },
          ]
        : [],
    guaranteeDays: product.kind === 'digital' ? 7 : 30,
    deadline: null,
    paymentLink: product.paymentLink ?? null,
    shippingEta: 'Entrega de 2 a 5 días hábiles',
  };
}

export interface DefaultsInput {
  product: Product;
  store: StoreInfo;
  related?: RelatedProduct[];
  template?: TemplateId;
  theme?: ThemeId;
  awareness?: Awareness;
  angle?: Angle;
  emojisInCopy?: boolean;
}

export function defaultSettings(input: DefaultsInput): LandingSettings {
  const { product, store } = input;
  const awareness: Awareness = input.awareness ?? (product.kind === 'physical' ? 'product' : 'problem');
  const angle: Angle = input.angle ?? 'pain';
  const emojisInCopy = input.emojisInCopy ?? true;
  const offer = defaultOffer(product);

  const copy = buildCopy({ product, awareness, angle, offer, emojisInCopy, storeName: store.name });

  return {
    awareness,
    angle,
    emojisInCopy,
    offer,
    socialProof: { customers: null, rating: null, ratingCount: null },
    reviews: [], // Nada de reseñas inventadas: se cargan a mano en el panel.
    faq: defaultFaq(product, offer),
    copy,
    tracking: {
      pixelId: store.pixelId ?? null,
      capiToken: null,
      conversionEvent: 'Lead',
      testEventCode: null,
    },
    webhookUrl: null,
    utm: { source: 'facebook', medium: 'paid', campaign: slugify(product.name) },
    whatsappPhone: store.whatsappPhone,
    returnPolicy:
      product.kind === 'digital'
        ? `Si entras al contenido y no es lo que esperabas, escríbenos dentro de los primeros ${offer.guaranteeDays} días y te devolvemos el dinero. El acceso se desactiva al hacer la devolución.`
        : product.kind === 'service'
          ? 'Puedes cancelar sin costo antes de que empecemos. Si ya arrancamos, se cobra únicamente lo ejecutado hasta ese momento, con el detalle por escrito.'
          : `Cambios por defecto de fábrica dentro de los primeros ${offer.guaranteeDays} días. El producto debe estar en buen estado y con su empaque. La recogida la coordinamos nosotros.`,
    legalName: `${store.name} · Ventas en línea con entrega en toda Colombia.`,
    showCod: product.kind === 'physical',
  };
}

export function createLandingDocument(input: DefaultsInput): LandingDocument {
  const { product, store } = input;
  const template = input.template ?? suggestTemplate(product.kind);
  const theme = input.theme ?? suggestTheme(product.category, product.kind);
  const now = new Date().toISOString();

  return {
    version: 1,
    id: uid('landing'),
    slug: slugify(product.name),
    title: product.name,
    template,
    theme,
    accent: null,
    store,
    product,
    related: input.related ?? [],
    settings: defaultSettings({ ...input, template, theme }),
    sections: sectionsForTemplate(template),
    createdAt: now,
    updatedAt: now,
  };
}

/** Producto "servicio" creado a mano en el panel. */
export function makeServiceProduct(input: {
  name: string;
  description: string;
  price: number;
  images: string[];
  category?: string;
  features?: string[];
}): Product {
  return {
    id: `svc_${slugify(input.name)}`,
    name: input.name,
    description: input.description,
    price: input.price,
    currency: 'COP',
    image: input.images[0] ?? null,
    images: input.images,
    video: null,
    category: input.category || 'Servicios',
    kind: 'service',
    linea: 'servicio',
    sku: null,
    features: input.features ?? [],
    paymentLink: null,
    opciones: null,
  };
}
