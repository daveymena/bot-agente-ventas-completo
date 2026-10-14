import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Camera, ChevronDown, Clock, Search, TrendingUp, X } from "lucide-react";
import { SEARCH_TABS, type SearchTab } from "@shared/types";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useUi, toast } from "@/store/ui";
import { useOnClickOutside } from "@/components/ui";

const TYPE_MENU: { id: SearchTab; label: string }[] = SEARCH_TABS.filter((t) => !["free", "premium"].includes(t.id)).map((t) => ({ id: t.id as SearchTab, label: t.label }));

export function SearchBar({ size = "md", className, autoFocus }: { size?: "md" | "lg"; className?: string; autoFocus?: boolean }) {
  const navigate = useNavigate();
  const [sp] = useSearchParams();
  const [q, setQ] = useState(sp.get("q") || "");
  const [tab, setTab] = useState<SearchTab>((sp.get("tab") as SearchTab) || "all");
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { recentSearches, pushRecent } = useUi();
  const trending = useQuery({ queryKey: ["trending"], queryFn: api.trending, staleTime: 5 * 60_000 });

  useEffect(() => { setQ(sp.get("q") || ""); setTab((sp.get("tab") as SearchTab) || "all"); }, [sp]);
  useOnClickOutside(wrap, useCallback(() => { setOpen(false); setMenu(false); }, []));

  const go = (query: string, t: SearchTab = tab) => {
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (t !== "all") params.set("tab", t);
    pushRecent(query);
    setOpen(false);
    navigate(`/buscar?${params.toString()}`);
  };
  const submit = (e: FormEvent) => { e.preventDefault(); go(q); };

  const onFile = async (f: File | null) => {
    if (!f) return;
    if (!f.type.startsWith("image/")) return toast({ kind: "error", title: "Subí una imagen (JPG, PNG o WEBP)" });
    // Guardamos la imagen en sesión para que la página de resultados la procese
    const url = URL.createObjectURL(f);
    (window as any).__visualSearchFile = f;
    navigate(`/buscar?visual=1`, { state: { previewUrl: url } });
  };

  const big = size === "lg";
  const current = TYPE_MENU.find((t) => t.id === tab) || TYPE_MENU[0];
  return (
    <div ref={wrap} className={cn("relative w-full", className)}>
      <form onSubmit={submit} className={cn("flex items-stretch overflow-visible rounded-xl bg-white text-ink shadow-card ring-1 ring-slate-200 focus-within:ring-2 focus-within:ring-brand-500", big ? "h-14 sm:h-16" : "h-11")}>
        {/* Selector de tipo */}
        <div className={cn("relative", big ? "hidden sm:block" : "hidden xl:block")}>
          <button type="button" onClick={() => { setMenu((m) => !m); setOpen(false); }} className={cn("flex h-full items-center gap-1.5 rounded-l-xl border-r border-line px-3.5 text-sm font-semibold text-ink-soft hover:bg-slate-50", big && "px-5 text-base")}>
            {current.label}<ChevronDown className="h-4 w-4 text-mute" />
          </button>
          {menu && (
            <ul className="absolute left-0 top-full z-40 mt-1.5 w-44 overflow-hidden rounded-xl border border-line bg-white py-1 shadow-pop fade-up">
              {TYPE_MENU.map((t) => <li key={t.id}><button type="button" onClick={() => { setTab(t.id); setMenu(false); if (q.trim()) go(q, t.id); }} className={cn("w-full px-3.5 py-2 text-left text-sm hover:bg-slate-50", tab === t.id && "font-semibold text-brand-700")}>{t.label}</button></li>)}
            </ul>
          )}
        </div>
        <div className="relative flex flex-1 items-center">
          <Search className={cn("pointer-events-none absolute left-3.5 text-mute", big ? "h-5 w-5" : "h-4 w-4")} />
          <input value={q} onChange={(e) => setQ(e.target.value)} onFocus={() => { setOpen(true); setMenu(false); }} autoFocus={autoFocus} placeholder={big ? "Buscá fotos, vectores, vídeos, música, plantillas…" : "Buscar en todo el catálogo"} className={cn("h-full w-full min-w-0 bg-transparent pl-10 pr-2 text-sm placeholder:text-slate-400", big && "text-base pl-11")} aria-label="Buscar" />
          {q && <button type="button" onClick={() => { setQ(""); }} className="mr-1 rounded-full p-1 text-mute hover:bg-slate-100" aria-label="Limpiar"><X className="h-4 w-4" /></button>}
        </div>
        <button type="button" onClick={() => fileRef.current?.click()} title="Búsqueda visual: subí una imagen y encontramos similares" className={cn("flex items-center gap-1.5 border-l border-line px-3 text-mute hover:bg-slate-50 hover:text-ink", big && "px-4")}>
          <Camera className={big ? "h-5 w-5" : "h-4 w-4"} /><span className={cn("hidden whitespace-nowrap text-xs font-semibold", big ? "text-sm md:inline" : "2xl:inline")}>Buscar por imagen</span>
        </button>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => onFile(e.target.files?.[0] || null)} />
        <button type="submit" className={cn("rounded-r-xl bg-ink px-4 text-sm font-semibold text-white hover:bg-slate-800", big && "px-6 text-base")}><span className={cn(!big && "hidden sm:inline")}>Buscar</span><Search className={cn("h-4 w-4", big ? "hidden" : "sm:hidden")} /></button>
      </form>

      {open && (recentSearches.length > 0 || (trending.data?.length || 0) > 0) && (
        <div className="absolute inset-x-0 top-full z-40 mt-2 rounded-xl border border-line bg-white p-3 text-ink shadow-pop fade-up">
          {recentSearches.length > 0 && (
            <div className="mb-3">
              <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-mute"><Clock className="h-3.5 w-3.5" />Recientes</p>
              <div className="flex flex-wrap gap-1.5">{recentSearches.map((r) => <button key={r} type="button" onClick={() => go(r)} className="chip text-xs">{r}</button>)}</div>
            </div>
          )}
          {(trending.data?.length || 0) > 0 && (
            <div>
              <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-mute"><TrendingUp className="h-3.5 w-3.5" />Tendencias</p>
              <div className="flex flex-wrap gap-1.5">{trending.data!.map((r) => <button key={r} type="button" onClick={() => go(r)} className="chip text-xs">{r}</button>)}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
