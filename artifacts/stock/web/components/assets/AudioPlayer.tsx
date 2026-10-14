import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { duration } from "@/lib/format";

/** Un único <audio> global: al reproducir una pista se pausa la anterior (como en Adobe Stock). */
let shared: HTMLAudioElement | null = null;
let currentSrc: string | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

function ensure() {
  if (!shared) {
    shared = new Audio();
    shared.preload = "none";
    shared.addEventListener("play", notify); shared.addEventListener("pause", notify); shared.addEventListener("ended", notify); shared.addEventListener("timeupdate", notify);
  }
  return shared;
}

export function useAudio(src: string) {
  const [, force] = useState(0);
  useEffect(() => { const l = () => force((x) => x + 1); listeners.add(l); return () => { listeners.delete(l); }; }, []);
  const a = shared;
  const active = currentSrc === src;
  const playing = !!a && active && !a.paused;
  const progress = a && active && a.duration ? a.currentTime / a.duration : 0;
  const toggle = () => {
    const el = ensure();
    if (currentSrc !== src) { el.src = src; currentSrc = src; el.currentTime = 0; }
    if (el.paused) el.play().catch(() => {}); else el.pause();
    notify();
  };
  const seek = (ratio: number) => { const el = ensure(); if (currentSrc !== src) { el.src = src; currentSrc = src; } if (el.duration) el.currentTime = ratio * el.duration; notify(); };
  return { playing, active, progress, toggle, seek, currentTime: a && active ? a.currentTime : 0 };
}

export function Waveform({ data, progress = 0, className, onSeek, barClass, activeClass }: { data: number[] | null; progress?: number; className?: string; onSeek?: (r: number) => void; barClass?: string; activeClass?: string }) {
  const bars = data && data.length ? data : Array.from({ length: 80 }, (_, i) => 0.3 + 0.4 * Math.abs(Math.sin(i * 0.7)));
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div ref={ref} className={cn("flex h-12 w-full items-center gap-px cursor-pointer", className)} onClick={(e) => { if (!onSeek || !ref.current) return; const r = ref.current.getBoundingClientRect(); onSeek((e.clientX - r.left) / r.width); }}>
      {bars.map((v, i) => (
        <div key={i} className="flex h-full flex-1 items-center">
          <div className={cn("w-full rounded-sm transition-colors", i / bars.length <= progress ? (activeClass || "bg-brand-500") : (barClass || "bg-white/70"))} style={{ height: `${Math.max(6, Math.min(100, v * 100))}%` }} />
        </div>
      ))}
    </div>
  );
}

export function PlayButton({ src, className, size = "md" }: { src: string; className?: string; size?: "sm" | "md" | "lg" }) {
  const { playing, toggle } = useAudio(src);
  const s = { sm: "h-8 w-8", md: "h-11 w-11", lg: "h-14 w-14" }[size];
  return (
    <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggle(); }} aria-label={playing ? "Pausar" : "Reproducir"} className={cn("grid place-items-center rounded-full bg-white text-ink shadow-pop transition-transform hover:scale-105", s, className)}>
      {playing ? <Pause className="h-5 w-5" /> : <Play className="ml-0.5 h-5 w-5" />}
    </button>
  );
}

export function AudioStrip({ src, waveform, durationSec, title, className }: { src: string; waveform: number[] | null; durationSec: number | null; title?: string; className?: string }) {
  const { playing, toggle, progress, seek, currentTime } = useAudio(src);
  return (
    <div className={cn("flex items-center gap-3 rounded-xl bg-slate-900 p-3 text-white", className)}>
      <button type="button" onClick={toggle} className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white text-ink">{playing ? <Pause className="h-5 w-5" /> : <Play className="ml-0.5 h-5 w-5" />}</button>
      <div className="min-w-0 flex-1">
        {title && <p className="truncate text-xs font-medium text-slate-300">{title}</p>}
        <Waveform data={waveform} progress={progress} onSeek={seek} className="h-10" barClass="bg-white/40" activeClass="bg-brand-400" />
      </div>
      <span className="shrink-0 tabular-nums text-xs text-slate-300">{duration(currentTime)} / {duration(durationSec)}</span>
    </div>
  );
}
