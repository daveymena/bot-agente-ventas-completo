/**
 * Editor de bloques del Landing Studio.
 *
 * El cliente toca la landing con las manos: reordena (arrastrando), oculta,
 * duplica, borra, edita textos y foto de cada sección, agrega bloques de una
 * biblioteca y le pide a la IA que mejore UN bloque. La idea es la de los
 * constructores de páginas (GrapesJS, Puck: JSON como fuente de verdad +
 * editor visual), reducida a lo que nuestros renderers entienden.
 *
 * Es CONTROLADO: el estado (y el historial para deshacer) vive en la página,
 * porque la vista previa también edita las mismas secciones (doble clic).
 */
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ArrowUp, ArrowDown, Eye, EyeOff, Loader2, ChevronDown, ChevronRight, Copy, Trash2, Plus, Sparkles, GripVertical, Upload, ImageOff, Wand2 } from "lucide-react";

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
  pricing: "Precio", cta: "Llamado final", problem: "El problema", solution: "La solución", trust: "Confianza",
  guarantee: "Garantía", how_it_works: "Cómo funciona", "how-it-works": "Cómo funciona", steps: "Pasos",
  checkout: "Cierre", footer: "Pie", logistic: "Envío y entrega", "photo-band": "Banda de foto",
};

export function nombreDe(s: Pick<Seccion, "type">): string {
  const t = String(s.type || "").toLowerCase();
  if (NOMBRES[t]) return NOMBRES[t];
  for (const k of Object.keys(NOMBRES)) if (t.includes(k)) return NOMBRES[k];
  return t || "Sección";
}

/** Los bloques que los renderers saben dibujar. Testimonios NO: sin datos reales, sería inventarlos. */
const BIBLIOTECA: { type: string; nombre: string; desc: string; emoji: string }[] = [
  { type: "benefits", nombre: "Beneficios", desc: "Razones para comprar, con ✓", emoji: "✅" },
  { type: "how-it-works", nombre: "Cómo funciona", desc: "Pasos de uso, con foto", emoji: "🔁" },
  { type: "problem", nombre: "El problema", desc: "El dolor que resuelve", emoji: "😣" },
  { type: "offer", nombre: "Oferta", desc: "Precio y qué incluye", emoji: "🏷️" },
  { type: "faq", nombre: "Preguntas frecuentes", desc: "Dudas antes de comprar", emoji: "❓" },
  { type: "gallery", nombre: "Galería", desc: "Las fotos reales del producto", emoji: "🖼️" },
  { type: "photo-band", nombre: "Banda de foto", desc: "Foto a lo ancho con una frase", emoji: "🌄" },
  { type: "logistics", nombre: "Envío y entrega", desc: "Cómo llega y cómo se paga", emoji: "🚚" },
  { type: "guarantee", nombre: "Garantía", desc: "Solo la que el negocio ofrece", emoji: "🛡️" },
  { type: "cta", nombre: "Llamado final", desc: "El último empujón", emoji: "👉" },
];

const ACCIONES_IA = [
  { etiqueta: "Más persuasivo", instruccion: "Reescribe esta sección más persuasiva, orientada al beneficio, sin inventar datos" },
  { etiqueta: "Más corto", instruccion: "Acorta los textos de esta sección a la mitad conservando lo esencial" },
  { etiqueta: "Otro ángulo", instruccion: "Reescribe esta sección desde otro ángulo de venta (dolor, deseo o curiosidad), sin inventar datos" },
  { etiqueta: "Corregir", instruccion: "Corrige ortografía y redacción de esta sección sin cambiar el sentido" },
];

const AYUDA_CUERPO: Record<string, string> = {
  faq: "Una pregunta por línea: Pregunta | Respuesta",
  benefits: "Un beneficio por línea",
  features: "Una característica por línea",
  "how-it-works": "Un paso por línea",
  offer: "Lo que incluye, una cosa por línea",
};

