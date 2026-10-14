/**
 * Cliente HTTP tipado para la API de VentasPro Stock. Todas las rutas son
 * relativas (/api/...) para que funcionen detrás de cualquier dominio/proxy.
 */
import type {
  AssetDetail, AssetSummary, BrandInfo, CategoryDto, CollectionDto, ContributorStats, CreditPackDto, LicenseDto, LicenseType,
  OrderDto, PlanDto, SearchFilters, SearchResponse, UserDto, AdminStats,
} from "@shared/types";

export class ApiError extends Error {
  status: number; details: any;
  constructor(status: number, message: string, details?: any) { super(message); this.status = status; this.details = details; }
}

async function request<T>(method: string, url: string, body?: any, opts: { form?: boolean; signal?: AbortSignal } = {}): Promise<T> {
  const init: RequestInit = { method, credentials: "include", headers: {}, signal: opts.signal };
  if (body !== undefined) {
    if (opts.form || body instanceof FormData) init.body = body;
    else { (init.headers as Record<string, string>)["content-type"] = "application/json"; init.body = JSON.stringify(body); }
  }
  const res = await fetch(url, init);
  const ct = res.headers.get("content-type") || "";
  const data = ct.includes("application/json") ? await res.json().catch(() => null) : await res.text().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, (data && typeof data === "object" && data.error) || `Error ${res.status}`, data?.details);
  return data as T;
}

export const get = <T>(url: string, signal?: AbortSignal) => request<T>("GET", url, undefined, { signal });
export const post = <T>(url: string, body?: any) => request<T>("POST", url, body);
export const patch = <T>(url: string, body?: any) => request<T>("PATCH", url, body);
export const put = <T>(url: string, body?: any) => request<T>("PUT", url, body);
export const del = <T>(url: string) => request<T>("DELETE", url);

export function qs(params: Record<string, any>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "" || v === false) continue;
    if (Array.isArray(v)) { if (v.length) sp.set(k, v.join(",")); continue; }
    sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export interface HomeData {
  hero: AssetSummary | null; featured: AssetSummary[]; videos: AssetSummary[]; vectors: AssetSummary[]; templates: AssetSummary[]; audio: AssetSummary[];
  free: AssetSummary[]; recent: AssetSummary[]; categories: CategoryDto[]; curated: CollectionDto[]; trending: string[];
}

export interface Quote { type: LicenseType; credits: number; coveredBySubscription: boolean; canAfford: boolean; alreadyLicensed: boolean; free: boolean }
export interface QuoteResponse { standard: Quote; extended: Quote; credits: number; subscription: UserDto["subscription"] }

