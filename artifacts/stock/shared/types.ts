/**
 * Tipos compartidos entre el servidor y la interfaz (DTOs de la API).
 * Nada de aquí toca la base de datos ni el DOM.
 */

export const ASSET_TYPES = ["photo", "illustration", "vector", "video", "audio", "template", "3d"] as const;
export type AssetType = (typeof ASSET_TYPES)[number];

export const ASSET_TYPE_LABEL: Record<AssetType, string> = {
  photo: "Foto",
  illustration: "Ilustración",
  vector: "Vector",
  video: "Vídeo",
  audio: "Audio",
  template: "Plantilla",
  "3d": "3D",
};

export const ASSET_TYPE_PLURAL: Record<AssetType, string> = {
  photo: "Fotos",
  illustration: "Ilustraciones",
  vector: "Vectores",
  video: "Vídeos",
  audio: "Audio",
  template: "Plantillas",
  "3d": "3D",
};

/** Pestañas del buscador (las mismas que Adobe Stock: Todos, Imágenes, Vídeos, Audio, Plantillas, 3D, Gratis, Premium). */
export const SEARCH_TABS = [
  { id: "all", label: "Todos" },
  { id: "images", label: "Imágenes" },
  { id: "video", label: "Vídeos" },
  { id: "audio", label: "Audio" },
  { id: "template", label: "Plantillas" },
  { id: "3d", label: "3D" },
  { id: "free", label: "Gratis" },
  { id: "premium", label: "Premium" },
] as const;
export type SearchTab = (typeof SEARCH_TABS)[number]["id"];

export const ORIENTATIONS = ["horizontal", "vertical", "square", "panoramic"] as const;
export type Orientation = (typeof ORIENTATIONS)[number];
export const ORIENTATION_LABEL: Record<Orientation, string> = {
  horizontal: "Horizontal", vertical: "Vertical", square: "Cuadrado", panoramic: "Panorámico",
};

export type AssetStatus = "draft" | "pending" | "approved" | "rejected" | "disabled";
export type LicenseType = "standard" | "extended";
export type UserRole = "user" | "contributor" | "admin";

export const SORT_OPTIONS = [
  { id: "relevance", label: "Relevancia" },
  { id: "recent", label: "Más recientes" },
  { id: "downloads", label: "Descargas" },
  { id: "undiscovered", label: "Sin descubrir" },
] as const;
export type SortOption = (typeof SORT_OPTIONS)[number]["id"];

export interface AssetColor { hex: string; ratio: number }

export interface AssetSummary {
  id: number;
  type: AssetType;
  title: string;
  width: number;
  height: number;
  orientation: Orientation;
  durationSec: number | null;
  resolutionLabel: string | null;
  isFree: boolean;
  isPremium: boolean;
  isEditorial: boolean;
  isAiGenerated: boolean;
  thumbUrl: string;
  cardUrl: string;
  previewUrl: string;
  posterUrl: string | null;
  blurData: string | null;
  colors: AssetColor[];
  waveform: number[] | null;
  contributor: { id: number; name: string } | null;
  priceCredits: { standard: number; extended: number };
  createdAt: string;
}

export interface AssetDetail extends AssetSummary {
  description: string;
  keywords: string[];
  category: { id: number; slug: string; name: string } | null;
  fileFormat: string;
  fileSizeBytes: number;
  fps: number | null;
  hasPeople: boolean;
  peopleCount: number;
  modelRelease: boolean;
  propertyRelease: boolean;
  seriesId: string | null;
  views: number;
  downloads: number;
  status: AssetStatus;
  rejectionReason: string | null;
  licensedByMe: LicenseType | null;
  savedInCollections: number[];
}