export interface BloquesEditorProps {
  landingId: number | null;
  secciones: Seccion[];
  onCambiar: (nuevas: Seccion[]) => void;
  seleccion: string | null;
  onSeleccionar: (id: string | null) => void;
  /** Fotos reales del producto, para elegir sin pegar URLs. */
  fotos: string[];
  ocupado: boolean;
  cargando: boolean;
  /** Pide a la IA un cambio (sobre un bloque o la página). */
  onIA: (instruccion: string, sectionId: string | null) => Promise<void>;
  onSubirImagen: (archivo: File) => Promise<string | null>;
}

let idsLocales = 0;
const idNuevo = (type: string) => `${type}-${Date.now().toString(36)}${(idsLocales++).toString(36)}`;

export function BloquesEditor(p: BloquesEditorProps) {
  const { secciones, onCambiar, seleccion, onSeleccionar } = p;
  const [biblioteca, setBiblioteca] = useState(false);
  const [pedido, setPedido] = useState("");
  const arrastrando = useRef<string | null>(null);
  const [sobre, setSobre] = useState<string | null>(null);
  const archivoRef = useRef<HTMLInputElement>(null);
  const subirPara = useRef<string | null>(null);
  const [subiendo, setSubiendo] = useState(false);

  const cambiar = (id: string, patch: Partial<Seccion>) => onCambiar(secciones.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  const mover = (id: string, dir: -1 | 1) => {
    const i = secciones.findIndex((s) => s.id === id), j = i + dir;
    if (i < 0 || j < 0 || j >= secciones.length) return;
    const copia = [...secciones];
    [copia[i], copia[j]] = [copia[j], copia[i]];
    onCambiar(copia);
  };
  const moverA = (id: string, destino: string) => {
    if (id === destino) return;
    const copia = [...secciones];
    const i = copia.findIndex((s) => s.id === id);
    if (i < 0) return;
    const [s] = copia.splice(i, 1);
    const j = copia.findIndex((x) => x.id === destino);
    copia.splice(j < 0 ? copia.length : j, 0, s);
    onCambiar(copia);
  };
  const duplicar = (id: string) => {
    const i = secciones.findIndex((s) => s.id === id);
    if (i < 0) return;
    const copia = [...secciones];
    const nueva = { ...secciones[i], id: idNuevo(secciones[i].type) };
    copia.splice(i + 1, 0, nueva);
    onCambiar(copia);
    onSeleccionar(nueva.id);
  };
  const borrar = (id: string) => {
    const s = secciones.find((x) => x.id === id);
    if (!s) return;
    if (s.type === "hero") return;
    onCambiar(secciones.filter((x) => x.id !== id));
    if (seleccion === id) onSeleccionar(null);
  };
  const agregarEnBlanco = (type: string) => {
    const nueva: Seccion = { id: idNuevo(type), type, title: "", subtitle: "", body: "", cta: "" };
    const cierre = secciones.findIndex((s) => s.type === "cta");
    const copia = [...secciones];
    if (cierre === -1 || type === "cta") copia.push(nueva); else copia.splice(cierre, 0, nueva);
    onCambiar(copia);
    onSeleccionar(nueva.id);
    setBiblioteca(false);
  };

  const elegirArchivo = (id: string) => { subirPara.current = id; archivoRef.current?.click(); };
  const alSubir = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    const id = subirPara.current;
    if (!f || !id) return;
    setSubiendo(true);
    try { const url = await p.onSubirImagen(f); if (url) cambiar(id, { image: url }); } finally { setSubiendo(false); }
  };

  if (!p.landingId) return <div className="p-4 text-xs text-muted-foreground">Generá o elegí una landing para editar sus bloques.</div>;
  if (p.cargando) return <div className="p-4 text-xs text-muted-foreground flex items-center gap-2"><Loader2 className="h-3 w-3 animate-spin" /> Cargando bloques…</div>;

  return (
    <div className="flex flex-col h-full min-h-0">
      <input ref={archivoRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={alSubir} />
      <div className="px-2 py-1.5 border-b text-[10px] text-muted-foreground bg-muted/20 shrink-0">
        Tip: en la vista previa, <b>clic</b> elige un bloque y <b>doble clic</b> sobre un título o botón lo edita ahí mismo.
      </div>
      <ScrollArea className="flex-1 px-2 py-2">
        <div className="space-y-1.5">
          {secciones.map((s, i) => {
            const open = seleccion === s.id;
            const fijo = s.type === "hero";
            return (
              <div
                key={s.id}
                onDragOver={(e) => { if (arrastrando.current) { e.preventDefault(); setSobre(s.id); } }}
                onDragLeave={() => setSobre((x) => (x === s.id ? null : x))}
                onDrop={(e) => { e.preventDefault(); if (arrastrando.current) moverA(arrastrando.current, s.id); arrastrando.current = null; setSobre(null); }}
                className={`rounded-lg border bg-background transition-colors ${s.hidden ? "opacity-50" : ""} ${open ? "border-violet-500 ring-1 ring-violet-500/30" : ""} ${sobre === s.id ? "border-t-4 border-t-violet-500" : ""}`}
              >
                <div className="flex items-center gap-0.5 px-1 py-1.5">
                  <span
                    draggable={!fijo}
                    onDragStart={(e) => { arrastrando.current = s.id; e.dataTransfer.effectAllowed = "move"; }}
                    onDragEnd={() => { arrastrando.current = null; setSobre(null); }}
                    className={`p-0.5 ${fijo ? "opacity-20" : "cursor-grab active:cursor-grabbing text-muted-foreground"}`}
                    title={fijo ? "La portada va siempre arriba" : "Arrastrá para reordenar"}
                  >
                    <GripVertical className="h-3.5 w-3.5" />
                  </span>
                  <button onClick={() => onSeleccionar(open ? null : s.id)} className="flex items-center gap-1 flex-1 text-left min-w-0" aria-expanded={open}>
                    {open ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
                    <span className="text-xs font-semibold truncate">{nombreDe(s)}</span>
                    {s.title ? <span className="text-[10px] text-muted-foreground truncate">— {String(s.title)}</span> : <span className="text-[10px] text-amber-600">sin título</span>}
                  </button>
                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0" title="Subir" aria-label="Subir" disabled={i === 0 || fijo} onClick={() => mover(s.id, -1)}><ArrowUp className="h-3 w-3" /></Button>
                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0" title="Bajar" aria-label="Bajar" disabled={i === secciones.length - 1 || fijo} onClick={() => mover(s.id, 1)}><ArrowDown className="h-3 w-3" /></Button>
                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0" title={s.hidden ? "Mostrar" : "Ocultar"} aria-label={s.hidden ? "Mostrar" : "Ocultar"} onClick={() => cambiar(s.id, { hidden: !s.hidden })}>
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
                        placeholder={AYUDA_CUERPO[s.type] || ""}
                        className="mt-0.5 w-full rounded-md border bg-background px-2 py-1 text-xs leading-relaxed"
                      />
                    </label>
                    <Campo etiqueta="Botón" valor={s.cta} onChange={(v) => cambiar(s.id, { cta: v })} />
                    <div>
                      <span className="text-[10px] uppercase font-semibold text-muted-foreground">Foto del bloque</span>
                      <div className="mt-1 flex gap-1 overflow-x-auto pb-1">
                        <button onClick={() => cambiar(s.id, { image: null })} title="Automática (el motor elige una foto real que no se repita)"
                          className={`h-12 w-12 shrink-0 rounded-md border grid place-items-center text-[9px] text-muted-foreground ${!s.image ? "ring-2 ring-violet-500" : ""}`}>
                          <ImageOff className="h-3.5 w-3.5" />
                        </button>
                        {p.fotos.map((f) => (
                          <button key={f} onClick={() => cambiar(s.id, { image: f })} className={`h-12 w-12 shrink-0 rounded-md border overflow-hidden ${s.image === f ? "ring-2 ring-violet-500" : ""}`}>
                            <img src={f} alt="" className="h-full w-full object-cover" loading="lazy" />
                          </button>
                        ))}
                        {s.image && !p.fotos.includes(String(s.image)) && (
                          <span className="h-12 w-12 shrink-0 rounded-md border overflow-hidden ring-2 ring-violet-500"><img src={String(s.image)} alt="" className="h-full w-full object-cover" /></span>
                        )}
                        <button onClick={() => elegirArchivo(s.id)} title="Subir una foto propia" disabled={subiendo}
                          className="h-12 w-12 shrink-0 rounded-md border border-dashed grid place-items-center text-muted-foreground hover:bg-muted">
                          {subiendo ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                    </div>
                    <div className="rounded-md bg-violet-50 dark:bg-violet-950/30 p-1.5 space-y-1">
                      <span className="text-[10px] font-semibold text-violet-700 dark:text-violet-300 flex items-center gap-1"><Sparkles className="h-3 w-3" /> IA sobre este bloque</span>
                      <div className="flex flex-wrap gap-1">
                        {ACCIONES_IA.map((a) => (
                          <button key={a.etiqueta} disabled={p.ocupado} onClick={() => p.onIA(a.instruccion, s.id)}
                            className="text-[10px] px-2 py-0.5 rounded-full border bg-background hover:bg-muted disabled:opacity-50">{a.etiqueta}</button>
                        ))}
                      </div>
                      <form className="flex gap-1" onSubmit={(e) => { e.preventDefault(); if (pedido.trim()) { void p.onIA(pedido.trim(), s.id); setPedido(""); } }}>
                        <Input value={pedido} onChange={(e) => setPedido(e.target.value)} placeholder="Pedile algo a este bloque…" className="h-7 text-[11px]" disabled={p.ocupado} />
                        <Button type="submit" size="sm" className="h-7 w-7 p-0 shrink-0" disabled={p.ocupado || !pedido.trim()} aria-label="Pedir a la IA">
                          {p.ocupado ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />}
                        </Button>
                      </form>
                    </div>
                    <div className="flex gap-1 pt-1">
                      <Button size="sm" variant="outline" className="h-7 text-[11px] flex-1" onClick={() => duplicar(s.id)}><Copy className="h-3 w-3 mr-1" />Duplicar</Button>
                      <Button size="sm" variant="outline" className="h-7 text-[11px] flex-1 text-red-600" disabled={fijo} onClick={() => borrar(s.id)}><Trash2 className="h-3 w-3 mr-1" />Quitar</Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {secciones.length === 0 && <p className="text-xs text-muted-foreground p-2">Esta landing no tiene bloques.</p>}

          {biblioteca ? (
            <div className="rounded-lg border bg-muted/20 p-2 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold">Agregar un bloque</span>
                <button className="text-[11px] text-muted-foreground" onClick={() => setBiblioteca(false)}>Cerrar</button>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {BIBLIOTECA.map((b) => (
                  <div key={b.type} className="rounded-md border bg-background p-1.5">
                    <p className="text-[11px] font-semibold">{b.emoji} {b.nombre}</p>
                    <p className="text-[10px] text-muted-foreground leading-tight mb-1">{b.desc}</p>
                    <div className="flex gap-1">
                      <button disabled={p.ocupado} onClick={() => { setBiblioteca(false); void p.onIA(`Agrega una sección "${b.nombre}" (type ${b.type}) con los datos reales del producto y del negocio. Si no hay datos reales para esa sección, no la agregues.`, null); }}
                        className="flex-1 text-[10px] rounded bg-violet-600 text-white px-1 py-0.5 disabled:opacity-50" title="La IA la escribe con los datos reales">✨ Con IA</button>
                      <button onClick={() => agregarEnBlanco(b.type)} className="flex-1 text-[10px] rounded border px-1 py-0.5" title="Vacía, para escribirla a mano">En blanco</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <Button size="sm" variant="outline" className="w-full h-8 text-xs border-dashed" onClick={() => setBiblioteca(true)}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Agregar bloque
            </Button>
          )}
        </div>
      </ScrollArea>
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
