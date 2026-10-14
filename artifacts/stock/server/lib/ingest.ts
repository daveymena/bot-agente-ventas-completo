/**
 * Ingesta de recursos: valida, guarda el original en privado, genera
 * derivados públicos y crea la fila. La usan el portal de colaboradores, el
 * generador con IA y el seed de demostración.
 */
import path from "node:path";
import fs from "node:fs/promises";
import { config } from "../config";
import { insert, run, get, nowIso } from "../db/client";
import { badRequest } from "./http";
import {
  AUDIO_FORMATS, IMAGE_FORMATS, MODEL3D_FORMATS, TEMPLATE_FORMATS, VIDEO_FORMATS,
  analyzeAudio, analyzeImage, extOf, makeDerivatives, newUuid, orientationOf, probeMp4, resolutionLabel, saveOriginal, videoComp, videoFrame, originalAbs,
} from "./media";
import { keywordsText, normalizeKeywords } from "./assets";
import type { AssetType } from "../../shared/types";

export interface IngestInput {
  buffer: Buffer;
  filename: string;
  mimetype?: string;
  type?: AssetType;                     // si no viene, se deduce del archivo
  title: string;
  description?: string;
  keywords?: string[] | string;
  categorySlug?: string | null;
  contributorId: number | null;
  status?: "draft" | "pending" | "approved";
  isFree?: boolean; isPremium?: boolean; isEditorial?: boolean; isAiGenerated?: boolean;
  hasPeople?: boolean; peopleCount?: number; modelRelease?: boolean; propertyRelease?: boolean; mature?: boolean;
  seriesId?: string | null;
  featured?: boolean;
  priceCreditsStandard?: number | null; priceCreditsExtended?: number | null;
  /** Vídeo: fotograma capturado en el navegador (JPEG/PNG). */
  poster?: Buffer | null;
  /** Metadatos medidos en el navegador cuando el servidor no puede (vídeo/audio). */
  clientMeta?: { durationSec?: number; width?: number; height?: number; fps?: number; waveform?: number[] } | null;
  /** Imagen de portada para plantillas / 3D / audio (opcional). */
  cover?: Buffer | null;
  createdAt?: string;
  /** Saltar validaciones de calidad (seed/admin). */
  skipQuality?: boolean;
}

export function detectType(filename: string, mimetype?: string, declared?: AssetType): AssetType {
  const ext = extOf(filename);
  if (declared && declared !== "photo") {
    // El tipo declarado manda salvo que el archivo lo contradiga de forma evidente
    if (declared === "vector" && ext !== "svg" && ext !== "ai" && ext !== "eps") return ext === "mp4" || ext === "mov" || ext === "webm" ? "video" : "illustration";
    return declared;
  }
  if (ext === "svg" || ext === "ai" || ext === "eps") return "vector";
  if (VIDEO_FORMATS.has(ext) || mimetype?.startsWith("video/")) return "video";
  if (AUDIO_FORMATS.has(ext) || mimetype?.startsWith("audio/")) return "audio";
  if (MODEL3D_FORMATS.has(ext)) return "3d";
  if (TEMPLATE_FORMATS.has(ext)) return "template";
  if (IMAGE_FORMATS.has(ext) || mimetype?.startsWith("image/")) return declared || "photo";
  throw badRequest(`Formato no soportado: .${ext || "?"}. Aceptamos JPG/PNG/WEBP/TIFF, SVG, MP4/MOV/WEBM, MP3/WAV, PSD/AI/PPTX/ZIP, GLB/OBJ/FBX.`);
}

