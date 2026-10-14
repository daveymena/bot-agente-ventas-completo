/**
 * Las propiedades de la capa elegida (o del lienzo, si no hay ninguna).
 * Todo lo que cambia acá entra al historial de deshacer.
 */
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { AlignLeft, AlignCenter, AlignRight, Bold, Italic, CaseUpper, Copy, Trash2, Lock, Unlock, FlipHorizontal, Upload, Loader2 } from "lucide-react";
import { FUENTES } from "@estudio/fuentes";
import type { Capa, Escena } from "@estudio/escena";
import { useRef, useState, forwardRef } from "react";

const COLORES = ["#ffffff", "#111827", "#f6f7f9", "#e5342a", "#f97316", "#facc15", "#16a34a", "#0e9f8a", "#2563eb", "#4f46e5", "#db2777", "#8c7a5b"];

function Fila({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase font-semibold text-muted-foreground">{etiqueta}</span>
      <div className="mt-0.5">{children}</div>
    </label>
  );
}

function Deslizador({ valor, min, max, paso = 1, onChange, sufijo = "" }: { valor: number; min: number; max: number; paso?: number; onChange: (v: number) => void; sufijo?: string }) {
  return (
    <div className="flex items-center gap-2">
      <input type="range" min={min} max={max} step={paso} value={valor} onChange={(e) => onChange(Number(e.target.value))} className="flex-1 accent-violet-600" />
      <span className="text-[10px] w-10 text-right tabular-nums text-muted-foreground">{Number.isInteger(paso) ? Math.round(valor) : valor.toFixed(2)}{sufijo}</span>
    </div>
  );
}

