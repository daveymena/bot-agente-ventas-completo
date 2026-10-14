/**
 * Búsqueda del catálogo: FTS5 (sin acentos, prefijos, sinónimos es/en) +
 * filtros SQL + orden por relevancia/recencia/descargas/sin descubrir, con
 * facetas por tipo y sugerencias de búsquedas relacionadas.
 */
import { all, get, run, parseJson } from "../db/client";
import { ASSET_FROM, ASSET_SELECT, toSummary, type AssetRow } from "./assets";
import { hammingHex } from "./media";
import { stripDiacritics, synonymsFor } from "./synonyms";
import { ASSET_TYPES, type AssetSummary, type AssetType, type SearchFilters, type SearchResponse } from "../../shared/types";

const IMAGE_TYPES: AssetType[] = ["photo", "illustration", "vector"];

export function tokenize(q: string): string[] {
  return stripDiacritics(q.toLowerCase())
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 2)
    .slice(0, 8);
}

/** "montañas" → "montan" (prefijo que cubre singular/plural). */
export function stem(t: string): string {
  if (t.length > 5 && t.endsWith("es")) return t.slice(0, -2);
  if (t.length > 3 && t.endsWith("s")) return t.slice(0, -1);
  return t;
}

/** Construye la consulta MATCH de FTS5: (a* OR sinA*) (b* OR sinB*) */
export function buildMatch(q: string): string | null {
  const tokens = tokenize(q);
  if (!tokens.length) return null;
  const groups = tokens.map((tok) => {
    const variants = new Set<string>([stem(tok)]);
    for (const s of synonymsFor(tok)) for (const part of tokenize(s)) variants.add(stem(part));
    const parts = [...variants].filter(Boolean).map((v) => `"${v.replace(/"/g, "")}"*`);
    return parts.length > 1 ? `(${parts.join(" OR ")})` : parts[0]!;
  });
  // FTS5 solo admite AND implícito entre frases simples; con grupos entre paréntesis hay que escribirlo.
  return groups.join(" AND ");
}

function hexToHsl(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1]!, 16);
  let r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0; const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) { case r: h = (g - b) / d + (g < b ? 6 : 0); break; case g: h = (b - r) / d + 2; break; default: h = (r - g) / d + 4; }
    h /= 6;
  }
  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
}

interface Built { where: string[]; args: any[]; join: string; rankExpr: string }

function typesForTab(f: SearchFilters): AssetType[] | null {
  if (f.types?.length) return f.types.filter((t) => (ASSET_TYPES as readonly string[]).includes(t));
  switch (f.tab) {
    case "images": return IMAGE_TYPES;
    case "video": return ["video"];
    case "audio": return ["audio"];
    case "template": return ["template"];
    case "3d": return ["3d"];
    default: return null;
  }
}

function buildWhere(f: SearchFilters, opts: { skipTypes?: boolean } = {}): Built {
  const where: string[] = ["a.status = 'approved'"];
  const args: any[] = [];
  let join = "";
  let rankExpr = "0";

  const match = f.q ? buildMatch(f.q) : null;
  if (match) {
    join = `JOIN (SELECT rowid AS fid, bm25(assets_fts, 12.0, 1.0, 6.0) AS rank FROM assets_fts WHERE assets_fts MATCH ?) f ON f.fid = a.id`;
    args.push(match);
    rankExpr = "(-f.rank)";
  }

  const types = opts.skipTypes ? null : typesForTab(f);
  if (types && types.length) { where.push(`a.type IN (${types.map(() => "?").join(",")})`); args.push(...types); }

  if (f.tab === "free" || f.price === "free") where.push("a.is_free = 1");
  else if (f.tab === "premium" || f.price === "premium") where.push("a.is_premium = 1");

  if (f.category) { where.push("c.slug = ?"); args.push(f.category); }
  if (f.orientation?.length) { where.push(`a.orientation IN (${f.orientation.map(() => "?").join(",")})`); args.push(...f.orientation); }
  if (f.ai === "exclude") where.push("a.is_ai_generated = 0");
  if (f.ai === "only") where.push("a.is_ai_generated = 1");
  if (f.editorial === "exclude") where.push("a.is_editorial = 0");
  if (f.editorial === "only") where.push("a.is_editorial = 1");
  if (f.people === "with") where.push("a.has_people = 1");
  if (f.people === "without") where.push("a.has_people = 0");
  if (f.peopleCount === "1") where.push("a.people_count = 1");
  if (f.peopleCount === "2") where.push("a.people_count = 2");
  if (f.peopleCount === "3+") where.push("a.people_count >= 3");
  if (f.minWidth) { where.push("max(a.width, a.height) >= ?"); args.push(Number(f.minWidth)); }
  if (f.minDuration) { where.push("a.duration_sec >= ?"); args.push(Number(f.minDuration)); }
  if (f.maxDuration) { where.push("a.duration_sec <= ?"); args.push(Number(f.maxDuration)); }
  if (f.resolution === "4K") where.push("a.resolution_label = '4K'");
  if (f.resolution === "HD") where.push("a.resolution_label IN ('HD','4K')");
  if (f.contributor) { where.push("a.contributor_id = ?"); args.push(Number(f.contributor)); }
  if (f.series) { where.push("a.series_id = ?"); args.push(f.series); }
  if (f.collection) { where.push("a.id IN (SELECT ci.asset_id FROM collection_items ci JOIN collections col ON col.id = ci.collection_id WHERE col.slug = ?)"); args.push(f.collection); }
  if (f.safe !== false) where.push("a.mature = 0");
  if (f.period) {
    const ms = { "24h": 86400e3, "7d": 7 * 86400e3, "30d": 30 * 86400e3, "1y": 365 * 86400e3 }[f.period];
    if (ms) { where.push("a.created_at >= ?"); args.push(new Date(Date.now() - ms).toISOString()); }
  }
  if (f.color) {
    const hsl = hexToHsl(f.color);
    if (hsl) {
      const [h, s, l] = hsl;
      if (s < 15) {
        where.push("a.saturation < 22 AND abs(a.lightness - ?) <= 28"); args.push(l);
      } else {
        where.push("a.saturation >= 18 AND min(abs(a.hue - ?), 360 - abs(a.hue - ?)) <= 24"); args.push(h, h);
      }
    }
  }
  return { where, args, join, rankExpr };
}

