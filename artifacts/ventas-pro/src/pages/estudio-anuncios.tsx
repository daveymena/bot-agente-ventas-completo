/**
 * Estudio de anuncios: por cada producto, un paquete de imágenes (1:1, 4:5,
 * 9:16) y un vídeo vertical hechos con sus fotos reales; todo editable.
 */
import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Clapperboard, Download, Facebook, Images, LayoutTemplate, Loader2, Pencil, RefreshCw, Search, Sparkles, Trash2, Wand2, CheckCircle2, AlertTriangle, Video } from "lucide-react";
import { FORMATOS, PLANTILLAS, apiEstudio, nombreDePlantilla, type CatalogoEstudio, type Diseno, type EstadoEstudio, type Formato, type ImagenGenerada, type PlantillaCatalogo, type ProductoDelEstudio } from "@/lib/estudio/diseno";
// Los editores traen Fabric.js (~300 KB): se cargan solo al abrirlos.
const EditorImagen = lazy(() => import("@/components/estudio/editor-imagen").then((m) => ({ default: m.EditorImagen })));
const EditorVideo = lazy(() => import("@/components/estudio/editor-video").then((m) => ({ default: m.EditorVideo })));
const PanelIA = lazy(() => import("@/components/estudio/panel-ia").then((m) => ({ default: m.PanelIA })));
const CargandoEditor = () => <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/90 text-sm text-slate-200"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Abriendo el editor…</div>;

const miniatura = (src: string | null | undefined) => (!src ? "" : src.startsWith("/") || src.startsWith("data:") ? src : `/api/estudio-anuncios/imagen?src=${encodeURIComponent(src)}`);

