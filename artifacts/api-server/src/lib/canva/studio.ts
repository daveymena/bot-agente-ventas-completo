import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import { db, products, tenants } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { canvaRequest, CanvaError } from "../canva-connector";
import { getImageStoreDir } from "../image-store";
import { beneficiosDe, inventaCifras } from "../creativos/datos";
import { leerKit } from "../creativos/kit";
import { FORMATS, getJob, jobs, locked, saveJob, saveTemplate, templates, type Family, type Format, type Job, type Mapping, type Template } from "./store";

export const FIELDS = ["nombre", "precio", "descripcion", "beneficio1", "beneficio2", "beneficio3", "gancho", "apoyo", "cta", "marca", "foto", "logo"] as const;
const id = (value: unknown) => { const v = String(value || ""); if (!/^[a-zA-Z0-9_-]{1,80}$/.test(v)) throw new CanvaError("Identificador inválido", 400); return v; };
const safeUrl = (raw: unknown, canvaOnly = false) => {
  try { const u = new URL(String(raw)); if (u.protocol !== "https:" || u.username || u.password) return null;
    if (canvaOnly && !(u.hostname === "canva.com" || u.hostname.endsWith(".canva.com") || u.hostname.endsWith(".canva.ai"))) return null;
    if (!canvaOnly && (u.hostname === "localhost" || /^[0-9.]+$/.test(u.hostname) || u.hostname.startsWith("[") || u.hostname.endsWith(".local") || u.hostname.endsWith(".internal"))) return null;
    return u.href;
  } catch { return null; }
};
export async function productData(tenantId: number, productId: number) {
  const [p] = await db.select().from(products).where(and(eq(products.id, productId), eq(products.tenantId, tenantId))).limit(1);
  if (!p) throw new CanvaError("El producto no existe en este negocio", 404);
  const [tenant] = await db.select({ name: tenants.brandName }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  const { kit, definido } = await leerKit(tenantId);
  let features: unknown = p.features; if (typeof features === "string") { try { features = JSON.parse(features); } catch { features = []; } }
  const benefits = beneficiosDe({ features, description: p.description });
  const family: Family = /^(physical|fisico|dropshipping)$/i.test(String(p.kind)) ? "fisico" : /^(service|servicio|consulting|consultoria)$/i.test(String(p.kind)) ? "servicio" : "digital";
  const absolute = (url: unknown) => { const s = String(url || ""); return safeUrl(s.startsWith("/uploads/") ? `${String(process.env.APP_URL || "https://ventasproia.com").replace(/\/$/, "")}${s}` : s); };
  const price = Number(p.price);
  return { productId: p.id, productName: p.name, family, kit, kitDefinido: definido, fields: {
    nombre: p.name, precio: Number.isFinite(price) && price > 0 ? `${new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 }).format(price)} ${p.currency || "COP"}` : "Consultar precio",
    descripcion: String(p.description || "").slice(0, 500), beneficio1: benefits[0] || "", beneficio2: benefits[1] || "", beneficio3: benefits[2] || "",
    gancho: p.name, apoyo: benefits[0] || "", cta: "Pide información", marca: String(tenant?.name || ""), foto: absolute(p.imageUrl) || "", logo: absolute(kit.logo) || "",
  } };
}
export function mapFields(dataset: any, mapping: Mapping, fields: Record<string, string>, assets: Record<string, string> = {}) {
  const data: Record<string, any> = {};
  const entries = Object.entries(dataset || {});
  if (!entries.length) throw new CanvaError("Este diseño no tiene campos de autorrelleno. Configúralos en Canva antes de usarlo como plantilla.", 400);
  for (const [name, spec] of entries as [string, any][]) {
    const field = mapping[name];
    if (!field || !FIELDS.includes(field as any)) throw new CanvaError(`Asigna el campo «${name}» antes de generar`, 400);
    if (spec.type === "text") {
      if (["foto", "logo"].includes(field)) throw new CanvaError(`«${name}» necesita texto`, 400);
      if (!String(fields[field] || "").trim()) throw new CanvaError(`El producto no tiene un valor para «${field}»`, 400);
      data[name] = { type: "text", text: fields[field] };
    } else if (spec.type === "image") {
      if (!["foto", "logo"].includes(field) || !fields[field]) throw new CanvaError(`Falta una imagen válida para «${name}»`, 400);
      data[name] = { type: "image", asset_id: assets[field] || "pendiente" };
    } else throw new CanvaError(`El campo «${name}» es ${spec.type}. Usa una plantilla de texto e imágenes; el video puede estar en su línea de tiempo.`, 400);
  }
  for (const name of Object.keys(mapping)) if (!(name in dataset)) throw new CanvaError(`El campo «${name}» cambió en Canva. Actualiza la plantilla.`, 409);
  return data;
}
export async function sourceDataset(tenantId: number, type: Template["sourceType"], sourceId: string) {
  return (await canvaRequest(tenantId, `/${type === "brand_template" ? "brand-templates" : "designs"}/${id(sourceId)}/dataset`)).dataset || {};
}
export async function registerTemplate(tenantId: number, input: any) {
  if (!["digital", "fisico", "servicio"].includes(input.family) || !["design", "brand_template"].includes(input.sourceType)) throw new CanvaError("Elige familia y tipo de plantilla", 400);
  const dataset = await sourceDataset(tenantId, input.sourceType, input.sourceId);
  const mapping = input.mapping;
  if (!mapping || typeof mapping !== "object" || Array.isArray(mapping) || Object.keys(mapping).length > 60) throw new CanvaError("Mapa de campos inválido", 400);
  const placeholders = Object.fromEntries(FIELDS.map((f) => [f, `Valor de ${f}`])); mapFields(dataset, mapping, placeholders);
  return saveTemplate(tenantId, { id: createHash("sha256").update(`${input.family}:${input.sourceType}:${input.sourceId}`).digest("hex").slice(0, 20), family: input.family, sourceType: input.sourceType, sourceId: id(input.sourceId), title: String(input.title || "Mi plantilla").slice(0, 100), mapping });
}

export async function catalog(tenantId: number, query = "", continuation = "", type: "design" | "brand_template" = "design") {
  const params = new URLSearchParams({ limit: "24" }); if (query) params.set("query", query.slice(0, 100)); if (continuation) params.set("continuation", continuation.slice(0, 2000));
  const result = await canvaRequest(tenantId, `/${type === "brand_template" ? "brand-templates" : "designs"}?${params}`);
  return { items: (result.items || []).map((d: any) => ({ id: d.id, title: d.title || "Sin título", thumbnail: safeUrl(d.thumbnail?.url, true), editUrl: safeUrl(d.urls?.edit_url, true) })), continuation: result.continuation || null };
}

const running = new Set<string>();
const waiting: Array<() => Promise<void>> = [];
let active = 0;
function pump() { while (active < 2 && waiting.length) { const run = waiting.shift()!; active++; void run().finally(() => { active--; pump(); }); } }
export const isRunning = (j: Job) => running.has(`${j.tenantId}:${j.id}`);
async function remote(j: Job, key: string, endpoint: string, body: unknown) {
  if (!j.pending || j.pending.key !== key) {
    const result = await canvaRequest(j.tenantId, endpoint, body);
    if (!result.job?.id) throw new Error("Canva no devolvió el identificador del trabajo");
    j.pending = { key, path: endpoint, id: id(result.job.id) }; await saveJob(j);
  }
  const started = Date.now();
  while (Date.now() - started < 180_000) {
    await new Promise((r) => setTimeout(r, 2000));
    let result: any;
    try { result = await canvaRequest(j.tenantId, `${j.pending.path}/${j.pending.id}`); }
    catch (e: any) { if (e.status === 429 || e.status >= 500) continue; throw e; }
    if (result.job?.status === "failed") { j.pending = undefined; throw new Error(`Canva: ${String(result.job.error?.code || "trabajo rechazado").slice(0, 100)}`); }
    if (result.job?.status === "success") { const job = result.job; j.pending = undefined; return job; }
  }
  throw new Error("Canva sigue procesando. Puedes continuar este trabajo sin empezar de nuevo.");
}
function designResult(job: any) { const d = job.result?.design || job.result?.designs?.[0] || job.design; if (!d?.id) throw new Error("Canva no devolvió el diseño terminado"); return { designId: id(d.id), editUrl: safeUrl(d.urls?.edit_url, true) || undefined, thumbnail: safeUrl(d.thumbnail?.url, true) || undefined }; }
async function upload(j: Job, field: "foto" | "logo") {
  const key = field === "foto" ? "imageAsset" : "logoAsset";
  if (j[key]) return j[key]!;
  const result = await remote(j, `asset-${field}`, "/url-asset-uploads", { name: `${j.productName} · ${field}`.slice(0, 255), url: j.texts[field] });
  const asset = result.asset || result.result?.asset;
  if (!asset?.id) throw new Error("Canva no devolvió la imagen subida");
  j[key] = id(asset.id); await saveJob(j); return j[key]!;
}

/** Solo descarga URLs firmadas devueltas por Canva, sin seguir redirecciones. */
export async function storeExport(tenantId: number, url: string, format: string): Promise<{ url: string; format: string; bytes: number }> {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || !(parsed.hostname === "canva.com" || parsed.hostname.endsWith(".canva.com"))) throw new Error("Canva devolvió una descarga no permitida");
  if (!["png", "jpg", "pdf", "mp4"].includes(format)) throw new Error("Formato inválido");
  const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(60_000) });
  if (!response.ok || !response.body) throw new Error("No se pudo descargar el archivo de Canva");
  const max = format === "mp4" ? 80 * 1024 * 1024 : 25 * 1024 * 1024;
  if (Number(response.headers.get("content-length")) > max) { await response.body.cancel(); throw new Error("Archivo demasiado grande"); }
  const reader = response.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
  try { while (true) { const r = await reader.read(); if (r.done) break; size += r.value.byteLength; if (size > max) throw new Error("Archivo demasiado grande"); chunks.push(r.value); } } catch (e) { await reader.cancel().catch(() => {}); throw e; }
  const bytes = Buffer.concat(chunks);
  const valid = format === "png" ? bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) : format === "jpg" ? bytes[0] === 255 && bytes[1] === 216 : format === "pdf" ? bytes.subarray(0, 5).toString() === "%PDF-" : bytes.subarray(4, 8).toString() === "ftyp";
  if (!valid) throw new Error("La descarga no coincide con el formato solicitado");
  const name = `${randomUUID()}.${format}`, dir = path.join(getImageStoreDir(), "canva", String(tenantId)); await mkdir(dir, { recursive: true });
  const tmp = path.join(dir, `.${name}.tmp`); await writeFile(tmp, bytes); await rename(tmp, path.join(dir, name));
  return { url: `/uploads/canva/${tenantId}/${name}`, format, bytes: size };
}

