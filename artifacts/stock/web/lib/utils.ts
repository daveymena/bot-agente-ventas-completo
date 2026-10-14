import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }

export function downloadUrl(url: string, filename?: string) {
  const a = document.createElement("a");
  a.href = url; if (filename) a.download = filename; a.rel = "noopener";
  document.body.appendChild(a); a.click(); a.remove();
}

export async function copyText(text: string) {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

/** Lee dimensiones/duración de un vídeo o audio en el navegador (para subir metadatos cuando el servidor no tiene ffmpeg). */
export function probeMediaFile(file: File): Promise<{ durationSec?: number; width?: number; height?: number; poster?: Blob | null; waveform?: number[] }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    if (file.type.startsWith("video/")) {
      const v = document.createElement("video");
      v.preload = "metadata"; v.muted = true; v.playsInline = true; v.src = url;
      const done = (poster: Blob | null) => { URL.revokeObjectURL(url); resolve({ durationSec: isFinite(v.duration) ? v.duration : undefined, width: v.videoWidth, height: v.videoHeight, poster }); };
      v.onloadedmetadata = () => { v.currentTime = Math.min(1, (v.duration || 2) / 2); };
      v.onseeked = () => {
        try {
          const c = document.createElement("canvas"); c.width = v.videoWidth; c.height = v.videoHeight;
          c.getContext("2d")!.drawImage(v, 0, 0);
          c.toBlob((b) => done(b), "image/jpeg", 0.9);
        } catch { done(null); }
      };
      v.onerror = () => done(null);
      setTimeout(() => done(null), 8000);
    } else if (file.type.startsWith("audio/")) {
      const Ctx = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext | undefined;
      if (!Ctx) return resolve({});
      file.arrayBuffer().then((buf) => new Ctx().decodeAudioData(buf)).then((audio) => {
        const data = audio.getChannelData(0), bins = 120, step = Math.floor(data.length / bins), peaks: number[] = [];
        for (let i = 0; i < bins; i++) { let m = 0; for (let j = i * step; j < (i + 1) * step; j += 16) m = Math.max(m, Math.abs(data[j])); peaks.push(m); }
        const max = Math.max(...peaks, 0.001);
        URL.revokeObjectURL(url);
        resolve({ durationSec: audio.duration, waveform: peaks.map((p) => Math.round((p / max) * 1000) / 1000) });
      }).catch(() => { URL.revokeObjectURL(url); resolve({}); });
    } else { URL.revokeObjectURL(url); resolve({}); }
  });
}
