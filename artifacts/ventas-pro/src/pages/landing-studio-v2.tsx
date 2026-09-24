import { useCallback, useEffect, useRef, useState } from "react";
import { Layout } from "@/components/layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { Sparkles, Send, User, Loader2, Monitor, Smartphone, Download, RefreshCw, LayoutTemplate, Wand2, Copy, Trash2, ExternalLink, EyeOff, MoreHorizontal } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import ReactMarkdown from "react-markdown";
import { BloquesEditor } from "@/components/landing/bloques-editor";

type Product = { id: number; name: string; description?: string; price?: string; currency?: string };
type Landing = { id: number; name: string; productId?: number | null; design?: any; sections?: any[]; strategy?: any; status?: string; publishedUrl?: string | null; source?: any };
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
  | "fitness" | "educacion" | "tecnologia" | "familiar" | "creativa" | "oscura" | "launch"
  | "electronica" | "suplemento" | "gourmet" | "dropshipping";

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
  { value: "launch", label: "Launch", color: "#F59E4B" },
  { value: "electronica", label: "Electrónica", color: "#22D3EE" },
  { value: "suplemento", label: "Salud y suplementos", color: "#16A34A" },
  { value: "gourmet", label: "Gourmet", color: "#7C3F1D" },
  { value: "dropshipping", label: "Dropshipping directo", color: "#4F46E5" },
];

const SALUDO = `Soy **Atlas Landing**, el diseñador de páginas de venta de VentasPro 

Creo paginas de ventas profesionales con frameworks de alta conversion (AIDA, PAS, Before-After).

**Para empezar:**
1. Selecciona un **producto** arriba
2. Si querés, elegí un **estilo** (si no, se elige solo según el producto)
3. Presiona **Generar** — o escribeme que quieres

*"Crea una landing impactante para mi curso de piano"*`;