function orderBy(f: SearchFilters, rankExpr: string): string {
  const popularity = "(log(1 + a.downloads) * 0.35 + log(1 + a.licenses_count) * 0.6 + a.featured * 1.2)";
  switch (f.sort) {
    case "recent": return "a.created_at DESC, a.id DESC";
    case "downloads": return "a.downloads DESC, a.licenses_count DESC, a.created_at DESC";
    case "undiscovered": return "a.views ASC, ((a.id * 2654435761) % 997) ASC";
    default:
      return rankExpr !== "0"
        ? `(${rankExpr} + ${popularity}) DESC, a.created_at DESC`
        : `${popularity} DESC, a.created_at DESC`;
  }
}

export async function searchAssets(f: SearchFilters): Promise<SearchResponse> {
  const t0 = Date.now();
  const page = Math.max(1, Number(f.page) || 1);
  const perPage = Math.min(100, Math.max(1, Number(f.perPage) || 40));
  const b = buildWhere(f);
  const whereSql = b.where.join(" AND ");

  const totalRow = await get<{ n: number }>(`SELECT count(*) AS n FROM ${ASSET_FROM} ${b.join} WHERE ${whereSql}`, b.args);
  const total = Number(totalRow?.n || 0);
  const rows = await all<AssetRow>(
    `SELECT ${ASSET_SELECT} FROM ${ASSET_FROM} ${b.join} WHERE ${whereSql} ORDER BY ${orderBy(f, b.rankExpr)} LIMIT ? OFFSET ?`,
    [...b.args, perPage, (page - 1) * perPage]);

  // Facetas por tipo (mismos filtros, sin el de tipo)
  const bf = buildWhere(f, { skipTypes: true });
  const facetRows = await all<{ type: AssetType; n: number }>(
    `SELECT a.type, count(*) AS n FROM ${ASSET_FROM} ${bf.join} WHERE ${bf.where.join(" AND ")} GROUP BY a.type`, bf.args);

  // Sugerencias: palabras clave más frecuentes entre los primeros resultados que no están en la consulta
  const qTokens = new Set(tokenize(f.q || "").map(stem));
  const freq = new Map<string, number>();
  for (const r of rows.slice(0, 30)) {
    for (const k of parseJson<string[]>(r.keywords, [])) {
      const st = stem(stripDiacritics(k));
      if (qTokens.has(st) || k.length < 3) continue;
      freq.set(k, (freq.get(k) || 0) + 1);
    }
  }
  const suggestions = [...freq.entries()].sort((a, b2) => b2[1] - a[1]).slice(0, 12).map(([k]) => k);

  if (f.q && page === 1) {
    run(`INSERT INTO search_logs(query, results) VALUES (?, ?)`, [f.q.trim().toLowerCase().slice(0, 80), total]).catch(() => {});
  }

  return {
    items: rows.map(toSummary), total, page, perPage, totalPages: Math.max(1, Math.ceil(total / perPage)),
    facets: { types: facetRows.map((r) => ({ type: r.type, count: Number(r.n) })) },
    suggestions, tookMs: Date.now() - t0,
  };
}

