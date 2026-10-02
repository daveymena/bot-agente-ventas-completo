import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, ImagePlus, Copy, Eye, EyeOff, Trash2, Rocket, ExternalLink, Plus, Images } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Layout } from "@/components/layout";

/**
 * Landing de imágenes: 11 paneles verticales estilo dropshipping.
 * Atlas arma el plan; cada panel se ve con la foto real del producto o con la
 * imagen que el dueño genera (gratis, con el prompt que damos) y sube.
 */

const api = async (endpoint: string, options: RequestInit = {}) => {
  const r = await fetch(`/api${endpoint}`, { ...options, headers: { "Content-Type": "application/json", ...(options.headers || {}) }, credentials: "include" });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || j.message || `Error ${r.status}`);
  return j;
};

interface Oferta { nombre: string; cantidad: number; precio: number }
interface Panel {
  id: string; clave: string; titulo: string; subtitulo?: string; bullets?: string[]; pares?: Array<{ a: string; b: string }>;
  conceptoVisual?: string; imagen?: string | null; foto?: string | null; oculto?: boolean; prompt: string;
}
interface Landing {
  id: number; nombre: string; slug: string; estado: string; publishedUrl: string | null;
  producto: { id: number; nombre: string; precio: number } | null;
  paleta: string[]; ofertas: Oferta[]; sellos: string[]; fotos: string[]; paneles: Panel[]; autorDelPlan: string | null;
}

const NOMBRES: Record<string, string> = {
  portada: "1 · Portada", dolor: "2 · El problema", solucion: "3 · La solución", beneficios: "4 · Beneficios",
  comparativa: "5 · Comparativa", "modo-de-uso": "6 · Modo de uso", "para-quien": "7 · Para quién es", ofertas: "8 · Ofertas",
  confianza: "9 · Compra segura", preguntas: "10 · Preguntas", cierre: "11 · Cierre",
};
const ANGULOS = ["Dolor / solución", "Transformación (antes y después)", "Comparativa contra lo tradicional", "Comodidad / ahorro de tiempo", "Regalo ideal"];
const cop = (n: number) => `$${Math.round(Number(n) || 0).toLocaleString("es-CO")}`;
const leerArchivo = (f: File) => new Promise<string>((ok, mal) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = mal; r.readAsDataURL(f); });

function EditorOfertas({ ofertas, onChange }: { ofertas: Oferta[]; onChange: (o: Oferta[]) => void }) {
  return (
    <div className="space-y-2">
      {ofertas.map((o, i) => (
        <div key={i} className="grid grid-cols-[1fr_70px_110px_auto] gap-2 items-center">
          <Input value={o.nombre} placeholder="Ej: 2 unidades" onChange={(e) => onChange(ofertas.map((x, j) => (j === i ? { ...x, nombre: e.target.value } : x)))} />
          <Input type="number" min={1} max={10} value={o.cantidad} title="Unidades" onChange={(e) => onChange(ofertas.map((x, j) => (j === i ? { ...x, cantidad: Number(e.target.value) || 1 } : x)))} />
          <Input type="number" min={0} value={o.precio || ""} placeholder="Precio" onChange={(e) => onChange(ofertas.map((x, j) => (j === i ? { ...x, precio: Number(e.target.value) || 0 } : x)))} />
          <Button variant="ghost" size="icon" onClick={() => onChange(ofertas.filter((_, j) => j !== i))} aria-label="Quitar oferta"><Trash2 className="h-4 w-4" /></Button>
        </div>
      ))}
      {ofertas.length < 4 ? <Button variant="outline" size="sm" onClick={() => onChange([...ofertas, { nombre: `${ofertas.length + 1} unidades`, cantidad: ofertas.length + 1, precio: 0 }])}><Plus className="h-4 w-4 mr-1" />Agregar oferta</Button> : null}
      <p className="text-xs text-muted-foreground">El pedido cobra exactamente estos precios.</p>
    </div>
  );
}

