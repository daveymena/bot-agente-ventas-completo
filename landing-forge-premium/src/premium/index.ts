/**
 * Landing Forge Premium – VentasProIA
 * API pública del motor. Esto es lo único que necesita importar el
 * generador existente para integrarlo.
 *
 * ```ts
 * import { renderLanding, createLandingDocument, TEMPLATES, THEMES } from '@/premium';
 *
 * const doc = createLandingDocument({ product, store, related });
 * const html = renderLanding(doc.product, doc.store, {
 *   slug: doc.slug, template: doc.template, theme: doc.theme,
 *   settings: doc.settings, sections: doc.sections, related: doc.related,
 * });
 * ```
 */

/* Tipos */
export type {
  Angle,
  Awareness,
  Bonus,
  Bundle,
  CopyBundle,
  CopyStep,
  FaqItem,
  LandingDocument,
  LandingSettings,
  Offer,
  OrderPayload,
  Product,
  ProductKind,
  ProductOption,
  RelatedProduct,
  RenderConfig,
  Review,
  SectionSpec,
  SectionType,
  SocialProof,
  StoreInfo,
  TemplateId,
  TemplateMeta,
  Theme,
  ThemeId,
  ThemeTokens,
  Tracking,
  Utm,
} from './types';

/* Render */
export { renderLanding, renderLandingFull, renderLandingDocument, buildUtmLink } from './render';
export type { RenderResult } from './render';

/* Plantillas */
export {
  TEMPLATES,
  TEMPLATE_LIST,
  TEMPLATE_IDS,
  suggestTemplate,
  sectionsForTemplate,
  codProductSections,
  advertorialSections,
  digitalCourseSections,
  serviceWhatsappSections,
} from './templates';

/* Temas */
export {
  THEMES,
  THEME_LIST,
  THEME_IDS,
  suggestTheme,
  resolveTheme,
  themeCssVars,
  contrastOn,
  hexToRgba,
} from './themes';

/* Secciones */
export { SECTION_REGISTRY, SECTION_LABELS, PINNED_SECTIONS } from './sections/registry';

/* Copy */
export { buildCopy, defaultFaq, extractBenefits, extractCurriculum, cleanSupplierText, waMessage } from './copy/generator';
export type { CopyInput } from './copy/generator';
export {
  ANGLES,
  AWARENESS_LABEL,
  AWARENESS_HINT,
  PAIN_HOOKS,
  DESIRE_PROMISES,
  TRUST_SEALS,
  TRUST_SEALS_DIGITAL,
  CLOSER_LINE,
  CLOSER_LINE_PLAIN,
  detectFamily,
  sanitizeClaims,
  hasBannedClaim,
  FAMILY_LABEL,
} from './copy/angles';
export type { Family } from './copy/angles';

/* Defaults */
export {
  createLandingDocument,
  defaultSettings,
  defaultOffer,
  defaultBundles,
  defaultServicePlans,
  makeServiceProduct,
} from './defaults';
export type { DefaultsInput } from './defaults';

/* Datos de la tienda */
export {
  STORE_BASE,
  STORE_SLUG,
  absoluteUrl,
  normalizeStore,
  normalizeProduct,
  normalizeRelated,
  normalizeProductPayload,
  normalizeCatalog,
  waLink,
  storeProductUrl,
} from './store';
export type { NormalizedCatalog, NormalizedProductPayload } from './store';

/* Utilidades */
export {
  cop,
  toNumber,
  toNumberOr,
  discountPercent,
  prettyPrice,
  slugify,
  esc,
  stripEmoji,
  humanTitle,
  longDate,
  compactNumber,
  truncate,
  uid,
} from './format';

/* Colombia */
export { COLOMBIA, DEPARTMENT_NAMES, citiesOf, colombiaMap } from './data/colombia';
export type { Department } from './data/colombia';

/* Semilla */
export { SEED_CATALOG, SEED_PRODUCTS, SEED_STORE, seedProductPayload, DEMO_PHYSICAL_ID, DEMO_DIGITAL_ID } from './data/seed';

/* Íconos */
export { icon, pickIconForText, ICON_NAMES } from './icons';
