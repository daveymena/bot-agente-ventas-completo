import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, CloudUpload, Copy, FileImage, Film, Music, Sparkles, Trash2, Wand2, X, AlertCircle, Box, LayoutTemplate } from "lucide-react";
import type { AssetType } from "@shared/types";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/store/auth";
import { toast } from "@/store/ui";
import { bytes, typeLabel } from "@/lib/format";
import { cn, probeMediaFile } from "@/lib/utils";
import { Button, Checkbox, Field, Input, Select, Textarea } from "@/components/ui";

type Item = {
  key: string; file: File; type: AssetType; previewUrl: string | null; cover: File | null; poster: Blob | null;
  meta: { durationSec?: number; width?: number; height?: number; waveform?: number[] };
  title: string; description: string; keywords: string[]; categorySlug: string; hasPeople: boolean; peopleCount: number; modelRelease: boolean; isEditorial: boolean; isAiGenerated: boolean; isFree: boolean; seriesId: string;
  tagging: boolean; status: "idle" | "uploading" | "done" | "error"; progress: number; error: string | null; assetId: number | null;
};

const EXT_TYPE: Record<string, AssetType> = { jpg: "photo", jpeg: "photo", png: "photo", webp: "photo", tif: "photo", tiff: "photo", svg: "vector", ai: "vector", eps: "vector", mp4: "video", mov: "video", webm: "video", mkv: "video", mp3: "audio", wav: "audio", ogg: "audio", flac: "audio", m4a: "audio", psd: "template", pptx: "template", docx: "template", zip: "template", indd: "template", glb: "3d", gltf: "3d", obj: "3d", fbx: "3d", blend: "3d" };
const guessType = (f: File): AssetType => EXT_TYPE[f.name.split(".").pop()?.toLowerCase() || ""] || (f.type.startsWith("video/") ? "video" : f.type.startsWith("audio/") ? "audio" : "photo");
const TYPE_ICON: Record<AssetType, any> = { photo: FileImage, illustration: FileImage, vector: FileImage, video: Film, audio: Music, template: LayoutTemplate, "3d": Box };

function uploadWithProgress(fd: FormData, onProgress: (p: number) => void): Promise<any> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/contributor/upload");
    xhr.withCredentials = true;
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100)); };
    xhr.onload = () => { let body: any = null; try { body = JSON.parse(xhr.responseText); } catch {} if (xhr.status >= 200 && xhr.status < 300) resolve(body); else reject(new ApiError(xhr.status, body?.error || `Error ${xhr.status}`, body?.details)); };
    xhr.onerror = () => reject(new Error("Error de red durante la subida"));
    xhr.send(fd);
  });
}

function KeywordEditor({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [draft, setDraft] = useState("");
  const add = (raw: string) => { const parts = raw.split(/[,;\n]/).map((s) => s.trim().toLowerCase()).filter(Boolean); if (!parts.length) return; const set = new Set(value); for (const p of parts) if (set.size < 50) set.add(p); onChange([...set]); setDraft(""); };
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-2 focus-within:ring-2 focus-within:ring-brand-500/30">
      <div className="flex flex-wrap gap-1">
        {value.map((k, i) => <span key={k} className={cn("inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs", i < 10 ? "bg-brand-50 text-brand-800" : "bg-slate-100 text-slate-700")}>{k}<button type="button" onClick={() => onChange(value.filter((x) => x !== k))} className="text-mute hover:text-ink"><X className="h-3 w-3" /></button></span>)}
        <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(draft); } else if (e.key === "Backspace" && !draft && value.length) onChange(value.slice(0, -1)); }} onBlur={() => draft && add(draft)} onPaste={(e) => { const t = e.clipboardData.getData("text"); if (t.includes(",") || t.includes("\n")) { e.preventDefault(); add(t); } }} placeholder={value.length ? "" : "Escribí y presioná Enter o coma…"} className="min-w-[160px] flex-1 bg-transparent px-1 py-0.5 text-sm outline-none" />
      </div>
      <p className="mt-1 text-[11px] text-mute">{value.length}/50 · las primeras 10 pesan más en la búsqueda{value.length < 5 && " · mínimo 5"}</p>
    </div>
  );
}

