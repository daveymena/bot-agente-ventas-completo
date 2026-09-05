import { useCallback, useEffect, useRef, useState } from "react";
import { Layout } from "@/components/layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { Sparkles, Send, User, Loader2, Monitor, Smartphone, Download, RefreshCw, LayoutTemplate, Wand2 } from "lucide-react";
import ReactMarkdown from "react-markdown";

type Product = { id: number; name: string; description?: string; price?: string; currency?: string };
type Landing = { id: number; name: string; productId?: number | null; design?: any; sections?: any[]; strategy?: any };
type Msg = { role: "user" | "assistant"; content: string; loading?: boolean };
/**
 * Las familias visuales, tal como las conoce el renderer.
 *
 * ⚠️ Acá había SIETE nombres inventados --elegante, startup, corp, bold,
 * minimalista, dark_premium, warm-- y NINGUNO existía del lado del servidor.
 * `tokensDe()` no los reconocía y caía al respaldo, así que los siete botones
 * producían EXACTAMENTE la misma landing. El selector de estilo era
 * decoración: se podía apretar "Dark Premium" o "Bold" y salía la misma
 * página.
 *
 * Es un fallo que no se ve mirando la pantalla --los botones responden, el
 * color cambia, la vista previa se recarga-- y solo aparece comparando las dos
 * listas. Por eso `value` tiene que salir de `FamiliaVisual` en
 * lib/landing/design-system.ts y no de la imaginación: si alguien agrega una
 * familia allá, la agrega acá con el MISMO identificador o vuelve a pasar.
 *
 * `label` y `color` son los del propio design system (`nombre` y
 * `color.acento`), para que la pastilla se vea del color real de la familia.
 */
type Familia =
  | "premium" | "respuesta-directa" | "minimal" | "editorial" | "ecommerce" | "belleza"
  | "fitness" | "educacion" | "tecnologia" | "familiar" | "creativa" | "oscura";

const FAMILIAS: { value: Familia; label: string; color: string }[] = [
  { value: "premium", label: "Premium", color: "#8C7A5B" },
  { value: "respuesta-directa", label: "Respuesta directa", color: "#E5342A" },
  { value: "minimal", label: "Minimal", color: "#111111" },
  { value: "editorial", label: "Editorial", color: "#1F4E42" },
  { value: "ecommerce", label: "Ecommerce", color: "#1B6EF3" },
  { value: "belleza", label: "Belleza", color: "#C08573" },
  { value: "fitness", label: "Fitness", color: "#C8FF3D" },
  { value: "educacion", label: "Educación", color: "#2A5BD7" },
  { value: "tecnologia", label: "Tecnología", color: "#5B4BE8" },
  { value: "familiar", label: "Familiar", color: "#E8792B" },
  { value: "creativa", label: "Creativa", color: "#3B1FD9" },
  { value: "oscura", label: "Oscura", color: "#00D3A7" },
];

const SUGERENCIAS = ["Hero más impactante", "CTA urgente", "Más premium", "Agrega FAQ", "Más beneficios", "Prueba social"];

const SALUDO = `Soy tu **Constructor de Landing Pages** con IA.

Creo páginas de ventas profesionales con frameworks de alta conversión (AIDA, PAS, Antes-Después).

**Para empezar:**
1. Selecciona un **producto** arriba
2. Elige un **estilo visual**
3. Presiona **Generar** — o escríbeme qué quieres

*"Crea una landing impactante para mi curso de piano"*`;

async function apiFetch<T>(url: string, opts?: RequestInit): Promise<T> {
  const r = await fetch(url, { credentials: "include", headers: { "Content-Type": "application/json", ...(opts?.headers || {}) }, ...opts });
  if (!r.ok) throw new Error((await r.json().catch(() => null))?.message || `Error ${r.status}`);
  return r.status === 204 ? (undefined as T) : r.json();
}