function SelectorColor({ valor, onChange, extra, permitirNada }: { valor?: string | null; onChange: (c: string | null) => void; extra?: string[]; permitirNada?: boolean }) {
  const lista = [...new Set([...(extra || []), ...COLORES])].slice(0, 14);
  return (
    <div className="flex flex-wrap gap-1 items-center">
      {permitirNada && (
        <button onClick={() => onChange(null)} title="Sin color" aria-label="Sin color" className={`h-5 w-5 rounded border bg-[linear-gradient(45deg,transparent_45%,#ef4444_45%,#ef4444_55%,transparent_55%)] ${!valor ? "ring-2 ring-violet-500" : ""}`} />
      )}
      {lista.map((c) => (
        <button key={c} onClick={() => onChange(c)} title={c} aria-label={`Color ${c}`} className={`h-5 w-5 rounded border ${valor?.toLowerCase() === c.toLowerCase() ? "ring-2 ring-violet-500" : ""}`} style={{ background: c }} />
      ))}
      <label className="h-5 w-5 rounded border relative overflow-hidden cursor-pointer text-[10px] grid place-items-center" title="Otro color">
        ＋<input type="color" value={/^#[0-9a-f]{6}$/i.test(valor || "") ? valor! : "#000000"} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 opacity-0 cursor-pointer" />
      </label>
    </div>
  );
}

const Boton = ({ activo, onClick, titulo, children }: { activo?: boolean; onClick: () => void; titulo: string; children: React.ReactNode }) => (
  <button onClick={onClick} title={titulo} aria-label={titulo} aria-pressed={activo} className={`h-7 w-7 grid place-items-center rounded border ${activo ? "bg-violet-600 text-white border-violet-600" : "hover:bg-muted"}`}>{children}</button>
);

export const Propiedades = forwardRef<HTMLTextAreaElement, {
  escena: Escena;
  capa: Capa | null;
  onCapa: (patch: Partial<Capa>) => void;
  onEscena: (patch: Partial<Escena>) => void;
  onDuplicar: () => void;
  onBorrar: () => void;
  fotos: string[];
  acento?: string;
  onSubirImagen: (f: File) => Promise<string | null>;
}>(function Propiedades({ escena, capa, onCapa, onEscena, onDuplicar, onBorrar, fotos, acento, onSubirImagen }, textoRef) {
  const archivo = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState(false);
  const extra = acento ? [acento] : [];

  if (!capa) {
    return (
      <div className="space-y-3 p-3">
        <p className="text-xs font-semibold">Lienzo</p>
        <Fila etiqueta="Color de fondo"><SelectorColor valor={escena.fondo} onChange={(c) => onEscena({ fondo: c || "#ffffff" })} extra={extra} /></Fila>
        <p className="text-[11px] text-muted-foreground">Tocá una capa en el lienzo para editarla. Arrastrá para mover; las esquinas cambian el tamaño (Shift mantiene la proporción, Alt desactiva los imanes).</p>
      </div>
    );
  }

  const subir = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setSubiendo(true);
    try { const url = await onSubirImagen(f); if (url) onCapa({ src: url } as any); } finally { setSubiendo(false); }
  };

  return (
    <div className="space-y-3 p-3">
      <div className="flex items-center gap-1">
        <Input value={capa.nombre || ""} placeholder={capa.tipo} onChange={(e) => onCapa({ nombre: e.target.value })} className="h-7 text-xs font-semibold flex-1" aria-label="Nombre de la capa" />
        <Boton titulo={capa.bloqueada ? "Desbloquear" : "Bloquear"} onClick={() => onCapa({ bloqueada: !capa.bloqueada })} activo={capa.bloqueada}>{capa.bloqueada ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}</Boton>
        <Boton titulo="Duplicar (Ctrl+D)" onClick={onDuplicar}><Copy className="h-3.5 w-3.5" /></Boton>
        <Boton titulo="Borrar (Supr)" onClick={onBorrar}><Trash2 className="h-3.5 w-3.5 text-red-600" /></Boton>
      </div>

      {capa.tipo === "texto" && (
        <>
          <Fila etiqueta="Texto">
            <textarea ref={textoRef} value={capa.texto} rows={3} onChange={(e) => onCapa({ texto: e.target.value } as any)} className="w-full rounded-md border bg-background px-2 py-1 text-xs" />
          </Fila>
          <Fila etiqueta="Letra">
            <select value={capa.fuente || "inter"} onChange={(e) => onCapa({ fuente: e.target.value } as any)} className="h-7 w-full rounded-md border bg-background px-2 text-xs">
              {FUENTES.map((f) => <option key={f.id} value={f.id} style={{ fontFamily: `'${f.familia}'` }}>{f.familia} — {f.caracter}</option>)}
            </select>
          </Fila>
          <Fila etiqueta="Tamaño"><Deslizador valor={capa.tam} min={1.5} max={25} paso={0.1} onChange={(v) => onCapa({ tam: v } as any)} /></Fila>
          <div className="flex flex-wrap gap-1">
            <Boton titulo="Negrita" activo={(capa.peso ?? 800) >= 700} onClick={() => onCapa({ peso: (capa.peso ?? 800) >= 700 ? 400 : 800 } as any)}><Bold className="h-3.5 w-3.5" /></Boton>
            <Boton titulo="Cursiva" activo={capa.italica} onClick={() => onCapa({ italica: !capa.italica } as any)}><Italic className="h-3.5 w-3.5" /></Boton>
            <Boton titulo="Mayúsculas" activo={capa.mayus} onClick={() => onCapa({ mayus: !capa.mayus } as any)}><CaseUpper className="h-3.5 w-3.5" /></Boton>
            <span className="w-1" />
            <Boton titulo="Alinear a la izquierda" activo={capa.alinear === "left"} onClick={() => onCapa({ alinear: "left" } as any)}><AlignLeft className="h-3.5 w-3.5" /></Boton>
            <Boton titulo="Centrar" activo={capa.alinear === "center"} onClick={() => onCapa({ alinear: "center" } as any)}><AlignCenter className="h-3.5 w-3.5" /></Boton>
            <Boton titulo="Alinear a la derecha" activo={capa.alinear === "right"} onClick={() => onCapa({ alinear: "right" } as any)}><AlignRight className="h-3.5 w-3.5" /></Boton>
          </div>
          <Fila etiqueta="Color del texto"><SelectorColor valor={capa.color} onChange={(c) => onCapa({ color: c || "#111827" } as any)} extra={extra} /></Fila>
          <Fila etiqueta="Resaltado (fondo por renglón)"><SelectorColor valor={capa.fondo} permitirNada onChange={(c) => onCapa({ fondo: c } as any)} extra={extra} /></Fila>
          <Fila etiqueta="Contorno"><SelectorColor valor={capa.contorno} permitirNada onChange={(c) => onCapa({ contorno: c } as any)} extra={extra} /></Fila>
          <div className="grid grid-cols-2 gap-2">
            <Fila etiqueta="Interlineado"><Deslizador valor={capa.interlineado ?? 1.1} min={0.8} max={2} paso={0.02} onChange={(v) => onCapa({ interlineado: v } as any)} /></Fila>
            <Fila etiqueta="Espaciado"><Deslizador valor={capa.espaciado ?? 0} min={-0.1} max={0.5} paso={0.01} onChange={(v) => onCapa({ espaciado: v } as any)} /></Fila>
          </div>
          <div className="flex gap-3 text-xs">
            <label className="flex items-center gap-1"><input type="checkbox" checked={!!capa.sombra} onChange={(e) => onCapa({ sombra: e.target.checked } as any)} /> Sombra</label>
            <label className="flex items-center gap-1"><input type="checkbox" checked={!!capa.tachado} onChange={(e) => onCapa({ tachado: e.target.checked } as any)} /> Tachado</label>
            <select value={capa.vertical || "top"} onChange={(e) => onCapa({ vertical: e.target.value } as any)} className="h-6 rounded border bg-background px-1 text-[11px]" aria-label="Posición vertical en la caja">
              <option value="top">Arriba</option><option value="center">Centro</option><option value="bottom">Abajo</option>
            </select>
          </div>
        </>
      )}

      {capa.tipo === "imagen" && (
        <>
          <input ref={archivo} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={subir} />
          <Fila etiqueta="Foto">
            <div className="flex gap-1 overflow-x-auto pb-1">
              {fotos.map((f) => (
                <button key={f} onClick={() => onCapa({ src: f } as any)} className={`h-12 w-12 shrink-0 rounded border overflow-hidden ${capa.src === f ? "ring-2 ring-violet-500" : ""}`}><img src={f} alt="" className="h-full w-full object-cover" loading="lazy" /></button>
              ))}
              <button onClick={() => archivo.current?.click()} disabled={subiendo} title="Subir una imagen (logo, foto propia)" className="h-12 w-12 shrink-0 rounded border border-dashed grid place-items-center text-muted-foreground hover:bg-muted">
                {subiendo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              </button>
            </div>
          </Fila>
          <div className="flex gap-1">
            {(["cover", "contain"] as const).map((a) => (
              <button key={a} onClick={() => onCapa({ ajuste: a } as any)} className={`flex-1 h-7 rounded border text-[11px] ${capa.ajuste === a ? "bg-violet-600 text-white" : ""}`}>{a === "cover" ? "Llenar" : "Entera"}</button>
            ))}
            <Boton titulo="Espejo" activo={capa.espejo} onClick={() => onCapa({ espejo: !capa.espejo } as any)}><FlipHorizontal className="h-3.5 w-3.5" /></Boton>
          </div>
          {capa.ajuste !== "contain" && (
            <div className="grid grid-cols-2 gap-2">
              <Fila etiqueta="Encuadre ↔"><Deslizador valor={capa.focoX ?? 50} min={0} max={100} onChange={(v) => onCapa({ focoX: v } as any)} sufijo="%" /></Fila>
              <Fila etiqueta="Encuadre ↕"><Deslizador valor={capa.focoY ?? 50} min={0} max={100} onChange={(v) => onCapa({ focoY: v } as any)} sufijo="%" /></Fila>
            </div>
          )}
          <Fila etiqueta="Esquinas"><Deslizador valor={Math.min(capa.radio ?? 0, 300)} min={0} max={300} onChange={(v) => onCapa({ radio: v } as any)} sufijo="px" /></Fila>
          <div className="grid grid-cols-2 gap-2">
            <Fila etiqueta="Brillo"><Deslizador valor={capa.brillo ?? 1} min={0.3} max={1.8} paso={0.02} onChange={(v) => onCapa({ brillo: v } as any)} /></Fila>
            <Fila etiqueta="Contraste"><Deslizador valor={capa.contraste ?? 1} min={0.3} max={1.8} paso={0.02} onChange={(v) => onCapa({ contraste: v } as any)} /></Fila>
            <Fila etiqueta="Saturación"><Deslizador valor={capa.saturacion ?? 1} min={0} max={2} paso={0.02} onChange={(v) => onCapa({ saturacion: v } as any)} /></Fila>
            <Fila etiqueta="Desenfoque"><Deslizador valor={capa.desenfoque ?? 0} min={0} max={20} onChange={(v) => onCapa({ desenfoque: v } as any)} sufijo="px" /></Fila>
          </div>
          <div className="flex gap-3 text-xs">
            <label className="flex items-center gap-1"><input type="checkbox" checked={!!capa.sombra} onChange={(e) => onCapa({ sombra: e.target.checked } as any)} /> Sombra</label>
            <label className="flex items-center gap-1"><input type="checkbox" checked={!!capa.borde} onChange={(e) => onCapa({ borde: e.target.checked ? "#ffffff" : null } as any)} /> Marco blanco</label>
          </div>
        </>
      )}

      {capa.tipo === "forma" && (
        <>
          <div className="grid grid-cols-4 gap-1">
            {([["rect", "▭"], ["pastilla", "⬭"], ["circulo", "●"], ["estallido", "✸"]] as const).map(([f, icono]) => (
              <button key={f} onClick={() => onCapa({ forma: f } as any)} className={`h-8 rounded border text-base ${capa.forma === f ? "bg-violet-600 text-white" : ""}`} title={f}>{icono}</button>
            ))}
          </div>
          <Fila etiqueta="Relleno"><SelectorColor valor={capa.relleno} onChange={(c) => onCapa({ relleno: c || "#111827" } as any)} extra={extra} /></Fila>
          {capa.forma === "rect" && <Fila etiqueta="Esquinas"><Deslizador valor={capa.radio ?? 0} min={0} max={200} onChange={(v) => onCapa({ radio: v } as any)} sufijo="px" /></Fila>}
          <Fila etiqueta="Borde"><SelectorColor valor={capa.borde} permitirNada onChange={(c) => onCapa({ borde: c, grosor: c ? Math.max(capa.grosor || 0, 4) : 0 } as any)} extra={extra} /></Fila>
          <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={!!capa.sombra} onChange={(e) => onCapa({ sombra: e.target.checked } as any)} /> Sombra</label>
        </>
      )}

      {capa.tipo === "degradado" && (
        <>
          <Fila etiqueta="Desde"><SelectorColor valor={capa.desde} onChange={(c) => onCapa({ desde: c || "rgba(0,0,0,0)" } as any)} extra={["rgba(0,0,0,0)", "rgba(0,0,0,.8)", ...extra]} /></Fila>
          <Fila etiqueta="Hasta"><SelectorColor valor={capa.hasta} onChange={(c) => onCapa({ hasta: c || "rgba(0,0,0,.8)" } as any)} extra={["rgba(0,0,0,0)", "rgba(0,0,0,.8)", ...extra]} /></Fila>
          <Fila etiqueta="Ángulo"><Deslizador valor={capa.angulo ?? 180} min={0} max={360} onChange={(v) => onCapa({ angulo: v } as any)} sufijo="°" /></Fila>
        </>
      )}

      <details className="rounded-md border p-2">
        <summary className="text-[11px] font-semibold cursor-pointer">Posición y tamaño</summary>
        <div className="grid grid-cols-2 gap-2 mt-2">
          {(["x", "y", "w", "h"] as const).map((k) => (
            <Fila key={k} etiqueta={{ x: "Izquierda %", y: "Arriba %", w: "Ancho %", h: "Alto %" }[k]}>
              <Input type="number" step={0.5} value={Number(capa[k].toFixed(1))} onChange={(e) => onCapa({ [k]: Number(e.target.value) } as any)} className="h-7 text-xs" />
            </Fila>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2 mt-2">
          <Fila etiqueta="Giro"><Deslizador valor={capa.rot ?? 0} min={-45} max={45} onChange={(v) => onCapa({ rot: v })} sufijo="°" /></Fila>
          <Fila etiqueta="Opacidad"><Deslizador valor={capa.opacidad ?? 1} min={0.05} max={1} paso={0.05} onChange={(v) => onCapa({ opacidad: v })} /></Fila>
        </div>
        <div className="flex gap-1 mt-2">
          <Button size="sm" variant="outline" className="h-7 text-[11px] flex-1" onClick={() => onCapa({ x: (100 - capa.w) / 2 })}>Centrar ↔</Button>
          <Button size="sm" variant="outline" className="h-7 text-[11px] flex-1" onClick={() => onCapa({ y: (100 - capa.h) / 2 })}>Centrar ↕</Button>
        </div>
      </details>
    </div>
  );
});
