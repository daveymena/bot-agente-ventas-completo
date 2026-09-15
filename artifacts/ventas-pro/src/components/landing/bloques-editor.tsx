/**
 * Editor de bloques del Landing Studio.
 *
 * Hasta hoy la única forma de cambiar una landing era pedírselo al chat
 * ("haz el hero más agresivo") y esperar al modelo. Para cambiar una palabra
 * del título o bajar una sección eso es lento y a veces cambia otra cosa.
 *
 * Acá el cliente toca la landing con las manos: reordena, oculta, edita los
 * textos y la imagen de cada sección, y guarda. Es la idea de OpenPage
 * (JSON como fuente de verdad + editor visual), reducida a lo que nuestro
 * renderer entiende: `sections[]` con title/subtitle/body/cta/image/hidden.
 * El chat sigue existiendo para los cambios de fondo (ángulo, tono, FAQ).
 */
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { ArrowUp, ArrowDown, Eye, EyeOff, Loader2, Save, Undo2, ChevronDown, ChevronRight } from "lucide-react";

export type Seccion = {
  id: string;
  type: string;
  title?: string | null;
  subtitle?: string | null;
  body?: string | null;
  cta?: string | null;
  image?: string | null;
  hidden?: boolean | null;
  [k: string]: unknown;
};

const NOMBRES: Record<string, string> = {
  hero: "Portada", benefits: "Beneficios", features: "Características", gallery: "Galería", visual: "Galería",
  faq: "Preguntas frecuentes", testimonials: "Testimonios", social_proof: "Prueba social", offer: "Oferta",
  pricing: "Precio", cta: "Llamado a la acción", problem: "El problema", solution: "La solución", trust: "Confianza",
  guarantee: "Garantía", how_it_works: "Cómo funciona", steps: "Pasos", checkout: "Cierre", footer: "Pie",
};

function nombreDe(s: Seccion): string {
  const t = String(s.type || "").toLowerCase();
  for (const k of Object.keys(NOMBRES)) if (t.includes(k)) return NOMBRES[k];
  return t || "Sección";
}

