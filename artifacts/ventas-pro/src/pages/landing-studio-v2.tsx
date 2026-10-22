import { useCallback, useEffect, useRef, useState } from "react";
import { Layout } from "@/components/layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { Sparkles, Send, User, Loader2, Monitor, Smartphone, Tablet, Download, RefreshCw, LayoutTemplate, Wand2, Copy, Trash2, ExternalLink, EyeOff, MoreHorizontal, Undo2, Redo2, Save, Image as ImageIcon } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import ReactMarkdown from "react-markdown";
import { BloquesEditor, type Seccion } from "@/components/landing/bloques-editor";
import { TemaPanel } from "@/components/landing/tema-panel";
import { PedidoPanel } from "@/components/landing/pedido-panel";
import { conectarEdicion, etiquetar, marcarSeleccion, type CampoEditable } from "@/components/landing/puente-edicion";
import { aplicarRetoque, normalizarRetoque, type Retoque } from "@estudio/retoque";
import { Link } from "wouter";
import { LogoMarca } from "@/components/logo-marca";

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
  | "electronica" | "suplemento" | "gourmet" | "dropshipping" | "clinica";

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
  { value: "clinica", label: "Clínica PostureFit", color: "#1D4ED8" },
];

const SALUDO = `Soy **Atlas Landing**, el diseñador de páginas de venta de VentasPro 

Creo paginas de ventas profesionales con frameworks de alta conversion (AIDA, PAS, Before-After).

**Para empezar:**
1. Selecciona un **producto** arriba
2. Si querés, elegí un **modelo**: los 4 MODELOS DE PÁGINA validados (CleanHome COD, Urgencia, Clínico o Pro) o una **familia** visual. Si no, se elige solo según el producto
3. Presiona **Generar** — o escribeme que quieres

*"Crea una landing impactante para mi curso de piano"*`;

/**
 * Plantilla activa: "" = Automática, "estilo" / "estilo:cleanhome|urgencia|clinico|pro"
 * = el renderer-estilo (cada valor es UNA MAQUETACIÓN DISTINTA validada por el
 * dueño el 03-10), cualquier otro valor = una familia v3. El prefijo "estilo:"
 * evita la colisión con la familia "premium".
 */
type Plantilla = "" | Familia | "estilo" | `estilo:${string}` | "vp:premium";

/** El diseño premium (renderer-premium): físico, digital o servicio según el producto. */
const PREMIUM: Plantilla = "vp:premium";

const VARIANTES_ESTILO: { value: Plantilla; label: string }[] = [
  { value: "estilo", label: "Modelo COD — que la IA elija el modelo" },
  { value: "estilo:cleanhome", label: "Modelo: CleanHome (product page COD, form arriba derecha)" },
  { value: "estilo:urgencia", label: "Modelo: Urgencia (countdown + stock + combos 2x/3x)" },
  { value: "estilo:clinico", label: "Modelo: Clínico (azul marino, pasos, packs)" },
  { value: "estilo:pro", label: "Modelo: Pro (PosturaPro, salud/precio alto)" },
];

const COLOR_ESTILO: Record<string, string> = { cleanhome: "#08783A", urgencia: "#E5342A", clinico: "#1E5BD7", pro: "#0E9F8A" };

function plantillaDeDesign(d: any): Plantilla {
  if (d?.renderer === "premium") return PREMIUM;
  if (d?.renderer === "estilo") {
    const s = String(d.style || "");
    if (s && ["cleanhome", "urgencia", "clinico", "pro"].includes(s)) return (`estilo:${s}` as Plantilla);
    const alias: Record<string, string> = { cod: "cleanhome", premium: "pro", bold: "urgencia", dark: "clinico" };
    if (s && alias[s]) return (`estilo:${alias[s]}` as Plantilla);
    return "estilo";
  }
  if (d?.familia) return d.familia as Familia;
  return "";
}

const soloFamilia = (v?: string | null): string => (v && !v.startsWith("estilo") && !v.startsWith("vp:") ? v : "");

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
  // 08-10-2026: el backend responde {error, code} (no {message}); leer .message
  // mostraba "Error 400" sin decir qué pasó. Se lee .error también.
  if (!r.ok) {
    const body = await r.json().catch(() => null);
    throw new Error(body?.message || body?.error || `Error ${r.status}`);
  }
  return r.status === 204 ? (undefined as T) : r.json();
}

/** Lo que el editor le cuenta a la suite (y la suite a Atlas y a la galería). */
export interface ContextoLanding {
  productId: number | null;
  productoNombre: string | null;
  landing: { id: number; nombre: string; publicada: boolean } | null;
  secciones: unknown[];
  retoque: unknown;
  plantilla: string;
}

export interface PropsLandingStudio {
  /** La ruta de wouter le pasa `params` cuando se usa como página suelta. */
  params?: unknown;
  /** Dentro de la suite /estudio: sin el marco de la app. */
  incrustado?: boolean;
  /** Producto elegido en la suite (compartido con creativos y diseños). */
  producto?: number | "";
  onProducto?: (id: number | "") => void;
  onContexto?: (c: ContextoLanding) => void;
  /** Un diseño elegido en la galería: se aplica o se crea la landing. */
  pedidoDiseno?: { plantilla: string; n: number } | null;
}

