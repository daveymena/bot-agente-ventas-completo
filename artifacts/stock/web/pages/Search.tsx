import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { PanelLeftClose, PanelLeftOpen, Sparkles, X, Camera, Layers, Image as ImageIcon, Loader2 } from "lucide-react";
import { SORT_OPTIONS, type AssetSummary, type SearchFilters, type SearchResponse, type SearchTab, ASSET_TYPE_PLURAL } from "@shared/types";
import { api } from "@/lib/api";
import { useUi, toast } from "@/store/ui";
import { useAuth } from "@/store/auth";
import { FilterPanel, activeFilterCount } from "@/components/search/FilterPanel";
import { JustifiedGrid, GridSkeleton } from "@/components/assets/JustifiedGrid";
import { Button, Empty, ErrorBox, Select, useInfiniteScroll } from "@/components/ui";
import { cn } from "@/lib/utils";
import { num } from "@/lib/format";

function parseFilters(sp: URLSearchParams): SearchFilters {
  const g = (k: string) => sp.get(k) || undefined;
  const list = (k: string) => (sp.get(k) ? sp.get(k)!.split(",").filter(Boolean) : undefined);
  return {
    q: g("q"), tab: (g("tab") as SearchTab) || "all", types: list("types") as any, category: g("category"), orientation: list("orientation") as any, color: g("color"),
    price: g("price") as any, ai: g("ai") as any, editorial: g("editorial") as any, people: g("people") as any, peopleCount: g("peopleCount") as any,
    minWidth: sp.get("minWidth") ? Number(sp.get("minWidth")) : undefined, minDuration: sp.get("minDuration") ? Number(sp.get("minDuration")) : undefined, maxDuration: sp.get("maxDuration") ? Number(sp.get("maxDuration")) : undefined,
    resolution: g("resolution") as any, contributor: sp.get("contributor") ? Number(sp.get("contributor")) : undefined, series: g("series"), similar: sp.get("similar") ? Number(sp.get("similar")) : undefined, collection: g("collection"),
    safe: sp.get("safe") === "false" ? false : undefined, period: g("period") as any, sort: (g("sort") as any) || "relevance",
  };
}

function toParams(f: SearchFilters): URLSearchParams {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) {
    if (v === undefined || v === null || v === "" || (Array.isArray(v) && !v.length)) continue;
    if (k === "tab" && v === "all") continue;
    if (k === "sort" && v === "relevance") continue;
    if (k === "safe" && v !== false) continue;
    p.set(k, Array.isArray(v) ? v.join(",") : String(v));
  }
  return p;
}

