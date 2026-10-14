import { useState, type ReactNode } from "react";
import { ChevronDown, RotateCcw } from "lucide-react";
import { ORIENTATIONS, ORIENTATION_LABEL, type Orientation, type SearchFilters, type SearchTab } from "@shared/types";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Checkbox, Radio, Select, Switch } from "@/components/ui";
import { cn } from "@/lib/utils";

const COLORS = ["#ef4444", "#f97316", "#f59e0b", "#84cc16", "#22c55e", "#14b8a6", "#06b6d4", "#3b82f6", "#6366f1", "#a855f7", "#ec4899", "#78350f", "#ffffff", "#9ca3af", "#111827"];

function Group({ title, children, defaultOpen = true }: { title: string; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-line py-3">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between py-1 text-sm font-semibold text-ink"><span>{title}</span><ChevronDown className={cn("h-4 w-4 text-mute transition-transform", open && "rotate-180")} /></button>
      {open && <div className="mt-2 space-y-2">{children}</div>}
    </div>
  );
}

export function activeFilterCount(f: SearchFilters): number {
  let n = 0;
  if (f.types?.length) n++; if (f.category) n++; if (f.orientation?.length) n++; if (f.color) n++; if (f.price && f.price !== "all") n++;
  if (f.ai && f.ai !== "include") n++; if (f.editorial && f.editorial !== "include") n++; if (f.people && f.people !== "any") n++; if (f.peopleCount) n++;
  if (f.minWidth) n++; if (f.minDuration) n++; if (f.maxDuration) n++; if (f.resolution) n++; if (f.period) n++; if (f.safe === false) n++;
  return n;
}