async function processJob(j: Job) {
  j.state = "trabajando"; j.error = undefined; await saveJob(j);
  try {
    let dataset: any;
    if (j.template) {
      dataset = await sourceDataset(j.tenantId, j.template.sourceType, j.template.sourceId);
      mapFields(dataset, j.template.mapping, j.texts);
      if (Object.values(j.template.mapping).includes("foto")) { j.phase = "Subiendo la foto del producto"; await saveJob(j); await upload(j, "foto"); }
      if (Object.values(j.template.mapping).includes("logo")) { j.phase = "Subiendo el logo"; await saveJob(j); await upload(j, "logo"); }
    }
    for (const piece of j.pieces) {
      if (piece.files?.length && (!j.nativeFamily || piece.designId)) continue;
      if (j.nativeFamily) {
        j.phase = `Diseñando ${piece.angle} · ${piece.format}`; await saveJob(j);
        if (!piece.files?.length) {
          const { crearCreativos } = await import("../creativos/atlas");
          const r = await crearCreativos(j.tenantId, { productId: j.productId, formato: piece.format, maqueta: j.nativeFamily === "digital" ? "editorial" : j.nativeFamily === "fisico" ? "premium" : "beneficios", cantidad: 1,
            gancho: j.texts[`gancho_${piece.angle}`] || j.texts.gancho, apoyo: j.texts[`apoyo_${piece.angle}`] || j.texts.apoyo, cta: j.texts.cta, conIA: false, exportar: true, juzgar: false });
          if (!r.ok) throw new Error(r.error);
          const c = r.creativos[0]; if (!c?.png) throw new Error("No se pudo renderizar el creativo. Comprueba Chromium y las fotos del producto.");
          piece.creativeId = c.id; piece.files = [{ url: c.png, format: "png", bytes: 0 }]; await saveJob(j);
        }
        if (!piece.nativeAsset) {
          const url = `${String(process.env.APP_URL || "https://ventasproia.com").replace(/\/$/, "")}${piece.files[0].url}`;
          const result = await remote(j, `native-upload-${piece.key}`, "/url-asset-uploads", { name: `${j.productName} · ${piece.angle}`, url });
          const asset = result.asset || result.result?.asset; if (!asset?.id) throw new Error("No se pudo subir el creativo a Canva");
          piece.nativeAsset = id(asset.id); await saveJob(j);
        }
        if (!piece.designId) {
          const result = await canvaRequest(j.tenantId, "/designs", { design_type: { type: "custom", ...FORMATS[piece.format] }, asset_id: piece.nativeAsset, title: `${j.productName} · ${piece.angle}`.slice(0, 255) });
          if (!result.design?.id) throw new Error("No se pudo crear el diseño en Canva");
          Object.assign(piece, { designId: id(result.design.id), editUrl: safeUrl(result.design.urls?.edit_url, true) || undefined }); await saveJob(j);
        }
        continue;
      }
      if (!piece.designId && j.template) {
        j.phase = `Preparando ${piece.angle} · ${piece.format}`; await saveJob(j);
        // Cada concepto usa una copia; las tres medidas parten de esa copia.
        const sibling = j.pieces.find((x) => x.angle === piece.angle && x.designId);
        let design = (j as any)[`base_${piece.angle}`] || (sibling ? { designId: sibling.designId!, editUrl: sibling.editUrl, thumbnail: sibling.thumbnail } : null);
        if (!design) {
          const angleTexts = { ...j.texts, gancho: j.texts[`gancho_${piece.angle}`] || j.texts.gancho, apoyo: j.texts[`apoyo_${piece.angle}`] || j.texts.apoyo };
          const data = mapFields(dataset, j.template.mapping, angleTexts, { foto: j.imageAsset!, logo: j.logoAsset! });
          const source = j.template.sourceType === "brand_template" ? { type: "create_from_brand_template", brand_template_id: j.template.sourceId } : { type: "create_from_design", design_id: j.template.sourceId };
          design = designResult(await remote(j, `fill-${piece.angle}`, "/autofills", { ...source, title: `${j.productName} · ${piece.angle}`.slice(0, 255), data }));
          // Conservar el diseño base antes de iniciar otra operación remota.
          (j as any)[`base_${piece.angle}`] = design; await saveJob(j);
        }
        const base = (j as any)[`base_${piece.angle}`] || design;
        Object.assign(piece, designResult(await remote(j, `resize-${piece.key}`, "/resizes", { design_id: base.designId, design_type: { type: "custom", ...FORMATS[piece.format] } })));
        await saveJob(j);
      }
      if (!piece.designId) throw new Error("Falta el diseño de Canva");
      j.phase = `Guardando ${piece.angle} · ${piece.format}`; await saveJob(j);
      const result = await remote(j, `export-${piece.key}`, "/exports", { design_id: piece.designId, format: { type: j.exportFormat } });
      if (!Array.isArray(result.urls) || !result.urls.length || result.urls.length > 30) throw new Error("Canva no devolvió archivos exportados válidos");
      // La URL firmada se usa solo para copiar al volumen. Nunca queda como imagen de producto.
      const files = []; for (const url of result.urls) files.push(await storeExport(j.tenantId, url, j.exportFormat));
      piece.files = files;
      await saveJob(j);
    }
    j.state = "listo"; j.phase = "Listo para revisar y usar";
  } catch (e: any) { j.state = "error"; j.error = String(e.message || "No se pudo completar el trabajo").slice(0, 400); }
  await saveJob(j);
}
export function start(j: Job) {
  const key = `${j.tenantId}:${j.id}`; if (running.has(key)) return;
  running.add(key); waiting.push(async () => { try { await processJob(j); } catch {} finally { running.delete(key); } }); pump();
}
export async function createJob(tenantId: number, input: any) {
  return locked(tenantId, "create", async () => {
    const requestId = id(input.requestId || randomUUID());
    const requestHash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
    const old = await getJob(tenantId, requestId);
    if (old) { if (old.requestHash !== requestHash) throw new CanvaError("Esta solicitud ya corresponde a otro trabajo", 409); return old; }
    const all = await jobs(tenantId);
    if (all.some(isRunning)) throw new CanvaError("Espera a que termine el trabajo actual de este negocio", 409);
    if (all.length >= 200) throw new CanvaError("Se alcanzó el máximo de 200 paquetes guardados", 409);
    const p = await productData(tenantId, Number(input.productId));
    const template = input.templateId ? (await templates(tenantId)).find((x) => x.id === input.templateId) : undefined;
    const nativeFamily: Family | undefined = input.native === true ? p.family : undefined;
    if (nativeFamily && input.exportFormat && input.exportFormat !== "png") throw new CanvaError("Los diseños de Studio se generan en PNG. Para MP4 importa un diseño de video de Canva.", 400);
    if (input.templateId && !template) throw new CanvaError("Plantilla no encontrada en este negocio", 404);
    if (!template && !nativeFamily && !input.designId) throw new CanvaError("Elige una plantilla o un diseño para importar", 400);
    const formats: Format[] = [...new Set<Format>((Array.isArray(input.formats) ? input.formats : ["4:5"]).filter((f: any) => typeof f === "string" && Object.hasOwn(FORMATS, f)))];
    if (!formats.length) throw new CanvaError("Elige al menos un formato", 400);
    const angles = template || nativeFamily ? ["beneficio", "detalle", "consulta"].slice(0, input.threeAngles === false ? 1 : 3) : ["original"];
    const objective = input.objective === "ventas" ? "ventas" : "mensajes";
    // Solo los ganchos son redacción editable. Precio, ficha, foto y marca vienen de la base.
    const texts = { ...p.fields, cta: objective === "ventas" ? "Ver producto" : "Escríbenos para conocer más", gancho_beneficio: p.fields.nombre,
      gancho_detalle: "Conoce lo que incluye", apoyo_detalle: [p.fields.beneficio1, p.fields.beneficio2].filter(Boolean).join(" · "),
      gancho_consulta: "¿Es lo que estás buscando?", apoyo_consulta: "Conoce los detalles y resuelve tus dudas" };
    for (const key of ["gancho_beneficio", "gancho_detalle", "gancho_consulta"] as const) if (input.texts?.[key]) {
      const text = String(input.texts[key]).slice(0, 120);
      if (inventaCifras(text, { datos: { nombre: p.fields.nombre, precio: p.fields.precio, beneficios: [p.fields.beneficio1, p.fields.beneficio2, p.fields.beneficio3], sellos: [] } as any })) throw new CanvaError("El titular contiene cifras o descuentos que no están en el catálogo", 400);
      texts[key] = text;
    }
    if (template) { if (template.family !== p.family) throw new CanvaError(`La plantilla es para ${template.family}; este producto es ${p.family}`, 400); mapFields(await sourceDataset(tenantId, template.sourceType, template.sourceId), template.mapping, texts); }
    const sourceDesignId = template || nativeFamily ? undefined : id(input.designId);
    const original = sourceDesignId ? (await canvaRequest(tenantId, `/designs/${sourceDesignId}`)).design : null; // comprobar acceso antes de encolar
    const j: Job = { id: requestId, tenantId, productId: p.productId, productName: p.productName, objective, usage: ["tienda", "landing"].includes(input.usage) ? input.usage : "anuncio", template,
      nativeFamily, sourceDesignId, exportFormat: ["jpg", "pdf", "mp4"].includes(input.exportFormat) ? input.exportFormat : "png", state: "en_cola", phase: "En cola", created: new Date().toISOString(), updated: new Date().toISOString(), requestHash,
      texts, pieces: template || nativeFamily ? angles.flatMap((angle) => formats.map((format) => ({ key: `${angle}-${format.replace(":", "x")}`, angle, format }))) : [{ key: "original", angle: "original", format: formats[0], designId: sourceDesignId, editUrl: safeUrl(original?.urls?.edit_url, true) || undefined }] };
    await saveJob(j); start(j); return j;
  });
}
export async function resumeJob(tenantId: number, jobId: string) {
  return locked(tenantId, "create", async () => {
    const j = await getJob(tenantId, jobId); if (!j) throw new CanvaError("Trabajo no encontrado", 404);
    if (j.state !== "listo" && !isRunning(j)) {
      if ((await jobs(tenantId)).some(isRunning)) throw new CanvaError("Espera a que termine el trabajo actual de este negocio", 409);
      j.state = "en_cola"; j.error = undefined; j.phase = "En cola para continuar"; await saveJob(j);
      start(j);
    }
    return j;
  });
}
export async function listJobs(tenantId: number) { return (await jobs(tenantId)).map((j) => ({ ...j, texts: undefined, pending: undefined, paused: ["trabajando", "en_cola"].includes(j.state) && !isRunning(j) })); }
export async function linkAd(tenantId: number, jobId: string, pieceKey: string, adId: string) {
  if (!/^\d{5,40}$/.test(adId)) throw new CanvaError("ID de anuncio de Meta inválido", 400);
  return locked(tenantId, "ad-bindings", async () => { const j = await getJob(tenantId, jobId); if (!j || j.state !== "listo") throw new CanvaError("El creativo todavía no está listo", 409);
    if ((await jobs(tenantId)).some((other) => other.pieces.some((p) => p.adIds?.includes(adId) && (other.id !== jobId || p.key !== pieceKey)))) throw new CanvaError("Ese anuncio ya está asociado a otro creativo", 409);
    const piece = j.pieces.find((p) => p.key === pieceKey); if (!piece) throw new CanvaError("Variante no encontrada", 404);
    piece.adIds = [...new Set([...(piece.adIds || []), adId])].slice(0, 20); await saveJob(j); return j;
  });
}