/**
 * Acá había un panel "Diseño (tú decides)" (fondo, botones, color) que solo
 * pintaba la VISTA PREVIA con un <style> inyectado. La landing publicada se
 * arma con renderer-v3 desde las secciones y nunca lo leía (el POST
 * /landing-studio/design lo horneaba en `landing.html`, que ni la ruta
 * pública ni la de copias usan). Quitado el 23-09-2026: la preview mentía.
 * El estilo lo decide la familia, que sí llega a la página publicada.
 */

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
  // Chat (pedirle cambios al modelo) o Bloques (tocar la landing con las manos).
  const [modoPanel, setModoPanel] = useState<"chat" | "bloques">("chat");
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

  const enviar = useCallback(async () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setMsgs(m => [...m, { role: "user", content: text }]);

    const pid = typeof productId === "number" ? productId : null;
    if (!pid && !landingId) {
      setMsgs(m => [...m, { role: "assistant", content: "Selecciona primero un **producto** en el selector de arriba." }]);
      inputRef.current?.focus();
      return;
    }

    setBusy(true);
    const esNueva = /genera|crea|construye|haz una landing|nueva landing/i.test(text);
    setMsgs(m => [...m, { role: "assistant", content: esNueva ? "El agente de landings está generando la página con los datos reales del producto... 30-90 segundos." : "El agente está aplicando el cambio (recuerda lo que ya pediste antes)...", loading: true }]);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 180000);
      const r = await fetch("/api/landing-studio/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, landingId: esNueva ? undefined : landingId, productId: pid, familia }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (!r.ok) {
        const err = await r.json().catch(() => null);
        throw new Error(err?.message || `Error ${r.status}`);
      }
      const data = await r.json();
      setLandingId(data.landingId);
      setPreviewHtml(data.html);
      setLandings(prev => {
        const exists = prev.find(l => l.id === data.landingId);
        if (exists) return prev.map(l => l.id === data.landingId ? { ...l, html: data.html } as any : l);
        return [{ id: data.landingId, name: `Landing #${data.landingId}`, productId: pid, status: "draft" } as any, ...prev];
      });
      setMsgs(m => [
        ...m.filter(x => !(x as any).loading),
        { role: "assistant", content: (esNueva
          ? `**Landing generada** (${data.elapsed || "?"})\n\nID: ${data.landingId}\n\nPuedes pedirme ajustes como:\n> *"Haz el hero más agresivo"*\n> *"Cambia los colores a oscuro"*\n> *"Agrega una sección de testimonios"`
          : `**Landing actualizada** (ID: ${data.landingId})\n\nPreview actualizada. Que más ajustamos?`)
          + (data.motor ? `\n\n_Redactada por: ${data.motor}_` : "")
          + (Array.isArray(data.saneado) && data.saneado.length ? `\n_Se quitó lo repetido: ${data.saneado.join(", ")}_` : "") },
      ]);
      toast.success(esNueva ? "¡Landing generada!" : "¡Landing actualizada!");
    } catch (e: any) {
      const msg = e.name === "AbortError" ? "Tiempo de espera agotado (3 min). Intenta con un producto más simple." : (e.message || "Error al procesar.");
      setMsgs(m => [...m.filter(x => !(x as any).loading), { role: "assistant", content: `Error: ${msg}` }]);
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }, [input, busy, productId, landingId, familia]);

  const exportar = useCallback(async () => {
    if (!previewHtml) { toast.info("Primero genera una landing."); return; }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([previewHtml], { type: "text/html" }));
    a.download = `landing-${landingId || "nueva"}.html`; a.click();
  }, [previewHtml, landingId]);

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

  // Despublicar: la URL /l/<slug> deja de responder; la landing sigue en borrador.
  const despublicar = useCallback(async () => {
    if (!landingId) return;
    try {
      await apiFetch<any>(`/api/landing-pages/${landingId}/publish`, { method: "POST", body: JSON.stringify({ publicada: false }) });
      setUrlPublica(null);
      setLandings(ls => ls.map(l => l.id === landingId ? { ...l, status: "draft", publishedUrl: null } as any : l));
      toast.success("Despublicada: la URL ya no responde. Sigue guardada como borrador.");
    } catch (e: any) { toast.error(`No se pudo despublicar: ${e.message}`); }
  }, [landingId]);

  // Clonar: sin producto distinto → copia; con otro producto → clona el ESTILO
  // (mismo diseño, contenido nuevo para ese producto). Queda en borrador.
  const [clonarAbierto, setClonarAbierto] = useState(false);
  const [clonarProducto, setClonarProducto] = useState<number | "">("");
  const clonar = useCallback(async () => {
    if (!landingId) return;
    setClonarAbierto(false);
    try {
      const r = await apiFetch<any>(`/api/landing-pages/${landingId}/clonar`, {
        method: "POST", body: JSON.stringify({ productId: clonarProducto || null }),
      });
      const nueva = r.landing;
      setLandings(ls => [nueva, ...ls]);
      setUrlPublica(null);
      setLandingId(nueva.id);
      if (nueva.productId) setProductId(nueva.productId);
      await cargarPreview(nueva.id, (nueva.design as any)?.familia as Familia);
      toast.success(r.modo === "estilo" ? "Estilo clonado para el otro producto (borrador)." : "Copia creada (borrador).");
      setMsgs(m => [...m, { role: "assistant", content: r.modo === "estilo"
        ? `**Estilo clonado.** Nueva landing **"${nueva.name}"** en borrador, con el mismo diseño y el contenido del producto elegido. ¿Qué ajustamos?`
        : `**Copia creada.** Estás editando **"${nueva.name}"** (borrador). La original sigue igual.` }]);
    } catch (e: any) { toast.error(`No se pudo clonar: ${e.message}`); }
  }, [landingId, clonarProducto, cargarPreview]);

  // Clonar una landing REAL desde una URL (HTML + CSS), y adaptarla al producto.
  const [urlAbierto, setUrlAbierto] = useState(false);
  const [urlClonar, setUrlClonar] = useState("");
  const [adaptando, setAdaptando] = useState(false);
  const esCopiaHtml = (l?: Landing | null) => !!(l as any)?.source && (l as any).source.tipo === "html";
  const landingActual = landings.find(x => x.id === landingId) || null;

  const clonarDesdeUrl = useCallback(async () => {
    const url = urlClonar.trim();
    if (!/^https?:\/\//i.test(url)) { toast.error("Pegá una URL completa (https://…)."); return; }
    setUrlAbierto(false);
    setMsgs(m => [...m, { role: "user", content: `Clonar: ${url}` }, { role: "assistant", content: "Descargando el HTML y el CSS…", loading: true }]);
    try {
      const r = await apiFetch<any>(`/api/landing-pages/importar-url`, { method: "POST", body: JSON.stringify({ url, productId: productId || null }) });
      const nueva = r.landing;
      setLandings(ls => [nueva, ...ls]);
      setUrlPublica(null);
      setLandingId(nueva.id);
      await cargarPreview(nueva.id);
      setMsgs(m => [...m.filter(x => !(x as any).loading), { role: "assistant", content:
        `**Copia lista** (${r.hojas} hojas de estilo embebidas, ${r.imagenes} imágenes).\n\n` +
        `⚠️ Todavía tiene los textos, fotos y marca del sitio original. Elegí tu producto arriba y presioná **Adaptar al producto** para que quede tuya.` +
        (r.advertencias?.length ? `\n\n${r.advertencias.map((a: string) => `• ${a}`).join("\n")}` : "") }]);
    } catch (e: any) {
      setMsgs(m => [...m.filter(x => !(x as any).loading), { role: "assistant", content: `No pude clonar esa URL: ${e.message}` }]);
    }
  }, [urlClonar, productId, cargarPreview]);

  const adaptar = useCallback(async () => {
    if (!landingId) return;
    if (!productId) { toast.info("Elegí el producto al que adaptarla."); return; }
    setAdaptando(true);
    setMsgs(m => [...m, { role: "assistant", content: "Reescribiendo textos, cambiando fotos y botones…", loading: true }]);
    try {
      const r = await apiFetch<any>(`/api/landing-pages/${landingId}/adaptar`, { method: "POST", body: JSON.stringify({ productId }) });
      await cargarPreview(landingId);
      setLandings(ls => ls.map(l => l.id === landingId ? { ...l, productId: Number(productId), source: { ...((l as any).source || {}), adaptada: true } } as any : l));
      setMsgs(m => [...m.filter(x => !(x as any).loading), { role: "assistant", content:
        `**Adaptada a tu producto:** ${r.reemplazos} textos reescritos, ${r.imagenes} imágenes reemplazadas, botones apuntando a tu WhatsApp.` +
        (r.advertencias?.length ? `\n\n${r.advertencias.map((a: string) => `• ${a}`).join("\n")}` : "") + `\n\nRevisala y, si te gusta, **Publicar**.` }]);
    } catch (e: any) {
      setMsgs(m => [...m.filter(x => !(x as any).loading), { role: "assistant", content: `No pude adaptarla: ${e.message}` }]);
    } finally { setAdaptando(false); }
  }, [landingId, productId, cargarPreview]);

  // Eliminar: irreversible, con confirmación.
  const eliminar = useCallback(async () => {
    if (!landingId) return;
    const l = landings.find(x => x.id === landingId);
    if (!window.confirm(`¿Eliminar la landing "${l?.name ?? landingId}"? Si está publicada, su URL deja de existir. No se puede deshacer.`)) return;
    try {
      const r = await fetch(`/api/landing-pages/${landingId}`, { method: "DELETE", credentials: "include" });
      if (!r.ok && r.status !== 204) throw new Error(`HTTP ${r.status}`);
      setLandings(ls => ls.filter(x => x.id !== landingId));
      setLandingId(null); setUrlPublica(null); setPreviewHtml(null);
      toast.success("Landing eliminada.");
      setMsgs(m => [...m, { role: "assistant", content: "Landing eliminada. Elegí un producto y generá otra cuando quieras." }]);
    } catch (e: any) { toast.error(`No se pudo eliminar: ${e.message}`); }
  }, [landingId, landings]);

  // El render usa la familia GUARDADA antes que `?familia=`: si no se guarda,
  // elegir otro estilo sobre una landing ya generada no cambiaba nada (ni la
  // preview ni la publicada).
  const cambiarFamilia = useCallback(async (f: Familia) => {
    setFamilia(f);
    if (!landingId) return;
    const l = landings.find(x => x.id === landingId);
    const design = { ...((l?.design as any) || {}), familia: f };
    try {
      await apiFetch(`/api/landing-pages/${landingId}`, { method: "PATCH", body: JSON.stringify({ design }) });
      setLandings(ls => ls.map(x => x.id === landingId ? { ...x, design } : x));
      await cargarPreview(landingId, f);
    } catch (e: any) { toast.error(`No se pudo cambiar el estilo: ${e.message}`); }
  }, [landingId, landings, cargarPreview]);

  const cargarLanding = useCallback(async (id: number) => {
    const l = landings.find(x => x.id === id);
    if (!l) return;
    setLandingId(id);
    if (l.productId) setProductId(l.productId);
    if ((l.design as any)?.familia) setFamilia((l.design as any).familia as Familia);
    setUrlPublica((l as any).status === "published" ? ((l as any).publishedUrl || null) : null);
    await cargarPreview(id, (l.design as any)?.familia as Familia);
    setMsgs(m => [...m, { role: "assistant", content: `Landing **"${l.name}"** cargada${(l as any).status === "published" ? ` — publicada en ${(l as any).publishedUrl}` : " (borrador)"}. ¿Qué querés modificar?` }]);
  }, [landings, cargarPreview]);

  return (
    <Layout>
      <div className="flex flex-col" style={{ height: "calc(100vh - 4rem)" }}>
        <div className="flex items-center gap-2 px-3 py-2 border-b bg-background shrink-0 flex-wrap">
          <div className="flex items-center gap-2 mr-1">
            <div className="p-1.5 rounded-lg bg-violet-500/10 border border-violet-500/20">
              <LayoutTemplate className="h-4 w-4 text-violet-500" />
            </div>
            <span className="text-sm font-bold hidden sm:block">Atlas Landing</span>
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
          <Button size="sm" disabled={busy || !productId} onClick={async () => {
              if (!productId) return;
              setInput("Genera una landing page para este producto");
              // Trigger enviar via ref
              setTimeout(() => enviar(), 100);
            }}
            className="bg-violet-600 hover:bg-violet-700 text-white h-8 px-3 text-xs">
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Wand2 className="h-3.5 w-3.5 mr-1" />}
            Generar
          </Button>
          <div className="ml-auto flex gap-1 items-center">
            {urlPublica ? (
              <>
                <a href={urlPublica} target="_blank" rel="noreferrer" className="h-8 px-2 inline-flex items-center gap-1 rounded-md border text-xs text-emerald-700 border-emerald-300 bg-emerald-50 hover:bg-emerald-100 max-w-[220px] truncate"
                  title={`Abrir ${urlPublica}`}>
                  <ExternalLink className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{urlPublica.replace(/^https?:\/\//, "")}</span>
                </a>
                <Button size="sm" variant="ghost" onClick={despublicar} className="h-8 px-2 text-xs" title="Despublicar: la URL deja de responder">
                  <EyeOff className="h-3.5 w-3.5 mr-1" />Despublicar
                </Button>
              </>
            ) : (
              <Button size="sm" onClick={publicar} disabled={!landingId} className="h-8 px-3 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                title="Publicar en ventasproia.com/l/… (la URL para el anuncio)">
                Publicar
              </Button>
            )}
            {esCopiaHtml(landingActual) && (
              <Button size="sm" onClick={adaptar} disabled={adaptando || !productId} className="h-8 px-3 text-xs bg-violet-600 hover:bg-violet-700 text-white"
                title="Reescribir textos, fotos y botones para el producto elegido">
                {adaptando ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Wand2 className="h-3.5 w-3.5 mr-1" />}Adaptar al producto
              </Button>
            )}
            {/* Pedido del dueño (13-09): el campo de la URL se extiende a los
                lados dentro de la misma barra, no cae en un cuadro debajo. */}
            {urlAbierto && (
              <div className="flex items-center gap-1 flex-1 min-w-[280px]">
                <Input autoFocus value={urlClonar} onChange={e => setUrlClonar(e.target.value)} placeholder="Pegá la URL de la landing a clonar (HTML + CSS)…" className="h-8 text-xs flex-1"
                  onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); clonarDesdeUrl(); } if (e.key === "Escape") setUrlAbierto(false); }} />
                <Button size="sm" className="h-8 px-3 text-xs" onClick={clonarDesdeUrl} disabled={!urlClonar.trim()}>Clonar</Button>
                <Button size="sm" variant="ghost" className="h-8 px-2 text-xs" onClick={() => setUrlAbierto(false)}>Cancelar</Button>
              </div>
            )}
            <Button size="sm" variant="ghost" onClick={() => landingId && cargarPreview(landingId)} disabled={!landingId || previewBusy} className="h-8 w-8 p-0"
              title="Actualizar la vista previa" aria-label="Actualizar la vista previa">
              <RefreshCw className={`h-3.5 w-3.5 ${previewBusy ? "animate-spin" : ""}`} />
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setPreviewMode(m => m === "desktop" ? "mobile" : "desktop")} className="h-8 w-8 p-0"
              title={previewMode === "desktop" ? "Ver como se ve en un celular" : "Ver como se ve en pantalla grande"}
              aria-label={previewMode === "desktop" ? "Ver como se ve en un celular" : "Ver como se ve en pantalla grande"}>
              {previewMode === "desktop" ? <Smartphone className="h-3.5 w-3.5" /> : <Monitor className="h-3.5 w-3.5" />}
            </Button>
            {/* Lo que se usa poco va en "Más": la barra queda con lo del día a día. */}
            <div className="relative">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="ghost" className="h-8 w-8 p-0" title="Más acciones" aria-label="Más acciones">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuItem onClick={() => setClonarAbierto(true)} disabled={!landingId}>
                    <Copy className="h-3.5 w-3.5 mr-2" />Duplicar / usar en otro producto
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setUrlAbierto(true)}>
                    <ExternalLink className="h-3.5 w-3.5 mr-2" />Copiar una landing de internet
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={exportar} disabled={!landingId}>
                    <Download className="h-3.5 w-3.5 mr-2" />Descargar HTML
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={eliminar} disabled={!landingId} className="text-red-600 focus:text-red-700">
                    <Trash2 className="h-3.5 w-3.5 mr-2" />Eliminar landing
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              {clonarAbierto && (
                <div className="absolute right-0 top-9 z-20 w-64 rounded-md border bg-background p-3 shadow-lg space-y-2">
                  <p className="text-xs font-semibold">Clonar esta landing</p>
                  <p className="text-[11px] text-muted-foreground">Sin producto: copia exacta. Con otro producto: mismo estilo, contenido nuevo.</p>
                  <select value={clonarProducto} onChange={e => setClonarProducto(e.target.value ? Number(e.target.value) : "")}
                    className="h-8 w-full rounded-md border bg-background px-2 text-xs">
                    <option value="">Copia exacta (mismo producto)</option>
                    {products.map(p => <option key={p.id} value={p.id}>Estilo para: {p.name}</option>)}
                  </select>
                  <div className="flex gap-1 justify-end">
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setClonarAbierto(false)}>Cancelar</Button>
                    <Button size="sm" className="h-7 text-xs" onClick={clonar}>Clonar</Button>
                  </div>
                </div>
              )}
            </div>
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
            <div className="px-3 py-2 border-b bg-muted/20 shrink-0 flex items-center gap-2">
              <span className="text-[11px] font-medium text-muted-foreground shrink-0">Estilo</span>
              <span className="h-3 w-3 rounded-full shrink-0 border" style={{ backgroundColor: FAMILIAS.find(f => f.value === familia)?.color }} />
              <select value={familia} onChange={e => cambiarFamilia(e.target.value as Familia)} disabled={busy || previewBusy}
                className="h-7 flex-1 rounded-md border bg-background px-2 text-xs">
                {FAMILIAS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
            </div>
            <div className="flex shrink-0 border-b bg-muted/20 p-1 gap-1">
              {([["chat", "💬 Chat"], ["bloques", "🧱 Bloques"]] as const).map(([valor, etiqueta]) => (
                <button key={valor} onClick={() => setModoPanel(valor)} aria-pressed={modoPanel === valor}
                  className={`flex-1 h-7 rounded-md text-[11px] font-semibold transition-colors ${modoPanel === valor ? "bg-background shadow-sm" : "text-muted-foreground"}`}>
                  {etiqueta}
                </button>
              ))}
            </div>
            {modoPanel === "bloques" ? (
              <BloquesEditor landingId={landingId} onGuardado={() => { if (landingId) cargarPreview(landingId); }} />
            ) : (<>
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
            </>)}
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