/** Recursos parecidos: palabras clave compartidas + hash perceptual + color + mismo tipo/serie. */
export async function similarAssets(id: number, limit = 24): Promise<AssetSummary[]> {
  const base = await get<AssetRow>(`SELECT ${ASSET_SELECT} FROM ${ASSET_FROM} WHERE a.id=?`, [id]);
  if (!base) return [];
  const kws = parseJson<string[]>(base.keywords, []);
  const topKws = kws.slice(0, 10);
  const match = topKws.length ? topKws.map((k) => `"${stem(stripDiacritics(k)).replace(/"/g, "")}"*`).join(" OR ") : null;
  // Misma familia de medio (como Adobe: "similares" nunca mezcla vídeo con fotos)
  const family: AssetType[] = (IMAGE_TYPES as readonly string[]).includes(base.type) ? [...IMAGE_TYPES] : [base.type as AssetType];
  const candidates = await all<AssetRow>(
    `SELECT ${ASSET_SELECT} FROM ${ASSET_FROM} WHERE a.status='approved' AND a.id != ? AND a.type IN (${family.map(() => "?").join(",")}) AND (
        ${match ? "a.id IN (SELECT rowid FROM assets_fts WHERE assets_fts MATCH ?) OR" : ""}
        a.category_id = ? OR a.series_id = ? OR a.contributor_id = ? OR a.hue IS NOT NULL)
     LIMIT 400`,
    match ? [id, ...family, match, base.category_id ?? -1, base.series_id ?? "", base.contributor_id ?? -1] : [id, ...family, base.category_id ?? -1, base.series_id ?? "", base.contributor_id ?? -1]);

  const kwSet = new Set(kws.map((k) => stem(stripDiacritics(k))));
  const scored = candidates.map((c) => {
    const ck = parseJson<string[]>(c.keywords, []).map((k) => stem(stripDiacritics(k)));
    const inter = ck.filter((k) => kwSet.has(k)).length;
    const jaccard = inter / Math.max(1, new Set([...ck, ...kwSet]).size);
    const ham = hammingHex(base.dhash, c.dhash); // 0..64
    const hueD = base.hue != null && c.hue != null ? Math.min(Math.abs(base.hue - c.hue), 360 - Math.abs(base.hue - c.hue)) : 180;
    let score = jaccard * 10 + inter * 0.6 + (1 - ham / 64) * 4 + (1 - hueD / 180) * 1.5;
    if (c.type === base.type) score += 1.5;
    if (c.series_id && c.series_id === base.series_id) score += 3;
    if (c.category_id === base.category_id) score += 0.8;
    if (c.contributor_id === base.contributor_id) score += 0.3;
    return { c, score };
  });
  scored.sort((a, b2) => b2.score - a.score);
  return scored.slice(0, limit).map((s) => toSummary(s.c));
}

/** Búsqueda visual por hash/color: recibe el análisis de la imagen subida. */
export async function visualSearch(input: { dhash: string; hue: number; saturation: number; keywords?: string[] }, limit = 40): Promise<AssetSummary[]> {
  let rows: AssetRow[];
  if (input.keywords?.length) {
    const match = input.keywords.slice(0, 10).map((k) => `"${stem(stripDiacritics(k)).replace(/"/g, "")}"*`).join(" OR ");
    rows = await all<AssetRow>(`SELECT ${ASSET_SELECT} FROM ${ASSET_FROM} WHERE a.status='approved' AND a.type IN ('photo','illustration','vector','video','template') AND (a.id IN (SELECT rowid FROM assets_fts WHERE assets_fts MATCH ?) OR a.dhash IS NOT NULL) LIMIT 1500`, [match]);
  } else {
    rows = await all<AssetRow>(`SELECT ${ASSET_SELECT} FROM ${ASSET_FROM} WHERE a.status='approved' AND a.type IN ('photo','illustration','vector','video','template') AND a.dhash IS NOT NULL LIMIT 1500`);
  }
  const kwSet = new Set((input.keywords || []).map((k) => stem(stripDiacritics(k))));
  const scored = rows.map((c) => {
    const ham = hammingHex(input.dhash, c.dhash);
    const hueD = c.hue != null ? Math.min(Math.abs(input.hue - c.hue), 360 - Math.abs(input.hue - c.hue)) : 180;
    const ck = parseJson<string[]>(c.keywords, []).map((k) => stem(stripDiacritics(k)));
    const inter = ck.filter((k) => kwSet.has(k)).length;
    const score = (1 - ham / 64) * 6 + (1 - hueD / 180) * 2 + inter * 1.2 + (c.saturation != null && Math.abs(c.saturation - input.saturation) < 20 ? 0.5 : 0);
    return { c, score };
  });
  scored.sort((a, b2) => b2.score - a.score);
  return scored.slice(0, limit).map((s) => toSummary(s.c));
}

export async function trendingSearches(limit = 12): Promise<string[]> {
  const rows = await all<{ query: string; n: number }>(
    `SELECT query, count(*) AS n FROM search_logs WHERE results > 0 AND created_at >= ? GROUP BY query ORDER BY n DESC, max(created_at) DESC LIMIT ?`,
    [new Date(Date.now() - 30 * 86400e3).toISOString(), limit]);
  return rows.map((r) => r.query);
}
