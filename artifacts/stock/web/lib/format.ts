import type { AssetSummary, AssetType } from "@shared/types";
import { ASSET_TYPE_LABEL } from "@shared/types";

let LOCALE = "es-CO";
let CURRENCY = "COP";
export function configureFormat(locale: string, currency: string) { LOCALE = locale || LOCALE; CURRENCY = currency || CURRENCY; }

export function money(cents: number, currency = CURRENCY): string {
  const minor = currency === "COP" || currency === "CLP" ? 0 : 2;
  return new Intl.NumberFormat(LOCALE, { style: "currency", currency, minimumFractionDigits: minor, maximumFractionDigits: minor }).format(cents / 100);
}

export function num(n: number): string { return new Intl.NumberFormat(LOCALE).format(n); }

export function compact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")} M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")} mil`;
  return String(n);
}

export function credits(n: number): string { return n === 0 ? "Gratis" : n === 1 ? "1 crédito" : `${num(n)} créditos`; }

export function duration(sec: number | null | undefined): string {
  if (sec == null || !isFinite(sec)) return "";
  const s = Math.round(sec);
  const m = Math.floor(s / 60), r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

export function bytes(n: number): string {
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(2)} GB`;
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${n} B`;
}

export function dateShort(iso: string): string {
  return new Date(iso).toLocaleDateString(LOCALE, { day: "numeric", month: "short", year: "numeric" });
}
export function dateTime(iso: string): string {
  return new Date(iso).toLocaleString(LOCALE, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
export function relTime(iso: string): string {
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 60) return "hace un momento";
  if (d < 3600) return `hace ${Math.floor(d / 60)} min`;
  if (d < 86400) return `hace ${Math.floor(d / 3600)} h`;
  if (d < 86400 * 30) return `hace ${Math.floor(d / 86400)} d`;
  return dateShort(iso);
}

export function megapixels(w: number, h: number): string { return `${((w * h) / 1e6).toFixed(1)} MP`; }

export function typeLabel(t: AssetType): string { return ASSET_TYPE_LABEL[t] || t; }

export function slugify(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}

export function assetPath(a: Pick<AssetSummary, "id" | "title" | "type">): string {
  const seg = a.type === "video" ? "video" : a.type === "audio" ? "audio" : a.type === "template" ? "plantillas" : a.type === "3d" ? "3d" : "imagenes";
  return `/${seg}/${slugify(a.title) || "recurso"}/${a.id}`;
}

export function ratio(a: Pick<AssetSummary, "width" | "height" | "type">): number {
  if (a.type === "audio") return 16 / 6;
  if (!a.width || !a.height) return 4 / 3;
  return Math.min(3.2, Math.max(0.45, a.width / a.height));
}

export function pluralize(n: number, one: string, many: string): string { return `${num(n)} ${n === 1 ? one : many}`; }

export const REASON_LABEL: Record<string, string> = {
  pack_purchase: "Compra de paquete", subscription_grant: "Créditos de suscripción", license: "Licencia", refund: "Reembolso", admin_adjust: "Ajuste", signup_bonus: "Bono de bienvenida", payout: "Pago",
};
