/**
 * El lienzo del estudio de creativos.
 *
 * Dibuja la escena con `capasAHtml` —el MISMO dibujante que usa Chromium en
 * el servidor para exportar el PNG— escalada para que entre en pantalla, y
 * encima una capa transparente para seleccionar, mover y redimensionar.
 *
 * Mover y redimensionar trabajan en % del lienzo (como la escena), con
 * imanes al centro y a los bordes, y guías que aparecen cuando encaja.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { capasAHtml, FORMATOS, ZONAS_SEGURAS, type Capa, type Escena } from "@estudio/escena";

type Asa = "mover" | "nw" | "ne" | "sw" | "se";

export function Lienzo({ escena, seleccion, onSeleccionar, onMover, onEmpezarCambio, onDobleClic, zonaSegura, maxAlto }: {
  escena: Escena;
  seleccion: string | null;
  onSeleccionar: (id: string | null) => void;
  /** Cambio en vivo (sin historial). */
  onMover: (id: string, caja: Pick<Capa, "x" | "y" | "w" | "h">) => void;
  /** Antes de empezar a arrastrar: guarda el punto para deshacer. */
  onEmpezarCambio: () => void;
  onDobleClic: (id: string) => void;
  zonaSegura: boolean;
  /** Alto máximo disponible en px (el lienzo se escala para entrar). */
  maxAlto?: number;
}) {
  const contRef = useRef<HTMLDivElement>(null);
  const [anchoDisp, setAnchoDisp] = useState(600);
  useEffect(() => {
    const el = contRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setAnchoDisp(el.clientWidth));
    ro.observe(el);
    setAnchoDisp(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const { ancho, alto } = FORMATOS[escena.formato];
  const escala = Math.min((anchoDisp - 8) / ancho, (maxAlto ?? 760) / alto, 1);
  const W = ancho * escala, H = alto * escala;
  const html = useMemo(() => capasAHtml(escena), [escena]);
  const [guias, setGuias] = useState<{ v: number[]; h: number[] }>({ v: [], h: [] });
  const arrastre = useRef<{ id: string; asa: Asa; x0: number; y0: number; caja: { x: number; y: number; w: number; h: number } } | null>(null);

  const sel = escena.capas.find((c) => c.id === seleccion && !c.oculta) || null;

  /** La capa visible de más arriba bajo el puntero. */
  const capaEn = (px: number, py: number): Capa | null => {
    const xp = (px / W) * 100, yp = (py / H) * 100;
    for (let i = escena.capas.length - 1; i >= 0; i--) {
      const c = escena.capas[i];
      if (c.oculta) continue;
      if (xp >= c.x && xp <= c.x + c.w && yp >= c.y && yp <= c.y + c.h) {
        // El fondo a pantalla completa solo se elige si no hay nada más.
        if (c.w >= 99 && c.h >= 99 && i > 0) { const debajo = escena.capas.slice(0, i).some((d) => !d.oculta && xp >= d.x && xp <= d.x + d.w && yp >= d.y && yp <= d.y + d.h && !(d.w >= 99 && d.h >= 99)); if (debajo) continue; }
        return c;
      }
    }
    return null;
  };

  const posicion = (e: React.PointerEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return { px: e.clientX - r.left, py: e.clientY - r.top };
  };

  const empezar = (e: React.PointerEvent, asa: Asa, capa?: Capa | null) => {
    const c = capa ?? sel;
    if (!c || c.bloqueada) return;
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    onEmpezarCambio();
    arrastre.current = { id: c.id, asa, x0: e.clientX, y0: e.clientY, caja: { x: c.x, y: c.y, w: c.w, h: c.h } };
  };

  const alBajar = (e: React.PointerEvent) => {
    const { px, py } = posicion(e);
    const c = capaEn(px, py);
    onSeleccionar(c?.id ?? null);
    if (c) empezar(e, "mover", c);
  };

  const iman = (valor: number, objetivos: number[], tol = 1.2): { v: number; guia: number | null } => {
    for (const o of objetivos) if (Math.abs(valor - o) <= tol) return { v: o, guia: o };
    return { v: valor, guia: null };
  };

  const alMover = (e: React.PointerEvent) => {
    const a = arrastre.current;
    if (!a) return;
    const dx = ((e.clientX - a.x0) / W) * 100, dy = ((e.clientY - a.y0) / H) * 100;
    let { x, y, w, h } = a.caja;
    const gv: number[] = [], gh: number[] = [];
    if (a.asa === "mover") {
      x += dx; y += dy;
      if (!e.altKey) {
        // Imanes: bordes y centro del lienzo con el borde o el centro de la capa.
        const cx = iman(x + w / 2, [50]); if (cx.guia !== null) { x = cx.v - w / 2; gv.push(50); }
        else { const l = iman(x, [0, 5]); if (l.guia !== null) { x = l.v; gv.push(l.v); } const r = iman(x + w, [100, 95]); if (r.guia !== null) { x = r.v - w; gv.push(r.v); } }
        const cy = iman(y + h / 2, [50]); if (cy.guia !== null) { y = cy.v - h / 2; gh.push(50); }
        else { const t = iman(y, [0, 5]); if (t.guia !== null) { y = t.v; gh.push(t.v); } const b = iman(y + h, [100, 95]); if (b.guia !== null) { y = b.v - h; gh.push(b.v); } }
      }
    } else {
      if (a.asa.includes("e")) w = Math.max(2, w + dx);
      if (a.asa.includes("s")) h = Math.max(2, h + dy);
      if (a.asa.includes("w")) { const nw = Math.max(2, w - dx); x += w - nw; w = nw; }
      if (a.asa.includes("n")) { const nh = Math.max(2, h - dy); y += h - nh; h = nh; }
      // Shift: mantiene la proporción (fotos que no se deforman).
      if (e.shiftKey) { const p = a.caja.h / a.caja.w; h = (w * p * W) / W; }
    }
    setGuias({ v: gv, h: gh });
    onMover(a.id, { x: +x.toFixed(2), y: +y.toFixed(2), w: +w.toFixed(2), h: +h.toFixed(2) });
  };

  const alSoltar = () => { arrastre.current = null; setGuias({ v: [], h: [] }); };

  const zona = ZONAS_SEGURAS[escena.formato];

  return (
    <div ref={contRef} className="w-full flex justify-center">
      <div className="relative shadow-2xl ring-1 ring-black/10 select-none touch-none" style={{ width: W, height: H, background: "#fff" }}>
        <div style={{ width: ancho, height: alto, maxWidth: "none", transform: `scale(${escala})`, transformOrigin: "top left", pointerEvents: "none" }} dangerouslySetInnerHTML={{ __html: html }} />
        {zonaSegura && zona && (
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute left-0 right-0 top-0 bg-rose-500/15 border-b border-dashed border-rose-500" style={{ height: `${zona.arriba}%` }} />
            <div className="absolute left-0 right-0 bottom-0 bg-rose-500/15 border-t border-dashed border-rose-500" style={{ height: `${zona.abajo}%` }} />
            <div className="absolute top-0 bottom-0 left-0 bg-rose-500/10" style={{ width: `${zona.lados}%` }} />
            <div className="absolute top-0 bottom-0 right-0 bg-rose-500/10" style={{ width: `${zona.lados}%` }} />
            <span className="absolute left-1 bottom-1 text-[10px] font-semibold text-rose-700 bg-white/80 rounded px-1">Meta tapa esta zona</span>
          </div>
        )}
        <div
          className="absolute inset-0 cursor-default"
          onPointerDown={alBajar}
          onPointerMove={alMover}
          onPointerUp={alSoltar}
          onPointerCancel={alSoltar}
          onDoubleClick={(e) => { const { px, py } = posicion(e as any); const c = capaEn(px, py); if (c) onDobleClic(c.id); }}
        >
          {guias.v.map((g) => <div key={`v${g}`} className="absolute top-0 bottom-0 w-px bg-fuchsia-500 pointer-events-none" style={{ left: `${g}%` }} />)}
          {guias.h.map((g) => <div key={`h${g}`} className="absolute left-0 right-0 h-px bg-fuchsia-500 pointer-events-none" style={{ top: `${g}%` }} />)}
          {sel && (
            <div className="absolute border-2 border-violet-500 pointer-events-none" style={{ left: `${sel.x}%`, top: `${sel.y}%`, width: `${sel.w}%`, height: `${sel.h}%`, transform: sel.rot ? `rotate(${sel.rot}deg)` : undefined }}>
              {!sel.bloqueada && (["nw", "ne", "sw", "se"] as const).map((asa) => (
                <span key={asa} onPointerDown={(e) => empezar(e, asa)}
                  className="absolute h-3.5 w-3.5 rounded-full bg-white border-2 border-violet-600 pointer-events-auto"
                  style={{ left: asa.includes("w") ? -8 : undefined, right: asa.includes("e") ? -8 : undefined, top: asa.includes("n") ? -8 : undefined, bottom: asa.includes("s") ? -8 : undefined, cursor: asa === "nw" || asa === "se" ? "nwse-resize" : "nesw-resize" }} />
              ))}
              <span className="absolute -top-5 left-0 text-[10px] bg-violet-600 text-white rounded px-1 whitespace-nowrap">{sel.nombre || sel.tipo}{sel.bloqueada ? " 🔒" : ""}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