export function FilterPanel({ filters: f, onChange, tab }: { filters: SearchFilters; onChange: (patch: Partial<SearchFilters>) => void; tab: SearchTab }) {
  const cats = useQuery({ queryKey: ["categories"], queryFn: api.categories, staleTime: 5 * 60_000 });
  const showImage = tab === "all" || tab === "images" || tab === "free" || tab === "premium";
  const showVideo = tab === "all" || tab === "video" || tab === "free" || tab === "premium";
  const showAudio = tab === "all" || tab === "audio";
  const toggleOrientation = (o: Orientation) => { const cur = new Set(f.orientation || []); cur.has(o) ? cur.delete(o) : cur.add(o); onChange({ orientation: [...cur] }); };
  const toggleType = (t: any) => { const cur = new Set(f.types || []); cur.has(t) ? cur.delete(t) : cur.add(t); onChange({ types: [...cur] as any }); };
  const reset = () => onChange({ types: [], category: undefined, orientation: [], color: undefined, price: undefined, ai: undefined, editorial: undefined, people: undefined, peopleCount: undefined, minWidth: undefined, minDuration: undefined, maxDuration: undefined, resolution: undefined, period: undefined, safe: undefined });
  const n = activeFilterCount(f);

  return (
    <aside className="text-sm">
      <div className="flex items-center justify-between pb-2"><h2 className="text-base font-bold">Filtros {n > 0 && <span className="ml-1 rounded-full bg-ink px-2 py-0.5 text-[11px] font-bold text-white">{n}</span>}</h2>{n > 0 && <button onClick={reset} className="flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline"><RotateCcw className="h-3 w-3" />Limpiar</button>}</div>

      {(tab === "all" || tab === "images" || tab === "free" || tab === "premium") && (
        <Group title="Tipo de recurso">
          {[["photo", "Fotos"], ["illustration", "Ilustraciones"], ["vector", "Vectores"], ...(tab === "all" || tab === "free" || tab === "premium" ? [["video", "Vídeos"], ["audio", "Audio"], ["template", "Plantillas"], ["3d", "3D"]] : [])].map(([id, l]) => <Checkbox key={id} checked={!!f.types?.includes(id as any)} onChange={() => toggleType(id)} label={l} />)}
        </Group>
      )}

      <Group title="Precio">
        <Radio name="price" checked={!f.price || f.price === "all"} onChange={() => onChange({ price: undefined })} label="Todos" />
        <Radio name="price" checked={f.price === "free"} onChange={() => onChange({ price: "free" })} label="Solo gratis" />
        <Radio name="price" checked={f.price === "premium"} onChange={() => onChange({ price: "premium" })} label="Solo Premium" />
      </Group>

      <Group title="Categoría">
        <Select value={f.category || ""} onChange={(e) => onChange({ category: e.target.value || undefined })}>
          <option value="">Todas las categorías</option>
          {cats.data?.map((c) => <option key={c.slug} value={c.slug}>{c.name}{c.count ? ` (${c.count})` : ""}</option>)}
        </Select>
      </Group>

      {(showImage || showVideo) && (
        <Group title="Orientación">
          <div className="grid grid-cols-2 gap-1.5">
            {ORIENTATIONS.map((o) => (
              <button key={o} onClick={() => toggleOrientation(o)} className={cn("flex items-center gap-2 rounded-lg border px-2.5 py-2 text-xs font-medium", f.orientation?.includes(o) ? "border-ink bg-ink text-white" : "border-slate-200 text-ink-soft hover:border-slate-400")}>
                <span className={cn("block border-2 border-current rounded-sm", o === "horizontal" && "h-3 w-4", o === "vertical" && "h-4 w-3", o === "square" && "h-3.5 w-3.5", o === "panoramic" && "h-2 w-5")} />{ORIENTATION_LABEL[o]}
              </button>
            ))}
          </div>
        </Group>
      )}

      {(showImage || showVideo) && (
        <Group title="Color">
          <div className="flex flex-wrap gap-1.5">
            {COLORS.map((c) => <button key={c} title={c} onClick={() => onChange({ color: f.color?.toLowerCase() === c ? undefined : c })} className={cn("h-7 w-7 rounded-full border transition-transform hover:scale-110", f.color?.toLowerCase() === c ? "ring-2 ring-ink ring-offset-2" : "border-slate-200")} style={{ background: c }} />)}
            <label className="relative h-7 w-7 cursor-pointer overflow-hidden rounded-full border border-slate-200 bg-[conic-gradient(red,yellow,lime,cyan,blue,magenta,red)]" title="Color personalizado"><input type="color" className="absolute inset-0 cursor-pointer opacity-0" onChange={(e) => onChange({ color: e.target.value })} /></label>
          </div>
        </Group>
      )}

      {showImage && (
        <Group title="Personas">
          <Radio name="people" checked={!f.people || f.people === "any"} onChange={() => onChange({ people: undefined, peopleCount: undefined })} label="Indiferente" />
          <Radio name="people" checked={f.people === "with"} onChange={() => onChange({ people: "with" })} label="Con personas" />
          <Radio name="people" checked={f.people === "without"} onChange={() => onChange({ people: "without", peopleCount: undefined })} label="Sin personas" />
          {f.people === "with" && (
            <div className="ml-6 flex gap-1.5">{(["1", "2", "3+"] as const).map((c) => <button key={c} onClick={() => onChange({ peopleCount: f.peopleCount === c ? undefined : c })} className={cn("chip px-2.5 py-1 text-xs", f.peopleCount === c && "chip-active")}>{c}</button>)}</div>
          )}
        </Group>
      )}

      {showVideo && (tab === "video" || tab === "all") && (
        <Group title="Vídeo" defaultOpen={tab === "video"}>
          <div className="flex gap-1.5">{(["HD", "4K"] as const).map((r) => <button key={r} onClick={() => onChange({ resolution: f.resolution === r ? undefined : r })} className={cn("chip px-3 py-1 text-xs", f.resolution === r && "chip-active")}>{r}</button>)}</div>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-mute">Duración mín. (s)<input type="number" min={0} className="input mt-1 py-1.5" value={f.minDuration ?? ""} onChange={(e) => onChange({ minDuration: e.target.value ? Number(e.target.value) : undefined })} /></label>
            <label className="text-xs text-mute">Duración máx. (s)<input type="number" min={0} className="input mt-1 py-1.5" value={f.maxDuration ?? ""} onChange={(e) => onChange({ maxDuration: e.target.value ? Number(e.target.value) : undefined })} /></label>
          </div>
        </Group>
      )}
      {showAudio && tab === "audio" && (
        <Group title="Duración (segundos)">
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-mute">Mínima<input type="number" min={0} className="input mt-1 py-1.5" value={f.minDuration ?? ""} onChange={(e) => onChange({ minDuration: e.target.value ? Number(e.target.value) : undefined })} /></label>
            <label className="text-xs text-mute">Máxima<input type="number" min={0} className="input mt-1 py-1.5" value={f.maxDuration ?? ""} onChange={(e) => onChange({ maxDuration: e.target.value ? Number(e.target.value) : undefined })} /></label>
          </div>
        </Group>
      )}

      {showImage && (
        <Group title="Resolución mínima" defaultOpen={false}>
          <Select value={f.minWidth || ""} onChange={(e) => onChange({ minWidth: e.target.value ? Number(e.target.value) : undefined })}>
            <option value="">Cualquiera</option><option value="1920">1920 px (Full HD)</option><option value="3000">3000 px</option><option value="4000">4000 px (4K)</option><option value="6000">6000 px</option>
          </Select>
        </Group>
      )}

      <Group title="Contenido" defaultOpen={false}>
        <label className="label mt-1">Generado con IA</label>
        <Select value={f.ai || "include"} onChange={(e) => onChange({ ai: e.target.value === "include" ? undefined : (e.target.value as any) })}><option value="include">Incluir</option><option value="exclude">Excluir</option><option value="only">Solo IA</option></Select>
        <label className="label mt-2">Editorial</label>
        <Select value={f.editorial || "include"} onChange={(e) => onChange({ editorial: e.target.value === "include" ? undefined : (e.target.value as any) })}><option value="include">Incluir</option><option value="exclude">Excluir</option><option value="only">Solo editorial</option></Select>
        <label className="label mt-2">Fecha de publicación</label>
        <Select value={f.period || ""} onChange={(e) => onChange({ period: (e.target.value || undefined) as any })}><option value="">Cualquiera</option><option value="24h">Últimas 24 h</option><option value="7d">Última semana</option><option value="30d">Último mes</option><option value="1y">Último año</option></Select>
        <div className="pt-2"><Switch checked={f.safe !== false} onCheckedChange={(v) => onChange({ safe: v ? undefined : false })} label="Búsqueda segura" /></div>
      </Group>
    </aside>
  );
}
