import path from "node:path";
import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { getImageStoreDir } from "../image-store";

export const FORMATS = { "1:1": { width: 1080, height: 1080 }, "4:5": { width: 1080, height: 1350 }, "9:16": { width: 1080, height: 1920 } };
export type Format = keyof typeof FORMATS;
export type Family = "digital" | "fisico" | "servicio";
export type Mapping = Record<string, string>;
export interface Template { id: string; family: Family; sourceType: "design" | "brand_template"; sourceId: string; title: string; mapping: Mapping }
export interface Piece { creativeId?: string; nativeAsset?: string; key: string; angle: string; format: Format; designId?: string; editUrl?: string; thumbnail?: string; files?: { url: string; format: string; bytes: number }[]; adIds?: string[] }
export interface Job { nativeFamily?: Family; id: string; tenantId: number; productId: number; productName: string; objective: "mensajes" | "ventas"; usage: "anuncio" | "tienda" | "landing"; template?: Template; exportFormat: "png" | "jpg" | "pdf" | "mp4"; state: "en_cola" | "trabajando" | "listo" | "error"; phase: string; error?: string; created: string; updated: string; pieces: Piece[]; pending?: { key: string; path: string; id: string }; sourceDesignId?: string; requestHash: string; imageAsset?: string; logoAsset?: string; texts: Record<string, string>; }
const safeId = /^[a-zA-Z0-9_-]{1,80}$/;
export function directory(tenantId: number) {
  if (!Number.isSafeInteger(tenantId) || tenantId < 1) throw new Error("Negocio inválido");
  return path.join(process.env.CANVA_STUDIO_DIR || path.resolve(getImageStoreDir(), "..", "canva-studio"), String(tenantId));
}
async function read<T>(tenantId: number, name: string): Promise<T | null> { try { return JSON.parse(await readFile(path.join(directory(tenantId), name), "utf8")); } catch (e: any) { if (e.code === "ENOENT") return null; throw e; } }
async function write(tenantId: number, name: string, data: unknown) {
  const dir = directory(tenantId); await mkdir(dir, { recursive: true });
  const tmp = path.join(dir, `.${randomUUID()}.tmp`); await writeFile(tmp, JSON.stringify(data), { mode: 0o600 }); await rename(tmp, path.join(dir, name));
}
const locks = new Map<string, Promise<unknown>>();
export async function locked<T>(tenantId: number, key: string, run: () => Promise<T>): Promise<T> {
  const id = `${tenantId}:${key}`, previous = locks.get(id) || Promise.resolve();
  const next = previous.catch(() => {}).then(run); locks.set(id, next);
  try { return await next; } finally { if (locks.get(id) === next) locks.delete(id); }
}
export async function templates(tenantId: number): Promise<Template[]> { return await read(tenantId, "templates.json") || []; }
export async function saveTemplate(tenantId: number, t: Template) {
  return locked(tenantId, "templates", async () => { const all = await templates(tenantId); const rest = all.filter((x) => x.id !== t.id); if (rest.length >= 30) throw new Error("Máximo 30 plantillas guardadas por negocio"); await write(tenantId, "templates.json", [...rest, t]); return t; });
}
export async function getJob(tenantId: number, id: string): Promise<Job | null> {
  if (!safeId.test(id)) return null;
  const j = await read<Job>(tenantId, `${id}.json`); return j?.tenantId === tenantId ? j : null;
}
export async function saveJob(j: Job) { if (!safeId.test(j.id) || j.id === "templates") throw new Error("Trabajo inválido"); j.updated = new Date().toISOString(); await write(j.tenantId, `${j.id}.json`, j); }
export async function jobs(tenantId: number): Promise<Job[]> {
  let names: string[]; try { names = await readdir(directory(tenantId)); } catch (e: any) { if (e.code === "ENOENT") return []; throw e; }
  const result = await Promise.all(names.filter((n) => n.endsWith(".json") && n !== "templates.json").map((n) => getJob(tenantId, n.slice(0, -5))));
  return result.filter((j): j is Job => !!j).sort((a, b) => b.created.localeCompare(a.created));
}