export default function SearchPage() {
  const [sp] = useSearchParams();
  const navigate = useNavigate();
  const loc = useLocation();
  const { brand } = useAuth();
  const filters = useMemo(() => parseFilters(sp), [sp]);
  const { filtersOpen, setFiltersOpen } = useUi();
  const isVisual = sp.get("visual") === "1";
  const update = useCallback((patch: Partial<SearchFilters>) => { const next = toParams({ ...filters, ...patch }); navigate(`/buscar?${next.toString()}`, { replace: false }); }, [filters, navigate]);

  // Búsqueda visual (imagen subida desde la barra o desde esta página)
  const [visualFile, setVisualFile] = useState<File | null>(() => (window as any).__visualSearchFile || null);
  const [visualPreview, setVisualPreview] = useState<string | null>((loc.state as any)?.previewUrl || null);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (isVisual && (window as any).__visualSearchFile) { setVisualFile((window as any).__visualSearchFile); (window as any).__visualSearchFile = null; } }, [isVisual]);
  const visualQ = useQuery({ queryKey: ["visual", visualFile?.name, visualFile?.size, visualFile?.lastModified], queryFn: () => api.visualSearch(visualFile!), enabled: isVisual && !!visualFile, staleTime: Infinity });

  // Similares a un recurso
  const similarQ = useQuery({ queryKey: ["similar", filters.similar], queryFn: () => api.similar(filters.similar!), enabled: !!filters.similar });
  const similarBase = useQuery({ queryKey: ["asset", filters.similar], queryFn: () => api.asset(filters.similar!), enabled: !!filters.similar });

  const q = useInfiniteQuery<SearchResponse>({
    queryKey: ["search", toParams(filters).toString()],
    queryFn: ({ pageParam = 1, signal }) => api.search({ ...filters, page: pageParam as number, perPage: 40 }, signal),
    getNextPageParam: (last) => (last.page < last.totalPages ? last.page + 1 : undefined),
    enabled: !isVisual && !filters.similar,
    staleTime: 30_000,
    keepPreviousData: false,
  });
  const items: AssetSummary[] = isVisual ? visualQ.data?.items || [] : filters.similar ? similarQ.data || [] : q.data?.pages.flatMap((p) => p.items) || [];
  const total = isVisual ? items.length : filters.similar ? items.length : q.data?.pages[0]?.total ?? 0;
  const first = q.data?.pages[0];
  const loadMore = useCallback(() => { if (q.hasNextPage && !q.isFetchingNextPage) q.fetchNextPage(); }, [q]);
  const sentinel = useInfiniteScroll(loadMore, !!q.hasNextPage);
  const loading = isVisual ? visualQ.isLoading : filters.similar ? similarQ.isLoading : q.isLoading;
  const error = isVisual ? visualQ.error : filters.similar ? similarQ.error : q.error;
  const nFilters = activeFilterCount(filters);

  useEffect(() => { document.title = `${filters.q ? `${filters.q} · ` : ""}${isVisual ? "Búsqueda visual · " : ""}${brand?.name || "Stock"}`; }, [filters.q, isVisual, brand?.name]);

  const tabLabel = filters.tab === "images" ? "imágenes" : filters.tab === "video" ? "vídeo" : filters.tab === "audio" ? "audio" : filters.tab === "template" ? "plantillas" : filters.tab === "free" ? "recursos gratis" : filters.tab === "premium" ? "Premium" : filters.tab === "3d" ? "3D" : "todos";
  const otherFacets = (first?.facets.types || []).filter((t) => { const tabTypes: Record<string, string[]> = { images: ["photo", "illustration", "vector"], video: ["video"], audio: ["audio"], template: ["template"], "3d": ["3d"] }; const cur = tabTypes[filters.tab || "all"]; return !cur || !cur.includes(t.type); });

  const onVisualFile = (f: File | null) => { if (!f) return; if (!f.type.startsWith("image/")) return toast({ kind: "error", title: "Subí una imagen" }); setVisualFile(f); setVisualPreview(URL.createObjectURL(f)); navigate("/buscar?visual=1"); };

  return (
    <div className="container-x py-5">
      {/* Cabecera de resultados */}
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={() => setFiltersOpen(!filtersOpen)} className="btn-secondary btn-sm">{filtersOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}<span className="hidden sm:inline">{filtersOpen ? "Ocultar panel" : "Filtros"}</span><span className="sm:hidden">Filtros</span>{nFilters > 0 && <span className="rounded-full bg-ink px-1.5 text-[10px] text-white">{nFilters}</span>}</button>
        <div className="order-first w-full min-w-0 lg:order-none lg:w-auto lg:flex-1">
          {isVisual ? (
            <div className="flex items-center gap-3">
              {visualPreview && <img src={visualPreview} alt="" className="h-12 w-16 rounded-lg object-cover ring-1 ring-line" />}
              <div><h1 className="text-lg font-bold">Resultados de búsqueda visual</h1><p className="text-xs text-mute">{visualQ.data?.aiUsed ? `La IA detectó: ${visualQ.data.keywords.slice(0, 6).join(", ")}` : "Coincidencia por composición y color. Configurá la IA para búsqueda semántica."}</p></div>
              <button onClick={() => fileRef.current?.click()} className="btn-secondary btn-sm"><Camera className="h-4 w-4" />Otra imagen</button>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => onVisualFile(e.target.files?.[0] || null)} />
            </div>
          ) : filters.similar ? (
            <div className="flex items-center gap-3">
              {similarBase.data && <img src={similarBase.data.thumbUrl} alt="" className="h-12 w-16 rounded-lg object-cover ring-1 ring-line" />}
              <div><h1 className="text-lg font-bold">Recursos similares</h1>{similarBase.data && <p className="line-clamp-1 text-xs text-mute">a «{similarBase.data.title}»</p>}</div>
              <Link to={`/buscar${filters.q ? `?q=${encodeURIComponent(filters.q)}` : ""}`} className="btn-ghost btn-sm"><X className="h-4 w-4" />Quitar</Link>
            </div>
          ) : (
            <h1 className="line-clamp-2 text-lg font-bold tracking-tight lg:truncate">{loading ? "Buscando…" : `${num(total)} resultados${filters.q ? ` para «${filters.q}»` : ""} en ${tabLabel}`}</h1>
          )}
          {!isVisual && !filters.similar && otherFacets.length > 0 && filters.q && (
            <p className="mt-0.5 text-xs text-mute">{otherFacets.slice(0, 3).map((f, i) => <span key={f.type}>{i > 0 && " · "}<button onClick={() => update({ tab: f.type === "video" ? "video" : f.type === "audio" ? "audio" : f.type === "template" ? "template" : f.type === "3d" ? "3d" : "images", types: [] })} className="underline hover:text-ink">{f.count} en {ASSET_TYPE_PLURAL[f.type].toLowerCase()}</button></span>)}</p>
          )}
        </div>
        {!isVisual && !filters.similar && (
          <label className="ml-auto flex items-center gap-2 text-xs text-mute"><span className="hidden sm:inline">Ordenar por</span><Select className="w-36 py-1.5 text-xs sm:w-40" value={filters.sort || "relevance"} onChange={(e) => update({ sort: e.target.value as any })}>{SORT_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</Select></label>
        )}
      </div>

      {/* Sugerencia IA (como Adobe: "generar imágenes personalizadas para X en AI Studio") */}
      {filters.q && !isVisual && !loading && (
        <Link to={`/ia?prompt=${encodeURIComponent(filters.q)}`} className="mt-3 flex items-center gap-2 rounded-xl border border-brand-100 bg-brand-50 px-3 py-2 text-sm text-brand-800 hover:bg-brand-100"><Sparkles className="h-4 w-4" />¿Querés algo distinto? Generá imágenes personalizadas para «{filters.q}» en IA Studio</Link>
      )}

      {/* Chips de filtros activos + sugerencias */}
      {(first?.suggestions?.length || 0) > 0 && !isVisual && (
        <div className="mt-3 flex items-center gap-1.5 overflow-x-auto scrollbar-none"><span className="shrink-0 text-xs text-mute">Relacionadas:</span>{first!.suggestions.slice(0, 12).map((s) => <Link key={s} to={`/buscar?${toParams({ ...filters, q: s }).toString()}`} className="chip shrink-0 text-xs">{s}</Link>)}</div>
      )}

      <div className="mt-4 flex gap-6">
        {filtersOpen && !isVisual && !filters.similar && (
          <div className="w-64 shrink-0 max-lg:fixed max-lg:inset-0 max-lg:z-50 max-lg:w-full max-lg:overflow-y-auto max-lg:bg-white max-lg:p-5">
            <div className="mb-3 flex items-center justify-between lg:hidden"><span className="text-base font-bold">Filtros</span><button onClick={() => setFiltersOpen(false)} className="rounded-md p-1.5 hover:bg-slate-100"><X className="h-5 w-5" /></button></div>
            <div className="sticky top-32 max-h-[calc(100vh-9rem)] overflow-y-auto pr-1 scrollbar-none"><FilterPanel filters={filters} onChange={update} tab={filters.tab || "all"} /></div>
            <div className="mt-4 lg:hidden"><Button className="w-full" onClick={() => setFiltersOpen(false)}>Ver {num(total)} resultados</Button></div>
          </div>
        )}
        <div className="min-w-0 flex-1">
          {loading ? <GridSkeleton /> : error ? <ErrorBox error={error} retry={() => (isVisual ? visualQ.refetch() : q.refetch())} /> : items.length === 0 ? (
            isVisual && !visualFile ? (
              <Empty icon={<Camera className="h-6 w-6" />} title="Buscá con una imagen" body="Subí una foto o captura y encontraremos recursos con composición y colores parecidos." action={<><Button onClick={() => fileRef.current?.click()} icon={<ImageIcon className="h-4 w-4" />}>Elegir imagen</Button><input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => onVisualFile(e.target.files?.[0] || null)} /></>} />
            ) : (
              <Empty icon={<Layers className="h-6 w-6" />} title="No encontramos resultados" body={<>Probá con otras palabras, quitá filtros o buscá en <button onClick={() => update({ tab: "all", types: [] })} className="font-semibold underline">todos los tipos</button>.{filters.q && <> También podés <Link to={`/ia?prompt=${encodeURIComponent(filters.q)}`} className="font-semibold underline">generar «{filters.q}» con IA</Link>.</>}</>} action={nFilters > 0 ? <Button variant="secondary" onClick={() => navigate(`/buscar?${toParams({ q: filters.q, tab: filters.tab }).toString()}`)}>Quitar filtros</Button> : undefined} />
            )
          ) : (
            <>
              <JustifiedGrid items={items} />
              <div ref={sentinel} className="h-10" />
              {q.isFetchingNextPage && <div className="flex justify-center py-6 text-sm text-mute"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Cargando más…</div>}
              {!q.hasNextPage && !isVisual && !filters.similar && total > 40 && <p className="py-6 text-center text-xs text-mute">Fin de los resultados</p>}
              {q.hasNextPage && !q.isFetchingNextPage && <div className="flex justify-center py-4"><Button variant="secondary" onClick={loadMore}>Cargar más</Button></div>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function ActiveChips({ filters, onRemove }: { filters: SearchFilters; onRemove: (k: keyof SearchFilters) => void }) {
  const chips: [keyof SearchFilters, string][] = [];
  if (filters.category) chips.push(["category", filters.category]);
  if (filters.color) chips.push(["color", filters.color]);
  return <div className={cn("flex gap-1")}>{chips.map(([k, l]) => <button key={k} onClick={() => onRemove(k)} className="chip text-xs">{l}<X className="h-3 w-3" /></button>)}</div>;
}
