import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { AssetSummary } from "@shared/types";
import { ratio } from "@/lib/format";
import { AssetCard } from "./AssetCard";

/**
 * Cuadrícula justificada (filas de alto variable que llenan el ancho), igual
 * que la de Adobe Stock / Flickr. Calcula las filas con el ancho real del
 * contenedor y la relación de aspecto de cada recurso.
 */
export function JustifiedGrid({ items, targetHeight, gap = 8, savedIds, children, maxLastRowScale = 1.25 }: { items: AssetSummary[]; targetHeight?: number; gap?: number; savedIds?: Set<number>; children?: ReactNode; maxLastRowScale?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    if (!ref.current) return;
    const measure = (w: number) => setWidth(Math.floor(w) || ref.current?.clientWidth || Math.min(window.innerWidth - 32, 1280));
    const ro = new ResizeObserver((e) => measure(e[0].contentRect.width));
    ro.observe(ref.current);
    measure(ref.current.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);

  const rows = useMemo(() => {
    if (!width) return [] as { a: AssetSummary; w: number; h: number }[][];
    const th = targetHeight ?? (width < 640 ? 180 : width < 1024 ? 230 : 280);
    const out: { a: AssetSummary; w: number; h: number }[][] = [];
    let row: AssetSummary[] = [];
    let sum = 0;
    const flush = (last: boolean) => {
      if (!row.length) return;
      const avail = width - gap * (row.length - 1);
      let h = avail / sum;
      if (last && h > th * maxLastRowScale) h = th * maxLastRowScale;
      out.push(row.map((a) => ({ a, h: Math.round(h), w: Math.round(h * ratio(a)) })));
      row = []; sum = 0;
    };
    for (const a of items) {
      const r = ratio(a);
      row.push(a); sum += r;
      if (sum * th >= width - gap * (row.length - 1)) flush(false);
    }
    flush(true);
    return out;
  }, [items, width, gap, targetHeight, maxLastRowScale]);

  return (
    <div ref={ref} className="w-full">
      {rows.map((r, i) => (
        <div key={i} className="flex" style={{ gap, marginBottom: gap }}>
          {r.map(({ a, w, h }) => <AssetCard key={a.id} asset={a} style={{ width: w, height: h, flex: `0 0 ${w}px` }} saved={savedIds?.has(a.id)} />)}
        </div>
      ))}
      {children}
    </div>
  );
}

export function GridSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-2">
          {Array.from({ length: 4 + (i % 2) }).map((_, j) => <div key={j} className="skeleton h-[200px] sm:h-[260px]" style={{ flex: `${1 + ((i + j) % 3) * 0.4} 1 0` }} />)}
        </div>
      ))}
    </div>
  );
}
