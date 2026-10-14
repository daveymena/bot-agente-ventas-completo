/**
 * Editor de vídeo por escenas (guion visual): cada escena es un fotograma
 * 9:16 editable + duración + locución + transición + movimiento. Al generar,
 * el navegador exporta cada fotograma tal cual se ve y el servidor arma el
 * MP4 (voz, movimiento, transiciones, música).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Clapperboard, Copy, Loader2, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { MOVIMIENTOS, TRANSICIONES, apiEstudio, nuevoId, type Diseno, type Escena, type Transicion } from "@/lib/estudio/diseno";
import { dataUrlABlob, exportarDiseno } from "@/lib/estudio/fabric-diseno";
import { EditorImagen } from "./editor-imagen";

export interface EditorVideoProps {
  productId: number;
  escenas: Escena[];
  fotos: string[];
  onCerrar: () => void;
  /** Se llama cuando el vídeo quedó encolado (el padre hace el seguimiento). */
  onVideoPedido: () => void;
}

export function EditorVideo({ productId, escenas: iniciales, fotos, onCerrar, onVideoPedido }: EditorVideoProps) {
  const [escenas, setEscenas] = useState<Escena[]>(() => JSON.parse(JSON.stringify(iniciales)));
  const [activa, setActiva] = useState(0);
  const [miniaturas, setMiniaturas] = useState<Record<string, string>>({});
  const [editando, setEditando] = useState<number | null>(null);
  const [voz, setVoz] = useState("es-CO-SalomeNeural");
  const [conVoz, setConVoz] = useState(true);
  const [conMusica, setConMusica] = useState(true);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const pendientes = useRef(new Set<string>());

  const miniaturaDe = useCallback(async (e: Escena) => {
    const clave = `${e.id}:${JSON.stringify(e.diseno).length}:${hash(JSON.stringify(e.diseno))}`;
    if (pendientes.current.has(clave)) return;
    pendientes.current.add(clave);
    try {
      const url = await exportarDiseno(e.diseno, { formato: "jpeg", escala: 0.16, calidad: 0.8 });
      setMiniaturas((m) => ({ ...m, [e.id]: url }));
    } catch { /* sin miniatura */ }
    pendientes.current.delete(clave);
  }, []);

  useEffect(() => { escenas.forEach((e) => void miniaturaDe(e)); }, [escenas, miniaturaDe]);

  const esc = escenas[activa];
  const actualizar = (i: number, cambios: Partial<Escena>) => setEscenas((xs) => xs.map((e, k) => (k === i ? { ...e, ...cambios, editada: true } : e)));
  const mover = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= escenas.length) return;
    setEscenas((xs) => { const c = [...xs]; [c[i], c[j]] = [c[j]!, c[i]!]; return c; });
    setActiva(j);
  };
  const duplicar = (i: number) => {
    const e = escenas[i]!;
    const copia: Escena = { ...JSON.parse(JSON.stringify(e)), id: nuevoId("e"), editada: true };
    setEscenas((xs) => [...xs.slice(0, i + 1), copia, ...xs.slice(i + 1)]);
    setActiva(i + 1);
  };
  const eliminar = (i: number) => {
    if (escenas.length <= 1) { toast.message("El vídeo necesita al menos una escena"); return; }
    setEscenas((xs) => xs.filter((_, k) => k !== i));
    setActiva(Math.max(0, i - 1));
  };
  const agregar = () => {
    const base = escenas[escenas.length - 1] || escenas[0];
    if (!base) return;
    const diseno: Diseno = JSON.parse(JSON.stringify(base.diseno));
    const nueva: Escena = { id: nuevoId("e"), diseno, duracion: 3.5, locucion: "", transicion: "fade", movimiento: "acercar", editada: true };
    setEscenas((xs) => [...xs, nueva]);
    setActiva(escenas.length);
  };

  const guardarGuion = async (silencioso = false) => {
    setOcupado("Guardando guion…");
    try {
      const r = await apiEstudio<{ escenas: Escena[] }>(`/${productId}/escenas`, { method: "PUT", body: JSON.stringify({ escenas }) });
      setEscenas(r.escenas);
      if (!silencioso) toast.success("Guion guardado");
      return true;
    } catch (e: any) { toast.error(`No se pudo guardar: ${e?.message || e}`); return false; }
    finally { setOcupado(null); }
  };

  const generar = async () => {
    if (!(await guardarGuion(true))) return;
    const fotogramas: Record<number, string> = {};
    try {
      for (let i = 0; i < escenas.length; i++) {
        setOcupado(`Exportando escena ${i + 1} de ${escenas.length}…`);
        const url = await exportarDiseno(escenas[i]!.diseno, { formato: "png", escala: 1 });
        const r = await apiEstudio<{ fotograma: string }>(`/${productId}/fotograma`, { method: "POST", body: dataUrlABlob(url), headers: { "Content-Type": "image/png" } });
        fotogramas[i] = r.fotograma;
      }
    } catch (e: any) {
      // Si el navegador no pudo exportar (foto sin CORS, memoria), el servidor pinta las escenas él mismo.
      toast.message(`El servidor pintará las escenas (${e?.message || e})`);
    }
    setOcupado("Enviando al servidor…");
    try {
      await apiEstudio(`/${productId}/video`, { method: "POST", body: JSON.stringify({ fotogramas, voz, conVoz, conMusica }) });
      toast.success("Vídeo en cola: se arma en 1–3 minutos");
      onVideoPedido();
      onCerrar();
    } catch (e: any) { toast.error(`No se pudo pedir el vídeo: ${e?.message || e}`); }
    finally { setOcupado(null); }
  };

  const total = escenas.reduce((a, e) => a + (Number(e.duracion) || 0), 0);

  if (editando != null && escenas[editando]) {
    const e = escenas[editando]!;
    return (
      <EditorImagen
        titulo={`Escena ${editando + 1} de ${escenas.length}`}
        diseno={e.diseno}
        fotos={fotos}
        productId={productId}
        onCerrar={() => setEditando(null)}
        onGuardar={(d) => { actualizar(editando, { diseno: d }); setEditando(null); }}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-slate-950 text-slate-100">
      <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
        <Button size="sm" variant="ghost" className="text-slate-200 hover:bg-white/10" onClick={onCerrar}><X className="h-4 w-4" /></Button>
        <div className="min-w-0 flex-1 truncate text-sm font-semibold"><Clapperboard className="mr-1 inline h-4 w-4" />Vídeo por escenas <span className="ml-2 text-xs font-normal text-slate-400">{escenas.length} escenas · ≈{Math.round(total)} s · 1080×1920</span></div>
        <Button size="sm" variant="ghost" className="text-slate-200 hover:bg-white/10" onClick={() => guardarGuion()} disabled={!!ocupado}><Save className="mr-1 h-4 w-4" />Guardar guion</Button>
        <Button size="sm" className="bg-indigo-600 hover:bg-indigo-500" onClick={generar} disabled={!!ocupado}>{ocupado ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Clapperboard className="mr-1 h-4 w-4" />}Generar vídeo</Button>
      </div>
      {ocupado && <div className="bg-indigo-600/20 px-3 py-1 text-center text-xs text-indigo-200">{ocupado}</div>}

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        {/* Tira de escenas */}
        <div className="flex shrink-0 gap-2 overflow-x-auto border-b border-white/10 p-2 md:w-44 md:flex-col md:overflow-y-auto md:border-b-0 md:border-r">
          {escenas.map((e, i) => (
            <button key={e.id} onClick={() => setActiva(i)} className={`relative shrink-0 overflow-hidden rounded-lg border-2 ${i === activa ? "border-indigo-400" : "border-transparent"} bg-slate-800`}>
              <div className="aspect-[9/16] w-20 md:w-full">{miniaturas[e.id] ? <img src={miniaturas[e.id]} className="h-full w-full object-cover" alt="" /> : <div className="flex h-full items-center justify-center"><Loader2 className="h-4 w-4 animate-spin text-slate-500" /></div>}</div>
              <span className="absolute left-1 top-1 rounded bg-black/60 px-1 text-[10px]">{i + 1}</span>
              <span className="absolute bottom-1 right-1 rounded bg-black/60 px-1 text-[10px]">{Number(e.duracion).toFixed(1)}s</span>
            </button>
          ))}
          <button onClick={agregar} className="flex aspect-[9/16] w-20 shrink-0 items-center justify-center rounded-lg border border-dashed border-white/20 text-slate-400 hover:bg-white/5 md:w-full"><Plus className="h-5 w-5" /></button>
        </div>

        {/* Escena activa */}
        {esc && (
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4 md:flex-row">
            <div className="mx-auto w-full max-w-[260px] shrink-0">
              <div className="relative aspect-[9/16] overflow-hidden rounded-xl bg-slate-800 ring-1 ring-white/10">
                {miniaturas[esc.id] && <img src={miniaturas[esc.id]} className="h-full w-full object-cover" alt="" />}
              </div>
              <div className="mt-2 flex justify-center gap-1">
                <Button size="sm" variant="ghost" className="text-slate-300 hover:bg-white/10" onClick={() => mover(activa, -1)} disabled={activa === 0}><ChevronLeft className="h-4 w-4" /></Button>
                <Button size="sm" variant="ghost" className="text-slate-300 hover:bg-white/10" onClick={() => duplicar(activa)}><Copy className="h-4 w-4" /></Button>
                <Button size="sm" variant="ghost" className="text-red-300 hover:bg-red-500/20" onClick={() => eliminar(activa)}><Trash2 className="h-4 w-4" /></Button>
                <Button size="sm" variant="ghost" className="text-slate-300 hover:bg-white/10" onClick={() => mover(activa, 1)} disabled={activa === escenas.length - 1}><ChevronRight className="h-4 w-4" /></Button>
              </div>
              <Button className="mt-2 w-full bg-indigo-600 hover:bg-indigo-500" size="sm" onClick={() => setEditando(activa)}><Pencil className="mr-1 h-4 w-4" />Editar diseño de la escena</Button>
            </div>

            <div className="flex-1 space-y-4 text-sm">
              <div>
                <Label className="text-slate-300">Locución (lo que dice la voz)</Label>
                <Textarea className="mt-1 border-white/10 bg-slate-800 text-slate-100" value={esc.locucion} onChange={(e) => actualizar(activa, { locucion: e.target.value })} placeholder="Vacío = sin voz en esta escena" />
                <p className="mt-1 text-xs text-slate-500">Si la voz dura más que la escena, la escena se alarga sola.</p>
              </div>
              <div>
                <Label className="text-slate-300">Duración ({Number(esc.duracion).toFixed(1)} s)</Label>
                <Slider className="mt-2" min={1.5} max={10} step={0.5} value={[Number(esc.duracion)]} onValueChange={(v) => actualizar(activa, { duracion: v[0]! })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-slate-300">Transición (al salir)</Label>
                  <Select value={esc.transicion || "fade"} onValueChange={(v) => actualizar(activa, { transicion: v as Transicion })}>
                    <SelectTrigger className="mt-1 border-white/10 bg-slate-800"><SelectValue /></SelectTrigger>
                    <SelectContent>{Object.entries(TRANSICIONES).map(([k, n]) => <SelectItem key={k} value={k}>{n}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-slate-300">Movimiento de cámara</Label>
                  <Select value={esc.movimiento || "acercar"} onValueChange={(v) => actualizar(activa, { movimiento: v as Escena["movimiento"] })}>
                    <SelectTrigger className="mt-1 border-white/10 bg-slate-800"><SelectValue /></SelectTrigger>
                    <SelectContent>{Object.entries(MOVIMIENTOS).map(([k, n]) => <SelectItem key={k} value={k}>{n}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>

              <div className="rounded-xl border border-white/10 p-3">
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Audio del vídeo</h4>
                <div className="flex items-center justify-between py-1"><Label className="text-slate-300">Voz en off</Label><Switch checked={conVoz} onCheckedChange={setConVoz} /></div>
                {conVoz && (
                  <Select value={voz} onValueChange={setVoz}>
                    <SelectTrigger className="mt-1 border-white/10 bg-slate-800"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="es-CO-SalomeNeural">Salomé (mujer, Colombia)</SelectItem>
                      <SelectItem value="es-CO-GonzaloNeural">Gonzalo (hombre, Colombia)</SelectItem>
                    </SelectContent>
                  </Select>
                )}
                <div className="flex items-center justify-between py-1"><Label className="text-slate-300">Música de fondo (si hay pistas en data/musica)</Label><Switch checked={conMusica} onCheckedChange={setConMusica} /></div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}