export default function UploadPage() {
  const { brand } = useAuth();
  const qc = useQueryClient();
  const cats = useQuery({ queryKey: ["categories"], queryFn: api.categories, staleTime: 300_000 });
  const [items, setItems] = useState<Item[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const coverRef = useRef<HTMLInputElement>(null);
  const patch = useCallback((key: string, p: Partial<Item> | ((it: Item) => Partial<Item>)) => setItems((list) => list.map((it) => (it.key === key ? { ...it, ...(typeof p === "function" ? p(it) : p) } : it))), []);
  useEffect(() => { document.title = "Subir recursos"; }, []);
  useEffect(() => () => { items.forEach((i) => i.previewUrl && i.previewUrl.startsWith("blob:") && URL.revokeObjectURL(i.previewUrl)); }, []);

  const addFiles = async (files: FileList | File[]) => {
    const arr = Array.from(files).slice(0, 20 - items.length);
    if (!arr.length) return;
    const next: Item[] = arr.map((file) => { const type = guessType(file); return { key: `${file.name}-${file.size}-${Math.random().toString(36).slice(2, 7)}`, file, type, previewUrl: file.type.startsWith("image/") || type === "video" ? URL.createObjectURL(file) : null, cover: null, poster: null, meta: {}, title: file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim().slice(0, 140), description: "", keywords: [], categorySlug: "", hasPeople: false, peopleCount: 0, modelRelease: false, isEditorial: false, isAiGenerated: false, isFree: false, seriesId: "", tagging: false, status: "idle", progress: 0, error: null, assetId: null }; });
    setItems((l) => [...l, ...next]); if (!active) setActive(next[0].key);
    for (const it of next) {
      if (it.type === "video" || it.type === "audio") { const m = await probeMediaFile(it.file); patch(it.key, { meta: { durationSec: m.durationSec, width: m.width, height: m.height, waveform: m.waveform }, poster: m.poster || null }); }
      if (it.file.type.startsWith("image/") && it.file.type !== "image/svg+xml" && brand?.aiEnabled) autotag(it.key, it.file);
    }
  };
  const autotag = async (key: string, file: File) => {
    patch(key, { tagging: true });
    try { const r = await api.autotag(file); if (r.tags) patch(key, (it) => ({ title: r.tags!.title || it.title, description: r.tags!.description || it.description, keywords: it.keywords.length ? it.keywords : r.tags!.keywords, categorySlug: it.categorySlug || r.tags!.category || "", hasPeople: r.tags!.hasPeople ?? it.hasPeople })); else if (r.message) toast({ kind: "info", title: r.message }); } catch (e: any) { toast({ kind: "error", title: "No se pudo etiquetar", description: e.message }); } finally { patch(key, { tagging: false }); }
  };
  const remove = (key: string) => { setItems((l) => l.filter((i) => i.key !== key)); if (active === key) setActive(null); };
  const applyToAll = (src: Item) => { setItems((l) => l.map((it) => (it.key === src.key || it.status === "done" ? it : { ...it, keywords: src.keywords, categorySlug: src.categorySlug, description: it.description || src.description, isEditorial: src.isEditorial, isAiGenerated: src.isAiGenerated, isFree: src.isFree, seriesId: src.seriesId, hasPeople: src.hasPeople, modelRelease: src.modelRelease, peopleCount: src.peopleCount }))); toast({ kind: "success", title: "Metadatos copiados al resto" }); };

  const validate = (it: Item) => { if (it.title.trim().length < 4) return "Título demasiado corto"; if (it.keywords.length < 5) return "Agregá al menos 5 palabras clave"; if (it.hasPeople && !it.modelRelease && !it.isEditorial) return "Con personas necesitás autorización de modelo o marcar editorial"; if ((it.type === "template" || it.type === "3d") && !it.cover) return "Las plantillas y 3D necesitan portada JPG/PNG"; return null; };
  const uploadAll = async (submit: boolean) => {
    const pending = items.filter((i) => i.status !== "done");
    for (const it of pending) { const err = validate(it); if (err) { patch(it.key, { error: err, status: "error" }); setActive(it.key); toast({ kind: "error", title: `${it.file.name}: ${err}` }); return; } }
    setSubmitting(true);
    for (const it of pending) {
      patch(it.key, { status: "uploading", progress: 0, error: null });
      const fd = new FormData();
      fd.append("file", it.file); if (it.cover) fd.append("cover", it.cover); if (it.poster && it.type === "video") fd.append("poster", it.poster, "poster.jpg");
      fd.append("title", it.title.trim()); fd.append("description", it.description.trim()); fd.append("keywords", JSON.stringify(it.keywords)); fd.append("type", it.type); if (it.categorySlug) fd.append("categorySlug", it.categorySlug);
      fd.append("isEditorial", String(it.isEditorial)); fd.append("isAiGenerated", String(it.isAiGenerated)); fd.append("hasPeople", String(it.hasPeople)); fd.append("peopleCount", String(it.hasPeople ? it.peopleCount || 1 : 0)); fd.append("modelRelease", String(it.modelRelease)); fd.append("isFree", String(it.isFree)); if (it.seriesId.trim()) fd.append("seriesId", it.seriesId.trim());
      fd.append("submit", String(submit)); if (Object.keys(it.meta).length) fd.append("clientMeta", JSON.stringify(it.meta));
      try { const a = await uploadWithProgress(fd, (p) => patch(it.key, { progress: p })); patch(it.key, { status: "done", progress: 100, assetId: a.id }); }
      catch (e: any) { patch(it.key, { status: "error", error: e.message }); setActive(it.key); }
    }
    setSubmitting(false);
    qc.invalidateQueries({ queryKey: ["my-assets"] }); qc.invalidateQueries({ queryKey: ["contributor-stats"] });
    const ok = items.filter((i) => i.status === "done").length;
    toast({ kind: "success", title: submit ? "Enviado a revisión" : "Guardado como borrador", description: `${ok || pending.length} archivo(s). Te avisamos cuando se publiquen.` });
  };

  const cur = items.find((i) => i.key === active) || null;
  const done = items.filter((i) => i.status === "done").length;

  return (
    <div>
      {items.length === 0 ? (
        <div onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={(e) => { e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files); }} onClick={() => inputRef.current?.click()} className={cn("grid cursor-pointer place-items-center rounded-3xl border-2 border-dashed px-6 py-20 text-center transition", drag ? "border-brand-500 bg-brand-50" : "border-slate-300 hover:border-slate-400 hover:bg-slate-50")}>
          <CloudUpload className="h-12 w-12 text-brand-600" />
          <h2 className="mt-3 text-xl font-bold">Arrastrá tus archivos acá</h2>
          <p className="mt-1 max-w-md text-sm text-mute">Fotos JPG/PNG (mín. 4 MP), vectores SVG, vídeos MP4/MOV, audio MP3/WAV, plantillas y modelos 3D. Hasta 20 archivos por tanda.</p>
          <Button className="mt-5" icon={<CloudUpload className="h-4 w-4" />}>Elegir archivos</Button>
          <p className="mt-6 text-xs text-mute">{brand?.aiEnabled ? <span className="inline-flex items-center gap-1"><Sparkles className="h-3.5 w-3.5 text-brand-600" />La IA sugiere título, descripción y palabras clave automáticamente.</span> : "Consejo: títulos descriptivos y 25-49 palabras clave relevantes venden más."}</p>
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[300px_1fr]">
          {/* Lista de archivos */}
          <div>
            <div className="flex items-center justify-between"><p className="text-sm font-semibold">{items.length} archivo{items.length === 1 ? "" : "s"}{done > 0 && ` · ${done} subidos`}</p><button onClick={() => inputRef.current?.click()} className="text-xs font-semibold text-brand-700 hover:underline">+ Agregar</button></div>
            <ul className="mt-2 max-h-[70vh] space-y-1.5 overflow-y-auto pr-1">
              {items.map((it) => { const Icon = TYPE_ICON[it.type]; const err = it.status === "error" ? it.error : it.status === "idle" ? validate(it) : null; return (
                <li key={it.key} onClick={() => setActive(it.key)} className={cn("flex cursor-pointer items-center gap-2 rounded-xl border p-2", active === it.key ? "border-ink ring-1 ring-ink" : "border-line hover:border-slate-400")}>
                  <div className="relative h-12 w-16 shrink-0 overflow-hidden rounded-lg bg-slate-100">{it.previewUrl && it.type !== "video" ? <img src={it.previewUrl} alt="" className="h-full w-full object-cover" /> : it.previewUrl ? <video src={it.previewUrl} muted className="h-full w-full object-cover" /> : <Icon className="m-auto h-5 w-5 translate-y-3.5 text-mute" />}{it.status === "uploading" && <div className="absolute inset-x-0 bottom-0 h-1 bg-slate-200"><div className="h-full bg-brand-600" style={{ width: `${it.progress}%` }} /></div>}</div>
                  <div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold">{it.title || it.file.name}</p><p className="truncate text-[11px] text-mute">{typeLabel(it.type)} · {bytes(it.file.size)}{it.meta.width ? ` · ${it.meta.width}×${it.meta.height}` : ""}</p>{it.tagging ? <p className="flex items-center gap-1 text-[11px] text-brand-700"><Wand2 className="h-3 w-3 animate-pulse" />Etiquetando…</p> : it.status === "done" ? <p className="flex items-center gap-1 text-[11px] text-emerald-700"><CheckCircle2 className="h-3 w-3" />Subido</p> : err ? <p className="flex items-center gap-1 truncate text-[11px] text-red-700"><AlertCircle className="h-3 w-3 shrink-0" />{err}</p> : <p className="text-[11px] text-emerald-700">Listo para enviar</p>}</div>
                  {it.status !== "uploading" && <button onClick={(e) => { e.stopPropagation(); remove(it.key); }} className="rounded-md p-1 text-mute hover:bg-slate-100 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>}
                </li>
              ); })}
            </ul>
            <div className="mt-3 space-y-2">
              <Button className="w-full" loading={submitting} disabled={items.every((i) => i.status === "done")} onClick={() => uploadAll(true)}>Enviar a revisión</Button>
              <Button className="w-full" variant="secondary" loading={submitting} disabled={items.every((i) => i.status === "done")} onClick={() => uploadAll(false)}>Guardar como borrador</Button>
              {done > 0 && <Link to="/colaborador/recursos" className="block text-center text-xs font-semibold text-brand-700 hover:underline">Ver mis recursos</Link>}
            </div>
          </div>

          {/* Editor del archivo activo */}
          {cur ? (
            <div className="card p-5">
              <div className="flex flex-wrap items-start gap-4">
                <div className="w-full overflow-hidden rounded-xl bg-slate-100 sm:w-72">{cur.type === "video" && cur.previewUrl ? <video src={cur.previewUrl} controls muted className="aspect-video w-full object-contain" /> : cur.previewUrl ? <img src={cur.previewUrl} alt="" className="max-h-64 w-full object-contain" /> : cur.cover ? <img src={URL.createObjectURL(cur.cover)} alt="" className="max-h-64 w-full object-contain" /> : <div className="grid aspect-video place-items-center text-mute">{(() => { const I = TYPE_ICON[cur.type]; return <I className="h-10 w-10" />; })()}</div>}</div>
                <div className="min-w-0 flex-1 space-y-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-mute"><span className="font-semibold text-ink">{cur.file.name}</span><span>{bytes(cur.file.size)}</span>{cur.meta.durationSec ? <span>{Math.round(cur.meta.durationSec)} s</span> : null}{cur.status === "done" && <span className="badge bg-emerald-100 text-emerald-800">Subido</span>}</div>
                  <Field label="Tipo de recurso"><Select value={cur.type} onChange={(e) => patch(cur.key, { type: e.target.value as AssetType })}>{(["photo", "illustration", "vector", "video", "audio", "template", "3d"] as AssetType[]).map((t) => <option key={t} value={t}>{typeLabel(t)}</option>)}</Select></Field>
                  {(cur.type === "template" || cur.type === "3d" || cur.type === "audio") && (
                    <Field label={cur.type === "audio" ? "Portada (opcional)" : "Portada JPG/PNG (obligatoria)"}><div className="flex items-center gap-2"><Button type="button" size="sm" variant="secondary" onClick={() => coverRef.current?.click()}>Elegir imagen</Button><span className="text-xs text-mute">{cur.cover?.name || "Ninguna"}</span><input ref={coverRef} type="file" accept="image/jpeg,image/png" className="hidden" onChange={(e) => patch(cur.key, { cover: e.target.files?.[0] || null })} /></div></Field>
                  )}
                  {cur.file.type.startsWith("image/") && brand?.aiEnabled && <Button type="button" size="sm" variant="secondary" icon={<Wand2 className="h-4 w-4" />} loading={cur.tagging} onClick={() => autotag(cur.key, cur.file)}>Sugerir metadatos con IA</Button>}
                </div>
              </div>
              <fieldset disabled={cur.status === "done" || cur.status === "uploading"} className="mt-5 space-y-3 disabled:opacity-60">
                <Field label="Título" hint={`${cur.title.length}/140 · describí qué se ve, sin palabras de relleno`}><Input value={cur.title} onChange={(e) => patch(cur.key, { title: e.target.value })} maxLength={140} /></Field>
                <Field label="Descripción (opcional)"><Textarea rows={2} value={cur.description} onChange={(e) => patch(cur.key, { description: e.target.value })} maxLength={2000} /></Field>
                <Field label="Palabras clave"><KeywordEditor value={cur.keywords} onChange={(v) => patch(cur.key, { keywords: v })} /></Field>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Categoría"><Select value={cur.categorySlug} onChange={(e) => patch(cur.key, { categorySlug: e.target.value })}><option value="">Elegir…</option>{cats.data?.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}</Select></Field>
                  <Field label="Serie (opcional)" hint="Mismo ID agrupa recursos relacionados"><Input value={cur.seriesId} onChange={(e) => patch(cur.key, { seriesId: e.target.value })} placeholder="ej. cafe-bogota-2026" maxLength={80} /></Field>
                </div>
                <div className="grid gap-2 rounded-xl bg-slate-50 p-3 sm:grid-cols-2">
                  <Checkbox checked={cur.hasPeople} onChange={(v) => patch(cur.key, { hasPeople: v, peopleCount: v ? Math.max(1, cur.peopleCount) : 0 })} label="Aparecen personas reconocibles" />
                  {cur.hasPeople && <label className="flex items-center gap-2 text-sm">¿Cuántas?<Input type="number" min={1} max={50} className="w-20 py-1" value={cur.peopleCount} onChange={(e) => patch(cur.key, { peopleCount: Number(e.target.value) })} /></label>}
                  {cur.hasPeople && <Checkbox checked={cur.modelRelease} onChange={(v) => patch(cur.key, { modelRelease: v })} label="Tengo autorización de modelo firmada" />}
                  <Checkbox checked={cur.isEditorial} onChange={(v) => patch(cur.key, { isEditorial: v })} label="Solo uso editorial (noticias, marcas visibles)" />
                  <Checkbox checked={cur.isAiGenerated} onChange={(v) => patch(cur.key, { isAiGenerated: v })} label="Creado con IA generativa" />
                  <Checkbox checked={cur.isFree} onChange={(v) => patch(cur.key, { isFree: v })} label="Ofrecer gratis (promociona tu portafolio)" />
                </div>
                {cur.error && <p className="flex items-center gap-2 rounded-lg bg-red-50 p-2 text-xs text-red-700"><AlertCircle className="h-4 w-4" />{cur.error}</p>}
                {items.length > 1 && <button type="button" onClick={() => applyToAll(cur)} className="flex items-center gap-1.5 text-xs font-semibold text-brand-700 hover:underline"><Copy className="h-3.5 w-3.5" />Aplicar palabras clave, categoría y opciones a todos los archivos</button>}
              </fieldset>
            </div>
          ) : <div className="card grid place-items-center p-10 text-sm text-mute">Seleccioná un archivo para editar sus datos.</div>}
        </div>
      )}
      <input ref={inputRef} type="file" multiple className="hidden" accept="image/*,video/*,audio/*,.svg,.ai,.eps,.psd,.pptx,.zip,.glb,.gltf,.obj,.fbx" onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }} />
    </div>
  );
}
