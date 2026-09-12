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

const SALUDO = `Soy tu **Constructor de Landing Pages** de VentasPro 

Creo paginas de ventas profesionales con frameworks de alta conversion (AIDA, PAS, Before-After).

**Para empezar:**
1. Selecciona un **producto** arriba
2. Elige un **estilo visual**
3. Presiona **Generar** — o escribeme que quieres

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
   * ⚠️ El editor no tenía NADA de esto. El panel de chat era `width: 340` fijo
   * con `minWidth: 280`, sin una sola regla responsive, y los dos paneles
   * vivían en un `flex` horizontal. En un teléfono de 390px eso deja 280 para
   * el chat y ~110 para la vista previa: técnicamente el botón de móvil
   * existía, pero no había dónde mostrar nada.
   *
   * El dueño lo dijo así: *"la landing page studio no tiene modo móvil"*.
   * Tenía razón en el efecto aunque el botón estuviera cableado.
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
      doc.write(`<!doctype html><html><body style="display:flex;align-items:center;justify-content:center;min-height:100vh;font-family:system-ui,sans-serif;color:#64748b;background:#0f172a;margin:0;flex-direction:column;gap:16px;text-align:center;padding:40px"><svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="1.2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg><p style="font-size:16px;max-width:300px">Selecciona un producto y presiona <strong style="color:#a5b4fc">Generar</strong></p></body></html>`);
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
      setMsgs(m => [
        ...m.filter(x => !(x as any).loading),
        { role: "assistant", content: `**Landing generada y guardada**\n\n**Nombre:** ${gen.name}\n**Estilo:** ${familia}\n**Motor:** ${gen.generatedBy === "ai" ? "VentasPro IA" : "Plantilla con los datos del producto"}\n\n**Secciones creadas:**\n${(gen.sections as any[]).map((s: any) => `- **${s.type}** — ${s.title}`).join("\n")}\n\nPuedes pedirme ajustes:\n> *"Haz el hero mas agresivo"*\n> *"Cambia el CTA a urgencia"*\n> *"Agrega mas beneficios"*` },
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
      if (r.operations?.length) await cargarPreview(landingId);
      setMsgs(m => [
        ...m.filter(x => !(x as any).loading),
        { role: "assistant", content: `${r.message || "Cambio aplicado."}\n\nPreview actualizada. Que mas ajustamos?` },
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
    // `return toast.info(...)` devolvia el id del toast mientras el resto de
    // la funcion no devuelve nada: dos tipos de retorno en la misma funcion.
    // Avisar y cortar son dos cosas, y se escriben como dos cosas.
    if (!landingId) { toast.info("Primero genera una landing."); return; }
    const r = await fetch(`/api/landing-pages/${landingId}/render?familia=${familia}`, { credentials: "include" });
    if (!r.ok) { toast.error("Error al exportar"); return; }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([await r.text()], { type: "text/html" }));
    a.download = `landing-${landingId}.html`; a.click();
  }, [landingId, familia]);

  // Publicar: la landing queda en /l/<slug> con el dominio de la app, sin
  // login. Esa es la URL que va en el anuncio. Hasta hoy no había forma de
  // publicar desde la pantalla (solo por API o por Atlas).
  const [urlPublica, setUrlPublica] = useState<string | null>(null);
  const publicar = useCallback(async () => {
    if (!landingId) { toast.info("Primero genera una landing."); return; }
    try {
      const r = await apiFetch<any>(`/api/landing-pages/${landingId}/publish`, { method: "POST", body: JSON.stringify({}) });
      setUrlPublica(r.url || null);
      try { await navigator.clipboard.writeText(r.url); } catch { /* sin portapapeles */ }
      toast.success(`Publicada: ${r.url} (copiada al portapapeles)`);
      setMsgs(m => [...m, { role: "assistant", content: `**Landing publicada.**

URL para el anuncio: ${r.url}

Cualquier cambio que me pidas se ve ahí al instante.` }]);
    } catch (e: any) {
      toast.error(`No se pudo publicar: ${e.message}`);
    }
  }, [landingId]);

  const cargarLanding = useCallback(async (id: number) => {
    const l = landings.find(x => x.id === id);
    if (!l) return;
    setLandingId(id);
    if (l.productId) setProductId(l.productId);
    if ((l.design as any)?.familia) setFamilia((l.design as any).familia as Familia);
    await cargarPreview(id, (l.design as any)?.familia as Familia);
    setMsgs(m => [...m, { role: "assistant", content: `Landing **"${l.name}"** cargada. Que quieres modificar?` }]);
  }, [landings, cargarPreview]);

  return (
    <Layout>
      <div className="flex flex-col" style={{ height: "calc(100vh - 4rem)" }}>
        <div className="flex items-center gap-2 px-3 py-2 border-b bg-background shrink-0 flex-wrap">
          <div className="flex items-center gap-2 mr-1">
            <div className="p-1.5 rounded-lg bg-violet-500/10 border border-violet-500/20">
              <LayoutTemplate className="h-4 w-4 text-violet-500" />
            </div>
            <span className="text-sm font-bold hidden sm:block">Landing AI Studio</span>
            <Badge variant="secondary" className="text-[10px] hidden sm:flex">IA</Badge>
          </div>
          <select value={productId} onChange={e => setProductId(e.target.value ? Number(e.target.value) : "")}
            className="h-8 rounded-md border bg-background px-2 text-xs min-w-[140px] max-w-[200px]">
            <option value="">Producto...</option>
            {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select value={landingId || ""} onChange={e => e.target.value && cargarLanding(Number(e.target.value))}
            className="h-8 rounded-md border bg-background px-2 text-xs min-w-[120px] max-w-[180px]">
            <option value="">Nueva landing...</option>
            {landings.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          <Button size="sm" disabled={busy || !productId} onClick={() => productId && generarLanding(Number(productId))}
            className="bg-violet-600 hover:bg-violet-700 text-white h-8 px-3 text-xs">
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Wand2 className="h-3.5 w-3.5 mr-1" />}
            Generar
          </Button>
          <div className="ml-auto flex gap-1">
            <Button size="sm" onClick={publicar} disabled={!landingId} className="h-8 px-3 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
              title="Publicar en ventasproia.com/l/… (la URL para el anuncio)">
              {urlPublica ? "Publicada ✓" : "Publicar"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => landingId && cargarPreview(landingId)} disabled={!landingId || previewBusy} className="h-8 w-8 p-0"
              title="Actualizar la vista previa" aria-label="Actualizar la vista previa">
              <RefreshCw className={`h-3.5 w-3.5 ${previewBusy ? "animate-spin" : ""}`} />
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setPreviewMode(m => m === "desktop" ? "mobile" : "desktop")} className="h-8 w-8 p-0"
              title={previewMode === "desktop" ? "Ver como se ve en un celular" : "Ver como se ve en pantalla grande"}
              aria-label={previewMode === "desktop" ? "Ver como se ve en un celular" : "Ver como se ve en pantalla grande"}>
              {previewMode === "desktop" ? <Smartphone className="h-3.5 w-3.5" /> : <Monitor className="h-3.5 w-3.5" />}
            </Button>
            <Button size="sm" variant="ghost" onClick={exportar} disabled={!landingId} className="h-8 w-8 p-0"
              title="Descargar la landing en HTML" aria-label="Descargar la landing en HTML">
              <Download className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
        {/* El selector de panel, SOLO en pantalla chica (lg:hidden). En
            escritorio los dos se ven a la vez y este control estorbaría. */}
        <div className="flex lg:hidden shrink-0 border-b bg-muted/30 p-1 gap-1">
          {([["chat", "💬 Chat"], ["preview", "👁️ Vista previa"]] as const).map(([valor, etiqueta]) => (
            <button
              key={valor}
              onClick={() => setPanelMovil(valor)}
              aria-pressed={panelMovil === valor}
              className={`flex-1 h-9 rounded-md text-xs font-semibold transition-colors ${
                panelMovil === valor ? "bg-background shadow-sm" : "text-muted-foreground"
              }`}
            >
              {etiqueta}
            </button>
          ))}
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Ancho completo en móvil; los 340px fijos recién a partir de lg.
              El `hidden` es lo que evita que los dos paneles se repartan una
              pantalla donde no entran. */}
          <div
            className={`flex-col border-r bg-background w-full lg:w-[340px] xl:w-[400px] lg:min-w-[280px] lg:flex ${
              panelMovil === "chat" ? "flex" : "hidden"
            }`}
          >
            <div className="px-3 py-2 border-b bg-muted/20 shrink-0">
              <p className="text-[10px] font-semibold uppercase text-muted-foreground mb-1.5">Estilo visual</p>
              <div className="flex flex-wrap gap-1">
                {FAMILIAS.map(f => (
                  <button key={f.value}
                    onClick={async () => { setFamilia(f.value); if (landingId) await cargarPreview(landingId, f.value); }}
                    className={`px-2 py-0.5 rounded text-[10px] font-medium border transition-all ${familia === f.value ? "text-white border-transparent" : "border-border bg-background text-muted-foreground hover:border-primary/40"}`}
                    style={familia === f.value ? { backgroundColor: f.color } : {}}>
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
            <ScrollArea className="flex-1 px-3 py-3">
              <div className="space-y-3">
                {msgs.map((msg, i) => (
                  <div key={i} className={`flex gap-2 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
                    <div className={`shrink-0 h-6 w-6 rounded-full flex items-center justify-center ${msg.role === "assistant" ? "bg-violet-100 text-violet-700" : "bg-blue-100 text-blue-700"}`}>
                      {msg.role === "assistant" ? <Sparkles className="h-3 w-3" /> : <User className="h-3 w-3" />}
                    </div>
                    <div className={`max-w-[260px] rounded-xl px-3 py-2 text-xs leading-relaxed ${msg.role === "assistant" ? "bg-muted" : "bg-blue-600 text-white"} ${(msg as any).loading ? "opacity-70" : ""}`}>
                      {msg.role === "assistant" ? (
                        <ReactMarkdown components={{
                          p: ({ children }) => <p className="mb-1 last:mb-0">{children}</p>,
                          strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                          ul: ({ children }) => <ul className="list-disc list-inside space-y-0.5 mt-1">{children}</ul>,
                          li: ({ children }) => <li>{children}</li>,
                          blockquote: ({ children }) => <blockquote className="border-l-2 border-violet-400 pl-2 italic opacity-80 mt-1">{children}</blockquote>,
                        }}>{msg.content}</ReactMarkdown>
                      ) : msg.content}
                      {(msg as any).loading && <Loader2 className="h-3 w-3 animate-spin inline ml-1" />}
                    </div>
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>
            </ScrollArea>
            <div className="px-3 py-2 border-t bg-muted/10 shrink-0">
              <div className="flex flex-wrap gap-1 mb-2">
                {["Hero mas impactante", "CTA urgente", "Mas premium", "Agrega FAQ"].map(s => (
                  <button key={s} onClick={() => { setInput(s); inputRef.current?.focus(); }}
                    className="text-[10px] px-2 py-0.5 rounded-full border bg-background hover:bg-muted transition-colors">
                    {s}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <Input ref={inputRef} value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), enviar())}
                  placeholder="Pide un cambio o genera..."
                  className="h-8 text-xs" disabled={busy} />
                <Button size="sm" onClick={enviar} disabled={busy || !input.trim()}
                  className="h-8 w-8 p-0 bg-violet-600 hover:bg-violet-700 text-white shrink-0">
                  {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                </Button>
              </div>
            </div>
          </div>
          <div
            className={`flex-1 flex-col bg-slate-950 overflow-hidden lg:flex ${
              panelMovil === "preview" ? "flex" : "hidden"
            }`}
          >
            <div className="flex items-center gap-2 px-3 py-2 bg-slate-900 border-b border-slate-800 shrink-0">
              <div className="flex gap-1">
                <span className="h-2.5 w-2.5 rounded-full bg-red-500/70" />
                <span className="h-2.5 w-2.5 rounded-full bg-yellow-500/70" />
                <span className="h-2.5 w-2.5 rounded-full bg-green-500/70" />
              </div>
              <div className="flex-1 bg-slate-800 rounded px-2 py-0.5 text-[10px] text-slate-400 truncate">
                {landingId ? `/api/landing-pages/${landingId}/render?familia=${familia}` : "preview - genera una landing para comenzar"}
              </div>
              <Badge variant="outline" className="text-[10px] border-slate-700 text-slate-400 hidden sm:flex">
                {FAMILIAS.find(f => f.value === familia)?.label}
              </Badge>
            </div>
            <div className={`flex-1 overflow-auto flex ${previewMode === "mobile" ? "items-start justify-center py-8" : ""}`}>
              {/* El marco de teléfono medía 390px EXACTOS -- justo el ancho de
                  un teléfono real, así que dentro de uno se salía de la
                  pantalla junto con sus 8px de borde. `w-full max-w-[390px]`
                  lo deja igual en escritorio y lo hace caber en el celular. */}
              <div className={`relative transition-all ${previewMode === "mobile" ? "w-full max-w-[390px] rounded-[40px] overflow-hidden border-8 border-slate-700 shadow-2xl" : "w-full h-full"}`}>
                {previewBusy && (
                  <div className="absolute inset-0 flex items-center justify-center bg-slate-950/70 z-10">
                    <Loader2 className="h-8 w-8 animate-spin text-violet-400" />
                  </div>
                )}
                {/* El alto va por clase y no por `style` porque tiene que
                    cambiar con el tamaño de pantalla, y un estilo en línea no
                    admite media queries. En móvil la barra de paneles se come
                    unos 3rem más, así que el `calc` de escritorio dejaba la
                    vista previa desbordando por abajo. */}
                <iframe ref={iframeRef} title="Vista previa de la landing"
                  className={`w-full block border-0 ${
                    previewMode === "mobile"
                      ? "h-[70vh] max-h-[844px] lg:h-[844px] lg:max-h-none"
                      : "h-[calc(100vh-12rem)] lg:h-[calc(100vh-8.5rem)]"
                  }`}
                  sandbox="allow-same-origin allow-scripts" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
