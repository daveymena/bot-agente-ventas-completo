/**
 * Editor de una pieza (imagen o fotograma de escena) sobre Fabric.js.
 *
 * Lienzo a tamaño real (1080×…) escalado a la pantalla; panel de propiedades
 * según la selección; deshacer/rehacer por instantáneas del Diseño. Al
 * guardar entrega el Diseño actualizado y el JPG tal cual se ve.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, FabricImage, Rect, type FabricObject } from "fabric";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, BookmarkPlus, Copy, ImagePlus, Loader2, Redo2, Save, Search, Smile, Square, Circle as CircleIcon, Trash2, Type, Undo2, Upload, X, AlignLeft, AlignCenter, AlignRight } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AMARILLO, ANIMACIONES, FUENTES, MOVIMIENTOS_CAPA, PATRONES, apiEstudio, esDegradado, esPatron, familiaCss, nuevoId, type Animacion, type Capa, type CapaFondo, type CapaIcono, type CapaImagen, type CapaTexto, type Diseno, type Elemento, type Entrada, type Movimiento, type RecorteGuardado } from "@/lib/estudio/diseno";
import { TextoAnuncio, aplicarEstiloImagen, canvasADiseno, cargarDisenoEnCanvas, cargarHojaDeFuentes, esperarFuentes, hornearEscala, objetoDeCapa } from "@/lib/estudio/fabric-diseno";

type Obj = FabricObject & { capa?: Capa; esFondo?: boolean };

export interface EditorImagenProps {
  titulo: string;
  diseno: Diseno;
  /** Fotos reales del producto para "Agregar foto". */
  fotos: string[];
  /** Recortes ya calculados (foto → PNG sin fondo) para que "Quitar fondo" sea instantáneo. */
  recortes?: Record<string, { url: string; confianza: number }>;
  productId: number;
  guardando?: boolean;
  onGuardar: (d: Diseno, jpgDataUrl: string) => Promise<void> | void;
  onCerrar: () => void;
}

const COLORES = ["#111827", "#ffffff", "#4F46E5", AMARILLO, "#25D366", "#EF4444", "#F97316", "#0EA5E9", "#64748B"];

