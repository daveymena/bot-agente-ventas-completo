import { memo, useRef, useState, type CSSProperties, type MouseEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Bookmark, BookmarkCheck, Download, Layers, Sparkles } from "lucide-react";
import type { AssetSummary } from "@shared/types";
import { assetPath, credits, duration, typeLabel } from "@/lib/format";
import { cn, downloadUrl } from "@/lib/utils";
import { useAuth } from "@/store/auth";
import { useUi, toast } from "@/store/ui";
import { Tip } from "@/components/ui";
import { PlayButton, Waveform, useAudio } from "./AudioPlayer";

export interface AssetCardProps {
  asset: AssetSummary;
  style?: CSSProperties;
  className?: string;
  /** Mostrar título siempre (listas verticales) en vez de solo al pasar el mouse. */
  showMeta?: boolean;
  saved?: boolean;
  onSelect?: (a: AssetSummary) => void;
  compact?: boolean;
}

export const AssetCard = memo(function AssetCard({ asset: a, style, className, showMeta, saved, compact }: AssetCardProps) {
  const [hover, setHover] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const navigate = useNavigate();
  const { requireAuth } = useAuth();
  const openSave = useUi((s) => s.openSave);
  const href = assetPath(a);
  const isVideo = a.type === "video", isAudio = a.type === "audio";
  const audio = useAudio(isAudio ? a.previewUrl : "");

  const onEnter = () => { setHover(true); if (isVideo && videoRef.current) { videoRef.current.play().catch(() => {}); } };
  const onLeave = () => { setHover(false); if (isVideo && videoRef.current) { videoRef.current.pause(); videoRef.current.currentTime = 0; } };
  const stop = (e: MouseEvent) => { e.preventDefault(); e.stopPropagation(); };
  const save = (e: MouseEvent) => { stop(e); requireAuth(() => openSave(a.id)); };
  const similar = (e: MouseEvent) => { stop(e); navigate(`/buscar?similar=${a.id}`); };
  const comp = (e: MouseEvent) => { stop(e); requireAuth(() => { downloadUrl(`/api/assets/${a.id}/comp`); toast({ kind: "success", title: "Descargando previsualización", description: "Con marca de agua, solo para bocetos." }); }); };

  const price = a.priceCredits.standard;
  return (
    <article style={style} className={cn("group relative overflow-hidden rounded-xl bg-slate-100", showMeta && "flex flex-col rounded-2xl border border-line bg-white", className)} onMouseEnter={onEnter} onMouseLeave={onLeave}>
      <Link to={href} className={cn("relative block h-full w-full overflow-hidden", showMeta && "aspect-[4/3] rounded-t-2xl")} aria-label={a.title}>
        {/* Placeholder borroso */}
        {a.blurData && !loaded && <img src={a.blurData} alt="" aria-hidden className="absolute inset-0 h-full w-full scale-110 object-cover blur-md" />}
        {isAudio ? (
          <div className="relative h-full w-full">
            <img src={a.cardUrl} alt={a.title} loading="lazy" decoding="async" onLoad={() => setLoaded(true)} className={cn("h-full w-full object-cover transition-opacity duration-300", loaded ? "opacity-100" : "opacity-0")} />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
            <div className="absolute inset-x-3 bottom-3 flex items-center gap-3">
              <PlayButton src={a.previewUrl} size="sm" />
              <Waveform data={a.waveform} progress={audio.progress} onSeek={audio.seek} className="h-8" />
            </div>
          </div>
        ) : (
          <>
            <img src={a.cardUrl} alt={a.title} loading="lazy" decoding="async" onLoad={() => setLoaded(true)} className={cn("h-full w-full object-cover transition-all duration-500", loaded ? "opacity-100" : "opacity-0", hover && !isVideo && "scale-[1.03]")} />
            {isVideo && a.previewUrl.endsWith(".mp4") && (
              <video ref={videoRef} src={hover ? a.previewUrl : undefined} muted loop playsInline preload="none" poster={a.posterUrl || a.cardUrl} className={cn("absolute inset-0 h-full w-full object-cover transition-opacity", hover ? "opacity-100" : "opacity-0")} />
            )}
          </>
        )}

        {/* Insignias */}
        <div className="pointer-events-none absolute left-2 top-2 flex flex-wrap gap-1">
          {a.isFree && <span className="badge bg-emerald-500 text-white">Gratis</span>}
          {a.isPremium && <span className="badge bg-amber-400 text-ink">Premium</span>}
          {a.isAiGenerated && <span className="badge bg-black/70 text-white backdrop-blur"><Sparkles className="mr-1 h-3 w-3" />IA</span>}
          {a.isEditorial && <span className="badge bg-black/70 text-white backdrop-blur">Editorial</span>}
        </div>
        {(isVideo || (!isAudio && a.type !== "photo" && !compact)) && (
          <div className="pointer-events-none absolute bottom-2 left-2 flex items-center gap-1">
            {isVideo && a.durationSec != null && <span className="badge bg-black/70 text-white backdrop-blur normal-case tracking-normal">{duration(a.durationSec)}</span>}
            {isVideo && a.resolutionLabel && <span className="badge bg-black/70 text-white backdrop-blur">{a.resolutionLabel}</span>}
            {!isVideo && <span className="badge bg-black/60 text-white backdrop-blur">{typeLabel(a.type)}</span>}
          </div>
        )}

        {/* Acciones al pasar el mouse */}
        <div className={cn("absolute inset-0 flex flex-col justify-between bg-gradient-to-b from-black/40 via-transparent to-black/60 p-2 opacity-0 transition-opacity duration-200", hover && "opacity-100")}>
          <div className="flex justify-end gap-1.5">
            <Tip label={saved ? "Guardado" : "Guardar en biblioteca"}><button onClick={save} className="grid h-8 w-8 place-items-center rounded-full bg-white/95 text-ink shadow hover:bg-white">{saved ? <BookmarkCheck className="h-4 w-4 text-brand-600" /> : <Bookmark className="h-4 w-4" />}</button></Tip>
            <Tip label="Buscar similares"><button onClick={similar} className="grid h-8 w-8 place-items-center rounded-full bg-white/95 text-ink shadow hover:bg-white"><Layers className="h-4 w-4" /></button></Tip>
            {!isAudio && <Tip label="Descargar previsualización"><button onClick={comp} className="grid h-8 w-8 place-items-center rounded-full bg-white/95 text-ink shadow hover:bg-white"><Download className="h-4 w-4" /></button></Tip>}
          </div>
          {!showMeta && (
            <div className="flex items-end justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-white drop-shadow">{a.title}</p>
                {a.contributor && <p className="truncate text-[11px] text-white/80">{a.contributor.name}</p>}
              </div>
              <span className="shrink-0 rounded-md bg-white px-2 py-1 text-[11px] font-bold text-ink shadow">{price === 0 ? "Gratis" : credits(price)}</span>
            </div>
          )}
        </div>
      </Link>
      {showMeta && (
        <div className="flex items-start justify-between gap-2 p-3">
          <div className="min-w-0"><Link to={href} className="line-clamp-2 text-sm font-medium text-ink hover:underline">{a.title}</Link>{a.contributor && <p className="mt-0.5 truncate text-xs text-mute">{a.contributor.name}</p>}</div>
          <span className="shrink-0 rounded-md bg-slate-100 px-2 py-1 text-[11px] font-bold text-ink">{price === 0 ? "Gratis" : credits(price)}</span>
        </div>
      )}
    </article>
  );
});