export async function ingestAsset(input: IngestInput): Promise<number> {
  const type = detectType(input.filename, input.mimetype, input.type);
  const ext = extOf(input.filename) || (type === "photo" ? "jpg" : "bin");
  const title = String(input.title || "").trim();
  if (title.length < 4) throw badRequest("El título debe tener al menos 4 caracteres.");
  const kws = normalizeKeywords(input.keywords ?? []);
  if (!input.skipQuality && kws.length < 5) throw badRequest("Agregá al menos 5 palabras clave (Adobe recomienda entre 25 y 49).");

  const uuid = newUuid();
  const limits = type === "video" ? config.upload.maxVideoBytes : type === "audio" ? config.upload.maxAudioBytes : config.upload.maxImageBytes;
  if (input.buffer.length > limits) throw badRequest("El archivo supera el tamaño máximo permitido.");

  const original = await saveOriginal(input.buffer, uuid, ext);
  const row: Record<string, any> = {
    uuid, type, title, description: (input.description || "").trim().slice(0, 2000), keywords: JSON.stringify(kws), keywords_text: keywordsText(kws),
    category_id: null, contributor_id: input.contributorId, status: input.status || "pending",
    is_free: input.isFree ? 1 : 0, is_premium: input.isPremium ? 1 : 0, is_editorial: input.isEditorial ? 1 : 0, is_ai_generated: input.isAiGenerated ? 1 : 0,
    has_people: input.hasPeople ? 1 : 0, people_count: input.peopleCount || 0, model_release: input.modelRelease ? 1 : 0, property_release: input.propertyRelease ? 1 : 0,
    mature: input.mature ? 1 : 0, width: 0, height: 0, orientation: "horizontal", duration_sec: null, fps: null, resolution_label: null,
    file_format: ext, file_size_bytes: original.bytes, original_path: original.rel, preview_path: null, thumb_path: null, card_path: null, poster_path: null,
    waveform: null, colors: null, hue: null, saturation: null, lightness: null, dhash: null, blur_data: null, series_id: input.seriesId || null,
    featured: input.featured ? 1 : 0, price_credits_standard: input.priceCreditsStandard ?? null, price_credits_extended: input.priceCreditsExtended ?? null,
    created_at: input.createdAt || nowIso(), approved_at: input.status === "approved" ? nowIso() : null, updated_at: nowIso(),
  };
  if (input.categorySlug) {
    const c = await get<{ id: number }>(`SELECT id FROM categories WHERE slug=?`, [input.categorySlug]);
    row.category_id = c?.id ?? null;
  }

  try {
    if (type === "photo" || type === "illustration" || type === "vector" || (type === "template" && IMAGE_FORMATS.has(ext))) {
      const a = await analyzeImage(input.buffer);
      if (!input.skipQuality && type !== "vector" && a.width * a.height < config.upload.minImagePixels) {
        throw badRequest(`La imagen tiene ${a.width}×${a.height}. El mínimo es ${Math.round(config.upload.minImagePixels / 1e6)} MP (p. ej. 2000×2000).`);
      }
      Object.assign(row, { width: a.width, height: a.height, orientation: a.orientation, colors: JSON.stringify(a.colors), hue: a.hue, saturation: a.saturation, lightness: a.lightness, dhash: a.dhash, blur_data: a.blurData, resolution_label: resolutionLabel(a.width, a.height) });
      const d = await makeDerivatives(input.buffer, uuid);
      Object.assign(row, { thumb_path: d.thumbPath, card_path: d.cardPath, preview_path: d.previewPath });
    } else if (type === "video") {
      const probe = ext === "mp4" || ext === "m4v" || ext === "mov" ? probeMp4(input.buffer) : { durationSec: null, width: 0, height: 0, fps: null };
      const cm = input.clientMeta || {};
      const width = probe.width || cm.width || 0, height = probe.height || cm.height || 0;
      Object.assign(row, { width, height, orientation: orientationOf(width, height), duration_sec: probe.durationSec ?? cm.durationSec ?? null, fps: probe.fps ?? cm.fps ?? null, resolution_label: resolutionLabel(width, height) });
      let poster = input.poster || null;
      if (!poster) poster = await videoFrame(originalAbs(original.rel), Math.min(1, (row.duration_sec || 2) / 2));
      if (poster) {
        const a = await analyzeImage(poster);
        const d = await makeDerivatives(poster, uuid);
        Object.assign(row, { colors: JSON.stringify(a.colors), hue: a.hue, saturation: a.saturation, lightness: a.lightness, dhash: a.dhash, blur_data: a.blurData, thumb_path: d.thumbPath, card_path: d.cardPath, poster_path: d.previewPath });
        if (!width) Object.assign(row, { width: a.width, height: a.height, orientation: a.orientation, resolution_label: resolutionLabel(a.width, a.height) });
      }
      const comp = await videoComp(originalAbs(original.rel), uuid);
      row.preview_path = comp;
    } else if (type === "audio") {
      const info = await analyzeAudio(originalAbs(original.rel), input.buffer);
      const cm = input.clientMeta || {};
      Object.assign(row, { duration_sec: info.durationSec ?? cm.durationSec ?? null, waveform: JSON.stringify(info.waveform || cm.waveform || null), orientation: "horizontal" });
      if (input.cover) {
        const a = await analyzeImage(input.cover); const d = await makeDerivatives(input.cover, uuid, { watermark: false });
        Object.assign(row, { colors: JSON.stringify(a.colors), hue: a.hue, saturation: a.saturation, lightness: a.lightness, blur_data: a.blurData, thumb_path: d.thumbPath, card_path: d.cardPath, preview_path: d.previewPath, dhash: a.dhash });
      }
    } else {
      // template / 3d con archivo no visual: necesita portada
      if (input.cover) {
        const a = await analyzeImage(input.cover); const d = await makeDerivatives(input.cover, uuid);
        Object.assign(row, { width: a.width, height: a.height, orientation: a.orientation, colors: JSON.stringify(a.colors), hue: a.hue, saturation: a.saturation, lightness: a.lightness, dhash: a.dhash, blur_data: a.blurData, thumb_path: d.thumbPath, card_path: d.cardPath, preview_path: d.previewPath, resolution_label: resolutionLabel(a.width, a.height) });
      } else if (!input.skipQuality) {
        throw badRequest("Las plantillas y modelos 3D necesitan una imagen de portada (JPG/PNG).");
      }
    }
  } catch (e) {
    await fs.rm(originalAbs(original.rel), { force: true }).catch(() => {});
    throw e;
  }

  const cols = Object.keys(row);
  const id = await insert(`INSERT INTO assets(${cols.join(",")}) VALUES (${cols.map(() => "?").join(",")})`, cols.map((c) => row[c]));
  return id;
}

/** Borra un recurso y sus archivos. */
export async function deleteAssetFiles(row: { original_path: string | null; preview_path: string | null; thumb_path: string | null; card_path: string | null; poster_path: string | null }) {
  const files = [row.original_path && originalAbs(row.original_path), row.preview_path && path.join(config.publicDir, row.preview_path), row.thumb_path && path.join(config.publicDir, row.thumb_path), row.card_path && path.join(config.publicDir, row.card_path), row.poster_path && path.join(config.publicDir, row.poster_path)].filter(Boolean) as string[];
  await Promise.all(files.map((f) => fs.rm(f, { force: true }).catch(() => {})));
}

export async function touchAsset(id: number) { await run(`UPDATE assets SET updated_at=? WHERE id=?`, [nowIso(), id]); }