export default function LandingStudioV2() {
  const [products, setProducts] = useState<Product[]>([]);
  const [landings, setLandings] = useState<Landing[]>([]);
  const [productId, setProductId] = useState<number | "">("");
  const [landingId, setLandingId] = useState<number | null>(null);
  // "ecommerce" es el mismo respaldo que usa tokensDe() en el servidor: así el
  // valor por defecto es explícito y coincide con lo que se renderiza.
  const [familia, setFamilia] = useState<Familia>("ecommerce");
  const [previewMode, setPreviewMode] = useState<"desktop" | "mobile">("desktop");
  /**
   * Qué panel se ve cuando la pantalla es chica.
   *
   * En pantalla chica se muestra UNO a la vez y a ancho completo, que es la
   * única forma de que ambos sean usables; en escritorio conviven como
   * siempre y este estado no hace nada.
   */
  const [panelMovil, setPanelMovil] = useState<"chat" | "preview">("chat");
  const [msgs, setMsgs] = useState<Msg[]>([{ role: "assistant", content: SALUDO }]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    Promise.all([apiFetch<Product[]>("/api/products"), apiFetch<Landing[]>("/api/landing-pages")])
      .then(([p, l]) => { setProducts(p); setLandings(l); })
      .catch(() => {});
  }, []);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const doc = iframe.contentDocument;
    if (!doc) return;
    if (previewHtml) {
      doc.open(); doc.write(previewHtml); doc.close();
    } else {
      doc.open();
      doc.write(`<!doctype html><html><body style="display:flex;align-items:center;justify-content:center;min-height:100vh;font-family:system-ui,sans-serif;color:#94a3b8;background:#0f172a;margin:0;flex-direction:column;gap:16px;text-align:center;padding:40px"><svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#818cf8" stroke-width="1.2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg><p style="font-size:15px;max-width:300px;line-height:1.6">Selecciona un producto y presiona <strong style="color:#a5b4fc">Generar</strong> para ver tu landing aquí</p></body></html>`);
      doc.close();
    }
  }, [previewHtml]);

  const cargarPreview = useCallback(async (id: number, fam?: Familia) => {
    setPreviewBusy(true);
    try {
      const r = await fetch(`/api/landing-pages/${id}/render?familia=${fam || familia}`, { credentials: "include" });
      if (!r.ok) throw new Error("Error al renderizar");
      setPreviewHtml(await r.text());
    } catch { toast.error("No se pudo cargar la preview"); }
    finally { setPreviewBusy(false); }
  }, [familia]);

  const generarLanding = useCallback(async (pid: number) => {
    const product = products.find(p => p.id === pid);
    setBusy(true);
    setMsgs(m => [...m, { role: "assistant", content: `Generando landing para **${product?.name}** con estilo *${familia}*...`, loading: true }]);
    try {
      const gen = await apiFetch<any>("/api/landing-pages/generate", {
        method: "POST",
        body: JSON.stringify({ productId: pid, language: "es", country: "CO", objective: "sales" }),
      });
      const saved = await apiFetch<Landing>("/api/landing-pages", {
        method: "POST",
        body: JSON.stringify({ name: gen.name, productId: pid, strategy: gen.strategy, sections: gen.sections, design: { ...gen.design, familia }, source: gen.source, status: "draft" }),
      });
      setLandingId(saved.id);
      setLandings(prev => [saved, ...prev.filter(l => l.id !== saved.id)]);
      const renderResp = await fetch(`/api/landing-pages/${saved.id}/render?familia=${familia}`, { credentials: "include" });
      if (renderResp.ok) setPreviewHtml(await renderResp.text());
      setPanelMovil("preview");
      setMsgs(m => [
        ...m.filter(x => !(x as any).loading),
        { role: "assistant", content: `**Landing generada y guardada**\n\n**Nombre:** ${gen.name}\n**Estilo:** ${familia}\n**Motor:** ${gen.generatedBy === "ai" ? "IA" : "Fallback determinístico"}\n\n**Secciones creadas:**\n${(gen.sections as any[]).map((s: any) => `- **${s.type}** — ${s.title}`).join("\n")}\n\nPuedes pedirme ajustes:\n> *"Haz el hero más agresivo"*\n> *"Cambia el CTA a urgencia"*\n> *"Agrega más beneficios"*` },
      ]);
      toast.success("¡Landing generada!");
    } catch (e: any) {
      setMsgs(m => [...m.filter(x => !(x as any).loading), { role: "assistant", content: `Error: ${e.message || "Error al generar."}` }]);
    } finally { setBusy(false); }
  }, [products, familia]);

  const aplicarComando = useCallback(async (instruccion: string) => {
    if (!landingId) {
      setMsgs(m => [...m, { role: "assistant", content: "Primero genera o carga una landing para editarla." }]);
      return;
    }
    setBusy(true);
    setMsgs(m => [...m, { role: "assistant", content: "Aplicando cambios con IA...", loading: true }]);
    try {
      const r = await apiFetch<any>(`/api/landing-pages/${landingId}/command`, {
        method: "POST",
        body: JSON.stringify({ instruction: instruccion }),
      });
      if (r.operations?.length) { await cargarPreview(landingId); setPanelMovil("preview"); }
      setMsgs(m => [
        ...m.filter(x => !(x as any).loading),
        { role: "assistant", content: `${r.message || "Cambio aplicado."}\n\nPreview actualizada. ¿Qué más ajustamos?` },
      ]);
    } catch (e: any) {
      setMsgs(m => [...m.filter(x => !(x as any).loading), { role: "assistant", content: `Error: ${e.message}` }]);
    } finally { setBusy(false); }
  }, [landingId, cargarPreview]);

  const enviar = useCallback(async () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setMsgs(m => [...m, { role: "user", content: text }]);
    const querGenerar = /genera|crea|construye|haz una landing|nueva landing/i.test(text);
    const pid = typeof productId === "number" ? productId : null;
    if (querGenerar && pid) await generarLanding(pid);
    else if (querGenerar && !pid) setMsgs(m => [...m, { role: "assistant", content: "Selecciona primero un **producto** en el selector de arriba." }]);
    else await aplicarComando(text);
    inputRef.current?.focus();
  }, [input, busy, productId, generarLanding, aplicarComando]);

  const exportar = useCallback(async () => {
    if (!landingId) { toast.info("Primero genera una landing."); return; }
    const r = await fetch(`/api/landing-pages/${landingId}/render?familia=${familia}`, { credentials: "include" });
    if (!r.ok) { toast.error("Error al exportar"); return; }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([await r.text()], { type: "text/html" }));
    a.download = `landing-${landingId}.html`; a.click();
    toast.success("HTML exportado");
  }, [landingId, familia]);

  const cargarLanding = useCallback(async (id: number) => {
    const l = landings.find(x => x.id === id);
    if (!l) return;
    setLandingId(id);
    if (l.productId) setProductId(l.productId);
    if ((l.design as any)?.familia) setFamilia((l.design as any).familia as Familia);
    await cargarPreview(id, (l.design as any)?.familia as Familia);
    setPanelMovil("preview");
    setMsgs(m => [...m, { role: "assistant", content: `Landing **"${l.name}"** cargada. ¿Qué quieres modificar?` }]);
  }, [landings, cargarPreview]);

  const selectCls = "h-9 rounded-lg border border-input bg-background px-2.5 text-xs font-medium text-foreground outline-none transition focus:ring-2 focus:ring-ring/40 focus:border-ring disabled:opacity-50";

  return (
    <Layout>
      <div className="flex h-[calc(100vh-4rem)] flex-col bg-background">
        {/* ── Toolbar ─────────────────────────────────────────── */}
        <header className="z-10 shrink-0 border-b border-border bg-card">
          <div className="flex flex-wrap items-center gap-2 px-3 py-2.5 sm:px-4">
            <div className="mr-1 flex items-center gap-2.5">
              <div className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary ring-1 ring-inset ring-primary/20">
                <LayoutTemplate className="h-5 w-5" />
              </div>
              <div className="leading-tight">
                <div className="flex items-center gap-1.5">
                  <h1 className="text-sm font-bold tracking-tight text-foreground">Landing Studio</h1>
                  <Badge variant="secondary" className="hidden h-4 gap-0.5 px-1.5 text-[10px] font-semibold sm:inline-flex"><Sparkles className="h-2.5 w-2.5" />IA</Badge>
                </div>
                <p className="hidden text-[11px] text-muted-foreground md:block">Páginas de venta con IA, conectadas a tus productos</p>
              </div>
            </div>

            {/* Controles principales */}
            <div className="flex flex-1 flex-wrap items-center gap-2">
              <select value={productId} onChange={e => setProductId(e.target.value ? Number(e.target.value) : "")}
                aria-label="Producto" className={`${selectCls} min-w-[140px] max-w-[220px] flex-1 sm:flex-none`}>
                <option value="">Producto…</option>
                {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <select value={landingId || ""} onChange={e => e.target.value && cargarLanding(Number(e.target.value))}
                aria-label="Landing existente" className={`${selectCls} min-w-[130px] max-w-[190px] flex-1 sm:flex-none`}>
                <option value="">Nueva landing…</option>
                {landings.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
              <Button size="sm" disabled={busy || !productId} onClick={() => productId && generarLanding(Number(productId))}
                className="h-9 shrink-0 gap-1.5 bg-primary px-3.5 text-xs font-semibold text-primary-foreground shadow-sm hover:bg-primary/90">
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
                Generar
              </Button>
            </div>

            {/* Acciones de preview */}
            <div className="ml-auto flex items-center gap-0.5 rounded-lg border border-border bg-muted/50 p-0.5">
              <Button size="sm" variant="ghost" onClick={() => landingId && cargarPreview(landingId)} disabled={!landingId || previewBusy} className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                title="Actualizar la vista previa" aria-label="Actualizar la vista previa">
                <RefreshCw className={`h-3.5 w-3.5 ${previewBusy ? "animate-spin" : ""}`} />
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setPreviewMode(m => m === "desktop" ? "mobile" : "desktop")} className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                title={previewMode === "desktop" ? "Ver como se ve en un celular" : "Ver como se ve en pantalla grande"}
                aria-label={previewMode === "desktop" ? "Ver como se ve en un celular" : "Ver como se ve en pantalla grande"}>
                {previewMode === "desktop" ? <Smartphone className="h-3.5 w-3.5" /> : <Monitor className="h-3.5 w-3.5" />}
              </Button>
              <Button size="sm" variant="ghost" onClick={exportar} disabled={!landingId} className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                title="Descargar la landing en HTML" aria-label="Descargar la landing en HTML">
                <Download className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </header>

        {/* ── Selector de panel (solo móvil) ──────────────────── */}
        <div className="flex shrink-0 gap-1 border-b border-border bg-muted/30 p-1 lg:hidden">
          {([["chat", "Editor", Sparkles], ["preview", "Vista previa", Monitor]] as const).map(([valor, etiqueta, Icon]) => (
            <button
              key={valor}
              onClick={() => setPanelMovil(valor)}
              aria-pressed={panelMovil === valor}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-md py-2 text-xs font-semibold transition-colors ${
                panelMovil === valor ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {etiqueta}
            </button>
          ))}
        </div>

        {/* ── Split principal ─────────────────────────────────── */}
        <div className="flex min-h-0 flex-1">
          {/* Panel izquierdo: estilo + chat + input */}
          <aside
            className={`min-h-0 w-full flex-col border-r border-border bg-card lg:flex lg:w-[360px] lg:min-w-[300px] xl:w-[400px] ${
              panelMovil === "chat" ? "flex" : "hidden"
            }`}
          >
            {/* Estilo visual */}
            <div className="shrink-0 border-b border-border px-3 py-2.5">
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Estilo visual</p>
              <div className="flex flex-wrap gap-1.5">
                {FAMILIAS.map(f => {
                  const activa = familia === f.value;
                  return (
                    <button key={f.value}
                      onClick={async () => { setFamilia(f.value); if (landingId) await cargarPreview(landingId, f.value); }}
                      aria-pressed={activa}
                      /* ⚠️ Antes la pastilla ACTIVA se rellenaba entera con el color de
                         la familia y TODAS mostraban su punto de color. Con doce
                         familias eso son doce colores compitiendo en una fila --
                         incluido un lima #C8FF3D y un rojo #E5342A-- y el resultado
                         es una barra que grita. El dueno lo dijo asi: "quedo igual de
                         feo, todo contrastado".

                         Va contra la direccion que el propio repo fijo en CLAUDE.md
                         ("Calm Sales OS: menos ruido, jerarquia fuerte"): el color
                         tiene que senalar UNA cosa --cual esta elegida-- no pintar
                         las doce.

                         Ahora la activa usa el fondo neutro del sistema y el color
                         aparece SOLO en su punto. Se lee de un vistazo cual esta
                         puesta, sin que la barra pelee con la vista previa que esta
                         al lado, que es lo que el admin de verdad tiene que mirar. */
                      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition-colors ${activa ? "border-foreground/15 bg-muted font-semibold text-foreground" : "border-transparent text-muted-foreground hover:bg-muted/60 hover:text-foreground"}`}>
                      <span
                        className={`h-1.5 w-1.5 rounded-full transition-opacity ${activa ? "opacity-100" : "opacity-0"}`}
                        style={{ backgroundColor: f.color }}
                      />
                      {f.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Conversación */}
            <ScrollArea className="min-h-0 flex-1 px-3 py-3">
              <div className="space-y-3">
                {msgs.map((msg, i) => (
                  <div key={i} className={`flex gap-2 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
                    <div className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full ${msg.role === "assistant" ? "bg-primary/10 text-primary" : "bg-accent/15 text-accent"}`}>
                      {msg.role === "assistant" ? <Sparkles className="h-3 w-3" /> : <User className="h-3 w-3" />}
                    </div>
                    <div className={`max-w-[86%] rounded-2xl px-3 py-2 text-xs leading-relaxed ${msg.role === "assistant" ? "rounded-tl-sm bg-muted text-foreground" : "rounded-tr-sm bg-primary text-primary-foreground"} ${(msg as any).loading ? "opacity-70" : ""}`}>
                      {msg.role === "assistant" ? (
                        <div className="prose-chat">
                          <ReactMarkdown components={{
                            p: ({ children }) => <p className="mb-1.5 last:mb-0">{children}</p>,
                            strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
                            ul: ({ children }) => <ul className="mt-1 list-disc space-y-0.5 pl-4">{children}</ul>,
                            li: ({ children }) => <li>{children}</li>,
                            blockquote: ({ children }) => <blockquote className="mt-1.5 border-l-2 border-primary/40 pl-2 italic opacity-80">{children}</blockquote>,
                          }}>{msg.content}</ReactMarkdown>
                        </div>
                      ) : msg.content}
                      {(msg as any).loading && <Loader2 className="ml-1 inline h-3 w-3 animate-spin" />}
                    </div>
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>
            </ScrollArea>

            {/* Entrada */}
            <div className="shrink-0 border-t border-border bg-muted/20 px-3 py-2.5">
              <div className="mb-2 flex flex-wrap gap-1.5">
                {SUGERENCIAS.map(s => (
                  <button key={s} onClick={() => { setInput(s); inputRef.current?.focus(); }}
                    className="rounded-full border border-border bg-background px-2.5 py-0.5 text-[10px] font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground">
                    {s}
                  </button>
                ))}
              </div>
              <div className="flex items-end gap-2">
                <Input ref={inputRef} value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), enviar())}
                  placeholder="Pide un cambio o genera una landing…"
                  className="h-9 rounded-lg text-xs" disabled={busy} />
                <Button size="sm" onClick={enviar} disabled={busy || !input.trim()}
                  className="h-9 w-9 shrink-0 p-0 bg-primary text-primary-foreground shadow-sm hover:bg-primary/90">
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                </Button>
              </div>
            </div>
          </aside>

          {/* Panel derecho: escenario de vista previa */}
          <main
            className={`min-h-0 min-w-0 flex-1 flex-col bg-muted/40 lg:flex ${
              panelMovil === "preview" ? "flex" : "hidden"
            }`}
          >
            {/* Barra tipo navegador */}
            <div className="flex shrink-0 items-center gap-2 border-b border-border bg-background px-3 py-2">
              <div className="flex gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/25" />
                <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/25" />
                <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/25" />
              </div>
              <div className="flex-1 truncate rounded-md bg-muted px-2.5 py-1 text-[10px] text-muted-foreground">
                {landingId ? `ventasproia.com/landing/${landingId}` : "vista previa — genera una landing para comenzar"}
              </div>
              <Badge variant="outline" className="hidden h-5 text-[10px] text-muted-foreground sm:flex">
                {FAMILIAS.find(f => f.value === familia)?.label}
              </Badge>
              <span className="hidden items-center gap-1 text-[10px] text-slate-500 md:flex">
                {previewMode === "desktop" ? <><Monitor className="h-3 w-3" />Escritorio</> : <><Smartphone className="h-3 w-3" />Móvil</>}
              </span>
            </div>

            {/* Escenario */}
            <div className={`relative min-h-0 flex-1 overflow-auto ${previewMode === "mobile" ? "flex items-start justify-center p-4 sm:p-8" : ""}`}>
              {previewBusy && (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/70 backdrop-blur-sm">
                  <div className="flex flex-col items-center gap-2 text-slate-300">
                    <Loader2 className="h-7 w-7 animate-spin text-indigo-400" />
                    <span className="text-xs">Renderizando…</span>
                  </div>
                </div>
              )}
              {/* Un ÚNICO iframe siempre montado: solo cambian las clases del
                  contenedor entre escritorio y el marco de teléfono. Si fueran
                  dos <iframe> distintos, cambiar de modo remontaría el nodo y
                  perdería el HTML ya escrito (el efecto solo reescribe cuando
                  cambia previewHtml, no previewMode). */}
              <div className={previewMode === "mobile"
                ? "relative h-full max-h-[820px] w-full max-w-[380px] overflow-hidden rounded-[2.25rem] border-[6px] border-foreground/15 bg-black shadow-2xl"
                : "h-full w-full"}>
                <iframe ref={iframeRef} title="Vista previa de la landing"
                  className="block h-full w-full border-0 bg-white"
                  sandbox="allow-same-origin allow-scripts" />
              </div>
            </div>
          </main>
        </div>
      </div>
    </Layout>
  );
}
