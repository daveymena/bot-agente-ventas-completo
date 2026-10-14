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
import { Clapperboard, Download, Facebook, Images, Loader2, Pencil, RefreshCw, Search, Sparkles, Trash2, Wand2, CheckCircle2, AlertTriangle, Video } from "lucide-react";
import { FORMATOS, PLANTILLAS, apiEstudio, type Diseno, type EstadoEstudio, type ImagenGenerada, type ProductoDelEstudio } from "@/lib/estudio/diseno";
// Los editores traen Fabric.js (~300 KB): se cargan solo al abrirlos.
const EditorImagen = lazy(() => import("@/components/estudio/editor-imagen").then((m) => ({ default: m.EditorImagen })));
const EditorVideo = lazy(() => import("@/components/estudio/editor-video").then((m) => ({ default: m.EditorVideo })));
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

  useEffect(() => { void cargarLista(); apiEstudio("/salud").then(setSalud).catch(() => setSalud(null)); }, [cargarLista, location]);
  useEffect(() => { if (seleccion) { setEstado(null); setMarcadas(new Set()); void cargarEstado(seleccion); } }, [seleccion, cargarEstado]);

  // Seguimiento mientras hay trabajos en cola/en curso.
  const activo = !!estado && ((estado.trabajos.paquete && ["pendiente", "en_curso"].includes(estado.trabajos.paquete.estado)) || (estado.trabajos.video && ["pendiente", "en_curso"].includes(estado.trabajos.video.estado)) || estado.estudio.paquete?.estado === "pendiente" || estado.estudio.paquete?.estado === "en_curso" || estado.estudio.video?.estado === "pendiente" || estado.estudio.video?.estado === "en_curso");
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
      await apiEstudio(`/${seleccion}/generar`, { method: "POST", body: JSON.stringify({ conIA, conVideo }) });
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
                  </TabsList>

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
                                <span className="truncate font-medium">{PLANTILLAS[img.plantilla] || img.plantilla}{img.editada ? " · editada" : ""}</span>
                                <div className="flex shrink-0 gap-0.5">
                                  <Button size="icon" variant="ghost" className="h-7 w-7" title="Editar" onClick={() => { const d = e.disenos[img.id]; if (!d) { toast.message("Esta pieza no tiene diseño editable"); return; } setEditando({ id: img.id, diseno: d, titulo: `${PLANTILLAS[img.plantilla] || img.plantilla} ${FORMATOS[img.formato].etiqueta}` }); }}><Pencil className="h-3.5 w-3.5" /></Button>
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
                          <p><strong className="text-foreground">Cómo se arma:</strong> cada escena es un fotograma 9:16 con la foto real del producto, con movimiento de cámara, transición y voz en off (Salomé o Gonzalo, es-CO). Si pones pistas en <code>data/musica</code> se mezcla música de fondo. Dura lo que sumen las escenas (la voz alarga la escena si hace falta).</p>
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
          <EditorImagen titulo={editando.titulo} diseno={editando.diseno} fotos={fotos} productId={seleccion} guardando={guardando} onGuardar={guardarDiseno} onCerrar={() => setEditando(null)} />
        </Suspense>
      )}
      {editorVideo && seleccion && !!e?.escenas?.length && (
        <Suspense fallback={<CargandoEditor />}>
          <EditorVideo productId={seleccion} escenas={e.escenas} fotos={fotos} onCerrar={() => setEditorVideo(false)} onVideoPedido={() => void cargarEstado(seleccion)} />
        </Suspense>
      )}
    </Layout>
  );
}

function etiqueta(estado: string): string {
  return estado === "pendiente" ? "en cola" : estado === "en_curso" ? "generando" : estado === "listo" ? "listo" : estado === "fallo" ? "falló" : estado;
}