export default function EstudioAnunciosPage() {
  const [location] = useLocation();
  const [productos, setProductos] = useState<ProductoDelEstudio[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [cargandoLista, setCargandoLista] = useState(true);
  const [salud, setSalud] = useState<{ ok: boolean; ffmpeg: boolean; nota: string | null } | null>(null);
  const [seleccion, setSeleccion] = useState<number | null>(() => { const m = /[?&]producto=(\d+)/.exec(typeof window !== "undefined" ? window.location.search : ""); return m ? Number(m[1]) : null; });
  const [estado, setEstado] = useState<EstadoEstudio | null>(null);
  const [conIA, setConIA] = useState(false);
  const [generando, setGenerando] = useState(false);
  const [editando, setEditando] = useState<{ id: string; diseno: Diseno; titulo: string } | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [editorVideo, setEditorVideo] = useState(false);
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const [creandoBorrador, setCreandoBorrador] = useState(false);
  const [catalogo, setCatalogo] = useState<CatalogoEstudio | null>(null);
  const [opciones, setOpciones] = useState<{ estilo: string; tema: string; guion: string }>({ estilo: "marca", tema: "ninguno", guion: "clasico" });
  const [mostrarOpciones, setMostrarOpciones] = useState(false);
  const cargarCatalogo = useCallback(async () => { try { setCatalogo(await apiEstudio<CatalogoEstudio>("/plantillas")); } catch { /* sin catálogo: el generador usa los valores por defecto */ } }, []);

  const cargarLista = useCallback(async () => {
    try {
      const r = await apiEstudio<{ productos: ProductoDelEstudio[] }>("/productos");
      setProductos(r.productos);
    } catch (e: any) { toast.error(`No se pudo cargar el catálogo: ${e?.message || e}`); }
    setCargandoLista(false);
  }, []);

  const cargarEstado = useCallback(async (id: number) => {
    try { setEstado(await apiEstudio<EstadoEstudio>(`/${id}`)); } catch (e: any) { toast.error(e?.message || "No se pudo leer el estudio"); }
  }, []);

  useEffect(() => { void cargarLista(); void cargarCatalogo(); apiEstudio("/salud").then(setSalud).catch(() => setSalud(null)); }, [cargarLista, cargarCatalogo, location]);
  useEffect(() => { if (seleccion) { setEstado(null); setMarcadas(new Set()); void cargarEstado(seleccion); } }, [seleccion, cargarEstado]);

  // Seguimiento mientras hay trabajos en cola/en curso.
  const activo = !!estado && ((estado.trabajos.paquete && ["pendiente", "en_curso"].includes(estado.trabajos.paquete.estado)) || (estado.trabajos.video && ["pendiente", "en_curso"].includes(estado.trabajos.video.estado)) || estado.estudio.paquete?.estado === "pendiente" || estado.estudio.paquete?.estado === "en_curso" || estado.estudio.video?.estado === "pendiente" || estado.estudio.video?.estado === "en_curso" || (estado.estudio.ia || []).some((c) => c.estado === "pendiente" || c.estado === "en_curso"));
  useEffect(() => {
    if (!activo || !seleccion) return;
    const t = setInterval(() => { void cargarEstado(seleccion); }, 2500);
    return () => clearInterval(t);
  }, [activo, seleccion, cargarEstado]);
  useEffect(() => { if (!activo) void cargarLista(); }, [activo, cargarLista]);

  const generar = async (conVideo = true) => {
    if (!seleccion) return;
    setGenerando(true);
    try {
      await apiEstudio(`/${seleccion}/generar`, { method: "POST", body: JSON.stringify({ conIA, conVideo, estilo: opciones.estilo, tema: opciones.tema, guion: opciones.guion }) });
      toast.success("Generando: 12 imágenes en segundos y el vídeo en 1–3 minutos");
      await cargarEstado(seleccion);
    } catch (e: any) { toast.error(e?.message || "No se pudo generar"); }
    setGenerando(false);
  };

  const guardarDiseno = async (d: Diseno, jpg: string) => {
    if (!seleccion || !editando) return;
    setGuardando(true);
    try {
      await apiEstudio(`/${seleccion}/diseno/${editando.id}`, { method: "PUT", body: JSON.stringify({ diseno: d, imagen: jpg }) });
      toast.success("Diseño guardado");
      setEditando(null);
      await cargarEstado(seleccion);
    } catch (e: any) { toast.error(e?.message || "No se pudo guardar"); }
    setGuardando(false);
  };

  const borrarImagen = async (id: string) => {
    if (!seleccion || !confirm("¿Borrar esta imagen?")) return;
    try { await apiEstudio(`/${seleccion}/imagen/${id}`, { method: "DELETE" }); await cargarEstado(seleccion); } catch (e: any) { toast.error(e?.message); }
  };

  const borrarEstudio = async () => {
    if (!seleccion || !confirm("¿Borrar todas las imágenes y el vídeo de este producto?")) return;
    try { await apiEstudio(`/${seleccion}`, { method: "DELETE" }); await cargarEstado(seleccion); await cargarLista(); } catch (e: any) { toast.error(e?.message); }
  };

  const descargar = async (url: string, nombre: string) => {
    try {
      const r = await fetch(url, { credentials: "include" });
      const b = await r.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(b); a.download = nombre; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    } catch { window.open(url, "_blank"); }
  };

  const crearBorradorMeta = async () => {
    if (!seleccion || !estado) return;
    const imgs = estado.estudio.imagenes.filter((i) => marcadas.has(i.id)).map((i) => i.urlAbsoluta || i.url);
    if (!imgs.length) { toast.message("Marca al menos una imagen"); return; }
    setCreandoBorrador(true);
    try {
      const r = await fetch(`/api/facebook/strategist/draft/${seleccion}`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ images: imgs }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || j?.message || `Error ${r.status}`);
      toast.success(`Borrador #${j?.id ?? ""} creado en Facebook → Borradores (en pausa, no gasta)`);
    } catch (e: any) { toast.error(`No se pudo crear el borrador: ${e?.message || e}`); }
    setCreandoBorrador(false);
  };

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return productos.filter((p) => !q || p.nombre.toLowerCase().includes(q) || String(p.id) === q);
  }, [productos, busqueda]);

  const producto = productos.find((p) => p.id === seleccion);
  const e = estado?.estudio;
  const fotos = e?.contenido?.fotos || [];
  const tp = estado?.trabajos.paquete, tv = estado?.trabajos.video;
  const porFormato = useMemo(() => {
    const g: Record<string, ImagenGenerada[]> = {};
    for (const i of e?.imagenes || []) (g[i.formato] ||= []).push(i);
    return g;
  }, [e?.imagenes]);

  return (
    <Layout>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight"><Wand2 className="h-6 w-6 text-indigo-600" />Estudio de anuncios</h1>
          <p className="text-sm text-muted-foreground">Imágenes para feed, historias y reels + vídeo vertical, hechos con las fotos reales de cada producto. Todo editable.</p>
        </div>
        {salud && (
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge variant="outline" className={salud.ok ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700"}>{salud.ok ? <CheckCircle2 className="mr-1 h-3 w-3" /> : <AlertTriangle className="mr-1 h-3 w-3" />}Imágenes</Badge>
            <Badge variant="outline" className={salud.ffmpeg ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700"}>{salud.ffmpeg ? <CheckCircle2 className="mr-1 h-3 w-3" /> : <AlertTriangle className="mr-1 h-3 w-3" />}Vídeo {salud.ffmpeg ? "" : "(sin ffmpeg)"}</Badge>
          </div>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-[300px_1fr]">
        {/* Catálogo */}
        <aside className="rounded-2xl border bg-card">
          <div className="border-b p-3">
            <div className="relative"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="pl-8" placeholder="Buscar producto…" value={busqueda} onChange={(ev) => setBusqueda(ev.target.value)} /></div>
          </div>
          <div className="max-h-[36vh] overflow-y-auto md:max-h-[calc(100vh-240px)]">
            {cargandoLista && <div className="p-4 text-sm text-muted-foreground"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Cargando catálogo…</div>}
            {!cargandoLista && !filtrados.length && <div className="p-4 text-sm text-muted-foreground">Sin productos. Crea uno en Productos o importa de Dropi/WooCommerce.</div>}
            {filtrados.map((p) => (
              <button key={p.id} onClick={() => setSeleccion(p.id)} className={`flex w-full items-center gap-3 border-b px-3 py-2 text-left transition hover:bg-muted/60 ${seleccion === p.id ? "bg-indigo-50 dark:bg-indigo-950/30" : ""}`}>
                <div className="h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-muted">{(p.estudio?.portada || p.imagen) && <img src={miniatura(p.estudio?.portada || p.imagen)} className="h-full w-full object-cover" alt="" loading="lazy" />}</div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{p.nombre}</div>
                  <div className="mt-0.5 flex flex-wrap gap-1 text-[11px] text-muted-foreground">
                    {p.estudio ? (
                      <>
                        {p.estudio.paquete === "listo" ? <span className="text-emerald-600">{p.estudio.imagenes} imágenes</span> : p.estudio.paquete ? <span className="text-indigo-600">{etiqueta(p.estudio.paquete)}</span> : null}
                        {p.estudio.video && <span className={p.estudio.video === "listo" ? "text-emerald-600" : p.estudio.video === "fallo" ? "text-red-600" : "text-indigo-600"}>· vídeo {etiqueta(p.estudio.video)}</span>}
                      </>
                    ) : <span>{p.fotos} foto{p.fotos === 1 ? "" : "s"} · sin anuncios</span>}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </aside>

        {/* Producto */}
        <section className="min-w-0">
          {!seleccion && (
            <div className="flex h-full min-h-[300px] flex-col items-center justify-center rounded-2xl border border-dashed p-8 text-center text-muted-foreground">
              <Images className="mb-3 h-10 w-10 text-indigo-400" />
              <p className="font-medium text-foreground">Elige un producto</p>
              <p className="mt-1 max-w-md text-sm">Con un clic salen 12 imágenes (4 plantillas × 1:1, 4:5 y 9:16) y un vídeo de 15–30 s con sus fotos reales. Después puedes editar cualquier pieza.</p>
            </div>
          )}

          {seleccion && producto && (
            <div className="space-y-4">
              <div className="rounded-2xl border bg-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-muted">{producto.imagen && <img src={miniatura(producto.imagen)} className="h-full w-full object-cover" alt="" />}</div>
                    <div className="min-w-0">
                      <h2 className="truncate text-lg font-semibold">{producto.nombre}</h2>
                      <p className="text-xs text-muted-foreground">{fotos.length || producto.fotos} foto{(fotos.length || producto.fotos) === 1 ? "" : "s"} del producto{e?.contenido?.precio ? ` · ${e.contenido.precio}` : ""}{e?.contenido?.marca ? ` · ${e.contenido.marca}` : ""}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-2 rounded-lg border px-2 py-1 text-xs"><Switch id="ia" checked={conIA} onCheckedChange={setConIA} /><Label htmlFor="ia" className="cursor-pointer"><Sparkles className="mr-1 inline h-3 w-3 text-indigo-500" />Ganchos con IA</Label></div>
                    <Button onClick={() => generar(true)} disabled={generando || activo} className="bg-indigo-600 hover:bg-indigo-500">{generando || activo ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Wand2 className="mr-1 h-4 w-4" />}{e?.imagenes?.length ? "Regenerar todo" : "Generar imágenes + vídeo"}</Button>
                    {!!e?.imagenes?.length && <Button variant="ghost" size="icon" title="Borrar el estudio de este producto" onClick={borrarEstudio}><Trash2 className="h-4 w-4 text-red-500" /></Button>}
                  </div>
                </div>

                {catalogo && (
                  <div className="mt-3 text-xs">
                    <button className="text-indigo-600 underline-offset-2 hover:underline" onClick={() => setMostrarOpciones((v) => !v)}>
                      {mostrarOpciones ? "Ocultar opciones" : `Estilo: ${catalogo.estilos.find((x) => x.id === opciones.estilo)?.nombre || opciones.estilo} · Tema: ${catalogo.temas.find((x) => x.id === opciones.tema)?.nombre || opciones.tema} · Guion: ${catalogo.guiones.find((x) => x.id === opciones.guion)?.nombre || opciones.guion} — cambiar`}
                    </button>
                    {mostrarOpciones && (
                      <div className="mt-2 grid gap-2 sm:grid-cols-3">
                        <label className="space-y-1"><span className="text-muted-foreground">Estilo (colores + tipografía)</span>
                          <select className="h-9 w-full rounded-md border bg-background px-2" value={opciones.estilo} onChange={(ev) => setOpciones((o) => ({ ...o, estilo: ev.target.value }))}>
                            <optgroup label="A mano">{catalogo.estilos.filter((x) => !/^paleta/.test(x.id)).map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}</optgroup>
                            <optgroup label="Paletas">{catalogo.estilos.filter((x) => /^paleta/.test(x.id)).map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}</optgroup>
                          </select></label>
                        <label className="space-y-1"><span className="text-muted-foreground">Tema / temporada</span>
                          <select className="h-9 w-full rounded-md border bg-background px-2" value={opciones.tema} onChange={(ev) => setOpciones((o) => ({ ...o, tema: ev.target.value }))}>{catalogo.temas.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}</select></label>
                        <label className="space-y-1"><span className="text-muted-foreground">Guion del vídeo</span>
                          <select className="h-9 w-full rounded-md border bg-background px-2" value={opciones.guion} onChange={(ev) => setOpciones((o) => ({ ...o, guion: ev.target.value }))}>{catalogo.guiones.map((x) => <option key={x.id} value={x.id}>{x.nombre} ({x.duracion})</option>)}</select></label>
                        <div className="flex flex-wrap gap-1 sm:col-span-3">
                          {catalogo.estilos.filter((x) => x.id === opciones.estilo).map((x) => <span key={x.id} className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5"><i className="h-3 w-3 rounded-full" style={{ background: x.fondo }} /><i className="h-3 w-3 rounded-full" style={{ background: x.acento }} /><i className="h-3 w-3 rounded-full" style={{ background: x.texto }} />{x.titular}{x.cuerpo !== x.titular ? ` + ${x.cuerpo}` : ""}</span>)}
                          <span className="text-muted-foreground">Se aplica a «Generar» y a las plantillas sin estilo/tema propio. Las frases salen de la ficha del producto; nada inventado.</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {(tp && tp.estado !== "listo") || e?.paquete?.estado === "fallo" ? (
                  <div className="mt-3 rounded-xl bg-muted/60 p-3 text-sm">
                    {e?.paquete?.estado === "fallo" && !(tp && ["pendiente", "en_curso"].includes(tp.estado)) ? (
                      <p className="text-red-600"><AlertTriangle className="mr-1 inline h-4 w-4" />Las imágenes fallaron: {e.paquete.error || tp?.error}. <button className="underline" onClick={() => generar(true)}>Reintentar</button></p>
                    ) : (
                      <>
                        <div className="flex items-center justify-between"><span><Loader2 className="mr-1 inline h-4 w-4 animate-spin" />{tp?.estado === "pendiente" ? `En cola (posición ${tp.posicion ?? 1})` : tp?.detalle || "Generando imágenes…"}</span><span className="text-xs text-muted-foreground">{tp?.progreso ?? 0}%{tp?.intento && tp.intento > 1 ? ` · intento ${tp.intento}` : ""}</span></div>
                        <Progress className="mt-2 h-2" value={tp?.progreso ?? 0} />
                      </>
                    )}
                  </div>
                ) : null}
              </div>

              {!!e && (
                <Tabs defaultValue="imagenes">
                  <TabsList>
                    <TabsTrigger value="imagenes"><Images className="mr-1 h-4 w-4" />Imágenes ({e.imagenes.length})</TabsTrigger>
                    <TabsTrigger value="video"><Video className="mr-1 h-4 w-4" />Vídeo {e.video?.estado === "listo" ? "✓" : ""}</TabsTrigger>
                    <TabsTrigger value="plantillas"><LayoutTemplate className="mr-1 h-4 w-4" />Plantillas</TabsTrigger>
                    <TabsTrigger value="ia"><Sparkles className="mr-1 h-4 w-4" />IA {(e.ia || []).some((c) => c.estado === "en_curso" || c.estado === "pendiente") ? <Loader2 className="ml-1 h-3 w-3 animate-spin" /> : (e.ia?.length ? `(${e.ia.length})` : "")}</TabsTrigger>
                  </TabsList>

                  <TabsContent value="ia">
                    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Cargando…</div>}>
                      <PanelIA productId={seleccion!} estado={estado!} onCambio={() => cargarEstado(seleccion!)} />
                    </Suspense>
                  </TabsContent>
                  <TabsContent value="plantillas">
                    <GaleriaDePlantillas productId={seleccion} catalogo={catalogo} opciones={opciones} onPiezaCreada={async () => { await cargarEstado(seleccion); }} onRecargarCatalogo={cargarCatalogo} />
                  </TabsContent>

                  <TabsContent value="imagenes" className="space-y-5">
                    {!e.imagenes.length && !activo && <div className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">Todavía no hay imágenes. Pulsa «Generar imágenes + vídeo».</div>}
                    {!!e.imagenes.length && (
                      <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-2 text-xs">
                        <span className="text-muted-foreground">{marcadas.size ? `${marcadas.size} marcada${marcadas.size === 1 ? "" : "s"}` : "Marca imágenes para usarlas en un anuncio de Meta"}</span>
                        <div className="ml-auto flex gap-2">
                          <Button size="sm" variant="outline" disabled={!marcadas.size || creandoBorrador} onClick={crearBorradorMeta}>{creandoBorrador ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Facebook className="mr-1 h-3 w-3" />}Crear borrador en Meta</Button>
                          <Button size="sm" variant="ghost" onClick={() => void cargarEstado(seleccion)}><RefreshCw className="h-3 w-3" /></Button>
                        </div>
                      </div>
                    )}
                    {(["cuadrado", "vertical", "historia"] as const).map((f) => porFormato[f]?.length ? (
                      <div key={f}>
                        <h3 className="mb-2 text-sm font-semibold">{FORMATOS[f].etiqueta} · {FORMATOS[f].uso} <span className="font-normal text-muted-foreground">({FORMATOS[f].ancho}×{FORMATOS[f].alto})</span></h3>
                        <div className={`grid gap-3 ${f === "historia" ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4" : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4"}`}>
                          {porFormato[f]!.map((img) => (
                            <div key={img.id} className={`group relative overflow-hidden rounded-xl border bg-card ${marcadas.has(img.id) ? "ring-2 ring-indigo-500" : ""}`}>
                              <button className="block w-full" onClick={() => setMarcadas((m) => { const n = new Set(m); n.has(img.id) ? n.delete(img.id) : n.add(img.id); return n; })}>
                                <img src={img.url} alt={img.plantilla} className="w-full bg-muted object-contain" style={{ aspectRatio: `${img.ancho}/${img.alto}` }} loading="lazy" />
                              </button>
                              <div className="flex items-center justify-between gap-1 px-2 py-1.5 text-xs">
                                <span className="truncate font-medium" title={img.plantilla}>{nombreDePlantilla(img.plantilla)}{img.tema && img.tema !== "ninguno" ? ` · ${catalogo?.temas.find((t) => t.id === img.tema)?.nombre || img.tema}` : ""}{img.editada ? " · editada" : ""}</span>
                                <div className="flex shrink-0 gap-0.5">
                                  <Button size="icon" variant="ghost" className="h-7 w-7" title="Editar" onClick={() => { const d = e.disenos[img.id]; if (!d) { toast.message("Esta pieza no tiene diseño editable"); return; } setEditando({ id: img.id, diseno: d, titulo: `${nombreDePlantilla(img.plantilla)} ${FORMATOS[img.formato].etiqueta}` }); }}><Pencil className="h-3.5 w-3.5" /></Button>
                                  <Button size="icon" variant="ghost" className="h-7 w-7" title="Descargar" onClick={() => descargar(img.url, `${producto.nombre.replace(/[^\w\dáéíóúñ -]/gi, "").slice(0, 40)}-${img.id}.jpg`)}><Download className="h-3.5 w-3.5" /></Button>
                                  <Button size="icon" variant="ghost" className="h-7 w-7" title="Borrar" onClick={() => borrarImagen(img.id)}><Trash2 className="h-3.5 w-3.5 text-red-500" /></Button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null)}
                  </TabsContent>

                  <TabsContent value="video">
                    <div className="grid gap-4 md:grid-cols-[280px_1fr]">
                      <div className="mx-auto w-full max-w-[280px]">
                        <div className="relative aspect-[9/16] overflow-hidden rounded-2xl bg-slate-900 ring-1 ring-border">
                          {e.video?.estado === "listo" && e.video.url ? (
                            <video key={e.video.url} src={e.video.url} controls playsInline className="h-full w-full object-contain" />
                          ) : (
                            <div className="flex h-full flex-col items-center justify-center p-4 text-center text-sm text-slate-300">
                              {tv && ["pendiente", "en_curso"].includes(tv.estado) || e.video?.estado === "en_curso" || e.video?.estado === "pendiente" ? (
                                <><Loader2 className="mb-2 h-6 w-6 animate-spin" />{tv?.estado === "pendiente" ? `En cola (posición ${tv.posicion ?? 1})` : tv?.detalle || "Armando el vídeo…"}<Progress className="mt-3 h-1.5 w-full" value={tv?.progreso ?? 0} /></>
                              ) : e.video?.estado === "fallo" ? (
                                <><AlertTriangle className="mb-2 h-6 w-6 text-amber-400" />El vídeo falló: {e.video.error}</>
                              ) : (
                                <><Clapperboard className="mb-2 h-6 w-6" />Aún no hay vídeo</>
                              )}
                            </div>
                          )}
                        </div>
                        {e.video?.estado === "listo" && <p className="mt-2 text-center text-xs text-muted-foreground">{e.video.duracion}s · {e.video.escenas} escenas{e.video.conVoz ? " · con voz" : " · sin voz"}{e.video.conMusica ? " · música" : ""} · {Math.round((e.video.tamano || 0) / 1024 / 1024 * 10) / 10} MB</p>}
                      </div>
                      <div className="space-y-3">
                        <div className="rounded-2xl border bg-card p-4">
                          <h3 className="font-semibold">Guion por escenas</h3>
                          <p className="mt-1 text-sm text-muted-foreground">{e.escenas?.length ? `${e.escenas.length} escenas: ${e.escenas.map((s) => s.diseno.gancho || "").filter(Boolean).slice(0, 4).join(" → ")}${(e.escenas.length > 4) ? " → …" : ""}` : "Las escenas se arman al generar el paquete."}</p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <Button className="bg-indigo-600 hover:bg-indigo-500" disabled={!e.escenas?.length || !salud?.ffmpeg} onClick={() => setEditorVideo(true)}><Pencil className="mr-1 h-4 w-4" />Editar escenas y generar</Button>
                            <Button variant="outline" disabled={!e.escenas?.length || !salud?.ffmpeg || !!(tv && ["pendiente", "en_curso"].includes(tv.estado))} onClick={async () => { try { await apiEstudio(`/${seleccion}/video`, { method: "POST", body: JSON.stringify({}) }); toast.success("Vídeo en cola"); await cargarEstado(seleccion); } catch (er: any) { toast.error(er?.message); } }}><RefreshCw className="mr-1 h-4 w-4" />Volver a armar</Button>
                            {e.video?.estado === "listo" && e.video.url && <Button variant="outline" onClick={() => descargar(e.video!.url!, `${producto.nombre.replace(/[^\w\dáéíóúñ -]/gi, "").slice(0, 40)}-reel.mp4`)}><Download className="mr-1 h-4 w-4" />Descargar MP4</Button>}
                          </div>
                          {!salud?.ffmpeg && <p className="mt-2 text-xs text-amber-600">El servidor no tiene ffmpeg: las imágenes salen, el vídeo no.</p>}
                        </div>
                        <div className="rounded-2xl border bg-card p-4 text-sm text-muted-foreground">
                          <p><strong className="text-foreground">Cómo se arma:</strong> cada escena es un fotograma 9:16 con la foto real del producto —recortada sin fondo cuando se puede— que flota o late dentro del cuadro, con cámara (zoom, paneo, giro 3D), partículas del tema (nieve, confeti, chispas…), transición y voz en off (Salomé o Gonzalo, es-CO). Si pones pistas en <code>data/musica</code> se mezcla música de fondo. Dura lo que sumen las escenas (la voz alarga la escena si hace falta). Los vídeos de la pestaña IA sirven de fondo de escena.</p>
                        </div>
                      </div>
                    </div>
                  </TabsContent>
                </Tabs>
              )}
            </div>
          )}
        </section>
      </div>

      {editando && seleccion && (
        <Suspense fallback={<CargandoEditor />}>
          <EditorImagen titulo={editando.titulo} diseno={editando.diseno} fotos={fotos} recortes={e?.contenido?.recortes} productId={seleccion} guardando={guardando} onGuardar={guardarDiseno} onCerrar={() => setEditando(null)} />
        </Suspense>
      )}
      {editorVideo && seleccion && !!e?.escenas?.length && (
        <Suspense fallback={<CargandoEditor />}>
          <EditorVideo productId={seleccion} escenas={e.escenas} fotos={fotos} recortes={e.contenido?.recortes} creacionesIA={e.ia} onCerrar={() => setEditorVideo(false)} onVideoPedido={() => void cargarEstado(seleccion)} />
        </Suspense>
      )}
    </Layout>
  );
}

/** Catálogo de plantillas (maqueta × estilo × tema + las propias): vista previa con el producto real y «Usar» en el formato elegido. */
function GaleriaDePlantillas({ productId, catalogo, opciones, onPiezaCreada, onRecargarCatalogo }: { productId: number; catalogo: CatalogoEstudio | null; opciones: { estilo: string; tema: string; guion: string }; onPiezaCreada: () => Promise<void>; onRecargarCatalogo: () => Promise<void> }) {
  const [q, setQ] = useState("");
  const [tema, setTema] = useState("");
  const [categoria, setCategoria] = useState("");
  const [formato, setFormato] = useState<Formato>("vertical");
  const [pagina, setPagina] = useState(1);
  const [res, setRes] = useState<{ total: number; items: PlantillaCatalogo[] } | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [usando, setUsando] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(async () => {
      setBuscando(true);
      try {
        const qs = new URLSearchParams({ q, tema: tema || opciones.tema === "ninguno" ? tema : opciones.tema, categoria, pagina: String(pagina), porPagina: "24", formato, producto: String(productId) });
        if (!tema && opciones.tema !== "ninguno" && !q) qs.set("tema", opciones.tema);
        setRes(await apiEstudio(`/plantillas/buscar?${qs}`));
      } catch (e: any) { toast.error(e?.message || "No se pudo buscar"); }
      setBuscando(false);
    }, 250);
    return () => clearTimeout(t);
  }, [q, tema, categoria, pagina, formato, productId, opciones.tema]);

  const usar = async (id: string, f: Formato = formato) => {
    setUsando(id + f);
    try {
      await apiEstudio(`/${productId}/pieza`, { method: "POST", body: JSON.stringify({ plantilla: id, formato: f, estilo: opciones.estilo, tema: opciones.tema }) });
      toast.success(`Pieza creada en ${FORMATOS[f].etiqueta}: la encuentras en la pestaña Imágenes`);
      await onPiezaCreada();
    } catch (e: any) { toast.error(e?.message || "No se pudo crear la pieza"); }
    setUsando(null);
  };
  const borrarPersonal = async (id: string) => {
    if (!confirm("¿Borrar esta plantilla propia?")) return;
    try { await apiEstudio(`/plantillas/personales/${encodeURIComponent(id.replace(/^personal:/, ""))}`, { method: "DELETE" }); await onRecargarCatalogo(); } catch (e: any) { toast.error(e?.message); }
  };

  const total = res?.total ?? 0, paginas = Math.max(1, Math.ceil(total / 24));
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border bg-card p-3">
        <div className="grid gap-2 md:grid-cols-[1fr_180px_160px_auto]">
          <div className="relative"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="pl-8" placeholder="navidad oferta, minimal elegante, mascotas, black friday…" value={q} onChange={(ev) => { setQ(ev.target.value); setPagina(1); }} /></div>
          <select className="h-10 rounded-md border bg-background px-2 text-sm" value={tema} onChange={(ev) => { setTema(ev.target.value); setPagina(1); }}><option value="">Tema: el elegido arriba</option>{catalogo?.temas.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}</select>
          <select className="h-10 rounded-md border bg-background px-2 text-sm" value={categoria} onChange={(ev) => { setCategoria(ev.target.value); setPagina(1); }}><option value="">Todas las categorías</option><option value="producto">Producto</option><option value="oferta">Oferta / precio</option><option value="beneficios">Beneficios</option><option value="gancho">Gancho</option></select>
          <div className="flex rounded-md border">{(["cuadrado", "vertical", "historia"] as Formato[]).map((f) => <button key={f} className={`px-3 text-xs ${formato === f ? "bg-indigo-600 text-white" : ""}`} onClick={() => setFormato(f)}>{FORMATOS[f].etiqueta}</button>)}</div>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">{catalogo ? `${catalogo.total.toLocaleString("es-CO")} plantillas (11 maquetas × ${catalogo.estilos.length} estilos × ${catalogo.temas.length} temas) + ${catalogo.personales.length} propias. ` : ""}La vista previa ya usa las fotos y textos de este producto. «Usar» crea la pieza al instante; luego la editas o la guardas como plantilla propia desde el editor. Atlas usa este mismo catálogo.</p>
      </div>

      {!!catalogo?.personales.length && (
        <div>
          <h3 className="mb-2 text-sm font-semibold">Mis plantillas</h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {catalogo.personales.map((p) => (
              <div key={p.id} className="overflow-hidden rounded-xl border bg-card">
                <img src={`/api/estudio-anuncios/plantillas/${encodeURIComponent(p.id)}/vista-previa.jpg?formato=${p.formato}&producto=${productId}`} alt={p.nombre} className="w-full bg-muted object-contain" style={{ aspectRatio: `${FORMATOS[p.formato]?.ancho || 1080}/${FORMATOS[p.formato]?.alto || 1350}` }} loading="lazy" />
                <div className="flex items-center justify-between gap-1 px-2 py-1.5 text-xs">
                  <span className="truncate font-medium" title={p.nombre}>{p.nombre}</span>
                  <div className="flex shrink-0 gap-0.5">
                    <Button size="sm" variant="outline" className="h-7 px-2" disabled={!!usando} onClick={() => usar(p.id, p.formato)}>{usando === p.id + p.formato ? <Loader2 className="h-3 w-3 animate-spin" /> : "Usar"}</Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => borrarPersonal(p.id)}><Trash2 className="h-3.5 w-3.5 text-red-500" /></Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <div className="mb-2 flex items-center justify-between text-sm"><h3 className="font-semibold">Catálogo {buscando && <Loader2 className="ml-1 inline h-3 w-3 animate-spin" />}</h3><span className="text-xs text-muted-foreground">{total.toLocaleString("es-CO")} resultados · página {pagina} de {paginas}</span></div>
        {res && !res.items.length && !buscando && <div className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">Nada con esa búsqueda. Prueba con un tema (navidad, amor, madre, halloween, black friday) o una maqueta (oferta, beneficios, collage).</div>}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {res?.items.map((p) => (
            <div key={p.id} className="group overflow-hidden rounded-xl border bg-card">
              <img src={p.vistaPrevia} alt={p.nombre} className="w-full bg-muted object-contain" style={{ aspectRatio: `${FORMATOS[formato].ancho}/${FORMATOS[formato].alto}` }} loading="lazy" />
              <div className="px-2 py-1.5 text-xs">
                <div className="truncate font-medium" title={p.id}>{p.nombre}</div>
                <div className="mt-1 flex items-center justify-between gap-1">
                  <span className="truncate text-[10px] text-muted-foreground">{p.categoria}</span>
                  <Button size="sm" variant="outline" className="h-7 px-2" disabled={!!usando} onClick={() => usar(p.id)}>{usando === p.id + formato ? <Loader2 className="h-3 w-3 animate-spin" /> : `Usar ${FORMATOS[formato].etiqueta}`}</Button>
                </div>
              </div>
            </div>
          ))}
        </div>
        {paginas > 1 && (
          <div className="mt-3 flex items-center justify-center gap-2 text-sm">
            <Button size="sm" variant="outline" disabled={pagina <= 1} onClick={() => setPagina((p) => p - 1)}>Anterior</Button>
            <span className="text-xs text-muted-foreground">{pagina} / {paginas}</span>
            <Button size="sm" variant="outline" disabled={pagina >= paginas} onClick={() => setPagina((p) => p + 1)}>Siguiente</Button>
          </div>
        )}
      </div>
    </div>
  );
}

function etiqueta(estado: string): string {
  return estado === "pendiente" ? "en cola" : estado === "en_curso" ? "generando" : estado === "listo" ? "listo" : estado === "fallo" ? "falló" : estado;
}
