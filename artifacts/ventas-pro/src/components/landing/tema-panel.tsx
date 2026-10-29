/**
 * El tema de la landing: color, letras y redondeo.
 *
 * No repite el error del panel de "Diseño" que se quitó en septiembre (pintaba
 * solo la vista previa): esto se guarda en `design.retoque` y lo hornea el
 * servidor en la preview Y en la publicada, con la MISMA función
 * (`@estudio/retoque`). La vista previa en vivo usa esa función también.
 */
import { Button } from "@/components/ui/button";
import { Loader2, RotateCcw, Save } from "lucide-react";
import { PAREJAS, FUENTES, fuentePorId, enlaceDeFuentes } from "@estudio/fuentes";
import { normalizarHex, TEMAS_ESTUDIO, type Retoque } from "@estudio/retoque";
import { useEffect, useState } from "react";
import { kitComoRetoque, kitVacio, type KitDeMarca } from "@estudio/kit";

const MUESTRAS = ["#111827", "#4F46E5", "#2563EB", "#0E9F8A", "#16A34A", "#E5342A", "#F97316", "#DB2777", "#8C7A5B", "#7C3AED"];

export function TemaPanel({ retoque, onCambiar, onGuardar, guardando, hayCambios, admite, sugeridos }: {
  retoque: Retoque;
  onCambiar: (r: Retoque) => void;
  onGuardar: () => void;
  guardando: boolean;
  hayCambios: boolean;
  /** false en copias HTML de otros sitios: sus variables son otras. */
  admite: boolean;
  /** Colores que salen del producto (foto / rubro). */
  sugeridos?: string[];
}) {
  // El kit de marca del negocio: un toque y la landing toma su identidad.
  const [kit, setKit] = useState<KitDeMarca | null>(null);
  useEffect(() => {
    fetch("/api/creativos/kit", { credentials: "include" }).then((r) => (r.ok ? r.json() : null)).then((r) => setKit(r?.definido ? r.kit : null)).catch(() => {});
  }, []);
  // Las muestras de letra del selector se ven con su propia fuente.
  useEffect(() => {
    const id = "vp-fuentes-muestra";
    if (document.getElementById(id)) return;
    const l = document.createElement("link");
    l.id = id; l.rel = "stylesheet"; l.href = enlaceDeFuentes(FUENTES.map((f) => f.id));
    document.head.appendChild(l);
  }, []);

  if (!admite) {
    return <div className="p-4 text-xs text-muted-foreground">Esta landing es una copia de otro sitio: su diseño viene de ese sitio y el tema no se le aplica. Usá <b>Adaptar al producto</b> o pedile cambios al chat.</div>;
  }
  const pareja = PAREJAS.find((p) => p.titulos === retoque.titulos && p.texto === retoque.texto)?.id;
  const colores = [...new Set([...(sugeridos || []), ...MUESTRAS].map((c) => normalizarHex(c)).filter(Boolean) as string[])].slice(0, 12);

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {kit && !kitVacio(kit) ? (
          <button onClick={() => onCambiar({ ...retoque, ...kitComoRetoque(kit) })} className="w-full rounded-lg border-2 border-violet-500 bg-violet-50 dark:bg-violet-950/30 p-2.5 text-left hover:bg-violet-100">
            <span className="flex items-center gap-2 text-sm font-semibold">
              <span className="flex h-5 w-12 rounded overflow-hidden">{[kit.oscuro, kit.acento, kit.claro].filter(Boolean).map((c) => <span key={c!} className="flex-1" style={{ background: c! }} />)}</span>
              Usar mi marca
            </span>
            <span className="block text-[10px] text-muted-foreground mt-0.5">Color y letras de tu kit de marca (Studio → Marca).</span>
          </button>
        ) : (
          <a href="/estudio?espacio=marca" className="block rounded-lg border border-dashed p-2.5 text-[11px] text-muted-foreground hover:bg-muted">Definí tu <b>kit de marca</b> en Studio → Marca y aplicalo acá con un toque.</a>
        )}
        <section>
          <h3 className="text-xs font-semibold mb-2">Dirección de arte</h3>
          <div className="space-y-2">{TEMAS_ESTUDIO.map(tema => <button key={tema.id} aria-pressed={retoque.estilo === tema.id} onClick={() => onCambiar({ ...tema.retoque })} className={`w-full rounded-xl border p-3 text-left hover:border-primary ${retoque.estilo === tema.id ? 'ring-2 ring-primary' : ''}`}>
            <div className="h-12 rounded-lg mb-2 flex items-center gap-2 px-3" style={{ background: tema.fondo }}><span className="text-xl font-bold" style={{ color: tema.retoque.acento }}>Aa</span><span className="ml-auto h-4 w-10 rounded-full" style={{ background: tema.retoque.acento }} /></div>
            <span className="block text-xs font-semibold">{tema.nombre}</span><span className="block text-[10px] text-muted-foreground mt-1">{tema.descripcion}</span>
          </button>)}</div>
        </section>
        <section>
          <p className="text-[11px] font-semibold uppercase text-muted-foreground mb-1.5">Color de la marca</p>
          <p className="text-[10px] text-muted-foreground mb-2">Botones, precios y detalles. El texto encima se ajusta solo para que se lea.</p>
          <div className="flex flex-wrap gap-1.5 items-center">
            {colores.map((c) => (
              <button key={c} onClick={() => onCambiar({ ...retoque, acento: c })} aria-label={`Color ${c}`} title={c}
                className={`h-7 w-7 rounded-full border-2 ${retoque.acento === c ? "border-foreground scale-110" : "border-transparent"}`} style={{ background: c }} />
            ))}
            <label className="h-7 w-7 rounded-full border overflow-hidden relative cursor-pointer" title="Otro color">
              <input type="color" value={retoque.acento || "#4f46e5"} onChange={(e) => onCambiar({ ...retoque, acento: e.target.value })} className="absolute inset-0 h-full w-full opacity-0 cursor-pointer" />
              <span className="absolute inset-0 grid place-items-center text-xs">＋</span>
            </label>
            {retoque.acento && <button className="text-[10px] text-muted-foreground underline ml-1" onClick={() => onCambiar({ ...retoque, acento: null })}>el del modelo</button>}
          </div>
        </section>

        <section>
          <p className="text-[11px] font-semibold uppercase text-muted-foreground mb-1.5">Tipografía</p>
          <div className="grid grid-cols-2 gap-1.5">
            {PAREJAS.map((p) => (
              <button key={p.id} onClick={() => onCambiar({ ...retoque, titulos: p.titulos, texto: p.texto })}
                className={`rounded-lg border p-2 text-left hover:bg-muted ${pareja === p.id ? "ring-2 ring-violet-500 border-violet-500" : ""}`}>
                <span className="block text-base leading-tight truncate" style={{ fontFamily: `'${fuentePorId(p.titulos).familia}'`, fontWeight: 700 }}>{p.nombre}</span>
                <span className="block text-[10px] text-muted-foreground truncate" style={{ fontFamily: `'${fuentePorId(p.texto).familia}'` }}>{fuentePorId(p.titulos).familia} + {fuentePorId(p.texto).familia}</span>
              </button>
            ))}
          </div>
          {(retoque.titulos || retoque.texto) && <button className="text-[10px] text-muted-foreground underline mt-1" onClick={() => onCambiar({ ...retoque, titulos: null, texto: null })}>usar la del modelo</button>}
        </section>

        <section>
          <p className="text-[11px] font-semibold uppercase text-muted-foreground mb-1.5">Esquinas</p>
          <div className="flex gap-1.5">
            {[{ v: 0, n: "Rectas" }, { v: 8, n: "Suaves" }, { v: 16, n: "Redondas" }, { v: 28, n: "Píldora" }].map((o) => (
              <button key={o.v} onClick={() => onCambiar({ ...retoque, radio: o.v })}
                className={`flex-1 border px-1 py-2 text-[10px] ${retoque.radio === o.v ? "ring-2 ring-violet-500 border-violet-500" : ""}`} style={{ borderRadius: Math.min(o.v, 14) }}>
                {o.n}
              </button>
            ))}
          </div>
          {retoque.radio !== undefined && retoque.radio !== null && <button className="text-[10px] text-muted-foreground underline mt-1" onClick={() => onCambiar({ ...retoque, radio: null })}>las del modelo</button>}
        </section>
      </div>
      <div className="px-3 py-2 border-t bg-muted/10 shrink-0 flex gap-2">
        <Button size="sm" variant="ghost" className="h-8 text-xs" disabled={!retoque.estilo && !retoque.acento && !retoque.titulos && retoque.radio == null} onClick={() => onCambiar({})}>
          <RotateCcw className="h-3 w-3 mr-1" /> Quitar tema
        </Button>
        <Button size="sm" className="h-8 text-xs flex-1 bg-violet-600 hover:bg-violet-700 text-white" disabled={!hayCambios || guardando} onClick={onGuardar}>
          {guardando ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Save className="h-3 w-3 mr-1" />} Guardar tema
        </Button>
      </div>
    </div>
  );
}