function TarjetaPanel({ landing, panel, onLanding }: { landing: Landing; panel: Panel; onLanding: (l: Landing) => void }) {
  const { toast } = useToast();
  const [titulo, setTitulo] = useState(panel.titulo);
  const [subtitulo, setSubtitulo] = useState(panel.subtitulo || "");
  const [lineas, setLineas] = useState((panel.bullets || []).join("\n"));
  const [pares, setPares] = useState((panel.pares || []).map((p) => `${p.a} | ${p.b}`).join("\n"));
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [verPrompt, setVerPrompt] = useState(false);
  const usaPares = panel.clave === "comparativa" || panel.clave === "preguntas";
  const vista = panel.imagen || panel.foto || landing.fotos[0] || "";

  const accion = async (nombre: string, fn: () => Promise<any>) => {
    setOcupado(nombre);
    try { const r = await fn(); if (r?.landing) onLanding(r.landing); }
    catch (e: any) { toast({ title: "No se pudo", description: e.message, variant: "destructive" }); }
    finally { setOcupado(null); }
  };
  const ruta = `/landing-imagenes/${landing.id}/panel/${panel.clave}`;
  const guardar = () => accion("guardar", () => api(ruta, { method: "PUT", body: JSON.stringify({
    titulo, subtitulo,
    bullets: usaPares ? undefined : lineas.split("\n").map((x) => x.trim()).filter(Boolean),
    pares: usaPares ? pares.split("\n").map((l) => { const [a, ...b] = l.split("|"); return { a: (a || "").trim(), b: b.join("|").trim() }; }).filter((x) => x.a) : undefined,
  }) }).then((r) => { toast({ title: "Panel guardado" }); return r; }));
  const subir = (f?: File | null) => f && accion("subir", async () => {
    if (f.size > 6 * 1024 * 1024) throw new Error("La imagen pesa más de 6 MB.");
    return api(`${ruta}/imagen`, { method: "POST", body: JSON.stringify({ file: await leerArchivo(f) }) });
  });

  return (
    <Card className={panel.oculto ? "opacity-60" : ""}>
      <CardContent className="p-3 sm:p-4 grid gap-4 md:grid-cols-[150px_1fr]">
        <div className="space-y-2">
          <div className="aspect-[9/16] rounded-lg bg-muted overflow-hidden border">
            {vista ? <img src={vista} alt={panel.titulo} className="w-full h-full object-cover" /> : <div className="h-full grid place-items-center text-xs text-muted-foreground p-2 text-center">Sin foto</div>}
          </div>
          <p className="text-[11px] text-center text-muted-foreground">{panel.imagen ? "Tu imagen subida" : "Compuesto con la foto real"}</p>
        </div>
        <div className="space-y-3 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <strong className="text-sm">{NOMBRES[panel.clave] || panel.clave}</strong>
            <Button variant="ghost" size="sm" onClick={() => accion("ocultar", () => api(ruta, { method: "PUT", body: JSON.stringify({ oculto: !panel.oculto }) }))}>
              {panel.oculto ? <><Eye className="h-4 w-4 mr-1" />Mostrar</> : <><EyeOff className="h-4 w-4 mr-1" />Ocultar</>}
            </Button>
          </div>
          <div className="grid gap-2">
            <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Titular" aria-label="Titular" />
            <Input value={subtitulo} onChange={(e) => setSubtitulo(e.target.value)} placeholder="Subtítulo" aria-label="Subtítulo" />
            {usaPares
              ? <Textarea rows={4} value={pares} onChange={(e) => setPares(e.target.value)} placeholder={panel.clave === "comparativa" ? "Con este producto | Con lo tradicional (una por línea)" : "Pregunta | Respuesta (una por línea)"} />
              : panel.clave !== "ofertas" ? <Textarea rows={4} value={lineas} onChange={(e) => setLineas(e.target.value)} placeholder="Una viñeta por línea" /> : null}
          </div>
          {!panel.imagen && landing.fotos.length > 1 ? (
            <div className="flex gap-2 overflow-x-auto pb-1" aria-label="Foto del panel">
              {landing.fotos.slice(0, 8).map((f) => (
                <button key={f} type="button" onClick={() => accion("foto", () => api(ruta, { method: "PUT", body: JSON.stringify({ foto: f }) }))} className={`h-14 w-14 shrink-0 rounded-md overflow-hidden border-2 ${panel.foto === f ? "border-primary" : "border-transparent"}`}>
                  <img src={f} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={guardar} disabled={!!ocupado}>{ocupado === "guardar" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Guardar"}</Button>
            <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(panel.prompt); toast({ title: "Prompt copiado", description: "Pegalo en Gemini junto con la foto del producto." }); }}><Copy className="h-4 w-4 mr-1" />Copiar prompt</Button>
            <label className="inline-flex">
              <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => subir(e.target.files?.[0])} />
              <span className="inline-flex items-center rounded-md border px-3 h-9 text-sm cursor-pointer hover:bg-muted">{ocupado === "subir" ? <Loader2 className="h-4 w-4 animate-spin" /> : <><ImagePlus className="h-4 w-4 mr-1" />{panel.imagen ? "Cambiar imagen" : "Subir imagen"}</>}</span>
            </label>
            {panel.imagen ? <Button size="sm" variant="ghost" onClick={() => accion("quitar", () => api(`${ruta}/imagen`, { method: "DELETE" }))}><Trash2 className="h-4 w-4 mr-1" />Quitar imagen</Button> : null}
            <Button size="sm" variant="ghost" onClick={() => setVerPrompt((v) => !v)}>{verPrompt ? "Ocultar prompt" : "Ver prompt"}</Button>
          </div>
          {verPrompt ? <pre className="text-xs whitespace-pre-wrap bg-muted rounded-md p-3 max-h-60 overflow-auto">{panel.prompt}</pre> : null}
        </div>
      </CardContent>
    </Card>
  );
}

export default function LandingImagenesPage() {
  const { toast } = useToast();
  const [productos, setProductos] = useState<Array<{ id: number; name: string; price: number }>>([]);
  const [existentes, setExistentes] = useState<Array<{ id: number; nombre: string; estado: string }>>([]);
  const [productId, setProductId] = useState<number | "">("");
  const [ofertas, setOfertas] = useState<Oferta[]>([]);
  const [angulo, setAngulo] = useState(ANGULOS[0]);
  const [publico, setPublico] = useState("");
  const [pruebaSocial, setPruebaSocial] = useState("");
  const [creando, setCreando] = useState(false);
  const [landing, setLanding] = useState<Landing | null>(null);
  const [cargando, setCargando] = useState(false);
  const [publicando, setPublicando] = useState(false);

  const abrir = useCallback(async (id: number) => {
    setCargando(true);
    try { const r = await api(`/landing-imagenes/${id}`); setLanding(r.landing); window.history.replaceState(null, "", `/landing-imagenes?id=${id}`); }
    catch (e: any) { toast({ title: "No se pudo abrir", description: e.message, variant: "destructive" }); }
    finally { setCargando(false); }
  }, [toast]);

  useEffect(() => {
    api("/products").then((r) => setProductos((Array.isArray(r) ? r : r.products || []).map((p: any) => ({ id: p.id, name: p.name, price: Number(p.price) || 0 })))).catch(() => {});
    api("/landing-imagenes").then((r) => setExistentes(r.landings || [])).catch(() => {});
    const id = Number(new URLSearchParams(window.location.search).get("id"));
    if (id) void abrir(id);
  }, [abrir]);

  useEffect(() => {
    const p = productos.find((x) => x.id === productId);
    if (p) setOfertas([{ nombre: "1 unidad", cantidad: 1, precio: p.price }]);
  }, [productId, productos]);

  const crear = async () => {
    if (!productId) return;
    setCreando(true);
    try {
      const r = await api("/landing-imagenes/plan", { method: "POST", body: JSON.stringify({ productId, ofertas, angulo, publico, pruebaSocial: pruebaSocial || null }) });
      setLanding(r.landing);
      window.history.replaceState(null, "", `/landing-imagenes?id=${r.landing.id}`);
      toast({ title: "Plan listo", description: "Revisá cada panel. Podés subir tu imagen o dejar la foto real." });
    } catch (e: any) { toast({ title: "No se pudo crear", description: e.message, variant: "destructive" }); }
    finally { setCreando(false); }
  };

  const publicar = async () => {
    if (!landing) return;
    setPublicando(true);
    try {
      const r = await api(`/landing-pages/${landing.id}/publish`, { method: "POST", body: JSON.stringify({ publicada: true }) });
      setLanding({ ...landing, estado: r.status, publishedUrl: r.url });
      toast({ title: "Publicada", description: r.url });
    } catch (e: any) { toast({ title: "No se pudo publicar", description: e.message, variant: "destructive" }); }
    finally { setPublicando(false); }
  };

  return (
    <Layout>
      <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Images className="h-6 w-6" />Landing de imágenes</h1>
          <p className="text-sm text-muted-foreground mt-1">11 paneles verticales para celular. Cada panel usa la foto real del producto, o tu propia imagen: copiá el prompt, generala gratis en Gemini (adjuntando la foto del producto) y subila acá.</p>
        </div>

        {cargando ? <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Abriendo…</div> : null}

        {!landing && !cargando ? (
          <>
            <Card>
              <CardHeader><CardTitle className="text-base">Nueva landing</CardTitle><CardDescription>Tres preguntas, igual que un director creativo.</CardDescription></CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1">
                  <Label>Producto</Label>
                  <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={productId} onChange={(e) => setProductId(Number(e.target.value) || "")}>
                    <option value="">Elegí un producto…</option>
                    {productos.map((p) => <option key={p.id} value={p.id}>{p.name} · {cop(p.price)}</option>)}
                  </select>
                </div>
                {productId ? (
                  <>
                    <div className="space-y-1"><Label>1. Tus ofertas (con precio real)</Label><EditorOfertas ofertas={ofertas} onChange={setOfertas} /></div>
                    <div className="space-y-1">
                      <Label>2. Ángulo de venta</Label>
                      <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={angulo} onChange={(e) => setAngulo(e.target.value)}>{ANGULOS.map((a) => <option key={a}>{a}</option>)}</select>
                    </div>
                    <div className="space-y-1"><Label>3. ¿A quién le vendés?</Label><Input value={publico} onChange={(e) => setPublico(e.target.value)} placeholder="Ej: personas que trabajan sentadas y sufren dolor de espalda" /></div>
                    <div className="space-y-1">
                      <Label>Reseñas reales (opcional)</Label>
                      <Input value={pruebaSocial} onChange={(e) => setPruebaSocial(e.target.value)} placeholder="Solo si son verificables. Ej: 4,8 en 120 reseñas de MercadoLibre" />
                      <p className="text-xs text-muted-foreground">Si lo dejás vacío no se muestran calificaciones ni cantidad de clientes: inventarlas es publicidad engañosa y Meta rechaza esos anuncios.</p>
                    </div>
                    <Button onClick={crear} disabled={creando || !ofertas.some((o) => o.precio > 0)}>{creando ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Armando el plan (30-60 s)…</> : "Crear plan de 11 paneles"}</Button>
                  </>
                ) : null}
              </CardContent>
            </Card>
            {existentes.length ? (
              <Card>
                <CardHeader><CardTitle className="text-base">Tus landings de imágenes</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {existentes.map((l) => <Button key={l.id} variant="outline" className="w-full justify-between" onClick={() => abrir(l.id)}><span className="truncate">{l.nombre}</span><span className="text-xs text-muted-foreground">{l.estado === "published" ? "Publicada" : "Borrador"}</span></Button>)}
                </CardContent>
              </Card>
            ) : null}
          </>
        ) : null}

        {landing ? (
          <>
            <Card>
              <CardContent className="p-4 flex flex-wrap items-center gap-3 justify-between">
                <div className="min-w-0">
                  <div className="font-semibold truncate">{landing.nombre}</div>
                  <div className="text-xs text-muted-foreground">{landing.estado === "published" ? "Publicada" : "Borrador"}{landing.autorDelPlan ? ` · plan por ${landing.autorDelPlan}` : ""}</div>
                  {landing.publishedUrl ? <a href={landing.publishedUrl} target="_blank" rel="noreferrer" className="text-xs text-primary inline-flex items-center gap-1 mt-1">{landing.publishedUrl}<ExternalLink className="h-3 w-3" /></a> : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={() => window.open(`/api/landing-pages/${landing.id}/render`, "_blank")}><Eye className="h-4 w-4 mr-1" />Vista previa</Button>
                  <Button onClick={publicar} disabled={publicando}>{publicando ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Rocket className="h-4 w-4 mr-1" />{landing.estado === "published" ? "Actualizar" : "Publicar"}</>}</Button>
                  <Button variant="ghost" onClick={() => { setLanding(null); window.history.replaceState(null, "", "/landing-imagenes"); }}>Otra landing</Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Ofertas</CardTitle><CardDescription>{landing.sellos.length ? `Sellos de tus condiciones: ${landing.sellos.join(" · ")}` : "Sin condiciones de envío cargadas: no se muestran sellos de envío ni de pago."}</CardDescription></CardHeader>
              <CardContent>
                <EditorOfertas ofertas={landing.ofertas} onChange={(o) => setLanding({ ...landing, ofertas: o })} />
                <Button size="sm" className="mt-3" onClick={async () => {
                  try { const r = await api(`/landing-imagenes/${landing.id}/ofertas`, { method: "PUT", body: JSON.stringify({ ofertas: landing.ofertas }) }); setLanding(r.landing); toast({ title: "Ofertas guardadas" }); }
                  catch (e: any) { toast({ title: "No se pudo", description: e.message, variant: "destructive" }); }
                }}>Guardar ofertas</Button>
              </CardContent>
            </Card>

            <details className="rounded-lg border p-4 text-sm">
              <summary className="font-medium cursor-pointer">¿Cómo genero las imágenes gratis?</summary>
              <ol className="list-decimal ml-5 mt-2 space-y-1 text-muted-foreground">
                <li>Abrí <a className="text-primary" href="https://gemini.google.com" target="_blank" rel="noreferrer">gemini.google.com</a> con tu cuenta de Google.</li>
                <li>Adjuntá una foto real del producto (la de Dropi sirve).</li>
                <li>En el panel, tocá <b>Copiar prompt</b> y pegalo en Gemini.</li>
                <li>Descargá la imagen y tocá <b>Subir imagen</b> en ese panel. Revisá que el texto haya salido bien escrito.</li>
              </ol>
            </details>

            <div className="space-y-4">
              {landing.paneles.map((p) => <TarjetaPanel key={`${p.clave}-${p.imagen || ""}-${p.foto || ""}-${p.oculto}`} landing={landing} panel={p} onLanding={setLanding} />)}
            </div>
          </>
        ) : null}
      </div>
    </Layout>
  );
}