export function EditorImagen({ titulo, diseno, fotos, recortes = {}, productId, guardando, onGuardar, onCerrar }: EditorImagenProps) {
  const [recortando, setRecortando] = useState(false);
  const contRef = useRef<HTMLDivElement>(null);
  const canvasEl = useRef<HTMLCanvasElement>(null);
  const canvasRef = useRef<Canvas | null>(null);
  const baseRef = useRef<Diseno>(diseno);
  const historial = useRef<{ atras: Diseno[]; adelante: Diseno[] }>({ atras: [], adelante: [] });
  const [sel, setSel] = useState<Obj | null>(null);
  const [tick, setTick] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [zoom, setZoom] = useState(0.3);
  const [subiendo, setSubiendo] = useState(false);
  const [panel, setPanel] = useState<"props" | "elementos">("props");
  const refrescar = useCallback(() => setTick((t) => t + 1), []);
  useEffect(() => { cargarHojaDeFuentes(); }, []);

  const ajustarZoom = useCallback(() => {
    const c = canvasRef.current, cont = contRef.current;
    if (!c || !cont) return;
    const d = baseRef.current;
    const z = Math.max(0.05, Math.min((cont.clientWidth - 16) / d.ancho, (cont.clientHeight - 16) / d.alto));
    c.setDimensions({ width: Math.round(d.ancho * z), height: Math.round(d.alto * z) });
    c.setZoom(z);
    c.requestRenderAll();
    setZoom(z);
  }, []);

  const instantanea = useCallback((): Diseno | null => {
    const c = canvasRef.current;
    if (!c) return null;
    for (const o of c.getObjects() as Obj[]) if (o.capa) hornearEscala(o);
    return canvasADiseno(c, baseRef.current);
  }, []);

  const guardarHistorial = useCallback(() => {
    const d = instantanea();
    if (!d) return;
    const h = historial.current;
    const ultimo = h.atras[h.atras.length - 1];
    if (ultimo && JSON.stringify(ultimo) === JSON.stringify(d)) return;
    h.atras = [...h.atras.slice(-49), d];
    h.adelante = [];
  }, [instantanea]);

  const cargar = useCallback(async (d: Diseno) => {
    const c = canvasRef.current;
    if (!c) return;
    setCargando(true);
    baseRef.current = d;
    try { await cargarDisenoEnCanvas(c, d); } catch (e: any) { toast.error(`No se pudo cargar el diseño: ${e?.message || e}`); }
    setSel(null);
    ajustarZoom();
    setCargando(false);
  }, [ajustarZoom]);

  // Montaje del lienzo.
  useEffect(() => {
    if (!canvasEl.current) return;
    const c = new Canvas(canvasEl.current, { preserveObjectStacking: true, selection: true, backgroundColor: "#ffffff", stopContextMenu: true, fireRightClick: false });
    canvasRef.current = c;
    const alSeleccionar = () => { setSel((c.getActiveObject() as Obj) || null); refrescar(); };
    c.on("selection:created", alSeleccionar);
    c.on("selection:updated", alSeleccionar);
    c.on("selection:cleared", () => { setSel(null); refrescar(); });
    c.on("object:modified", (e) => { const o = e.target as Obj; if (o?.capa) hornearEscala(o); guardarHistorial(); refrescar(); });
    c.on("text:changed", () => refrescar());
    c.on("text:editing:exited", () => guardarHistorial());
    historial.current = { atras: [JSON.parse(JSON.stringify(diseno))], adelante: [] };
    void cargar(diseno);
    const ro = new ResizeObserver(() => ajustarZoom());
    if (contRef.current) ro.observe(contRef.current);
    return () => { ro.disconnect(); c.dispose(); canvasRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Atajos.
  useEffect(() => {
    const h = (ev: KeyboardEvent) => {
      const c = canvasRef.current;
      if (!c) return;
      const activo = c.getActiveObject() as any;
      if (activo?.isEditing) return;
      const enCampo = ["INPUT", "TEXTAREA", "SELECT"].includes((ev.target as HTMLElement)?.tagName);
      if ((ev.key === "Delete" || ev.key === "Backspace") && !enCampo && activo) { ev.preventDefault(); borrar(); }
      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "z" && !enCampo) { ev.preventDefault(); ev.shiftKey ? rehacer() : deshacer(); }
      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "y" && !enCampo) { ev.preventDefault(); rehacer(); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const deshacer = useCallback(() => {
    const h = historial.current;
    if (h.atras.length < 2) return;
    const actual = h.atras.pop()!;
    h.adelante.push(actual);
    void cargar(h.atras[h.atras.length - 1]!);
  }, [cargar]);
  const rehacer = useCallback(() => {
    const h = historial.current;
    const d = h.adelante.pop();
    if (!d) return;
    h.atras.push(d);
    void cargar(d);
  }, [cargar]);

  const agregar = useCallback(async (capa: Capa) => {
    const c = canvasRef.current;
    if (!c) return;
    const obj = await objetoDeCapa(capa);
    if (!obj) { toast.error("No se pudo agregar (¿la foto no carga?)"); return; }
    c.add(obj);
    c.setActiveObject(obj);
    c.requestRenderAll();
    guardarHistorial();
  }, [guardarHistorial]);

  const d = baseRef.current;
  const agregarTexto = () => agregar({ id: nuevoId("t"), tipo: "texto", x: Math.round(d.ancho * 0.1), y: Math.round(d.alto * 0.4), w: Math.round(d.ancho * 0.8), h: 100, texto: "Tu texto aquí", tam: Math.round(d.ancho / 14), peso: 900, color: "#111827", alinear: "centro", resaltado: AMARILLO, nombre: "Texto" });
  const agregarRect = () => agregar({ id: nuevoId("r"), tipo: "rect", x: Math.round(d.ancho * 0.2), y: Math.round(d.alto * 0.4), w: Math.round(d.ancho * 0.6), h: Math.round(d.ancho * 0.12), relleno: "#4F46E5", radio: 24, nombre: "Rectángulo" });
  const agregarCirculo = () => agregar({ id: nuevoId("c"), tipo: "circulo", x: Math.round(d.ancho * 0.6), y: Math.round(d.alto * 0.5), w: 260, h: 260, relleno: AMARILLO, nombre: "Círculo" });
  const agregarFoto = (src: string) => agregar({ id: nuevoId("i"), tipo: "imagen", src, ajuste: "contener", x: Math.round(d.ancho * 0.1), y: Math.round(d.alto * 0.25), w: Math.round(d.ancho * 0.8), h: Math.round(d.ancho * 0.8), radio: 28, sombra: true, nombre: "Foto" });
  const agregarElemento = (el: Elemento) => {
    const tam = Math.round(d.ancho * 0.18);
    return agregar({ id: nuevoId("k"), tipo: "icono", icono: el.ref, color: el.coloreable ? "#111827" : null, x: Math.round(d.ancho / 2 - tam / 2), y: Math.round(d.alto * 0.42), w: tam, h: tam, nombre: el.nombre });
  };

  const guardarComoPlantilla = async () => {
    const dd = instantanea();
    if (!dd) return;
    const nombre = prompt("Nombre de la plantilla (se podrá aplicar a cualquier producto):", titulo);
    if (nombre == null) return;
    try {
      await apiEstudio("/plantillas/personales", { method: "POST", body: JSON.stringify({ nombre, diseno: dd }) });
      toast.success("Plantilla guardada: la verás en la pestaña Plantillas → Mis plantillas, y Atlas también la puede usar");
    } catch (e: any) { toast.error(`No se pudo guardar la plantilla: ${e?.message || e}`); }
  };

  /** Cambia la animación de la capa seleccionada (solo cuenta en el vídeo): entrada y/o movimiento interno continuo. */
  const setAnim = (cambios: Partial<Animacion> | null) => {
    const c = canvasRef.current;
    const o = c?.getActiveObject() as Obj | undefined;
    if (!c || !o?.capa) return;
    const anim: Animacion | null = cambios === null ? null : { retraso: 0.3, duracion: 0.5, ...(o.capa.anim || {}), ...cambios };
    const vacia = !anim || (!anim.entrada && (!anim.movimiento || anim.movimiento === "ninguno"));
    o.capa = { ...o.capa, anim: vacia ? null : anim } as Capa;
    refrescar();
    guardarHistorial();
  };

  /** Quita el fondo de la foto seleccionada (recorte local del servidor) o vuelve a la foto original. */
  const quitarFondo = async () => {
    const c = canvasRef.current;
    const o = c?.getActiveObject() as Obj | undefined;
    if (!c || !o || o.capa?.tipo !== "imagen") return;
    const capa = o.capa as CapaImagen;
    if (capa.recortada) { await setImagen({ src: capa.original || capa.src, recortada: false, original: undefined, radio: 28 }); return; }
    setRecortando(true);
    try {
      let url = recortes[capa.src]?.url || null;
      if (!url) {
        const r = await apiEstudio<{ recorte: RecorteGuardado }>(`/${productId}/recortar`, { method: "POST", body: JSON.stringify({ foto: capa.src }) });
        if (!r.recorte.usable || !r.recorte.url) { toast.message(`No se recortó: ${r.recorte.motivo || "el fondo no es liso"} (confianza ${Math.round(r.recorte.confianza * 100)} %). Se deja la foto entera.`); return; }
        url = r.recorte.url;
      }
      await setImagen({ src: `${url}${url.includes("?") ? "&" : "?"}v=${Date.now()}`, original: capa.src, recortada: true, ajuste: "contener", radio: 0, sombra: true });
      toast.success("Fondo quitado: el producto flota sobre el diseño");
    } catch (e: any) { toast.error(`No se pudo recortar: ${e?.message || e}`); }
    finally { setRecortando(false); }
  };

  const setIcono = async (cambios: Partial<CapaIcono>) => {
    const c = canvasRef.current;
    const o = c?.getActiveObject() as Obj | undefined;
    if (!c || !o || o.capa?.tipo !== "icono") return;
    const caja = { x: o.left || 0, y: o.top || 0, w: o.getScaledWidth(), h: o.getScaledHeight() };
    const idx = c.getObjects().indexOf(o);
    const rem = await objetoDeCapa({ ...(o.capa as CapaIcono), ...cambios, ...caja });
    if (!rem) { toast.error("No se pudo recargar el elemento"); return; }
    c.remove(o);
    c.insertAt(idx, rem);
    c.setActiveObject(rem);
    c.requestRenderAll();
    refrescar();
    guardarHistorial();
  };

  const setFuente = async (id: string) => {
    await esperarFuentes([id]);
    setProp({ fontFamily: familiaCss(id) });
  };

  const subirFoto = async (f: File | undefined) => {
    if (!f) return;
    setSubiendo(true);
    try {
      const r = await apiEstudio<{ url: string }>(`/${productId}/archivo?nombre=${encodeURIComponent(f.name)}`, { method: "POST", body: f, headers: { "Content-Type": f.type || "application/octet-stream" } });
      await agregarFoto(r.url);
    } catch (e: any) { toast.error(`No se pudo subir: ${e?.message || e}`); }
    setSubiendo(false);
  };

  const borrar = () => {
    const c = canvasRef.current;
    const o = c?.getActiveObject();
    if (!c || !o) return;
    c.remove(o);
    c.discardActiveObject();
    c.requestRenderAll();
    setSel(null);
    guardarHistorial();
  };
  const duplicar = async () => {
    const c = canvasRef.current;
    const o = c?.getActiveObject() as Obj | undefined;
    if (!c || !o?.capa) return;
    const dd = instantanea();
    const capa = dd?.capas.find((k) => k.id === o.capa!.id);
    if (!capa) return;
    await agregar({ ...capa, id: nuevoId(capa.tipo[0]), x: capa.x + 30, y: capa.y + 30 });
  };
  const mover = (dir: 1 | -1) => {
    const c = canvasRef.current;
    const o = c?.getActiveObject();
    if (!c || !o) return;
    dir > 0 ? c.bringObjectForward(o) : c.sendObjectBackwards(o);
    // El fondo (foto difuminada + velo) siempre queda abajo.
    const fondos = (c.getObjects() as Obj[]).filter((x) => x.esFondo);
    fondos.reverse().forEach((f) => c.sendObjectToBack(f));
    c.requestRenderAll();
    guardarHistorial();
  };

  const setProp = (cambios: Record<string, unknown>, historico = true) => {
    const c = canvasRef.current;
    const o = c?.getActiveObject() as Obj | undefined;
    if (!c || !o) return;
    o.set(cambios);
    if (o.capa?.tipo === "texto") (o as unknown as TextoAnuncio).initDimensions();
    o.setCoords();
    c.requestRenderAll();
    refrescar();
    if (historico) guardarHistorial();
  };

  const setImagen = async (cambios: Partial<CapaImagen>) => {
    const c = canvasRef.current;
    const o = c?.getActiveObject() as Obj | undefined;
    if (!c || !o || o.capa?.tipo !== "imagen") return;
    const img = o as unknown as FabricImage;
    const nueva: CapaImagen = { ...(o.capa as CapaImagen), ...cambios };
    if (cambios.ajuste || cambios.src) {
      const caja = { x: img.left || 0, y: img.top || 0, w: img.getScaledWidth(), h: img.getScaledHeight() };
      const idx = c.getObjects().indexOf(o);
      const rem = await objetoDeCapa({ ...nueva, ...caja });
      if (!rem) { toast.error("No se pudo cargar esa foto"); return; }
      c.remove(o);
      c.insertAt(idx, rem);
      c.setActiveObject(rem);
    } else {
      o.capa = nueva;
      aplicarEstiloImagen(img, nueva);
    }
    c.requestRenderAll();
    refrescar();
    guardarHistorial();
  };

  const setFondo = async (cambios: Partial<CapaFondo>) => {
    const actual = instantanea();
    if (!actual) return;
    const i = actual.capas.findIndex((k) => k.tipo === "fondo");
    const fondo: CapaFondo = i >= 0 ? { ...(actual.capas[i] as CapaFondo), ...cambios } : { id: nuevoId("f"), tipo: "fondo", x: 0, y: 0, w: actual.ancho, h: actual.alto, relleno: "#ffffff", ...cambios };
    const capas = [...actual.capas];
    if (i >= 0) capas[i] = fondo; else capas.unshift(fondo);
    const nuevo = { ...actual, capas };
    historial.current.atras.push(nuevo);
    historial.current.adelante = [];
    await cargar(nuevo);
  };

  const guardar = async () => {
    const c = canvasRef.current;
    if (!c) return;
    const dd = instantanea();
    if (!dd) return;
    c.discardActiveObject();
    c.requestRenderAll();
    const url = c.toDataURL({ format: "jpeg", quality: 0.92, multiplier: 1 / zoom, enableRetinaScaling: false });
    await onGuardar(dd, url);
  };

  const capa = sel?.capa;
  const fondoActual = useMemo(() => d.capas.find((k): k is CapaFondo => k.tipo === "fondo"), [d, tick]);
  const t = sel as unknown as TextoAnuncio;

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-slate-950 text-slate-100">
      {/* Barra superior */}
      <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
        <Button size="sm" variant="ghost" className="text-slate-200 hover:bg-white/10" onClick={onCerrar}><X className="h-4 w-4" /></Button>
        <div className="min-w-0 flex-1 truncate text-sm font-semibold">{titulo} <span className="ml-2 text-xs font-normal text-slate-400">{d.ancho}×{d.alto} · {Math.round(zoom * 100)}%</span></div>
        <Button size="sm" variant="ghost" className="text-slate-200 hover:bg-white/10" onClick={deshacer} title="Deshacer (Ctrl+Z)"><Undo2 className="h-4 w-4" /></Button>
        <Button size="sm" variant="ghost" className="text-slate-200 hover:bg-white/10" onClick={rehacer} title="Rehacer (Ctrl+Y)"><Redo2 className="h-4 w-4" /></Button>
        <Button size="sm" variant="ghost" className="hidden text-slate-200 hover:bg-white/10 sm:inline-flex" onClick={guardarComoPlantilla} title="Guardar este diseño como plantilla propia"><BookmarkPlus className="mr-1 h-4 w-4" />Plantilla</Button>
        <Button size="sm" className="bg-indigo-600 hover:bg-indigo-500" onClick={guardar} disabled={guardando || cargando}>{guardando ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}Guardar</Button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        {/* Herramientas */}
        <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-white/10 px-2 py-1.5 md:w-16 md:flex-col md:items-stretch md:border-b-0 md:border-r md:py-3">
          <Herr icono={<Type className="h-5 w-5" />} texto="Texto" onClick={agregarTexto} />
          <Herr icono={<Square className="h-5 w-5" />} texto="Caja" onClick={agregarRect} />
          <Herr icono={<CircleIcon className="h-5 w-5" />} texto="Círculo" onClick={agregarCirculo} />
          <Herr icono={<ImagePlus className="h-5 w-5" />} texto="Foto" onClick={() => fotos[0] ? agregarFoto(fotos[0]) : toast.message("Este producto no tiene fotos; sube una con el botón de subir")} />
          <Herr icono={<Smile className="h-5 w-5" />} texto="Elementos" onClick={() => { setPanel("elementos"); canvasRef.current?.discardActiveObject(); canvasRef.current?.requestRenderAll(); setSel(null); }} />
          <label className="flex cursor-pointer flex-col items-center gap-0.5 rounded-lg px-2 py-1.5 text-[10px] text-slate-300 hover:bg-white/10">
            {subiendo ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />}Subir
            <input type="file" accept="image/*" className="hidden" onChange={(e) => subirFoto(e.target.files?.[0])} />
          </label>
        </div>

        {/* Lienzo */}
        <div ref={contRef} className="relative flex min-h-[46vh] flex-1 items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_center,#1e293b,#020617)] p-2">
          <div className="shadow-2xl ring-1 ring-white/10"><canvas ref={canvasEl} /></div>
          {cargando && <div className="absolute inset-0 flex items-center justify-center bg-slate-950/60 text-sm"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Cargando diseño…</div>}
        </div>

        {/* Propiedades */}
        <div className="max-h-[42vh] shrink-0 overflow-y-auto border-t border-white/10 bg-slate-900 p-3 text-sm md:max-h-none md:w-80 md:border-l md:border-t-0">
          {!capa && panel === "elementos" && (
            <PanelElementos onElegir={(el) => void agregarElemento(el)} onCerrar={() => setPanel("props")} />
          )}
          {!capa && panel !== "elementos" && (
            <div className="space-y-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Fondo</h3>
              <div>
                <Label className="text-slate-300">Tipo de fondo</Label>
                <div className="mt-1 flex rounded-md border border-white/10">
                  {([["color", "Color"], ["degradado", "Degradado"], ["patron", "Patrón"]] as const).map(([v, n]) => {
                    const actual = !fondoActual || typeof fondoActual.relleno === "string" ? "color" : esDegradado(fondoActual.relleno) ? "degradado" : "patron";
                    const base = typeof fondoActual?.relleno === "string" ? fondoActual.relleno : esDegradado(fondoActual?.relleno || "") ? (fondoActual!.relleno as any).degradado[0] : esPatron(fondoActual?.relleno || "") ? (fondoActual!.relleno as any).fondo : "#111827";
                    return <button key={v} className={`flex-1 py-1 text-xs ${actual === v ? "bg-indigo-600 text-white" : "text-slate-300"}`} onClick={() => setFondo({ relleno: v === "color" ? base : v === "degradado" ? { degradado: [base, "#4F46E5"], angulo: 160 } : { patron: "puntos", color: "#ffffff55", fondo: base, escala: 1 } })}>{n}</button>;
                  })}
                </div>
              </div>
              {(!fondoActual || typeof fondoActual.relleno === "string") && (
                <div>
                  <Label className="text-slate-300">Color</Label>
                  <Paleta valor={typeof fondoActual?.relleno === "string" ? fondoActual.relleno : "#111111"} onChange={(v) => setFondo({ relleno: v })} />
                </div>
              )}
              {fondoActual && esDegradado(fondoActual.relleno) && (
                <>
                  <div><Label className="text-slate-300">Color inicial</Label><Paleta valor={fondoActual.relleno.degradado[0]} onChange={(v) => setFondo({ relleno: { ...(fondoActual.relleno as any), degradado: [v, (fondoActual.relleno as any).degradado[1]] } })} /></div>
                  <div><Label className="text-slate-300">Color final</Label><Paleta valor={fondoActual.relleno.degradado[1]} onChange={(v) => setFondo({ relleno: { ...(fondoActual.relleno as any), degradado: [(fondoActual.relleno as any).degradado[0], v] } })} /></div>
                  <div><Label className="text-slate-300">Ángulo ({fondoActual.relleno.angulo ?? 180}°)</Label><Slider className="mt-2" min={0} max={360} step={10} value={[fondoActual.relleno.angulo ?? 180]} onValueCommit={(v) => setFondo({ relleno: { ...(fondoActual.relleno as any), angulo: v[0] } })} /></div>
                </>
              )}
              {fondoActual && esPatron(fondoActual.relleno) && (
                <>
                  <div>
                    <Label className="text-slate-300">Patrón</Label>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {Object.entries(PATRONES).map(([id, n]) => <button key={id} className={`rounded border px-2 py-0.5 text-[11px] ${(fondoActual.relleno as any).patron === id ? "border-indigo-400 bg-indigo-600/30 text-white" : "border-white/10 text-slate-300"}`} onClick={() => setFondo({ relleno: { ...(fondoActual.relleno as any), patron: id } })}>{n}</button>)}
                    </div>
                  </div>
                  <div><Label className="text-slate-300">Color del fondo</Label><Paleta valor={fondoActual.relleno.fondo} onChange={(v) => setFondo({ relleno: { ...(fondoActual.relleno as any), fondo: v } })} /></div>
                  <div><Label className="text-slate-300">Color del dibujo</Label><Paleta valor={fondoActual.relleno.color.slice(0, 7)} onChange={(v) => setFondo({ relleno: { ...(fondoActual.relleno as any), color: `${v}55` } })} /></div>
                  <div><Label className="text-slate-300">Escala ({fondoActual.relleno.escala ?? 1}×)</Label><Slider className="mt-2" min={5} max={30} step={1} value={[Math.round((fondoActual.relleno.escala ?? 1) * 10)]} onValueCommit={(v) => setFondo({ relleno: { ...(fondoActual.relleno as any), escala: v[0]! / 10 } })} /></div>
                </>
              )}
              <div>
                <Label className="text-slate-300">Foto difuminada de fondo</Label>
                <div className="mt-1 flex flex-wrap gap-2">
                  <button className={`h-14 w-14 rounded-md border text-[10px] ${!fondoActual?.imagen ? "border-indigo-400" : "border-white/10"}`} onClick={() => setFondo({ imagen: null })}>Sin foto</button>
                  {fotos.slice(0, 8).map((f) => (
                    <button key={f} className={`h-14 w-14 overflow-hidden rounded-md border ${fondoActual?.imagen === f ? "border-indigo-400" : "border-white/10"}`} onClick={() => setFondo({ imagen: f, desenfoque: fondoActual?.desenfoque ?? 36, oscurecer: fondoActual?.oscurecer ?? 0.5 })}>
                      <img src={f.startsWith("/") ? f : `/api/estudio-anuncios/imagen?src=${encodeURIComponent(f)}`} className="h-full w-full object-cover" alt="" />
                    </button>
                  ))}
                </div>
              </div>
              {fondoActual?.imagen && (
                <div>
                  <Label className="text-slate-300">Oscurecer ({Math.round((fondoActual.oscurecer ?? 0.5) * 100)}%)</Label>
                  <Slider className="mt-2" min={0} max={90} step={5} value={[Math.round((fondoActual.oscurecer ?? 0.5) * 100)]} onValueCommit={(v) => setFondo({ oscurecer: v[0]! / 100 })} />
                </div>
              )}
              <p className="text-xs text-slate-500">Toca un elemento del lienzo para editarlo. Arrastra para mover, usa las esquinas para cambiar el tamaño y doble clic en un texto para escribir.</p>
              <div>
                <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Capas</h3>
                <ListaCapas canvas={canvasRef.current} tick={tick} onElegir={(o) => { canvasRef.current?.setActiveObject(o); canvasRef.current?.requestRenderAll(); setSel(o); }} />
              </div>
            </div>
          )}

          {capa && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">{capa.nombre || capa.tipo}</h3>
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-slate-300 hover:bg-white/10" title="Traer al frente" onClick={() => mover(1)}><ArrowUp className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-slate-300 hover:bg-white/10" title="Enviar atrás" onClick={() => mover(-1)}><ArrowDown className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-slate-300 hover:bg-white/10" title="Duplicar" onClick={duplicar}><Copy className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-red-300 hover:bg-red-500/20" title="Eliminar" onClick={borrar}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>

              {capa.tipo === "texto" && (
                <>
                  <div>
                    <Label className="text-slate-300">Texto</Label>
                    <Textarea className="mt-1 min-h-[72px] border-white/10 bg-slate-800 text-slate-100" value={t.text} onChange={(e) => setProp({ text: e.target.value }, false)} onBlur={() => guardarHistorial()} />
                  </div>
                  <div>
                    <Label className="text-slate-300">Tamaño ({Math.round(t.fontSize)})</Label>
                    <Slider className="mt-2" min={16} max={220} step={1} value={[Math.round(t.fontSize)]} onValueChange={(v) => setProp({ fontSize: v[0] }, false)} onValueCommit={() => guardarHistorial()} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-slate-300">Grosor</Label>
                      <div className="mt-1 flex rounded-md border border-white/10">
                        {([["normal", "Normal"], ["bold", "Negrita"], ["900", "Black"]] as const).map(([v, n]) => (
                          <button key={v} className={`flex-1 px-1 py-1 text-xs ${String(t.fontWeight) === v ? "bg-indigo-600 text-white" : "text-slate-300"}`} onClick={() => setProp({ fontWeight: v })}>{n}</button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <Label className="text-slate-300">Alinear</Label>
                      <div className="mt-1 flex rounded-md border border-white/10">
                        {([["left", AlignLeft], ["center", AlignCenter], ["right", AlignRight]] as const).map(([v, I]) => (
                          <button key={v} className={`flex flex-1 justify-center py-1 ${t.textAlign === v ? "bg-indigo-600 text-white" : "text-slate-300"}`} onClick={() => setProp({ textAlign: v })}><I className="h-4 w-4" /></button>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div>
                    <Label className="text-slate-300">Tipografía</Label>
                    <Select value={(capa as CapaTexto).fuente || FUENTES.find((f) => familiaCss(f.id) === t.fontFamily)?.id || "inter"} onValueChange={(v) => void setFuente(v)}>
                      <SelectTrigger className="mt-1 border-white/10 bg-slate-800"><SelectValue /></SelectTrigger>
                      <SelectContent className="max-h-72">
                        {FUENTES.map((f) => <SelectItem key={f.id} value={f.id}><span style={{ fontFamily: familiaCss(f.id) }}>{f.nombre}</span> <span className="ml-1 text-[10px] text-muted-foreground">{f.categoria}</span></SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-slate-300">Color del texto</Label>
                    <Paleta valor={String(t.fill || "#111827")} onChange={(v) => setProp({ fill: v })} />
                  </div>
                  <div>
                    <div className="flex items-center justify-between">
                      <Label className="text-slate-300">Contorno (texto sobre foto)</Label>
                      <Switch checked={!!(t.strokeWidth && t.stroke)} onCheckedChange={(on) => setProp(on ? { stroke: "#111827", strokeWidth: Math.max(2, Math.round(t.fontSize / 12)), paintFirst: "stroke", strokeLineJoin: "round" } : { stroke: undefined, strokeWidth: 0 })} />
                    </div>
                    {!!(t.strokeWidth && t.stroke) && <Paleta valor={String(t.stroke)} onChange={(v) => setProp({ stroke: v })} />}
                  </div>
                  <div>
                    <div className="flex items-center justify-between">
                      <Label className="text-slate-300">Resaltado detrás del texto</Label>
                      <Switch checked={!!t.resaltado} onCheckedChange={(on) => setProp({ resaltado: on ? AMARILLO : null })} />
                    </div>
                    {t.resaltado && <Paleta valor={t.resaltado} onChange={(v) => setProp({ resaltado: v })} />}
                  </div>
                </>
              )}

              {capa.tipo === "imagen" && (
                <>
                  <div>
                    <Label className="text-slate-300">Ajuste</Label>
                    <div className="mt-1 flex rounded-md border border-white/10">
                      {([["contener", "Completa"], ["cubrir", "Rellenar"]] as const).map(([v, n]) => (
                        <button key={v} className={`flex-1 py-1 text-xs ${(capa as CapaImagen).ajuste === v ? "bg-indigo-600 text-white" : "text-slate-300"}`} onClick={() => setImagen({ ajuste: v })}>{n}</button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <Label className="text-slate-300">Esquinas ({(capa as CapaImagen).radio ?? 0})</Label>
                    <Slider className="mt-2" min={0} max={200} step={4} value={[(capa as CapaImagen).radio ?? 0]} onValueCommit={(v) => setImagen({ radio: v[0] })} />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label className="text-slate-300">Sombra</Label>
                    <Switch checked={!!(capa as CapaImagen).sombra} onCheckedChange={(on) => setImagen({ sombra: on })} />
                  </div>
                  <div className="rounded-xl border border-white/10 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <Label className="text-slate-300">{(capa as CapaImagen).recortada ? "Producto sin fondo" : "Quitar el fondo"}</Label>
                        <p className="text-[11px] text-slate-500">{(capa as CapaImagen).recortada ? "Recorte local de la foto real, con sombra de silueta." : "Recorte local (sin IA): solo si el fondo de la foto es liso."}</p>
                      </div>
                      <Button size="sm" variant="secondary" disabled={recortando} onClick={() => void quitarFondo()}>
                        {recortando ? <Loader2 className="h-4 w-4 animate-spin" /> : (capa as CapaImagen).recortada ? "Foto original" : "Quitar fondo"}
                      </Button>
                    </div>
                  </div>
                  {fotos.length > 1 && (
                    <div>
                      <Label className="text-slate-300">Cambiar por otra foto del producto</Label>
                      <div className="mt-1 flex flex-wrap gap-2">
                        {fotos.slice(0, 8).map((f) => (
                          <button key={f} className={`h-14 w-14 overflow-hidden rounded-md border ${(capa as CapaImagen).src === f ? "border-indigo-400" : "border-white/10"}`} onClick={() => setImagen({ src: f })}>
                            <img src={f.startsWith("/") ? f : `/api/estudio-anuncios/imagen?src=${encodeURIComponent(f)}`} className="h-full w-full object-cover" alt="" />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}

              {(capa.tipo === "rect" || capa.tipo === "circulo") && (
                <>
                  <div>
                    <Label className="text-slate-300">Color</Label>
                    <Paleta valor={String((sel as unknown as Rect).fill || "#4F46E5")} onChange={(v) => setProp({ fill: v })} />
                  </div>
                  {capa.tipo === "rect" && (
                    <div>
                      <Label className="text-slate-300">Esquinas ({Math.round((sel as unknown as Rect).rx || 0)})</Label>
                      <Slider className="mt-2" min={0} max={200} step={4} value={[Math.round((sel as unknown as Rect).rx || 0)]} onValueChange={(v) => setProp({ rx: v[0], ry: v[0] }, false)} onValueCommit={() => guardarHistorial()} />
                    </div>
                  )}
                </>
              )}

              {capa.tipo === "icono" && (
                <div>
                  <Label className="text-slate-300">Color del elemento</Label>
                  {(capa as CapaIcono).color || /^(iconos|formas|marcas):/.test((capa as CapaIcono).icono) ? (
                    <Paleta valor={(capa as CapaIcono).color || "#111827"} onChange={(v) => void setIcono({ color: v })} />
                  ) : <p className="mt-1 text-xs text-slate-500">Los emojis traen su propio color. Cambia el tamaño desde las esquinas.</p>}
                </div>
              )}

              <div className="rounded-xl border border-white/10 p-3">
                <div className="flex items-center justify-between">
                  <Label className="text-slate-300">Animación de entrada <span className="text-[10px] text-slate-500">(solo vídeo)</span></Label>
                  <Switch checked={!!capa.anim?.entrada} onCheckedChange={(on) => setAnim(on ? { entrada: "aparecer" } : { entrada: null })} />
                </div>
                {capa.anim?.entrada && (
                  <div className="mt-2 space-y-2">
                    <Select value={capa.anim.entrada} onValueChange={(v) => setAnim({ entrada: v as Entrada })}>
                      <SelectTrigger className="border-white/10 bg-slate-800"><SelectValue /></SelectTrigger>
                      <SelectContent>{Object.entries(ANIMACIONES).map(([k, n]) => <SelectItem key={k} value={k}>{n}</SelectItem>)}</SelectContent>
                    </Select>
                    <div><Label className="text-xs text-slate-400">Empieza a los {(capa.anim.retraso ?? 0.3).toFixed(1)} s</Label><Slider className="mt-1" min={0} max={30} step={1} value={[Math.round((capa.anim.retraso ?? 0.3) * 10)]} onValueCommit={(v) => setAnim({ retraso: v[0]! / 10 })} /></div>
                    <div><Label className="text-xs text-slate-400">Dura {(capa.anim.duracion ?? 0.5).toFixed(1)} s</Label><Slider className="mt-1" min={2} max={15} step={1} value={[Math.round((capa.anim.duracion ?? 0.5) * 10)]} onValueCommit={(v) => setAnim({ duracion: v[0]! / 10 })} /></div>
                  </div>
                )}
                <div className="mt-3 border-t border-white/10 pt-3">
                  <Label className="text-slate-300">Movimiento interno <span className="text-[10px] text-slate-500">(sigue toda la escena)</span></Label>
                  <Select value={capa.anim?.movimiento || "ninguno"} onValueChange={(v) => setAnim({ movimiento: v as Movimiento })}>
                    <SelectTrigger className="mt-1 border-white/10 bg-slate-800"><SelectValue /></SelectTrigger>
                    <SelectContent>{Object.entries(MOVIMIENTOS_CAPA).map(([k, n]) => <SelectItem key={k} value={k}>{n}</SelectItem>)}</SelectContent>
                  </Select>
                  {capa.anim?.movimiento && capa.anim.movimiento !== "ninguno" && (
                    <div className="mt-2 flex rounded-md border border-white/10">
                      {([[1, "Sutil"], [2, "Normal"], [3, "Marcado"]] as const).map(([v, n]) => (
                        <button key={v} className={`flex-1 py-1 text-xs ${(capa.anim?.intensidad ?? 2) === v ? "bg-indigo-600 text-white" : "text-slate-300"}`} onClick={() => setAnim({ intensidad: v })}>{n}</button>
                      ))}
                    </div>
                  )}
                  <p className="mt-1 text-[11px] text-slate-500">El producto recortado, los emojis y el sello de precio se mueven solos dentro del cuadro, como en los anuncios hechos con IA.</p>
                </div>
              </div>

              <div>
                <Label className="text-slate-300">Opacidad ({Math.round((sel?.opacity ?? 1) * 100)}%)</Label>
                <Slider className="mt-2" min={10} max={100} step={5} value={[Math.round((sel?.opacity ?? 1) * 100)]} onValueChange={(v) => setProp({ opacity: v[0]! / 100 }, false)} onValueCommit={() => guardarHistorial()} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PanelElementos({ onElegir, onCerrar }: { onElegir: (e: Elemento) => void; onCerrar: () => void }) {
  const [q, setQ] = useState("");
  const [coleccion, setColeccion] = useState<"" | Elemento["coleccion"]>("");
  const [items, setItems] = useState<Elemento[]>([]);
  const [buscando, setBuscando] = useState(false);
  useEffect(() => {
    const t = setTimeout(async () => {
      setBuscando(true);
      try {
        const r = await apiEstudio<{ items: Elemento[] }>(`/elementos?q=${encodeURIComponent(q || "estrella corazon regalo oferta")}${coleccion ? `&coleccion=${coleccion}` : ""}&limite=60`);
        setItems(r.items);
      } catch { setItems([]); }
      setBuscando(false);
    }, 250);
    return () => clearTimeout(t);
  }, [q, coleccion]);
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Elementos</h3>
        <Button size="icon" variant="ghost" className="h-7 w-7 text-slate-300 hover:bg-white/10" onClick={onCerrar}><X className="h-4 w-4" /></Button>
      </div>
      <div className="relative"><Search className="absolute left-2 top-2 h-4 w-4 text-slate-500" /><Input className="h-8 border-white/10 bg-slate-800 pl-7 text-xs text-slate-100" placeholder="corazón, regalo, flecha, whatsapp…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <div className="flex flex-wrap gap-1 text-[11px]">
        {([["", "Todo"], ["emoji", "Emojis"], ["iconos", "Iconos"], ["formas", "Formas"], ["marcas", "Logos"]] as const).map(([v, n]) => <button key={v} className={`rounded border px-2 py-0.5 ${coleccion === v ? "border-indigo-400 bg-indigo-600/30 text-white" : "border-white/10 text-slate-300"}`} onClick={() => setColeccion(v)}>{n}</button>)}
      </div>
      {buscando && <p className="text-xs text-slate-500"><Loader2 className="mr-1 inline h-3 w-3 animate-spin" />Buscando…</p>}
      <div className="grid grid-cols-5 gap-1.5">
        {items.map((e) => (
          <button key={e.ref} title={e.nombre} className="flex aspect-square items-center justify-center rounded-md border border-white/10 bg-white/90 p-1.5 hover:border-indigo-400" onClick={() => onElegir(e)}>
            <img src={e.svg} alt={e.nombre} className="h-full w-full object-contain" loading="lazy" />
          </button>
        ))}
      </div>
      {!buscando && !items.length && <p className="text-xs text-slate-500">Nada con ese nombre. Prueba en español o en inglés (p. ej. "gift").</p>}
      <p className="text-[10px] text-slate-500">Fluent Emoji (MIT), Tabler Icons (MIT), Simple Icons (CC0) y formas propias. Todo libre para uso comercial.</p>
    </div>
  );
}

function Herr({ icono, texto, onClick }: { icono: React.ReactNode; texto: string; onClick: () => void }) {
  return <button className="flex flex-col items-center gap-0.5 rounded-lg px-2 py-1.5 text-[10px] text-slate-300 hover:bg-white/10" onClick={onClick}>{icono}{texto}</button>;
}

function Paleta({ valor, onChange }: { valor: string; onChange: (v: string) => void }) {
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1.5">
      {COLORES.map((c) => <button key={c} className={`h-6 w-6 rounded-full border ${valor.toLowerCase() === c.toLowerCase() ? "border-indigo-400 ring-2 ring-indigo-400/40" : "border-white/20"}`} style={{ background: c }} onClick={() => onChange(c)} title={c} />)}
      <input type="color" value={/^#[0-9a-f]{6}$/i.test(valor) ? valor : "#000000"} onChange={(e) => onChange(e.target.value)} className="h-6 w-8 cursor-pointer rounded border border-white/20 bg-transparent" />
      <Input className="h-7 w-24 border-white/10 bg-slate-800 text-xs text-slate-100" value={valor} onChange={(e) => /^#[0-9a-f]{6}$/i.test(e.target.value) && onChange(e.target.value)} />
    </div>
  );
}

function ListaCapas({ canvas, tick: _tick, onElegir }: { canvas: Canvas | null; tick: number; onElegir: (o: Obj) => void }) {
  if (!canvas) return null;
  const objs = (canvas.getObjects() as Obj[]).filter((o) => o.capa && !o.esFondo).reverse();
  if (!objs.length) return <p className="text-xs text-slate-500">Sin capas.</p>;
  return (
    <ul className="space-y-0.5">
      {objs.map((o, i) => (
        <li key={o.capa!.id + i}>
          <button className="w-full truncate rounded px-2 py-1 text-left text-xs text-slate-300 hover:bg-white/10" onClick={() => onElegir(o)}>
            {o.capa!.tipo === "texto" ? `Texto: ${(o as unknown as TextoAnuncio).text?.slice(0, 28)}` : o.capa!.nombre || o.capa!.tipo}
          </button>
        </li>
      ))}
    </ul>
  );
}