export interface SearchFilters {
  q?: string;
  tab?: SearchTab;
  types?: AssetType[];
  category?: string;
  orientation?: Orientation[];
  color?: string;           // hex
  price?: "free" | "premium" | "all";
  ai?: "include" | "exclude" | "only";
  editorial?: "include" | "exclude" | "only";
  people?: "any" | "with" | "without";
  peopleCount?: "1" | "2" | "3+";
  minWidth?: number;
  minDuration?: number;
  maxDuration?: number;
  resolution?: "HD" | "4K";
  contributor?: number;
  series?: string;
  similar?: number;
  collection?: string;
  safe?: boolean;
  period?: "24h" | "7d" | "30d" | "1y";
  sort?: SortOption;
  page?: number;
  perPage?: number;
}

export interface SearchResponse {
  items: AssetSummary[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
  facets: {
    types: { type: AssetType; count: number }[];
  };
  suggestions: string[];
  tookMs: number;
}

export interface CategoryDto { id: number; slug: string; name: string; description: string | null; coverUrl: string | null; count: number }

export interface CollectionDto {
  id: number;
  slug: string;
  title: string;
  description: string | null;
  isPublic: boolean;
  isCurated: boolean;
  ownerId: number | null;
  coverUrl: string | null;
  previews: string[];
  count: number;
  createdAt: string;
  updatedAt: string;
}

export interface PlanDto {
  id: number;
  slug: string;
  name: string;
  creditsPerMonth: number;
  videosPerMonth: number;
  priceMonthlyCents: number;
  priceAnnualMonthlyCents: number;
  features: string[];
  badge: string | null;
  audience: "individual" | "team" | "enterprise";
}

export interface CreditPackDto { id: number; credits: number; priceCents: number; label: string | null }

export interface SubscriptionState {
  planId: number;
  planName: string;
  status: "active" | "cancelled" | "expired";
  billing: "monthly" | "annual";
  periodStart: string;
  periodEnd: string;
  creditsLeft: number;
  videosLeft: number;
}

export interface UserDto {
  id: number;
  email: string;
  name: string;
  role: UserRole;
  avatarUrl: string | null;
  country: string | null;
  credits: number;
  subscription: SubscriptionState | null;
  contributor: {
    displayName: string;
    bio: string | null;
    website: string | null;
    payoutMethod: string | null;
    payoutAccount: string | null;
    acceptedTermsAt: string;
  } | null;
  earningsCents: number;
  createdAt: string;
}

export interface LicenseDto {
  id: number;
  certificateNo: string;
  type: LicenseType;
  creditsSpent: number;
  source: "credits" | "subscription" | "free";
  createdAt: string;
  downloadsCount: number;
  asset: AssetSummary;
}

export interface OrderDto {
  id: number;
  kind: "pack" | "subscription";
  referenceId: number;
  billing: "monthly" | "annual" | null;
  amountCents: number;
  currency: string;
  status: "pending" | "paid" | "cancelled" | "failed";
  provider: string;
  providerRef: string | null;
  instructions: { bank?: string; account?: string; holder?: string; reference: string; checkoutUrl?: string } | null;
  createdAt: string;
  paidAt: string | null;
  description: string;
}

export interface BrandInfo {
  name: string;
  tagline: string;
  currency: string;
  locale: string;
  creditValueCents: number;
  aiEnabled: boolean;
  paymentsEnabled: { mercadopago: boolean; transfer: boolean };
  royalty: { image: number; video: number; audio: number };
  payoutMinimumCents: number;
  stats: { assets: number; contributors: number; downloads: number };
}

export interface ContributorStats {
  totals: { assets: number; approved: number; pending: number; rejected: number; views: number; downloads: number; licenses: number; earningsCents: number; paidCents: number; availableCents: number };
  byDay: { day: string; views: number; licenses: number; earningsCents: number }[];
  topAssets: (AssetSummary & { views: number; licenses: number })[];
}

export interface AdminStats {
  users: number; contributors: number; assets: number; pendingAssets: number; licenses: number;
  revenueCents: number; pendingOrders: number; pendingPayouts: number;
  byDay: { day: string; licenses: number; revenueCents: number; signups: number }[];
}