export function BloquesEditor({ landingId, onGuardado }: { landingId: number | null; onGuardado: () => void }) {
  const [original, setOriginal] = useState<Seccion[]>([]);
  const [secciones, setSecciones] = useState<Seccion[]>([]);
  const [abierta, setAbierta] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!landingId) { setSecciones([]); setOriginal([]); return; }
    setCargando(true);
    fetch(`/api/landing-pages/${landingId}`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("no se pudo cargar"))))
      .then((l) => {
        const lista: Seccion[] = Array.isArray(l?.sections) ? l.sections.filter(Boolean).map((s: any, i: number) => ({ ...s, id: String(s.id || `${s.type || "sec"}-${i}`) })) : [];
        setSecciones(lista); setOriginal(lista); setAbierta(lista[0]?.id ?? null);
      })
      .catch(() => toast.error("No se pudieron cargar los bloques"))
      .finally(() => setCargando(false));
  }, [landingId]);

  const hayCambios = JSON.stringify(secciones) !== JSON.stringify(original);

  const cambiar = (id: string, patch: Partial<Seccion>) =>
    setSecciones((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  const mover = (id: string, dir: -1 | 1) =>
    setSecciones((prev) => {
      const i = prev.findIndex((s) => s.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const copia = [...prev];
      [copia[i], copia[j]] = [copia[j], copia[i]];
      return copia;
    });

  const guardar = async () => {
    if (!landingId) return;
    setGuardando(true);
    try {
      const r = await fetch(`/api/landing-pages/${landingId}`, {
        method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sections: secciones }),
      });
      if (!r.ok) throw new Error("no se pudo guardar");
      setOriginal(secciones);
      toast.success("Bloques guardados");
      onGuardado();
    } catch { toast.error("No se pudo guardar"); }
    finally { setGuardando(false); }
  };

  if (!landingId) {
    return <div className="p-4 text-xs text-muted-foreground">Generá o elegí una landing para editar sus bloques.</div>;
  }
  if (cargando) {
    return <div className="p-4 text-xs text-muted-foreground flex items-center gap-2"><Loader2 className="h-3 w-3 animate-spin" /> Cargando bloques…</div>;
  }

  return (
    <div className="flex flex-col h-full">
      <ScrollArea className="flex-1 px-2 py-2">
        <div className="space-y-1.5">
          {secciones.map((s, i) => {
            const open = abierta === s.id;
            return (
              <div key={s.id} className={`rounded-lg border bg-background ${s.hidden ? "opacity-50" : ""}`}>
                <div className="flex items-center gap-1 px-2 py-1.5">
                  <button onClick={() => setAbierta(open ? null : s.id)} className="flex items-center gap-1 flex-1 text-left min-w-0" aria-expanded={open}>
                    {open ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
                    <span className="text-xs font-semibold truncate">{nombreDe(s)}</span>
                    {s.title ? <span className="text-[10px] text-muted-foreground truncate">— {String(s.title)}</span> : null}
                  </button>
                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0" title="Subir" disabled={i === 0} onClick={() => mover(s.id, -1)}><ArrowUp className="h-3 w-3" /></Button>
                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0" title="Bajar" disabled={i === secciones.length - 1} onClick={() => mover(s.id, 1)}><ArrowDown className="h-3 w-3" /></Button>
                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0" title={s.hidden ? "Mostrar" : "Ocultar"} onClick={() => cambiar(s.id, { hidden: !s.hidden })}>
                    {s.hidden ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                  </Button>
                </div>
                {open && (
                  <div className="px-2 pb-2 space-y-1.5 border-t pt-2">
                    <Campo etiqueta="Título" valor={s.title} onChange={(v) => cambiar(s.id, { title: v })} />
                    <Campo etiqueta="Subtítulo" valor={s.subtitle} onChange={(v) => cambiar(s.id, { subtitle: v })} />
                    <label className="block">
                      <span className="text-[10px] uppercase font-semibold text-muted-foreground">Texto</span>
                      <textarea
                        value={String(s.body ?? "")}
                        onChange={(e) => cambiar(s.id, { body: e.target.value })}
                        rows={4}
                        className="mt-0.5 w-full rounded-md border bg-background px-2 py-1 text-xs leading-relaxed"
                      />
                    </label>
                    <Campo etiqueta="Botón" valor={s.cta} onChange={(v) => cambiar(s.id, { cta: v })} />
                    <Campo etiqueta="Imagen (URL)" valor={s.image} onChange={(v) => cambiar(s.id, { image: v })} />
                    {s.image ? <img src={String(s.image)} alt="" className="h-16 w-full object-cover rounded-md border" /> : null}
                  </div>
                )}
              </div>
            );
          })}
          {secciones.length === 0 && <p className="text-xs text-muted-foreground p-2">Esta landing no tiene bloques.</p>}
        </div>
      </ScrollArea>
      <div className="px-3 py-2 border-t bg-muted/10 shrink-0 flex gap-2">
        <Button size="sm" variant="ghost" className="h-8 text-xs" disabled={!hayCambios || guardando} onClick={() => setSecciones(original)}>
          <Undo2 className="h-3 w-3 mr-1" /> Deshacer
        </Button>
        <Button size="sm" className="h-8 text-xs flex-1 bg-violet-600 hover:bg-violet-700 text-white" disabled={!hayCambios || guardando} onClick={guardar}>
          {guardando ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Save className="h-3 w-3 mr-1" />} Guardar y ver
        </Button>
      </div>
    </div>
  );
}

function Campo({ etiqueta, valor, onChange }: { etiqueta: string; valor: unknown; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase font-semibold text-muted-foreground">{etiqueta}</span>
      <Input value={String(valor ?? "")} onChange={(e) => onChange(e.target.value)} className="h-7 text-xs mt-0.5" />
    </label>
  );
}
