/**
 * Filas de `assets` → DTOs. Un solo lugar decide qué URL ve el público: nunca
 * la del original, siempre la del derivado con marca de agua.
 */
import { parseJson, get, all, run } from "../db/client";
import { config } from "../config";
import { baseCredits } from "../../shared/pricing";
import type { AssetDetail, AssetSummary, AssetType, LicenseType, Orientation } from "../../shared/types";

export interface AssetRow {
  id: number; uuid: string; type: AssetType; title: string; description: string | null; keywords: string; keywords_text: string;
  category_id: number | null; contributor_id: number | null; status: string; rejection_reason: string | null;
  is_free: number; is_premium: number; is_editorial: number; is_ai_generated: number; has_people: number; people_count: number;
  model_release: number; property_release: number; mature: number; width: number; height: number; orientation: Orientation;
  duration_sec: number | null; fps: number | null; resolution_label: string | null; file_format: string; file_size_bytes: number;
  original_path: string | null; preview_path: string | null; thumb_path: string | null; card_path: string | null; poster_path: string | null;
  waveform: string | null; colors: string | null; hue: number | null; saturation: number | null; lightness: number | null; dhash: string | null;
  blur_data: string | null; series_id: string | null; views: number; downloads: number; licenses_count: number; featured: number;
  price_credits_standard: number | null; price_credits_extended: number | null; external_source: string | null; external_url: string | null;
  created_at: string; approved_at: string | null; updated_at: string;
  contributor_name?: string | null; category_slug?: string | null; category_name?: string | null;
}

export const ASSET_SELECT = `a.*, u.name AS contributor_name, c.slug AS category_slug, c.name AS category_name`;
export const ASSET_FROM = `assets a LEFT JOIN users u ON u.id = a.contributor_id LEFT JOIN categories c ON c.id = a.category_id`;

export const mediaUrl = (rel: string | null) => (rel ? `/media/${rel}` : null);

/** Previsualización reproducible (vídeo/audio). Sin ffmpeg y en producción, nada: el original no se filtra. */
export function streamPreviewUrl(row: AssetRow): string | null {
  if (row.type === "video") {
    if (row.preview_path && row.preview_path.endsWith(".mp4")) return mediaUrl(row.preview_path);
    return config.isProd && process.env.STOCK_STREAM_ORIGINAL_PREVIEW !== "true" ? null : `/api/assets/${row.id}/stream`;
  }
  if (row.type === "audio") return `/api/assets/${row.id}/stream`;
  return mediaUrl(row.preview_path);
}

export function toSummary(row: AssetRow): AssetSummary {
  const price = baseCredits({
    type: row.type, isFree: !!row.is_free, isPremium: !!row.is_premium, resolutionLabel: row.resolution_label,
    overrideStandard: row.price_credits_standard, overrideExtended: row.price_credits_extended,
  });
  const poster = row.type === "video" ? mediaUrl(row.poster_path || row.card_path) : null;
  return {
    id: row.id, type: row.type, title: row.title, width: row.width, height: row.height, orientation: row.orientation,
    durationSec: row.duration_sec, resolutionLabel: row.resolution_label,
    isFree: !!row.is_free, isPremium: !!row.is_premium, isEditorial: !!row.is_editorial, isAiGenerated: !!row.is_ai_generated,
    thumbUrl: mediaUrl(row.thumb_path) || "", cardUrl: mediaUrl(row.card_path) || mediaUrl(row.thumb_path) || "",
    previewUrl: streamPreviewUrl(row) || mediaUrl(row.card_path) || "", posterUrl: poster,
    blurData: row.blur_data, colors: parseJson(row.colors, []), waveform: parseJson(row.waveform, null),
    contributor: row.contributor_id ? { id: row.contributor_id, name: row.contributor_name || "Colaborador" } : null,
    priceCredits: price, createdAt: row.created_at,
  };
}

export async function toDetail(row: AssetRow, viewerId?: number): Promise<AssetDetail> {
  const s = toSummary(row);
  let licensedByMe: LicenseType | null = null;
  let saved: number[] = [];
  if (viewerId) {
    const lic = await get<{ type: LicenseType }>(`SELECT type FROM licenses WHERE user_id=? AND asset_id=? ORDER BY CASE type WHEN 'extended' THEN 0 ELSE 1 END LIMIT 1`, [viewerId, row.id]);
    licensedByMe = lic?.type ?? null;
    saved = (await all<{ collection_id: number }>(`SELECT ci.collection_id FROM collection_items ci JOIN collections c ON c.id = ci.collection_id WHERE ci.asset_id=? AND c.user_id=?`, [row.id, viewerId])).map((r) => r.collection_id);
  }
  return {
    ...s,
    description: row.description || "", keywords: parseJson<string[]>(row.keywords, []),
    category: row.category_id ? { id: row.category_id, slug: row.category_slug || "", name: row.category_name || "" } : null,
    fileFormat: row.file_format, fileSizeBytes: row.file_size_bytes, fps: row.fps,
    hasPeople: !!row.has_people, peopleCount: row.people_count, modelRelease: !!row.model_release, propertyRelease: !!row.property_release,
    seriesId: row.series_id, views: row.views, downloads: row.downloads, status: row.status as AssetDetail["status"],
    rejectionReason: row.rejection_reason, licensedByMe, savedInCollections: saved,
  };
}

export async function getAssetRow(id: number): Promise<AssetRow | undefined> {
  return get<AssetRow>(`SELECT ${ASSET_SELECT} FROM ${ASSET_FROM} WHERE a.id=?`, [id]);
}

export async function getAssetRows(ids: number[]): Promise<AssetRow[]> {
  if (!ids.length) return [];
  const rows = await all<AssetRow>(`SELECT ${ASSET_SELECT} FROM ${ASSET_FROM} WHERE a.id IN (${ids.map(() => "?").join(",")})`, ids);
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.map((i) => byId.get(i)).filter(Boolean) as AssetRow[];
}

export function normalizeKeywords(list: unknown): string[] {
  const arr = Array.isArray(list) ? list : typeof list === "string" ? list.split(/[,\n;]/) : [];
  const seen = new Set<string>(); const out: string[] = [];
  for (const k of arr) {
    const v = String(k).trim().toLowerCase().replace(/\s+/g, " ").slice(0, 40);
    if (v.length < 2 || seen.has(v)) continue;
    seen.add(v); out.push(v);
    if (out.length >= 50) break; // Adobe acepta hasta 49
  }
  return out;
}

export const keywordsText = (k: string[]) => k.join(" ");

export async function bumpViews(id: number, userId?: number) {
  const day = new Date().toISOString().slice(0, 10);
  await run(`UPDATE assets SET views = views + 1 WHERE id=?`, [id]);
  await run(`INSERT INTO asset_events(asset_id, user_id, kind, day) VALUES (?,?,?,?)`, [id, userId ?? null, "view", day]);
}