export const api = {
  meta: () => get<BrandInfo>("/api/meta"),
  home: () => get<HomeData>("/api/home"),
  categories: () => get<CategoryDto[]>("/api/categories"),
  trending: () => get<string[]>("/api/trending"),
  search: (f: SearchFilters, signal?: AbortSignal) => get<SearchResponse>(`/api/search${qs(f as any)}`, signal),
  visualSearch: (file: File) => { const fd = new FormData(); fd.append("image", file); return post<{ items: AssetSummary[]; keywords: string[]; colors: { hex: string }[]; aiUsed: boolean }>("/api/search/visual", fd); },
  asset: (id: number | string) => get<AssetDetail>(`/api/assets/${id}`),
  similar: (id: number | string) => get<AssetSummary[]>(`/api/assets/${id}/similar`),
  series: (id: number | string) => get<AssetSummary[]>(`/api/assets/${id}/series`),
  contributorMore: (id: number | string) => get<AssetSummary[]>(`/api/assets/${id}/contributor-more`),
  contributor: (id: number | string) => get<{ id: number; name: string; bio: string | null; website: string | null; since: string; stats: { assets: number; downloads: number; views: number } }>(`/api/contributors/${id}`),

  me: () => get<UserDto | null>("/api/auth/me"),
  login: (email: string, password: string) => post<UserDto>("/api/auth/login", { email, password }),
  register: (data: { email: string; password: string; name: string }) => post<UserDto>("/api/auth/register", data),
  logout: () => post<{ ok: true }>("/api/auth/logout"),
  updateMe: (data: Partial<{ name: string; country: string | null; avatarUrl: string | null }>) => patch<UserDto>("/api/auth/me", data),
  changePassword: (current: string, next: string) => post<{ ok: true }>("/api/auth/password", { current, next }),
  sessions: () => get<{ current: boolean; userAgent: string | null; createdAt: string; expiresAt: string }[]>("/api/auth/sessions"),
  creditTransactions: () => get<{ id: number; delta: number; balanceAfter: number; reason: string; note: string | null; createdAt: string }[]>("/api/auth/credits/transactions"),
  demoAccounts: () => get<{ email: string; role: string; password: string }[]>("/api/auth/demo-accounts"),

  collections: () => get<CollectionDto[]>("/api/collections"),
  myCollections: () => get<CollectionDto[]>("/api/collections/mine"),
  collection: (slug: string, page = 1) => get<{ collection: CollectionDto; items: AssetSummary[]; total: number; page: number; perPage: number }>(`/api/collections/${slug}?page=${page}`),
  createCollection: (data: { title: string; description?: string; isPublic?: boolean; assetId?: number }) => post<CollectionDto>("/api/collections", data),
  updateCollection: (id: number, data: Partial<{ title: string; description: string | null; isPublic: boolean; coverAssetId: number | null }>) => patch<CollectionDto>(`/api/collections/${id}`, data),
  deleteCollection: (id: number) => del<{ ok: true }>(`/api/collections/${id}`),
  addToCollection: (id: number, assetId: number) => post<{ ok: true }>(`/api/collections/${id}/items`, { assetId }),
  removeFromCollection: (id: number, assetId: number) => del<{ ok: true }>(`/api/collections/${id}/items/${assetId}`),

  catalog: () => get<{ plans: PlanDto[]; packs: CreditPackDto[]; currency: string; creditValueCents: number; providers: { mercadopago: boolean; transfer: boolean } }>("/api/billing/catalog"),
  createOrder: (data: { kind: "pack" | "subscription"; referenceId: number; billing?: "monthly" | "annual"; provider?: "manual" | "mercadopago" }) => post<OrderDto>("/api/billing/orders", data),
  orders: () => get<OrderDto[]>("/api/billing/orders"),
  order: (id: number | string) => get<OrderDto>(`/api/billing/orders/${id}`),
  cancelOrder: (id: number) => post<{ ok: true }>(`/api/billing/orders/${id}/cancel`),

  licenseText: () => get<Record<LicenseType, { name: string; short: string; bullets: string[] }>>("/api/licenses/text"),
  quote: (assetId: number) => get<QuoteResponse>(`/api/licenses/quote?assetId=${assetId}`),
  license: (assetId: number, type: LicenseType) => post<{ license: LicenseDto; user: UserDto }>("/api/licenses", { assetId, type }),
  licenses: () => get<LicenseDto[]>("/api/licenses"),

  joinContributor: (data: { displayName: string; bio?: string; website?: string; acceptTerms: true }) => post<UserDto>("/api/contributor/join", data),
  updateContributorProfile: (data: Record<string, any>) => patch<UserDto>("/api/contributor/profile", data),
  upload: (fd: FormData) => post<AssetDetail>("/api/contributor/upload", fd),
  autotag: (file: File) => { const fd = new FormData(); fd.append("image", file); return post<{ enabled: boolean; tags: { title: string; description: string; keywords: string[]; category: string | null; hasPeople?: boolean } | null; message?: string }>("/api/contributor/autotag", fd); },
  myAssets: (params: { status?: string; q?: string; page?: number }) => get<{ items: AssetDetail[]; total: number; page: number; perPage: number }>(`/api/contributor/assets${qs(params)}`),
  updateMyAsset: (id: number, data: Record<string, any>) => patch<AssetDetail>(`/api/contributor/assets/${id}`, data),
  deleteMyAsset: (id: number) => del<{ ok: true; deleted: boolean }>(`/api/contributor/assets/${id}`),
  contributorStats: () => get<ContributorStats>("/api/contributor/stats"),
  earnings: () => get<{ id: number; assetId: number; title: string; licenseType: LicenseType; amountCents: number; rate: number; status: string; createdAt: string }[]>("/api/contributor/earnings"),
  payouts: () => get<{ id: number; amountCents: number; method: string; account: string; status: string; note: string | null; requestedAt: string; resolvedAt: string | null }[]>("/api/contributor/payouts"),
  requestPayout: (method: string, account: string) => post<{ id: number; user: UserDto }>("/api/contributor/payouts", { method, account }),

  aiStatus: () => get<{ enabled: boolean; imageModel: string | null; sizes: string[] }>("/api/ai/status"),
  aiGenerate: (prompt: string, size: string) => post<{ generationId: number; revisedPrompt: string | null; asset: AssetDetail }>("/api/ai/generate", { prompt, size }),
  aiGenerations: () => get<{ id: number; prompt: string; size: string; status: string; error: string | null; createdAt: string; asset: AssetDetail | null }[]>("/api/ai/generations"),
  aiPublish: (id: number) => post<AssetDetail>(`/api/ai/generations/${id}/publish`),

  admin: {
    stats: () => get<AdminStats>("/api/admin/stats"),
    assets: (params: { status?: string; q?: string; page?: number }) => get<{ items: AssetDetail[]; total: number; page: number; perPage: number }>(`/api/admin/assets${qs(params)}`),
    approve: (id: number, data: { featured?: boolean; isPremium?: boolean; isFree?: boolean } = {}) => post<AssetDetail>(`/api/admin/assets/${id}/approve`, data),
    reject: (id: number, reason: string) => post<AssetDetail>(`/api/admin/assets/${id}/reject`, { reason }),
    rejectionReasons: () => get<{ id: string; label: string }[]>("/api/admin/rejection-reasons"),
    patchAsset: (id: number, data: Record<string, any>) => patch<AssetDetail>(`/api/admin/assets/${id}`, data),
    deleteAsset: (id: number) => del<{ ok: true }>(`/api/admin/assets/${id}`),
    users: (params: { q?: string; role?: string; page?: number }) => get<{ items: (UserDto & { status: string; assetCount: number; licenseCount: number; lastLoginAt: string | null })[]; total: number }>(`/api/admin/users${qs(params)}`),
    patchUser: (id: number, data: { role?: string; status?: string; creditsDelta?: number; note?: string }) => patch<UserDto>(`/api/admin/users/${id}`, data),
    orders: (status: string) => get<(OrderDto & { user: { email: string; name: string } })[]>(`/api/admin/orders?status=${status}`),
    markPaid: (id: number) => post<{ ok: true; changed: boolean }>(`/api/admin/orders/${id}/paid`),
    cancelOrder: (id: number) => post<{ ok: true }>(`/api/admin/orders/${id}/cancel`),
    payouts: (status: string) => get<{ id: number; amountCents: number; method: string; account: string; status: string; note: string | null; requestedAt: string; resolvedAt: string | null; contributor: { id: number; email: string; name: string } }[]>(`/api/admin/payouts?status=${status}`),
    resolvePayout: (id: number, status: "paid" | "rejected", note?: string) => post<{ ok: true }>(`/api/admin/payouts/${id}/resolve`, { status, note }),
    collections: () => get<CollectionDto[]>("/api/admin/collections"),
    createCollection: (data: { slug: string; title: string; description?: string; isPublic?: boolean }) => post<CollectionDto>("/api/admin/collections", data),
    addToCollection: (id: number, assetId: number) => post<{ ok: true }>(`/api/admin/collections/${id}/items`, { assetId }),
    removeFromCollection: (id: number, assetId: number) => del<{ ok: true }>(`/api/admin/collections/${id}/items/${assetId}`),
    deleteCollection: (id: number) => del<{ ok: true }>(`/api/admin/collections/${id}`),
    createCategory: (data: { slug: string; name: string; description?: string }) => post<{ id: number }>("/api/admin/categories", data),
    deleteCategory: (id: number) => del<{ ok: true }>(`/api/admin/categories/${id}`),
    settings: () => get<Record<string, any>>("/api/admin/settings"),
    saveSettings: (data: Record<string, any>) => put<{ ok: true }>("/api/admin/settings", data),
  },
};