export default function LandingStudioV2(props: PropsLandingStudio = {}) {
  const [products, setProducts] = useState<Product[]>([]);
  const [landings, setLandings] = useState<Landing[]>([]);
  const [productId, setProductIdLocal] = useState<number | "">(props.producto ?? "");
  const setProductId = (v: number | "") => { setProductIdLocal(v); props.onProducto?.(v); };
  // El producto de la suite manda: si cambia allá, cambia acá.
  useEffect(() => { if (props.producto !== undefined && props.producto !== productId) setProductIdLocal(props.producto); }, [props.producto]); // eslint-disable-line react-hooks/exhaustive-deps
  const [landingId, setLandingId] = useState<number | null>(null);
  // "": Automática (el servidor sugiere por el producto). Con plantilla
  // elegida, Generar usa SÍ O SÍ ese diseño (estilo COD o familia v3).
  const [plantilla, setPlantilla] = useState<Plantilla>("");
  const [previewMode, setPreviewMode] = useState<"desktop" | "tablet" | "mobile">("desktop");
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
  const [modoPanel, setModoPanel] = useState<"chat" | "bloques" | "tema" | "pedido">("chat");
  const [msgs, setMsgs] = useState<Msg[]>([{ role: "assistant", content: SALUDO }]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  // Sube en cada carga: el mismo HTML dos veces también tiene que volver a
  // escribirse en el iframe (p. ej. tras guardar sin cambios visibles).
  const [versionPreview, setVersionPreview] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [productsErr, setProductsErr] = useState<string | null>(null);
  const cargarProductos = useCallback(async () => {
    setProductsErr(null);
    try {
      const p = await apiFetch<Product[]>("/api/products");
      setProducts(Array.isArray(p) ? p : []);
    } catch (e: any) {
      setProductsErr(e?.message || "No se pudieron cargar los productos");
    }
  }, []);
  useEffect(() => {
    cargarProductos();
    apiFetch<Landing[]>("/api/landing-pages").then(setLandings).catch(() => {});
  }, [cargarProductos]);

  // ── Dropi en el generador ────────────────────────────────────────────────
  // Los productos del proveedor (Dropi) también aparecen acá: se buscan por
  // nombre vía API y se importan en un clic, sin salir del Studio. Después de
  // importar, el producto queda en el catálogo y se selecciona solo.
  const [dropiAbierto, setDropiAbierto] = useState(false);
  const [dropiQ, setDropiQ] = useState("");
  const [dropiBuscando, setDropiBuscando] = useState(false);
  const [dropiItems, setDropiItems] = useState<any[]>([]);
  const [dropiErr, setDropiErr] = useState<string | null>(null);
  const [dropiImportando, setDropiImportando] = useState<number | null>(null);

  const buscarDropi = useCallback(async () => {
    const q = dropiQ.trim();
    if (!q) { setDropiErr("Escribí qué buscar en Dropi"); return; }
    setDropiBuscando(true); setDropiErr(null); setDropiItems([]);
    try {
      const r = await apiFetch<any>(`/api/dropi/buscar?q=${encodeURIComponent(q)}`);
      if (!r.ok) { setDropiErr(r.error || "Dropi no respondió"); return; }
      setDropiItems(r.productos || []);
      if (!(r.productos || []).length) setDropiErr("No hay resultados (o ya están todos importados).");
    } catch (e: any) { setDropiErr(e?.message || "No se pudo buscar en Dropi"); }
    finally { setDropiBuscando(false); }
  }, [dropiQ]);

  const importarDropi = useCallback(async (dropiProductId: number) => {
    setDropiImportando(dropiProductId); setDropiErr(null);
    try {
      const r = await apiFetch<any>("/api/dropi/importar", { method: "POST", body: JSON.stringify({ dropiProductId, curar: true }) });
      const res = r?.resultados?.[0];
      if (res?.ok && res?.productId) {
        await cargarProductos();
        setProductId(res.productId);
        setDropiAbierto(false);
        setDropiQ(""); setDropiItems([]);
        toast.success(res.yaExistia ? "Producto ya estaba en tu catálogo — seleccionado." : "Producto importado y seleccionado.");
      } else {
        setDropiErr(res?.error || r?.error || "No se pudo importar");
      }
    } catch (e: any) { setDropiErr(e?.message || "No se pudo importar"); }
    finally { setDropiImportando(null); }
  }, [cargarProductos]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const doc = iframe.contentDocument;
    if (!doc) return;
    if (previewHtml) {
      // Recargar no te manda arriba de todo: se vuelve a donde estabas.
      const y = iframe.contentWindow?.scrollY || 0;
      doc.open(); doc.write(previewHtml); doc.close();
      const volver = () => { try { iframe.contentWindow?.scrollTo(0, y); } catch { /* sin acceso */ } };
      setTimeout(volver, 30); setTimeout(volver, 350);
      setDocVersion((v) => v + 1);
    } else {
      doc.open();
      doc.write(`<!doctype html><html><body style="display:flex;align-items:center;justify-content:center;min-height:100vh;font-family:system-ui,sans-serif;color:#64748b;background:#0f172a;margin:0;flex-direction:column;gap:16px;text-align:center;padding:40px"><svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="1.2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg><p style="font-size:16px;max-width:300px">Selecciona un producto y presiona <strong style="color:#a5b4fc">Generar</strong></p></body></html>`);
      doc.close();
    }
  }, [previewHtml, versionPreview]);

  const cargarPreview = useCallback(async (id: number, fam?: string) => {
    setPreviewBusy(true);
    try {
      const r = await fetch(`/api/landing-pages/${id}/render?familia=${soloFamilia(fam) || soloFamilia(plantilla)}`, { credentials: "include" });
      if (!r.ok) throw new Error("Error al renderizar");
      setPreviewHtml(await r.text());
      setVersionPreview((v) => v + 1);
    } catch { toast.error("No se pudo cargar la preview"); }
    finally { setPreviewBusy(false); }
  }, [plantilla]);

  // ── Secciones con historial (deshacer / rehacer) ─────────────────────────
  // Viven acá y no en el panel de bloques porque la vista previa también las
  // edita (doble clic sobre un título). Una sola fuente, dos manos.
  const [secciones, setSecciones] = useState<Seccion[]>([]);
  const [seccionesGuardadas, setSeccionesGuardadas] = useState("[]");
  const [cargandoSecciones, setCargandoSecciones] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [iaOcupada, setIaOcupada] = useState(false);
  const [seleccion, setSeleccion] = useState<string | null>(null);
  const pasado = useRef<Seccion[][]>([]);
  const futuro = useRef<Seccion[][]>([]);
  const [, setTicHistorial] = useState(0);
  const seccionesRef = useRef<Seccion[]>([]);
  seccionesRef.current = secciones;
  const hayCambios = JSON.stringify(secciones) !== seccionesGuardadas;

  // Tema (design.retoque) y diseño completo de la landing abierta.
  const [disenoActual, setDisenoActual] = useState<any>({});
  const [retoque, setRetoque] = useState<Retoque>({});
  const [retoqueGuardado, setRetoqueGuardado] = useState("{}");
  const hayCambiosTema = JSON.stringify(normalizarRetoque(retoque) || {}) !== retoqueGuardado;
  const [fotosProducto, setFotosProducto] = useState<string[]>([]);
  const [colorProducto, setColorProducto] = useState<string | null>(null);
  const [docVersion, setDocVersion] = useState(0);

  const cambiarSecciones = useCallback((nuevas: Seccion[]) => {
    pasado.current.push(seccionesRef.current);
    if (pasado.current.length > 100) pasado.current.shift();
    futuro.current = [];
    setSecciones(nuevas);
    setTicHistorial((t) => t + 1);
  }, []);
  const deshacer = useCallback(() => {
    const prev = pasado.current.pop();
    if (!prev) return;
    futuro.current.push(seccionesRef.current);
    setSecciones(prev);
    setTicHistorial((t) => t + 1);
  }, []);
  const rehacer = useCallback(() => {
    const sig = futuro.current.pop();
    if (!sig) return;
    pasado.current.push(seccionesRef.current);
    setSecciones(sig);
    setTicHistorial((t) => t + 1);
  }, []);

  /** Trae secciones + diseño de la base. `conservarHistorial`: tras un cambio de la IA, se puede deshacer. */
  const cargarSecciones = useCallback(async (id: number, conservarHistorial = false) => {
    setCargandoSecciones(!conservarHistorial);
    try {
      const l = await apiFetch<any>(`/api/landing-pages/${id}`);
      const lista: Seccion[] = Array.isArray(l?.sections) ? l.sections.filter(Boolean).map((s: any, i: number) => ({ ...s, id: String(s.id || `${s.type || "sec"}-${i}`) })) : [];
      if (conservarHistorial) { pasado.current.push(seccionesRef.current); futuro.current = []; }
      else { pasado.current = []; futuro.current = []; }
      setSecciones(lista);
      setSeccionesGuardadas(JSON.stringify(lista));
      const d = (l?.design && typeof l.design === "object") ? l.design : {};
      setDisenoActual(d);
      const r = normalizarRetoque(d.retoque) || {};
      setRetoque(r);
      setRetoqueGuardado(JSON.stringify(r));
      setLandings((ls) => ls.map((x) => (x.id === id ? { ...x, design: d, sections: lista, source: l?.source ?? (x as any).source } : x)));
      setTicHistorial((t) => t + 1);
    } catch { toast.error("No se pudieron cargar los bloques"); }
    finally { setCargandoSecciones(false); }
  }, []);

  useEffect(() => {
    if (landingId) void cargarSecciones(landingId);
    else { setSecciones([]); setSeccionesGuardadas("[]"); setRetoque({}); setRetoqueGuardado("{}"); setDisenoActual({}); }
    setSeleccion(null);
  }, [landingId, cargarSecciones]);

  // Fotos reales y color del producto: para elegir foto por bloque y sugerir colores.
  useEffect(() => {
    if (typeof productId !== "number") { setFotosProducto([]); setColorProducto(null); return; }
    apiFetch<any>(`/api/creativos/producto/${productId}`)
      .then((d) => { setFotosProducto(d?.datos?.fotos || []); setColorProducto(d?.datos?.acento || null); })
      .catch(() => { setFotosProducto([]); setColorProducto(null); });
  }, [productId]);

  const guardarSecciones = useCallback(async (): Promise<boolean> => {
    if (!landingId) return false;
    setGuardando(true);
    try {
      const actual = seccionesRef.current;
      const r = await apiFetch<any>(`/api/landing-pages/${landingId}`, { method: "PATCH", body: JSON.stringify({ sections: actual }) });
      const guardadas: Seccion[] = Array.isArray(r?.sections) ? r.sections : actual;
      // El servidor descarta bloques vacíos (sin título, texto ni foto): se avisa.
      const descartados = actual.length - guardadas.length;
      setSecciones(guardadas);
      setSeccionesGuardadas(JSON.stringify(guardadas));
      if (descartados > 0) toast.info(`${descartados} bloque(s) vacío(s) no se guardaron: escribiles algo o pedíselos a la IA.`);
      else toast.success("Cambios guardados");
      await cargarPreview(landingId);
      return true;
    } catch (e: any) { toast.error(`No se pudo guardar: ${e.message}`); return false; }
    finally { setGuardando(false); }
  }, [landingId, cargarPreview]);

  const guardarTema = useCallback(async () => {
    if (!landingId) return;
    setGuardando(true);
    try {
      const design = { ...disenoActual, retoque: normalizarRetoque(retoque) };
      await apiFetch(`/api/landing-pages/${landingId}`, { method: "PATCH", body: JSON.stringify({ design }) });
      setDisenoActual(design);
      setRetoqueGuardado(JSON.stringify(design.retoque || {}));
      setLandings((ls) => ls.map((x) => (x.id === landingId ? { ...x, design } : x)));
      toast.success("Tema guardado: ya se ve así en la página publicada.");
      await cargarPreview(landingId);
    } catch (e: any) { toast.error(`No se pudo guardar el tema: ${e.message}`); }
    finally { setGuardando(false); }
  }, [landingId, disenoActual, retoque, cargarPreview]);

  /** La IA cambia un bloque (o la página). Antes guarda lo pendiente para no pisarlo. */
  const pedirIA = useCallback(async (instruccion: string, sectionId: string | null) => {
    if (!landingId) return;
    if (hayCambios && !(await guardarSecciones())) return;
    setIaOcupada(true);
    try {
      const r = await apiFetch<any>(`/api/landing-pages/${landingId}/command`, { method: "POST", body: JSON.stringify({ instruction: instruccion, selectedSectionId: sectionId }) });
      toast.success(r?.message || "Listo");
      await cargarSecciones(landingId, true);
      await cargarPreview(landingId);
    } catch (e: any) { toast.error(e?.message || "La IA no pudo aplicar el cambio"); }
    finally { setIaOcupada(false); }
  }, [landingId, hayCambios, guardarSecciones, cargarSecciones, cargarPreview]);

  const subirImagen = useCallback(async (archivo: File): Promise<string | null> => {
    if (archivo.size > 8 * 1024 * 1024) { toast.error("La imagen pesa más de 8 MB"); return null; }
    const dataUrl = await new Promise<string>((ok, mal) => { const fr = new FileReader(); fr.onload = () => ok(String(fr.result)); fr.onerror = mal; fr.readAsDataURL(archivo); });
    try { const r = await apiFetch<any>("/api/creativos/subir-imagen", { method: "POST", body: JSON.stringify({ dataUrl, nombre: archivo.name }) }); return r.url; }
    catch (e: any) { toast.error(e?.message || "No se pudo subir"); return null; }
  }, []);

  // ── Puente con la vista previa ───────────────────────────────────────────
  const manejadores = useRef({
    onSeleccionar: (_id: string) => {},
    onEditar: (_id: string, _c: CampoEditable, _v: string) => {},
  });
  manejadores.current.onSeleccionar = (id: string) => { setSeleccion(id); setModoPanel("bloques"); };
  manejadores.current.onEditar = (id: string, campo: CampoEditable, valor: string) => {
    cambiarSecciones(seccionesRef.current.map((s) => (s.id === id ? { ...s, [campo]: valor } : s)));
  };
  // Se conecta una vez por documento cargado.
  useEffect(() => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc || !previewHtml || !landingId) return;
    return conectarEdicion(doc, seccionesRef.current, {
      onSeleccionar: (id) => manejadores.current.onSeleccionar(id),
      onEditar: (id, c, v) => manejadores.current.onEditar(id, c, v),
    });
  }, [docVersion, landingId, previewHtml]);
  // Lo que se escribe en el panel se ve ya en la vista previa (títulos y botones).
  useEffect(() => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc?.body) return;
    const porId = new Map(secciones.map((s) => [s.id, s]));
    doc.querySelectorAll<HTMLElement>("[data-vp-sec][data-vp-campo]").forEach((el) => {
      const s = porId.get(el.dataset.vpSec || "");
      const v = s ? String((s as any)[el.dataset.vpCampo || ""] ?? "") : "";
      if (s && v && !el.hasAttribute("contenteditable") && el.textContent !== v) el.textContent = v;
    });
    etiquetar(doc, secciones);
    marcarSeleccion(doc, seleccion);
  }, [secciones, docVersion]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { marcarSeleccion(iframeRef.current?.contentDocument, seleccion, true); }, [seleccion]);
  // El tema se ve al instante, con la MISMA función que usa el servidor.
  useEffect(() => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc?.head || !landingId || !previewHtml) return;
    const viejo = doc.getElementById("vp-retoque");
    const linkViejo = viejo?.previousElementSibling;
    if (linkViejo && linkViejo.matches('link[href*="fonts.googleapis"]')) linkViejo.remove();
    viejo?.remove();
    const tmp = doc.createElement("div");
    tmp.innerHTML = aplicarRetoque("<head></head>", retoque).replace(/<\/?head>/g, "");
    Array.from(tmp.children).forEach((n) => doc.head.appendChild(n));
  }, [retoque, docVersion, landingId, previewHtml]);

  // ── Suite: contar qué está abierto, recargar cuando Atlas cambió algo ────
  useEffect(() => {
    const l = landings.find((x) => x.id === landingId);
    props.onContexto?.({
      productId: typeof productId === "number" ? productId : null,
      productoNombre: products.find((p) => p.id === productId)?.name || null,
      landing: l ? { id: l.id, nombre: l.name, publicada: (l as any).status === "published" } : null,
      secciones,
      retoque: normalizarRetoque(retoque),
      plantilla,
    });
  }, [productId, landingId, landings, products, seccionesGuardadas, retoqueGuardado, plantilla]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const refrescar = () => {
      apiFetch<Landing[]>("/api/landing-pages").then(setLandings).catch(() => {});
      if (landingId) { void cargarSecciones(landingId, true); void cargarPreview(landingId); }
    };
    window.addEventListener("estudio:refrescar", refrescar);
    return () => window.removeEventListener("estudio:refrescar", refrescar);
  }, [landingId, cargarSecciones, cargarPreview]);

  const ultimoPedido = useRef(0);
  useEffect(() => {
    const p = props.pedidoDiseno;
    if (!p || p.n === ultimoPedido.current) return;
    ultimoPedido.current = p.n;
    if (landingId) { void cambiarPlantilla(p.plantilla as Plantilla); toast.success("Diseño aplicado: tus textos quedan igual."); }
    else if (typeof productId === "number" && p.plantilla === PREMIUM) { setPlantilla(PREMIUM); void crearPremium(productId); }
    else if (typeof productId === "number") { setPlantilla(p.plantilla as Plantilla); void enviar("Genera una landing page para este producto", { nueva: true }); }
    else toast.info("Elegí un producto para crear la landing.");
  }, [props.pedidoDiseno]); // eslint-disable-line react-hooks/exhaustive-deps

  // Atajos: Ctrl+Z, Ctrl+Shift+Z / Ctrl+Y, Ctrl+S.
  useEffect(() => {
    const alTecla = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const enCampo = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement)?.tagName || "");
      const k = e.key.toLowerCase();
      if (k === "s") { e.preventDefault(); if (hayCambios) void guardarSecciones(); else if (hayCambiosTema) void guardarTema(); return; }
      if (enCampo) return;
      if (k === "z" && !e.shiftKey) { e.preventDefault(); deshacer(); }
      else if ((k === "z" && e.shiftKey) || k === "y") { e.preventDefault(); rehacer(); }
    };
    window.addEventListener("keydown", alTecla);
    return () => window.removeEventListener("keydown", alTecla);
  }, [hayCambios, hayCambiosTema, guardarSecciones, guardarTema, deshacer, rehacer]);

  // Cambios sin guardar: el navegador avisa antes de cerrar la pestaña.
  useEffect(() => {
    if (!hayCambios && !hayCambiosTema) return;
    const avisar = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", avisar);
    return () => window.removeEventListener("beforeunload", avisar);
  }, [hayCambios, hayCambiosTema]);

  const enviar = useCallback(async (textoDirecto?: string, opciones?: { nueva?: boolean }) => {
    // ⚠️ El botón "Generar" hacía setInput(...) y llamaba a enviar() 100 ms
    // después: enviar era la versión de ANTES del setInput, leía el input
    // vacío y salía sin hacer nada (o mandaba lo que hubiera escrito). Ahora
    // el texto se pasa directo.
    const text = (textoDirecto ?? input).trim();
    if (!text || busy) return;
    if (textoDirecto === undefined) setInput("");

    setMsgs(m => [...m, { role: "user", content: text }]);

    const pid = typeof productId === "number" ? productId : null;
    if (!pid && !landingId) {
      setMsgs(m => [...m, { role: "assistant", content: "Selecciona primero un **producto** en el selector de arriba." }]);
      inputRef.current?.focus();
      return;
    }

    setBusy(true);
    const esNueva = opciones?.nueva ?? /^(genera|crea|construye|haz una landing|nueva landing)/i.test(text);
    setMsgs(m => [...m, { role: "assistant", content: esNueva ? "El agente de landings está generando la página con los datos reales del producto... 30-90 segundos." : "El agente está aplicando el cambio (recuerda lo que ya pediste antes)...", loading: true }]);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 180000);
      const r = await fetch("/api/landing-studio/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, landingId: esNueva ? undefined : landingId, productId: pid, plantilla: plantilla || null }),
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
      void cargarSecciones(data.landingId);
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
  }, [input, busy, productId, landingId, plantilla, cargarSecciones]);

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
      setPlantilla(plantillaDeDesign(nueva.design));
      await cargarPreview(nueva.id, (nueva.design as any)?.familia as Familia);
      toast.success(r.modo === "estilo" ? "Estilo clonado para el otro producto (borrador)." : "Copia creada (borrador).");
      setMsgs(m => [...m, { role: "assistant", content: r.modo === "estilo"
        ? `**Estilo clonado.** Nueva landing **"${nueva.name}"** en borrador, con el mismo diseño y el contenido del producto elegido. ¿Qué ajustamos?`
        : `**Copia creada.** Estás editando **"${nueva.name}"** (borrador). La original sigue igual.` }]);
    } catch (e: any) { toast.error(`No se pudo clonar: ${e.message}`); }
  }, [landingId, clonarProducto, cargarPreview]);

  // Diseño premium: se crea al instante con los datos de la ficha, sin IA
  // (el servidor arma las secciones de arranque). Después se mejora con el
  // chat o a mano en Bloques.
  const crearPremium = useCallback(async (pid: number) => {
    const prod = products.find((x) => x.id === pid);
    try {
      const nueva = await apiFetch<any>(`/api/landing-pages`, {
        method: "POST",
        body: JSON.stringify({ name: prod?.name || "Nueva landing", productId: pid, design: { renderer: "premium" } }),
      });
      setLandings(ls => [nueva, ...ls]);
      setUrlPublica(null);
      setLandingId(nueva.id);
      setPlantilla(PREMIUM);
      setDisenoActual(nueva.design || { renderer: "premium" });
      await cargarPreview(nueva.id, "");
      toast.success("Página creada con el diseño premium (borrador).");
      setMsgs(m => [...m, { role: "assistant", content: `**Listo.** Armé **"${nueva.name}"** con el diseño premium y los datos reales del producto. Puedes cambiar textos en Bloques o pedirme ajustes aquí.` }]);
    } catch (e: any) { toast.error(`No se pudo crear la página: ${e.message}`); }
  }, [products, cargarPreview]);

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
      void cargarSecciones(landingId);
      setLandings(ls => ls.map(l => l.id === landingId ? { ...l, productId: Number(productId), source: { ...((l as any).source || {}), adaptada: true } } as any : l));
      setMsgs(m => [...m.filter(x => !(x as any).loading), { role: "assistant", content:
        `**Adaptada a tu producto:** ${r.reemplazos} textos reescritos, ${r.imagenes} imágenes reemplazadas, botones apuntando a tu WhatsApp.` +
        (r.advertencias?.length ? `\n\n${r.advertencias.map((a: string) => `• ${a}`).join("\n")}` : "") + `\n\nRevisala y, si te gusta, **Publicar**.` }]);
    } catch (e: any) {
      setMsgs(m => [...m.filter(x => !(x as any).loading), { role: "assistant", content: `No pude adaptarla: ${e.message}` }]);
    } finally { setAdaptando(false); }
  }, [landingId, productId, cargarPreview, cargarSecciones]);

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

  // El render usa la plantilla GUARDADA antes que `?familia=`: si no se guarda,
  // elegir otra sobre una landing ya generada no cambiaba nada (ni la
  // preview ni la publicada). En estilo: guarda {renderer:"estilo", style} y
  // borra familia; en familia v3: la familia y borra renderer/style para que
  // el fork de estilo no gane.
  const cambiarPlantilla = useCallback(async (p: Plantilla) => {
    setPlantilla(p);
    if (!p || !landingId) return;
    const previo = { ...(disenoActual || {}) };
    const esEstilo = p === "estilo" || p.startsWith("estilo:");
    const esPremium = p === PREMIUM;
    const design = esPremium
      ? { ...previo, familia: null, style: null, renderer: "premium" }
      : esEstilo
        ? { ...previo, familia: null, renderer: "estilo", style: p === "estilo" ? null : p.slice(7) }
        : { ...previo, renderer: null, style: null, familia: p };
    try {
      await apiFetch(`/api/landing-pages/${landingId}`, { method: "PATCH", body: JSON.stringify({ design }) });
      setLandings(ls => ls.map(x => x.id === landingId ? { ...x, design } : x));
      setDisenoActual(design);
      await cargarPreview(landingId, esEstilo || esPremium ? "" : p);
    } catch (e: any) { toast.error(`No se pudo cambiar el estilo: ${e.message}`); }
  }, [landingId, disenoActual, cargarPreview]);

  const cargarLanding = useCallback(async (id: number) => {
    const l = landings.find(x => x.id === id);
    if (!l) return;
    if ((hayCambios || hayCambiosTema) && !window.confirm("Tenés cambios sin guardar en esta landing. ¿Salir sin guardarlos?")) return;
    setLandingId(id);
    if (l.productId) setProductId(l.productId);
    const p = plantillaDeDesign(l.design);
    setPlantilla(p);
    setUrlPublica((l as any).status === "published" ? ((l as any).publishedUrl || null) : null);
    await cargarPreview(id, soloFamilia(p));
    setMsgs(m => [...m, { role: "assistant", content: `Landing **"${l.name}"** cargada${(l as any).status === "published" ? ` — publicada en ${(l as any).publishedUrl}` : " (borrador)"}. ¿Qué querés modificar?` }]);
  }, [landings, cargarPreview, hayCambios, hayCambiosTema]);

  return (
    <Marco incrustado={!!props.incrustado}>
      <div className="flex flex-col flex-1 min-h-0">
        <div className="shrink-0 border-b bg-background">
          {/* Fila principal: logo + producto + landing + generar + iconos de acción */}
          <div className="flex items-center gap-2 px-3 pt-2">
            <div className={`items-center gap-2 shrink-0 ${props.incrustado ? "hidden" : "flex"}`}>
              <div className="p-1.5 rounded-lg bg-violet-500/10 border border-violet-500/20">
                <LayoutTemplate className="h-4 w-4 text-violet-500" />
              </div>
              <span className="text-sm font-bold hidden sm:block">Atlas Landing</span>
              <Badge variant="secondary" className="text-[10px] hidden sm:flex">IA</Badge>
            </div>
            <select value={productId} onChange={e => setProductId(e.target.value ? Number(e.target.value) : "")}
              className="h-8 rounded-md border bg-background px-2 text-xs min-w-0 flex-1 sm:flex-none sm:w-[170px]"
              title={productsErr ? "No se pudieron cargar los productos. Tocá para reintentar." : undefined}>
              <option value="">{productsErr ? "Error al cargar productos…" : "Producto..."}</option>
              {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <select value={landingId || ""} onChange={e => e.target.value && cargarLanding(Number(e.target.value))}
              className="h-8 rounded-md border bg-background px-2 text-xs min-w-0 flex-1 sm:flex-none sm:w-[150px]">
              <option value="">Nueva landing...</option>
              {landings.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            <Button size="sm" disabled={busy || !productId} onClick={() => {
                if (!productId) return;
                if (plantilla === PREMIUM) { void crearPremium(productId as number); return; }
                void enviar("Genera una landing page para este producto", { nueva: true });
              }}
              className="bg-violet-600 hover:bg-violet-700 text-white h-8 px-3 text-xs shrink-0">
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Wand2 className="h-3.5 w-3.5 mr-1" />}
              Generar
            </Button>
            <div className="ml-auto flex items-center gap-1 shrink-0">
              <Button size="sm" variant="ghost" onClick={() => landingId && cargarPreview(landingId)} disabled={!landingId || previewBusy} className="h-8 w-8 p-0"
                title="Actualizar la vista previa" aria-label="Actualizar la vista previa">
                <RefreshCw className={`h-3.5 w-3.5 ${previewBusy ? "animate-spin" : ""}`} />
              </Button>
              <div className="hidden sm:flex items-center rounded-md border p-0.5">
                {([["desktop", Monitor, "Pantalla grande"], ["tablet", Tablet, "Tablet"], ["mobile", Smartphone, "Celular"]] as const).map(([m, Icono, nombre]) => (
                  <button key={m} onClick={() => setPreviewMode(m)} aria-pressed={previewMode === m} title={`Ver en ${nombre.toLowerCase()}`} aria-label={`Ver en ${nombre.toLowerCase()}`}
                    className={`h-7 w-7 grid place-items-center rounded ${previewMode === m ? "bg-muted" : "text-muted-foreground"}`}>
                    <Icono className="h-3.5 w-3.5" />
                  </button>
                ))}
              </div>
              <Button size="sm" variant="ghost" onClick={() => setPreviewMode(m => m === "mobile" ? "desktop" : "mobile")} className="h-8 w-8 p-0 sm:hidden"
                title="Cambiar vista" aria-label="Cambiar vista">
                {previewMode === "mobile" ? <Monitor className="h-3.5 w-3.5" /> : <Smartphone className="h-3.5 w-3.5" />}
              </Button>
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
                  <DropdownMenuItem asChild>
                    <Link href={typeof productId === "number" ? `/creativos?producto=${productId}` : "/creativos"}>
                      <ImageIcon className="h-3.5 w-3.5 mr-2" />Crear creativos para el anuncio
                    </Link>
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
            </div>
          </div>
          {/* Fila de acciones secundarias: scroll horizontal en móvil, no se apilan */}
          <div className="flex items-center gap-1.5 px-3 py-2 overflow-x-auto overflow-y-hidden whitespace-nowrap sm:flex-wrap sm:overflow-visible">
            <Button size="sm" variant="outline" className="h-8 px-2 text-xs shrink-0" onClick={() => setDropiAbierto(true)} title="Buscar e importar un producto de Dropi">
              <LogoMarca marca="dropi" className="h-3.5 w-3.5 mr-1" />Dropi
            </Button>
            {productsErr && (
              <Button size="sm" variant="outline" className="h-8 px-2 text-xs shrink-0" onClick={cargarProductos} title="Reintentar cargar productos">
                <RefreshCw className="h-3.5 w-3.5 mr-1" />Reintentar
              </Button>
            )}
            {urlPublica ? (
              <a href={urlPublica} target="_blank" rel="noreferrer" className="h-8 px-2 inline-flex items-center gap-1 rounded-md border text-xs text-emerald-700 border-emerald-300 bg-emerald-50 hover:bg-emerald-100 max-w-[220px] truncate shrink-0"
                title={`Abrir ${urlPublica}`}>
                <ExternalLink className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{urlPublica.replace(/^https?:\/\//, "")}</span>
              </a>
            ) : (
              <Button size="sm" onClick={publicar} disabled={!landingId} className="h-8 px-3 text-xs bg-emerald-600 hover:bg-emerald-700 text-white shrink-0"
                title="Publicar en ventasproia.com/l/… (la URL para el anuncio)">
                Publicar
              </Button>
            )}
            {urlPublica && (
              <Button size="sm" variant="ghost" onClick={despublicar} className="h-8 px-2 text-xs shrink-0" title="Despublicar: la URL deja de responder">
                <EyeOff className="h-3.5 w-3.5 mr-1" />Despublicar
              </Button>
            )}
            {esCopiaHtml(landingActual) && (
              <Button size="sm" onClick={adaptar} disabled={adaptando || !productId} className="h-8 px-3 text-xs bg-violet-600 hover:bg-violet-700 text-white shrink-0"
                title="Reescribir textos, fotos y botones para el producto elegido">
                {adaptando ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Wand2 className="h-3.5 w-3.5 mr-1" />}Adaptar al producto
              </Button>
            )}
          </div>
          {urlAbierto && (
            <div className="flex items-center gap-1 px-3 pb-2">
              <Input autoFocus value={urlClonar} onChange={e => setUrlClonar(e.target.value)} placeholder="Pegá la URL de la landing a clonar (HTML + CSS)…" className="h-8 text-xs flex-1"
                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); clonarDesdeUrl(); } if (e.key === "Escape") setUrlAbierto(false); }} />
              <Button size="sm" className="h-8 px-3 text-xs" onClick={clonarDesdeUrl} disabled={!urlClonar.trim()}>Clonar</Button>
              <Button size="sm" variant="ghost" className="h-8 px-2 text-xs" onClick={() => setUrlAbierto(false)}>Cancelar</Button>
            </div>
          )}
        </div>
        {dropiAbierto && (
          <div className="fixed inset-0 z-30 flex items-start justify-center bg-black/30 p-4 pt-[10vh]" onClick={() => setDropiAbierto(false)}>
            <div className="w-full max-w-md rounded-lg border bg-background p-4 shadow-xl space-y-3" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">Importar producto de Dropi</p>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setDropiAbierto(false)}>×</Button>
              </div>
              <div className="flex gap-2">
                <Input autoFocus value={dropiQ} onChange={e => setDropiQ(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); buscarDropi(); } }} placeholder="Buscar por nombre en Dropi…" className="h-8 text-xs flex-1" />
                <Button size="sm" onClick={buscarDropi} disabled={dropiBuscando || !dropiQ.trim()} className="h-8 px-3 text-xs">
                  {dropiBuscando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Buscar"}
                </Button>
              </div>
              {dropiErr && <p className="text-xs text-red-600">{dropiErr}</p>}
              {dropiItems.length > 0 && (
                <div className="space-y-1 max-h-[50vh] overflow-y-auto">
                  {dropiItems.map((p) => (
                    <div key={p.id} className="flex items-center gap-2 rounded-md border p-2">
                      {p.foto ? <img src={p.foto} alt="" className="h-9 w-9 rounded object-cover shrink-0" /> : <div className="h-9 w-9 rounded bg-muted shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{p.nombre}</p>
                        <p className="text-[10px] text-muted-foreground">{p.categoria || "—"} · {p.precioSugerido ? `$${Number(p.precioSugerido).toLocaleString("es-CO")}` : "s/p"} {p.importadoComo ? "· ya importado" : ""}</p>
                      </div>
                      <Button size="sm" className="h-7 px-2 text-[11px]" onClick={() => importarDropi(p.id)} disabled={dropiImportando !== null}>
                        {dropiImportando === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : (p.importadoComo ? "Usar" : "Importar")}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
        {clonarAbierto && (
          <div className="fixed inset-0 z-30 flex items-start justify-center bg-black/30 p-4 pt-[10vh]" onClick={() => setClonarAbierto(false)}>
            <div className="w-full max-w-sm rounded-lg border bg-background p-4 shadow-xl space-y-2" onClick={e => e.stopPropagation()}>
              <p className="text-sm font-semibold">Clonar esta landing</p>
              <p className="text-xs text-muted-foreground">Sin producto: copia exacta. Con otro producto: mismo estilo, contenido nuevo.</p>
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
          </div>
        )}
        {/* El selector de panel, SOLO en pantalla chica (lg:hidden). En
            escritorio los dos se ven a la vez y este control estorbaría. */}
        <div className="flex lg:hidden shrink-0 border-b bg-muted/30 p-1 gap-1">
          {([["chat", props.incrustado ? "🛠️ Editar" : "💬 Chat"], ["preview", "👁️ Vista previa"]] as const).map(([valor, etiqueta]) => (
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

        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Ancho completo en móvil; los 340px fijos recién a partir de lg.
              El `hidden` es lo que evita que los dos paneles se repartan una
              pantalla donde no entran. */}
          <div
            className={`flex-col border-r bg-background w-full min-h-0 lg:w-[340px] xl:w-[400px] lg:min-w-[280px] lg:flex ${
              panelMovil === "chat" ? "flex" : "hidden"
            }`}
          >
            <div className="px-3 py-2 border-b bg-muted/20 shrink-0 flex items-center gap-2">
              <span className="text-[11px] font-medium text-muted-foreground shrink-0">Modelo</span>
              <span className="h-3 w-3 rounded-full shrink-0 border" style={{ backgroundColor: plantilla.startsWith("estilo") ? (COLOR_ESTILO[plantilla.slice(7) || "cleanhome"] || "#08783A") : (FAMILIAS.find(f => f.value === plantilla)?.color || "#8B5CF6") }} />
              <select value={plantilla} onChange={e => {
                  const v = e.target.value as Plantilla;
                  if (!v || !landingId) { setPlantilla(v); return; }
                  void cambiarPlantilla(v);
                }} disabled={busy || previewBusy}
                className="h-7 flex-1 rounded-md border bg-background px-2 text-xs" title="Manda en Generar y en la publicada: cada modelo es una maquetación distinta">
                <option value="">✨ Automático (según el producto)</option>
                <option value={PREMIUM}>Premium VentasPro (físico, digital o servicio)</option>
                <optgroup label="Modelos COD (product page validada)">
                  {VARIANTES_ESTILO.map(v => <option key={v.value} value={v.value}>{v.label}</option>)}
                </optgroup>
                <optgroup label="Familias (renderer v3)">
                  {FAMILIAS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                </optgroup>
              </select>
            </div>
            <div className="flex shrink-0 border-b bg-muted/20 p-1 gap-1">
              {([["chat", props.incrustado ? "✨ Generar" : "💬 Chat"], ["bloques", "🧱 Bloques"], ["tema", "🎨 Tema"], ["pedido", "🛒 Pedido"]] as const).map(([valor, etiqueta]) => (
                <button key={valor} onClick={() => setModoPanel(valor)} aria-pressed={modoPanel === valor}
                  className={`flex-1 h-7 rounded-md text-[11px] font-semibold transition-colors ${modoPanel === valor ? "bg-background shadow-sm" : "text-muted-foreground"}`}>
                  {etiqueta}
                </button>
              ))}
            </div>
            {(() => {
              // Landing de Landing Forge: su contenido vive alla. El chat y los
              // bloques de VentasPro no la pueden editar (salian vacios y al
              // guardar fallaban). Se abre su editor con la sesion del dueno.
              const actual = landings.find((l) => l.id === landingId);
              const forgeId = actual?.source?.type === "landingforge" ? (actual?.source?.landingId || actual?.strategy?.landingId) : null;
              if (!forgeId) return null;
              return (
                <div className="m-3 rounded-xl border bg-violet-50/60 p-4 text-xs leading-relaxed">
                  <p className="font-semibold text-slate-900 mb-1">Esta landing se edita en Landing Forge</p>
                  <p className="text-slate-600 mb-3">Fue creada con el generador nuevo: sus textos, fotos y bloques se cambian en su propio editor (o pidiéndoselo a Atlas).</p>
                  <a
                    href={`/api/landing-forge/entrar?next=${encodeURIComponent(`/editor/${forgeId}`)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-8 items-center rounded-md bg-violet-600 px-3 font-semibold text-white hover:bg-violet-700"
                  >
                    Abrir en el editor de Landing Forge
                  </a>
                </div>
              );
            })() ?? (modoPanel === "bloques" ? (
              <BloquesEditor
                landingId={landingId}
                secciones={secciones}
                onCambiar={cambiarSecciones}
                seleccion={seleccion}
                onSeleccionar={setSeleccion}
                fotos={fotosProducto}
                ocupado={iaOcupada || busy}
                cargando={cargandoSecciones}
                onIA={pedirIA}
                onSubirImagen={subirImagen}
              />
            ) : modoPanel === "tema" ? (
              landingId ? (
                <TemaPanel
                  retoque={retoque}
                  onCambiar={setRetoque}
                  onGuardar={guardarTema}
                  guardando={guardando}
                  hayCambios={hayCambiosTema}
                  admite={!esCopiaHtml(landingActual) && !(landingActual as any)?.html}
                  sugeridos={colorProducto ? [colorProducto] : []}
                />
              ) : <div className="p-4 text-xs text-muted-foreground">Generá o elegí una landing para cambiarle el tema.</div>
            ) : modoPanel === "pedido" ? (
              landingId ? (
                <PedidoPanel
                  landingId={landingId}
                  design={disenoActual}
                  productos={products}
                  productoDeLanding={landingActual?.productId ?? null}
                  onGuardado={(design) => {
                    setDisenoActual(design);
                    setLandings((ls) => ls.map((x) => (x.id === landingId ? { ...x, design } : x)));
                  }}
                />
              ) : <div className="p-4 text-xs text-muted-foreground">Generá o elegí una landing para configurar su formulario de pedido.</div>
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
                <Button size="sm" onClick={() => enviar()} disabled={busy || !input.trim()}
                  className="h-8 w-8 p-0 bg-violet-600 hover:bg-violet-700 text-white shrink-0">
                  {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                </Button>
              </div>
            </div>
            </>))}
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
                {landingId ? `/api/landing-pages/${landingId}/render` : "preview - genera una landing para comenzar"}
              </div>
              {landingId && (
                <div className="flex items-center gap-0.5 shrink-0">
                  <button onClick={deshacer} disabled={!pasado.current.length} title="Deshacer (Ctrl+Z)" aria-label="Deshacer" className="h-7 w-7 grid place-items-center rounded text-slate-300 hover:bg-slate-800 disabled:opacity-30"><Undo2 className="h-3.5 w-3.5" /></button>
                  <button onClick={rehacer} disabled={!futuro.current.length} title="Rehacer (Ctrl+Shift+Z)" aria-label="Rehacer" className="h-7 w-7 grid place-items-center rounded text-slate-300 hover:bg-slate-800 disabled:opacity-30"><Redo2 className="h-3.5 w-3.5" /></button>
                  {hayCambios ? (
                    <button onClick={() => void guardarSecciones()} disabled={guardando} title="Guardar (Ctrl+S)"
                      className="h-7 px-2 inline-flex items-center gap-1 rounded bg-amber-500 text-slate-950 text-[11px] font-semibold hover:bg-amber-400 disabled:opacity-60">
                      {guardando ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />} Guardar y ver
                    </button>
                  ) : (
                    <span className="text-[10px] text-slate-500 px-1">{iaOcupada ? "La IA está trabajando…" : "Todo guardado"}</span>
                  )}
                </div>
              )}
              <Badge variant="outline" className="text-[10px] border-slate-700 text-slate-400 hidden sm:flex">
                {plantilla.startsWith("estilo") ? (plantilla === "estilo" ? "Modelo COD (IA elige)" : `Modelo: ${plantilla.slice(7)}`) : (FAMILIAS.find(f => f.value === plantilla)?.label) || "Automático"}
              </Badge>
            </div>
            <div className={`flex-1 min-h-0 overflow-auto flex ${previewMode !== "desktop" ? "items-start justify-center py-8" : ""}`}>
              {/* El marco de teléfono medía 390px EXACTOS -- justo el ancho de
                  un teléfono real, así que dentro de uno se salía de la
                  pantalla junto con sus 8px de borde. `w-full max-w-[390px]`
                  lo deja igual en escritorio y lo hace caber en el celular. */}
              <div className={`relative transition-all ${previewMode === "mobile" ? "w-full max-w-[390px] rounded-[40px] overflow-hidden border-8 border-slate-700 shadow-2xl" : previewMode === "tablet" ? "w-full max-w-[820px] rounded-[28px] overflow-hidden border-[10px] border-slate-700 shadow-2xl" : "w-full h-full"}`}>
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
                      : previewMode === "tablet"
                        ? "h-[75vh] max-h-[1100px]"
                        : "h-full min-h-[420px]"
                  }`}
                  sandbox="allow-same-origin allow-scripts" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </Marco>
  );
}

/** Con la app alrededor, o sola dentro de la suite del Estudio. */
function Marco({ incrustado, children }: { incrustado: boolean; children: React.ReactNode }) {
  return incrustado ? <div className="flex flex-col flex-1 min-h-0 h-full">{children}</div> : <Layout chatCompleto>{children}</Layout>;
}
