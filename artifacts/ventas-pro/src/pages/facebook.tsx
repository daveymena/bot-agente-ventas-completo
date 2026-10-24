import { CampaignWorkbench, type CampaignBrief } from "@/components/marketing/campaign-workbench";
import { useState, useEffect } from "react";
import { SecretInput } from "@/components/ui/secret-input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, CheckCircle2, XCircle, RefreshCw, Megaphone, Package, Target, MapPin, Settings2, MessageCircle, MessageSquare, Radio, Globe, FileText, Trash2, Play, Pencil, BarChart3 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Layout } from "@/components/layout";
import { HelpTourButton } from "@/components/HelpTourButton";
import { useAutoTour } from "@/hooks/use-auto-tour";
import { getHelpGuide } from "@/data/help-guides";
import { describeError } from "@/lib/utils";
import { urlLoginFacebook } from "@/lib/facebook-login";
import { LogoMarca } from "@/components/logo-marca";
import { DatoSensibleInput, ValorOculto } from "@/components/ui/dato-sensible";

const HELP_GUIDE = getHelpGuide("facebook")!;

const apiRequest = async (endpoint: string, options: RequestInit = {}) => {
  const response = await fetch(`/api${endpoint}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
    credentials: "include",
  });
  if (!response.ok) {
    // El servidor no siempre responde JSON: un 502/504 del proxy devuelve HTML,
    // y `response.json()` explota → antes se mostraba "Error desconocido" para
    // TODO, ocultando la causa real (timeout del proxy, endpoint caído, etc.).
    // Ahora se lee como texto y solo se intenta parsear si de verdad es JSON.
    const raw = await response.text().catch(() => "");
    let detalle = "";
    try {
      const j = JSON.parse(raw);
      detalle = j.error || j.message || "";
    } catch {
      if (response.status === 502 || response.status === 504) {
        detalle = "el servidor tardó demasiado en responder (timeout del proxy). Suele pasar si Facebook no contesta.";
      } else if (raw.trim().startsWith("<")) {
        detalle = `el servidor respondió HTML en vez de JSON (${response.status}).`;
      } else {
        detalle = raw.slice(0, 200);
      }
    }
    throw new Error(`${response.status} ${response.statusText}${detalle ? " — " + detalle : ""}`);
  }
  return response.json();
};

interface FbConfig {
  accessToken: string;
  pixelId: string;
  catalogId: string;
  pageId: string;
  adAccountId: string;
  hasToken: boolean;
  appId?: string;
  hasAppSecret?: boolean;
  hasMessengerToken?: boolean;
  messengerVerifyToken?: string;
  // El servidor nunca devuelve secretos: solo si existen y sus últimos 4.
  hasMessengerVerifyToken?: boolean;
  messengerVerifyTokenUltimos4?: string;
  accessTokenUltimos4?: string;
  appSecretUltimos4?: string;
  messengerTokenUltimos4?: string;
  loginConfigId?: string;
}

interface Product {
  id: number;
  name: string;
  price: number;
  category: string;
  imageUrl: string | null;
}

interface FbAudience {
  description: string;
  targeting: { ageMin: number; ageMax: number; genders: number[]; geoLocations?: any; interests?: Array<{ id: string; name: string }> };
  rationale: string;
}

interface ChannelStatus {
  channel: string;
  connected: boolean;
  label: string;
  error?: string;
}

interface PageInfo {
  name: string;
  id: string;
  picture?: string;
}

/**
 * El renglón gris bajo la foto: en Meta es el DOMINIO del enlace (o
 * "WhatsApp" en una campaña de mensajes). Antes mostraba las ciudades de la
 * segmentación, que el cliente nunca ve en el anuncio.
 */
function destinoDelAnuncio(objetivo: string): string {
  if (objetivo === "mensajes") return "WHATSAPP";
  try { return window.location.hostname.toUpperCase(); } catch { return "TU PÁGINA"; }
}

/** El texto del botón como lo muestra Meta: depende del OBJETIVO, no solo del ctaType. */
function ctaDelAnuncio(d: DraftAd | null, objetivo: string): string {
  if (objetivo === "mensajes") return "Enviar mensaje";
  const st: any = d?.strategy || {};
  if (st.ctaType === "SIGN_UP") return "Registrarte";
  if (st.ctaType === "CONTACT_US") return "Contactarnos";
  return "Comprar";
}

/** Lo que Meta muestra antes del "Ver más" (≈125 letras o 3 renglones). */
function primeraVista(texto: string): { visible: string; cortado: boolean } {
  const lineas = texto.split("\n");
  let visible = lineas.slice(0, 3).join("\n");
  if (visible.length > 125) visible = visible.slice(0, 125).replace(/\s+\S*$/, "");
  return { visible, cortado: visible.length < texto.trimEnd().length };
}

interface DraftAd {
  id: number;
  productId: number;
  productName: string;
  campaignId: string | null;
  adId: string | null;
  status: string;
  fbStatus: string | null;
  primaryText: string;
  headline: string;
  description: string;
  imageUrl: string | null;
  images: string[] | null;
  niche: string | null;
  budget: number | null;
  /** La estrategia del borrador: ahí viaja la segmentación (interests/edad). */
  strategy?: { ageMin?: number; ageMax?: number; genders?: number[]; interests?: string[]; ciudades?: string[]; city?: string; angle?: string; hook?: string; objetivo?: string; destino?: string } | null;
  /** La rúbrica de anuncio profesional (backend: lib/anuncio-rubrica.ts). */
  calidad?: { puntaje: number; criterios: Array<{ id: string; nombre: string; ok: boolean; detalle: string }> } | null;
  createdAt: string;
}

type Tab = "agent" | "config" | "ads" | "messenger" | "comments" | "channels" | "drafts";

interface AgentLog {
  id: number;
  campaignId: string;
  adSetId: string | null;
  productName: string | null;
  checkType: "spend_protection" | "trend_review";
  status: "suggested" | "approved" | "rejected" | "auto_applied" | "no_action";
  suggestedAction: "pause" | "resume" | "increase_budget" | "decrease_budget" | null;
  reason: string;
  createdAt: string;
  respondedAt: string | null;
}

export default function FacebookAdsPage() {
  useAutoTour(HELP_GUIDE);
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [connected, setConnected] = useState<boolean | null>(null);

  const [config, setConfig] = useState<FbConfig>({
    accessToken: "", pixelId: "", catalogId: "", pageId: "", adAccountId: "", hasToken: false, appId: "", hasAppSecret: false, hasMessengerToken: false, messengerVerifyToken: "", hasMessengerVerifyToken: false, loginConfigId: "",
  });
  const [rawToken, setRawToken] = useState("");
  const [rawAppSecret, setRawAppSecret] = useState("");
  const [rawMessengerToken, setRawMessengerToken] = useState("");
  const [rawVerifyToken, setRawVerifyToken] = useState("");
  // (Mostrar lo escrito lo resuelve SecretInput campo por campo, y solo para
  // el valor NUEVO: lo guardado nunca llega al navegador.)

  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [audience, setAudience] = useState<FbAudience | null>(null);
  const [budget, setBudget] = useState(5000);
  const [city, setCity] = useState("");
  // Segmentación detallada (se resuelve contra Meta en el servidor; el anuncio queda PAUSED).
  const [ageMin, setAgeMin] = useState(18);
  const [ageMax, setAgeMax] = useState(65);
  const [genero, setGenero] = useState<"todos" | "hombres" | "mujeres">("todos");
  const [intereses, setIntereses] = useState("");
  const [audienciasPropias, setAudienciasPropias] = useState("");
  const [audienciasExcluidas, setAudienciasExcluidas] = useState("");
  const [advantagePlus, setAdvantagePlus] = useState(true);
  const [ubicacionesManuales, setUbicacionesManuales] = useState(false);
  const [enFacebook, setEnFacebook] = useState(true);
  const [enInstagram, setEnInstagram] = useState(true);
  const [enMessenger, setEnMessenger] = useState(false);
  const [creating, setCreating] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState<any>(null);

  // "Generar campaña" en un clic: el mismo camino que usa Atlas por chat
  // (POST /api/campana/generar), pero disparado desde acá.
  const [generandoCampana, setGenerandoCampana] = useState(false);
  const [campanaResult, setCampanaResult] = useState<any>(null);
  const [objetivoCampana, setObjetivoCampana] = useState<"ventas" | "trafico" | "mensajes" | "reconocimiento">("ventas");
  const [tab, setTab] = useState<Tab>("config");

  const [pageInfo, setPageInfo] = useState<PageInfo | null>(null);
  const [subscribing, setSubscribing] = useState(false);
  const [channelStatus, setChannelStatus] = useState<ChannelStatus[]>([]);
  const [pollingActive, setPollingActive] = useState(false);

  const [drafts, setDrafts] = useState<DraftAd[]>([]);
  const [loadingDrafts, setLoadingDrafts] = useState(false);
  const [creatingDraft, setCreatingDraft] = useState(false);
  const [creatingAllDrafts, setCreatingAllDrafts] = useState(false);
  const [limpiandoDuplicados, setLimpiandoDuplicados] = useState(false);
  // El catálogo de Meta (el feed diario)
  const [conectandoCatalogo, setConectandoCatalogo] = useState(false);
  const [catalogoEstado, setCatalogoEstado] = useState<{ catalogo?: { catalogId: string; feedId: string; feedUrl?: string; conectado?: string } | null; feedUrl?: string } | null>(null);
  const cargarCatalogoEstado = async () => {
    try {
      const res = await apiRequest("/facebook/catalogo/estado");
      setCatalogoEstado(res);
    } catch { /* sin estado: el botón queda en "Conectar" */ }
  };
  const conectarCatalogo = async () => {
    try {
      setConectandoCatalogo(true);
      const res = await apiRequest("/facebook/catalogo/conectar", { method: "POST" });
      if (res.ok) {
        toast({ title: "Catálogo conectado", description: "Meta descargará los productos en horario DAILY. En ~30 min aparecen en el Administrador de comercio." });
        cargarCatalogoEstado();
      } else {
        toast({ title: "Meta no aceptó el catálogo", description: res.message, variant: "destructive" });
      }
    } catch (e: any) {
      toast({ title: "Error", description: describeError(e, "No se pudo conectar el catálogo."), variant: "destructive" });
    } finally { setConectandoCatalogo(false); }
  };
  const [selectedDraftProduct, setSelectedDraftProduct] = useState<number | null>(null);

  // Métricas en vivo por borrador publicado (gasto, impresiones, clics...)
  // -- ver loadInsights(). Se piden bajo demanda, no todas de una, para no
  // gastar rate limit de Meta si hay muchos borradores en la lista.
  interface DraftInsights { spend: number; impressions: number; clicks: number; ctr: number; results: number; costPerResult: number; reach: number; }
  const [insights, setInsights] = useState<Record<number, DraftInsights | "error">>({});
  const [loadingInsights, setLoadingInsights] = useState<Record<number, boolean>>({});
  const [insightsRange, setInsightsRange] = useState<Record<number, string>>({});

  // Modal de detalle de producto (pestaña Anuncios)
  const [productDetail, setProductDetail] = useState<Product | null>(null);

  // Editor de borrador (modal editable)
  const [editingDraft, setEditingDraft] = useState<DraftAd | null>(null);
  // La segmentación del borrador, editable: se generaba (y la subida a Meta la
  // leía) pero el modal no la mostraba -- para ajustar el público había que
  // pedirle otro borrador a Atlas. Reportado por el dueño (02-10-2026).
  const [editAgeMin, setEditAgeMin] = useState(18);
  const [editAgeMax, setEditAgeMax] = useState(55);
  const [editGenero, setEditGenero] = useState<"todos" | "hombres" | "mujeres">("todos");
  const [editIntereses, setEditIntereses] = useState("");
  const [editCiudades, setEditCiudades] = useState("");
  // El objetivo de la campaña: hoy salía SIEMPRE a WhatsApp (el default del
  // plan por modelo) y el panel no tenía con qué cambiarlo. Con landing
  // publicada la venta va a la landing (ventas/trafico); sin ella, WhatsApp.
  const [editObjetivo, setEditObjetivo] = useState<"ventas" | "trafico" | "mensajes" | "reconocimiento">("mensajes");
  // "Cómo se vería publicado": el mock del anuncio dentro del modal.
  const [verVistaPrevia, setVerVistaPrevia] = useState(false);
  const [editHeadline, setEditHeadline] = useState("");
  const [editPrimaryText, setEditPrimaryText] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editBudget, setEditBudget] = useState<number>(5000);
  const [editImages, setEditImages] = useState<string[]>([]);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);



  const [agentLogs, setAgentLogs] = useState<AgentLog[]>([]);
  const [loadingAgentLogs, setLoadingAgentLogs] = useState(false);
  const [runningAgentNow, setRunningAgentNow] = useState(false);

  // Login real con Facebook (OAuth): antes la única forma de "conectar" era
  // pegar un token a mano en el campo de abajo -- si venía del Explorador de
  // Graph API (lo más común), duraba 1-2 horas y el admin terminaba
  // reconectando todo el tiempo. Este botón hace el login real y el backend
  // (/api/public/fb-connect) canjea el token por uno de página de larga
  // duración que prácticamente no vence.
  const [fbAppConfig, setFbAppConfig] = useState<{ appId: string | null; enabled: boolean }>({ appId: null, enabled: false });
  const [connectingOAuth, setConnectingOAuth] = useState(false);
  const [otherPages, setOtherPages] = useState<Array<{ id: string; name: string }>>([]);

  useEffect(() => {
    loadData();
    apiRequest("/public/fb-app-config").then(setFbAppConfig).catch(() => setFbAppConfig({ appId: null, enabled: false }));
    handleOAuthRedirectIfAny();
  }, []);

  // Estado de canales, derivado de la configuración que ya se cargó.
  //
  // `channelStatus` estaba declarado pero NUNCA se llenaba: no existía una
  // sola llamada a setChannelStatus en toda la página. Como la lista siempre
  // quedaba vacía, la pestaña Canales mostraba "Conecta Facebook primero"
  // incluso con Facebook conectado y funcionando, contradiciendo a la pestaña
  // de al lado que decía "Conexión exitosa".
  useEffect(() => {
    const canales: ChannelStatus[] = [
      {
        channel: "facebook",
        label: "Facebook (página y anuncios)",
        connected: !!config.hasToken && !!config.pageId,
        error: !config.hasToken ? "Falta el token de acceso" : !config.pageId ? "Falta elegir la página" : undefined,
      },
      {
        channel: "messenger",
        label: "Messenger",
        connected: !!config.hasMessengerToken,
        error: config.hasMessengerToken ? undefined : "Falta el token de la página para Messenger",
      },
      {
        channel: "comentarios",
        label: "Comentarios en publicaciones",
        connected: !!config.hasMessengerToken && !!config.hasMessengerVerifyToken,
        error: config.hasMessengerVerifyToken ? undefined : "Falta el verify token del webhook",
      },
      {
        channel: "anuncios",
        label: "Cuenta publicitaria",
        connected: !!config.adAccountId,
        error: config.adAccountId ? undefined : "Falta la cuenta publicitaria",
      },
    ];
    setChannelStatus(canales);
  }, [config.hasToken, config.pageId, config.hasMessengerToken, config.hasMessengerVerifyToken, config.adAccountId]);

  // Facebook redirige de vuelta con ?code=... en la QUERY STRING (nunca en
  // el fragmento) -- Authorization Code flow, no Implicit. Con el flujo
  // anterior (response_type=token) el access_token de verdad viajaba en el
  // fragmento de la URL (#access_token=...) y quedaba visible un instante
  // en la barra de direcciones del navegador; el código de acá es de un
  // solo uso y no sirve sin el App Secret (que nunca sale del servidor), así
  // que no expone nada sensible aunque se vea en la URL o quede en el
  // historial del navegador.
  const handleOAuthRedirectIfAny = async () => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    if (!code) return;
    // Limpiar el ?code= de la URL para no reprocesarlo al recargar.
    window.history.replaceState(null, "", window.location.pathname);
    await connectWithAuthCode(code);
  };

  const connectWithAuthCode = async (code: string, pageId?: string) => {
    try {
      setConnectingOAuth(true);
      const redirectUri = window.location.origin + window.location.pathname;
      // El tenant lo resuelve el backend a partir de la sesión (cookie
      // firmada) -- antes se mandaba un tenantId: 1 fijo acá, así que TODO
      // negocio que conectaba su Facebook terminaba pisando la conexión del
      // dueño de la plataforma en vez de la suya propia.
      const res = await apiRequest("/public/fb-connect", {
        method: "POST",
        body: JSON.stringify({ code, redirectUri, pageId }),
      });
      toast({ title: "Facebook conectado", description: `Página: ${res.page?.name || res.page?.id}${res.canPost ? "" : " (falta el permiso para publicar en el muro)"}` });
      setOtherPages(res.otrasPaginas || []);
      setConnected(true);
      const cfg = await apiRequest("/facebook/config");
      if (cfg) setConfig(cfg);
    } catch (e: any) {
      toast({ title: "Error conectando Facebook", description: describeError(e, "No se pudo conectar con Facebook. Volvé a intentarlo en unos segundos."), variant: "destructive" });
    } finally {
      setConnectingOAuth(false);
    }
  };

  // La app usa "Inicio de sesión con Facebook para empresas" (Facebook Login
  // for Business), que ignora `scope` y exige un `config_id` de una
  // configuración creada en developers.facebook.com → Inicio de sesión con
  // Facebook para empresas → Ajustes (ahí también se registra el redirect
  // URI válido). Confirmado funcionando en producción (ago-2026) con
  // FB_LOGIN_CONFIG_ID configurado. response_type=code (no `token`): el
  // código de un solo uso se canjea del lado del servidor, así el access
  // token real nunca pasa por la URL del navegador.
  // Permisos y config_id en lib/facebook-login.ts (los comparte Integraciones).
  const startFacebookLogin = () => {
    const url = urlLoginFacebook(fbAppConfig, window.location.origin + window.location.pathname);
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  };

  const loadData = async () => {
    try {
      setLoading(true);
      const [cfg, prods] = await Promise.all([
        apiRequest("/facebook/config").catch(() => ({
          accessToken: "", pixelId: "", catalogId: "", pageId: "", adAccountId: "", hasToken: false, appId: "", hasAppSecret: false, hasMessengerToken: false, messengerVerifyToken: "", hasMessengerVerifyToken: false, loginConfigId: "",
        })),
        apiRequest("/products").catch(() => []),
      ]);
      if (cfg) {
        setConfig(cfg);
        if (cfg.hasToken) setConnected(true);
      }
      setProducts(Array.isArray(prods) ? prods : []);
    } finally { setLoading(false); }
  };

  const saveConfig = async () => {
    try {
      setSaving(true);
      await apiRequest("/facebook/config", {
        method: "PUT",
        body: JSON.stringify({
          // Vacío = no lo cambies (el servidor también ignora las máscaras).
          ...(rawToken ? { accessToken: rawToken } : {}),
          pixelId: config.pixelId,
          catalogId: config.catalogId,
          pageId: config.pageId,
          adAccountId: config.adAccountId,
          appId: config.appId || "",
          // Vacío = no lo cambies: el GET nunca devuelve el secret.
          ...(rawAppSecret ? { appSecret: rawAppSecret } : {}),
          ...(rawMessengerToken ? { messengerPageToken: rawMessengerToken } : {}),
          ...(rawVerifyToken ? { messengerVerifyToken: rawVerifyToken } : {}),
          loginConfigId: config.loginConfigId || "",
        }),
      });
      toast({ title: "Guardado", description: "Configuración de Facebook guardada" });
      setRawToken("");
      setRawAppSecret("");
      setRawMessengerToken("");
      setRawVerifyToken("");
      const cfg = await apiRequest("/facebook/config");
      if (cfg) setConfig(cfg);
    } catch (e: any) {
      toast({ title: "Error", description: describeError(e, "No se pudo guardar la configuración de Facebook."), variant: "destructive" });
    } finally { setSaving(false); }
  };

  const testConnection = async () => {
    try {
      setTesting(true);
      const res = await apiRequest("/facebook/validate");
      setConnected(res.ok);
      toast({ title: res.ok ? "Conectado" : "Error", description: res.message });
    } catch (e: any) {
      setConnected(false);
      toast({ title: "Error", description: describeError(e, "No se pudo verificar la conexión con Facebook."), variant: "destructive" });
    } finally { setTesting(false); }
  };

  const suggestAudience = async (product: Product) => {
    setTab("ads");
    try {
      setSelectedProduct(product);
      setAudience(null);
      setResult(null);
      const res = await apiRequest(`/facebook/suggest-audience/${product.id}`);
      setAudience(res);
      // La sugerencia llena los campos: el admin la ve y la ajusta antes de crear.
      if (res?.targeting) {
        if (res.targeting.ageMin) setAgeMin(res.targeting.ageMin);
        if (res.targeting.ageMax) setAgeMax(res.targeting.ageMax);
        if (Array.isArray(res.targeting.interests) && res.targeting.interests.length) setIntereses(res.targeting.interests.map((i: any) => i.name).join(", "));
      }
    } catch (e: any) {
      toast({ title: "Error", description: describeError(e, "No se pudo sugerir una audiencia para este producto."), variant: "destructive" });
    }
  };

  const createAd = async () => {
    if (!selectedProduct) return;
    try {
      setCreating(true);
      setResult(null);
      const lista = (t: string) => t.split(",").map((x) => x.trim()).filter(Boolean);
      const edad = (n: number) => Math.min(65, Math.max(18, Math.round(Number(n) || 18)));
      const min = edad(ageMin);
      const max = Math.max(min, edad(ageMax));
      const targeting: any = {};
      const ciudades = lista(city);
      if (ciudades.length) targeting.geoLocations = { cities: ciudades, countries: ["CO"] };
      if (min !== 18) targeting.ageMin = min;
      if (max !== 65) targeting.ageMax = max;
      if (genero !== "todos") targeting.genders = genero === "hombres" ? [1] : [2];
      // Los intereses viajan como nombre; el servidor los resuelve contra la taxonomía de Meta.
      const nombresIntereses = lista(intereses);
      if (nombresIntereses.length) targeting.interests = nombresIntereses.map((name) => ({ id: "", name }));
      const propias = lista(audienciasPropias);
      if (propias.length) targeting.customAudiences = propias;
      const excluidas = lista(audienciasExcluidas);
      if (excluidas.length) targeting.excludedCustomAudiences = excluidas;
      targeting.advantagePlus = advantagePlus;
      if (ubicacionesManuales) {
        const placements: Record<string, string[]> = {};
        if (enFacebook) placements.facebook = ["feed", "story", "marketplace"];
        if (enInstagram) placements.instagram = ["stream", "story", "reels"];
        if (enMessenger) placements.messenger = ["messenger_home"];
        if (Object.keys(placements).length) targeting.placements = placements;
      }
      const res = await apiRequest(`/facebook/create-ad/${selectedProduct.id}`, {
        method: "POST",
        body: JSON.stringify({ budget, targeting }),
      });
      setResult(res);
      toast({ title: "Anuncio creado", description: `Anuncio para ${selectedProduct.name} creado (pausado)` });
    } catch (e: any) {
      toast({ title: "Error", description: describeError(e, "No se pudo crear el anuncio. Revisá que Facebook esté conectado."), variant: "destructive" });
    } finally { setCreating(false); }
  };

  // ── Generar campaña en un clic ──────────────────────────────────────────
  // Hace lo mismo que pedírselo a Atlas por chat, sin chat: el servidor busca
  // el producto, arma la segmentación sugerida, escribe el copy con los datos
  // reales del producto y guarda el borrador PAUSADO. No publica ni gasta.
  // Si algo se niega (producto ambiguo, margen negativo), vuelve el motivo en
  // palabras del negocio y NO se inventa nada.
  const generarCampanaUnClic = async (brief?: CampaignBrief) => {
    const product = brief?.product || selectedProduct;
    if (!product) return;
    try {
      setGenerandoCampana(true);
      setCampanaResult(null);
      const res = await apiRequest("/campana/generar", {
        method: "POST",
        body: JSON.stringify({
          producto: product.name,
          dailyBudget: brief?.budget ?? budget,
          objetivo: brief?.objetivo ?? objetivoCampana,
          subirAMeta: false,
        }),
      });
      setCampanaResult(res);
      toast({
        title: res.ok ? "Campaña generada" : "No se pudo generar",
        description: res.resumen,
        variant: res.ok ? undefined : "destructive",
      });
    } catch (e: any) {
      toast({ title: "Error", description: describeError(e, "No se pudo generar la campaña."), variant: "destructive" });
    } finally { setGenerandoCampana(false); }
  };

  const syncCatalog = async () => {
    try {
      setSyncing(true);
      const res = await apiRequest("/facebook/sync-catalog", { method: "POST" });
      toast({ title: "Catálogo sincronizado", description: `${res.synced} productos, ${res.failed} fallos` });
    } catch (e: any) {
      toast({ title: "Error", description: describeError(e, "No se pudo sincronizar el catálogo con Facebook."), variant: "destructive" });
    } finally { setSyncing(false); }
  };

  const loadPageInfo = async () => {
    try {
      const info = await apiRequest("/facebook/messenger/page-info");
      setPageInfo(info);
    } catch { setPageInfo(null); }
  };

  const subscribeMessenger = async () => {
    try {
      setSubscribing(true);
      const res = await apiRequest("/facebook/messenger/subscribe", { method: "POST" });
      toast({ title: res.ok ? "Suscrito" : "Error", description: res.message });
    } catch (e: any) {
      toast({ title: "Error", description: describeError(e, "No se pudo activar el bot de Messenger."), variant: "destructive" });
    } finally { setSubscribing(false); }
  };

  const loadChannelStatus = async () => {
    try {
      const res = await apiRequest("/facebook/channels/status");
      setChannelStatus(res.channels || []);
    } catch { setChannelStatus([]); }
  };

  const loadAgentLogs = async () => {
    try {
      setLoadingAgentLogs(true);
      const res = await apiRequest("/facebook/agent/logs");
      setAgentLogs(res.logs || []);
    } catch { setAgentLogs([]); }
    finally { setLoadingAgentLogs(false); }
  };

  const runAgentNow = async () => {
    try {
      setRunningAgentNow(true);
      const res = await apiRequest("/facebook/agent/run-now", { method: "POST" });
      toast({ title: "Revisión ejecutada", description: res.message });
      loadAgentLogs();
    } catch (e: any) {
      toast({ title: "Error", description: describeError(e, "No se pudo ejecutar el agente de anuncios ahora."), variant: "destructive" });
    } finally { setRunningAgentNow(false); }
  };

  const startPolling = async () => {
    try {
      await apiRequest("/facebook/channels/polling/start", { method: "POST" });
      setPollingActive(true);
      toast({ title: "Polling iniciado", description: "Monitoreo automático de comentarios activado" });
    } catch (e: any) {
      toast({ title: "Error", description: describeError(e, "No se pudo activar la revisión automática de mensajes."), variant: "destructive" });
    }
  };

  const stopPolling = async () => {
    try {
      await apiRequest("/facebook/channels/polling/stop", { method: "POST" });
      setPollingActive(false);
      toast({ title: "Polling detenido" });
    } catch (e: any) {
      toast({ title: "Error", description: describeError(e, "No se pudo detener la revisión automática de mensajes."), variant: "destructive" });
    }
  };

  const loadDrafts = async () => {
    try {
      setLoadingDrafts(true);
      const res = await apiRequest("/facebook/strategist/drafts");
      setDrafts(res.drafts || []);
    } catch { setDrafts([]); }
    finally { setLoadingDrafts(false); }
  };

  const createDraftForProduct = async () => {
    if (!selectedDraftProduct) return;
    try {
      setCreatingDraft(true);
      await apiRequest(`/facebook/strategist/draft/${selectedDraftProduct}`, { method: "POST" });
      toast({ title: "Borrador creado", description: "Borrador de anuncio creado exitosamente" });
      loadDrafts();
    } catch (e: any) {
      toast({ title: "Error", description: describeError(e, "No se pudo crear el borrador del anuncio."), variant: "destructive" });
    } finally { setCreatingDraft(false); }
  };

  const createAllDrafts = async () => {
    try {
      setCreatingAllDrafts(true);
      const res = await apiRequest("/facebook/strategist/draft-all", { method: "POST" });
      // withoutRealImage: cuántos de esos borradores van a salir con el
      // cartel de texto genérico en vez de una foto real del curso -- la
      // causa más probable de "la foto no corresponde al producto".
      // omitidos: los productos que YA tenían borrador — si no se omitieran,
      // cada clic en Megapacks crearía un borrador POR PRODUCTO (la lista
      // llegó a 132 "desbordados" el 03-10).
      const omitidos = res.omitidos > 0 ? ` · ${res.omitidos} ya tenían borrador (no duplicados)` : "";
      const imgWarning = res.withoutRealImage > 0 ? ` · ${res.withoutRealImage} sin foto real` : "";
      toast({
        title: "Borradores creados",
        description: `${res.created} nuevos, ${res.failed} fallos${imgWarning}${omitidos}`,
        variant: res.withoutRealImage > 0 ? "destructive" : "default",
      });
      loadDrafts();
    } catch (e: any) {
      toast({ title: "Error", description: describeError(e, "No se pudieron crear los borradores de todos los productos."), variant: "destructive" });
    } finally { setCreatingAllDrafts(false); }
  };

  const deleteDraft = async (draftId: number) => {
    try {
      await apiRequest(`/facebook/strategist/draft/${draftId}`, { method: "DELETE" });
      toast({ title: "Borrador eliminado" });
      loadDrafts();
    } catch (e: any) {
      toast({ title: "Error", description: describeError(e, "No se pudo eliminar el borrador."), variant: "destructive" });
    }
  };

  // El arreglo de la lista desbordada: deja el último borrador de cada
  // producto y quita los duplicados (el flood de Megapacks repetidos).
  const limpiarDuplicados = async () => {
    if (!confirm("Esto deja el borrador más RECIENTE de cada producto y elimina los que están repetidos (con su limpieza en Meta si la campaña ya existía). ¿Seguro?")) return;
    try {
      setLimpiandoDuplicados(true);
      const res = await apiRequest("/facebook/strategist/drafts/duplicados", { method: "DELETE" });
      toast({ title: "Lista limpiada", description: `${res.borrados} duplicados eliminados · ${res.conservados} productos conservados` });
      loadDrafts();
    } catch (e: any) {
      toast({ title: "Error", description: describeError(e, "No se pudo limpiar la lista."), variant: "destructive" });
    } finally { setLimpiandoDuplicados(false); }
  };

  const loadInsights = async (draftId: number, datePreset?: string) => {
    const range = datePreset || insightsRange[draftId] || "last_7d";
    setInsightsRange((r) => ({ ...r, [draftId]: range }));
    setLoadingInsights((l) => ({ ...l, [draftId]: true }));
    try {
      const res = await apiRequest(`/facebook/strategist/draft/${draftId}/insights?datePreset=${range}`);
      setInsights((i) => ({ ...i, [draftId]: res.insights }));
    } catch (e: any) {
      setInsights((i) => ({ ...i, [draftId]: "error" }));
    } finally {
      setLoadingInsights((l) => ({ ...l, [draftId]: false }));
    }
  };

  const publishDraft = async (draftId: number) => {
    try {
      const res = await apiRequest(`/facebook/strategist/draft/${draftId}/publish`, { method: "POST" });
      toast({ title: res.ok ? "Publicado" : "Error", description: res.message || (!res.ok ? "Si el borrador aún no está en Meta, usá Subir primero." : undefined) });
      loadDrafts();
    } catch (e: any) {
      toast({ title: "Error", description: describeError(e, "No se pudo publicar el anuncio en Facebook."), variant: "destructive" });
    }
  };

  // Sube un borrador LOCAL a Meta en PAUSA (no gasta). publish solo activa
  // campañas que ya existen, así que sin este paso los locales fallan.
  const uploadDraft = async (draftId: number) => {
    try {
      const res = await apiRequest(`/facebook/strategist/draft/${draftId}/upload`, { method: "POST", body: JSON.stringify({ objetivo: "mensajes" }) });
      toast({ title: res.ok ? "Subido a Meta en pausa" : "Error", description: res.message || (res.ok ? "Revisalo en Ads Manager y luego Publicar para activar." : undefined) });
      loadDrafts();
    } catch (e: any) {
      toast({ title: "Error", description: describeError(e, "No se pudo subir el borrador a Meta."), variant: "destructive" });
    }
  };

  // Abre el editor con los datos del borrador
  const openEditDraft = (d: DraftAd) => {
    setEditingDraft(d);
    setEditHeadline(d.headline || "");
    setEditPrimaryText(d.primaryText || "");
    setEditDescription((d as any).description || "");
    setEditBudget(d.budget || 5000);
    setEditImages(d.images && d.images.length > 0 ? d.images : (d.imageUrl ? [d.imageUrl] : []));
    // La segmentación que ya trae el borrador (la generó la subida y la lee
    // Meta): si no hubiera, los defaults de la pestaña Anuncios.
    const st: any = d.strategy || {};
    setEditAgeMin(Number.isFinite(Number(st.ageMin)) ? Number(st.ageMin) : 18);
    setEditAgeMax(Number.isFinite(Number(st.ageMax)) ? Number(st.ageMax) : 55);
    setEditGenero(Array.isArray(st.genders) && st.genders.length === 1 ? (st.genders[0] === 1 ? "hombres" : "mujeres") : "todos");
    setEditIntereses(Array.isArray(st.interests) ? st.interests.join(", ") : "");
    setEditCiudades(Array.isArray(st.ciudades) ? st.ciudades.join(", ") : (st.city ? String(st.city) : ""));
    setEditObjetivo((["ventas", "trafico", "mensajes", "reconocimiento"].includes(st.objetivo) ? st.objetivo : "mensajes") as any);
    setVerVistaPrevia(false);
  };

  // Sube una foto (archivo local -> data URL -> servidor) y la agrega a la
  // lista del borrador que se está editando. 2+ fotos = anuncio carrusel.
  const addDraftImage = async (file: File) => {
    setUploadingImage(true);
    try {
      const dataUrl: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const res = await apiRequest("/facebook/strategist/upload-image", {
        method: "POST",
        body: JSON.stringify({ image: dataUrl, filename: file.name }),
      });
      setEditImages((imgs) => [...imgs, res.url]);
    } catch (e: any) {
      toast({ title: "Error subiendo la imagen", description: describeError(e, "No se pudo subir la imagen. Probá con otra foto o un archivo más liviano."), variant: "destructive" });
    } finally {
      setUploadingImage(false);
    }
  };

  const removeDraftImage = (index: number) => {
    setEditImages((imgs) => imgs.filter((_, i) => i !== index));
  };

  // Guarda los cambios del borrador editado
  const saveEditedDraft = async () => {
    if (!editingDraft) return;
    try {
      setSavingDraft(true);
      const res = await apiRequest(`/facebook/strategist/draft/${editingDraft.id}`, {
        method: "PUT",
        body: JSON.stringify({
          headline: editHeadline,
          primaryText: editPrimaryText,
          description: editDescription,
          budget: editBudget,
          images: editImages,
          // La segmentación editada: ahora el público se ajusta desde acá
          // (viaja en la strategy del borrador, la misma que lee la subida a Meta).
          targeting: {
            ageMin: editAgeMin,
            ageMax: editAgeMax,
            genders: editGenero === "todos" ? [] : (editGenero === "hombres" ? [1] : [2]),
            interests: editIntereses.split(",").map((s) => s.trim()).filter(Boolean),
            ciudades: editCiudades.split(",").map((s) => s.trim()).filter(Boolean),
          },
          // El objetivo elegido: es lo que decide si el anuncio abre WhatsApp
          // o lleva a la landing/tienda.
          objetivo: editObjetivo,
        }),
      });
      if (res.metaSync && !res.metaSync.ok) {
        toast({ title: "Guardado, pero Facebook no aceptó el cambio de imagen", description: res.metaSync.message, variant: "destructive" });
      } else {
        toast({ title: "Borrador actualizado", description: res.avisoTargeting || (res.metaSync?.ok ? "El anuncio en Facebook ya muestra las fotos nuevas." : undefined) });
      }
      setEditingDraft(null);
      loadDrafts();
    } catch (e: any) {
      toast({ title: "Error", description: describeError(e, "No se pudieron guardar los cambios del borrador."), variant: "destructive" });
    } finally {
      setSavingDraft(false);
    }
  };

  // Cambiar de sección: carga los datos que necesita cada una. Compartido por
  // el desplegable (móvil) y las pestañas (escritorio).
  const selectTab = (id: Tab) => {
    setTab(id);
    if (id === "messenger") loadPageInfo();
    if (id === "channels") loadChannelStatus();
    if (id === "drafts") loadDrafts();
    if (id === "agent") loadAgentLogs();
    if (id === "config" && connected) cargarCatalogoEstado();
  };

  const tabs = [
    { id: "config" as Tab, label: "Configuración", icon: Settings2, disabled: false },
    { id: "ads" as Tab, label: "Anuncios", icon: Megaphone, disabled: !connected },
    { id: "drafts" as Tab, label: "Borradores", icon: FileText, disabled: false },
    { id: "agent" as Tab, label: "Agente IA", icon: Radio, disabled: !connected },
    { id: "messenger" as Tab, label: "Messenger", icon: MessageCircle, disabled: !connected },
    { id: "comments" as Tab, label: "Comentarios", icon: MessageSquare, disabled: !connected },
    { id: "channels" as Tab, label: "Canales", icon: Radio, disabled: false },
  ];

  return (
    <Layout>
      <div className="space-y-6 p-0 sm:p-2">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <div className="flex items-start gap-1.5">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight break-words min-w-0">Centro de crecimiento</h1>
              <HelpTourButton guide={HELP_GUIDE} />
            </div>
            <p className="text-muted-foreground">Campañas, creativos y conversaciones, en un mismo lugar.</p>
          </div>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}

        {!loading && (
          <>
            {/* Móvil: un desplegable en una sola línea. 7 pestañas en fila se
                salen del ancho del teléfono. Escritorio: se mantienen visibles. */}
            <div className="md:hidden border-b pb-2">
              <Select value={tab} onValueChange={(v) => selectTab(v as Tab)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Sección" />
                </SelectTrigger>
                <SelectContent>
                  {tabs.map(t => (
                    <SelectItem key={t.id} value={t.id} disabled={t.disabled}>
                      <span className="flex items-center gap-2">
                        <t.icon className="h-4 w-4" /> {t.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="hidden md:flex gap-2 border-b pb-2 flex-wrap">
              {tabs.map(t => (
                <Button
                  key={t.id}
                  variant={tab === t.id ? "default" : "ghost"}
                  onClick={() => selectTab(t.id)}
                  size="sm"
                  disabled={t.disabled}
                >
                  <t.icon className="mr-2 h-4 w-4" /> {t.label}
                </Button>
              ))}
            </div>

            {tab === "config" && (
              <div className="grid grid-cols-1 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2"><LogoMarca marca="facebook" className="h-5 w-5" /> Conectar con Facebook</CardTitle>
                    <CardDescription>
                      Recomendado: hace login real con Facebook y guarda un token de página de larga
                      duración (prácticamente no vence). El campo manual de abajo es solo un respaldo —
                      si pegás ahí un token del Explorador de Graph API, dura 1-2 horas y hay que
                      reconectar todo el tiempo.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <Button data-tour="facebook-connect-button" onClick={startFacebookLogin} disabled={!fbAppConfig.enabled || connectingOAuth} className="w-full sm:w-auto">
                      {connectingOAuth ? <Loader2 className="mr-2 h-4 w-4 animate-spin shrink-0" /> : <Globe className="mr-2 h-4 w-4 shrink-0" />}
                      Conectar con Facebook
                    </Button>
                    {!fbAppConfig.enabled && (
                      <Alert>
                        <XCircle className="h-4 w-4" />
                        <AlertDescription>
                          Falta configurar <code className="break-all">FB_APP_ID</code>, <code className="break-all">FB_APP_SECRET</code> y{" "}
                          <code className="break-all">FB_CONNECT_ENABLED=true</code> en las variables de entorno del servidor.
                          También agregá <code className="break-all">{window.location.origin}{window.location.pathname}</code> a las
                          "Valid OAuth Redirect URIs" del producto Facebook Login de tu app en developers.facebook.com.
                        </AlertDescription>
                      </Alert>
                    )}
                    {otherPages.length > 0 && (
                      <Alert>
                        <MessageSquare className="h-4 w-4" />
                        <AlertDescription>
                          También administrás: {otherPages.map(p => p.name).join(", ")}. Para conectar otra en vez de la actual, decíselo a Atlas o volvé a hacer login y elegí otra.
                        </AlertDescription>
                      </Alert>
                    )}
                  </CardContent>
                </Card>

                {connected && (
                  <CuentaPublicitariaSelector
                    onCambio={(id) => setConfig((c) => ({ ...c, adAccountId: id }))}
                  />
                )}

                {connected && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2"><LogoMarca marca="meta" className="h-5 w-5" /> Catálogo de productos en Meta</CardTitle>
                      <CardDescription>
                        Sube TODO el catálogo a Meta con un FEED que se descarga solo cada día. Con el catálogo se
                        desbloquean los anuncios de Advantage+ Catálogo (la IA de Meta genera fondos detrás del producto),
                        el retargeting dinámico (el que vio la Pañalera recibe el anuncio de la Pañalera) y los formatos
                        de colección.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex flex-wrap gap-2">
                        <Button onClick={conectarCatalogo} disabled={conectandoCatalogo} className="w-full sm:w-auto">
                          {conectandoCatalogo ? <Loader2 className="mr-2 h-4 w-4 animate-spin shrink-0" /> : <Package className="mr-2 h-4 w-4 shrink-0" />}
                          {catalogoEstado?.catalogo?.catalogId ? "Reconectar feed" : "Conectar catálogo a Meta"}
                        </Button>
                        {catalogoEstado?.feedUrl && (
                          <Button variant="outline" onClick={() => window.open(catalogoEstado.feedUrl, "_blank")} className="w-full sm:w-auto">
                            Ver el feed (JSON)
                          </Button>
                        )}
                      </div>
                      {catalogoEstado?.catalogo?.conectado && (
                        <p className="text-xs text-muted-foreground">
                          ✓ Conectado el {new Date(catalogoEstado.catalogo.conectado).toLocaleDateString("es-CO", { day: "numeric", month: "long" })} ·
                          catálogo <ValorOculto valor={catalogoEstado.catalogo.catalogId} /> · Meta descarga {catalogoEstado.catalogo.feedUrl?.split("/").pop()} en horario DAILY.
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        El feed es público (es información comercial) y sale de los productos ACTIVOS con su foto real:
                        la regla del anuncio (landing publicada primero, si no la ficha de la tienda) es la misma que usan
                        los enlaces.
                      </p>
                    </CardContent>
                  </Card>
                )}

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2"><Settings2 className="h-5 w-5" /> Credenciales de Facebook (manual / avanzado)</CardTitle>
                    <CardDescription>Solo si no podés usar el login de arriba. Pegar acá un token de corta duración hace que se venza pronto.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label>Access Token</Label>
                        {/* Antes el value era "••••••••": con escribir una letra se
                            mandaba la máscara + esa letra y pisaba el token real. */}
                        <SecretInput value={rawToken} onChange={setRawToken} guardado={config.hasToken && (config.accessTokenUltimos4 || true)} placeholder="EAA..." />
                      </div>
                      <div><Label>Pixel ID</Label><DatoSensibleInput value={config.pixelId} onChange={e => setConfig({...config, pixelId: e.target.value})} placeholder="FB_PIXEL_ID" /></div>
                      <div><Label>Catalog ID</Label><DatoSensibleInput value={config.catalogId} onChange={e => setConfig({...config, catalogId: e.target.value})} placeholder="FB_CATALOG_ID" /></div>
                      <div><Label>Page ID</Label><DatoSensibleInput value={config.pageId} onChange={e => setConfig({...config, pageId: e.target.value})} placeholder="FB_PAGE_ID" /></div>
                      <div><Label>Ad Account ID</Label><DatoSensibleInput value={config.adAccountId} onChange={e => setConfig({...config, adAccountId: e.target.value})} placeholder="FB_AD_ACCOUNT_ID (solo números)" /></div>

                      {/* App ID y App Secret DE ESTE NEGOCIO. El backend ya los
                          guardaba por tenant (PUT /config los persiste) y
                          facebook-messenger.ts ya los lee, pero no había dónde
                          cargarlos: quedaban dependiendo del .env del servidor,
                          o sea de la app de Facebook del dueño de la plataforma.
                          Con estos campos, cada negocio puede usar SU propia app
                          -- necesario para verificar la firma de sus webhooks y
                          para operar con sus propios permisos. */}
                      <div>
                        <Label>App ID</Label>
                        <DatoSensibleInput value={config.appId || ""} onChange={e => setConfig({...config, appId: e.target.value})} placeholder="Tu App ID de Meta" />
                        <p className="text-xs text-muted-foreground mt-1">Opcional: solo si usás tu propia app de Facebook.</p>
                      </div>
                      <div>
                        <Label>App Secret</Label>
                        <SecretInput value={rawAppSecret} onChange={setRawAppSecret} guardado={config.hasAppSecret && (config.appSecretUltimos4 || true)} placeholder="Tu App Secret de Meta" />
                      </div>

                      {/* Messenger y Login for Business: estaban en el modelo
                          pero no se podían cargar desde el panel, así que un
                          negocio con su propia app no tenía forma de conectar
                          Messenger ni de validar sus webhooks. */}
                      <div>
                        <Label>Messenger Page Token</Label>
                        <SecretInput value={rawMessengerToken} onChange={setRawMessengerToken} guardado={config.hasMessengerToken && (config.messengerTokenUltimos4 || true)} placeholder="Token de página para Messenger" />
                      </div>
                      <div>
                        <Label>Messenger Verify Token</Label>
                        <SecretInput value={rawVerifyToken} onChange={setRawVerifyToken} guardado={config.hasMessengerVerifyToken && (config.messengerVerifyTokenUltimos4 || true)} placeholder="El que pusiste en el webhook de Meta" />
                      </div>
                      <div>
                        <Label>Login Config ID</Label>
                        <DatoSensibleInput value={config.loginConfigId || ""} onChange={e => setConfig({...config, loginConfigId: e.target.value})} placeholder="Solo si usás Login for Business" />
                        <p className="text-xs text-muted-foreground mt-1">Meta → Inicio de sesión para empresas → Configuraciones.</p>
                      </div>
                    </div>

                    {/* bottom: el menú móvil (mobile-nav.tsx) mide 72px (min-h) +
                        8px (pb-2) = 80px reales antes de sumar el safe-area del
                        propio nav -- con solo 76px de offset acá, esta barra
                        quedaba con 4px de margen (0 en pantallas con notch) y su
                        parte de abajo terminaba tapada por el nav. 92px deja un
                        respiro real por encima del nav en cualquier dispositivo. */}
                    <div className="fixed md:static bottom-[calc(92px+env(safe-area-inset-bottom))] left-3 right-3 md:left-auto md:right-auto z-[55] flex flex-wrap gap-2 p-3 rounded-xl bg-background/95 backdrop-blur-md border border-border/60 shadow-2xl md:border-0 md:bg-transparent md:backdrop-blur-none md:shadow-none md:p-0 md:mx-0">
                      <Button onClick={saveConfig} disabled={saving}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Guardar</Button>
                      <Button variant="outline" onClick={testConnection} disabled={testing}>
                        {testing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                        {connected === true ? "✓ Conectado" : connected === false ? "Reconectar" : "Probar conexión"}
                      </Button>
                    </div>
                    {connected === true && <Alert className="border-green-500"><CheckCircle2 className="h-4 w-4 text-green-500" /><AlertDescription>Conexión exitosa. Todos los canales disponibles.</AlertDescription></Alert>}
                    {connected === false && <Alert variant="destructive"><XCircle className="h-4 w-4" /><AlertDescription>No se pudo conectar. Verifica tu Access Token.</AlertDescription></Alert>}
                  </CardContent>
                </Card>
              </div>
            )}

            {tab === "ads" && connected && (
              <div className="grid grid-cols-1 gap-6">
                <CampaignWorkbench products={products} busy={generandoCampana} result={campanaResult} onGenerate={generarCampanaUnClic} onDrafts={() => selectTab("drafts")} />
                <details className="rounded-xl border p-4"><summary className="cursor-pointer text-sm font-medium">Configuración manual y segmentación avanzada</summary><div className="mt-4 space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2"><Package className="h-5 w-5" /> Productos</CardTitle>
                    <CardDescription>Selecciona un producto para crear un anuncio.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {products.map(p => (
                        <Card key={p.id} className={`cursor-pointer transition-all ${selectedProduct?.id === p.id ? "ring-2 ring-primary" : "hover:bg-accent/50"}`} onClick={() => { setProductDetail(p); suggestAudience(p); }}>
                          <CardContent className="p-4">
                            <div className="aspect-video bg-muted rounded-md mb-3 overflow-hidden">
                              {p.imageUrl ? <img src={p.imageUrl} alt={p.name} className="w-full h-full object-cover" /> : <div className="flex items-center justify-center h-full text-muted-foreground"><Megaphone className="h-8 w-8" /></div>}
                            </div>
                            <h3 className="font-semibold truncate">{p.name}</h3>
                            <p className="text-sm text-muted-foreground">${Number(p.price).toLocaleString("es-CO")} COP</p>
                            <div className="flex gap-1 mt-2">
                              <Button size="sm" variant="outline" className="text-xs" onClick={(ev) => { ev.stopPropagation(); setProductDetail(p); }}>Ver detalle</Button>
                              <Button size="sm" className="text-xs" onClick={(ev) => { ev.stopPropagation(); suggestAudience(p); }}>Crear anuncio</Button>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </CardContent>
                </Card>
                {audience && selectedProduct && (
                  <>
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2"><Target className="h-5 w-5" /> Audiencia sugerida</CardTitle>
                        <CardDescription>{audience.description}</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div><Label>Edad min</Label><p className="text-2xl font-bold">{audience.targeting.ageMin}</p></div>
                          <div><Label>Edad max</Label><p className="text-2xl font-bold">{audience.targeting.ageMax}</p></div>
                        </div>
                        {audience.targeting.interests?.length > 0 && (
                          <div><Label>Intereses</Label><div className="flex flex-wrap gap-2 mt-1">{audience.targeting.interests.map((i, idx) => <span key={idx} className="px-2 py-1 bg-primary/10 text-primary text-xs rounded-full">{i.name}</span>)}</div></div>
                        )}
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2"><MapPin className="h-5 w-5" /> Configurar anuncio</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div><Label>Presupuesto diario (COP)</Label><Input type="number" value={budget} onChange={e => setBudget(Number(e.target.value))} min={1000} /></div>
                          <div><Label>Ciudades (separadas por coma)</Label><Input value={city} onChange={e => setCity(e.target.value)} placeholder="Ej: Bogotá, Medellín" /></div>
                          <div className="grid grid-cols-3 gap-2">
                            <div><Label>Edad mín.</Label><Input type="number" min={18} max={65} value={ageMin} onChange={e => setAgeMin(Number(e.target.value))} /></div>
                            <div><Label>Edad máx.</Label><Input type="number" min={18} max={65} value={ageMax} onChange={e => setAgeMax(Number(e.target.value))} /></div>
                            <div><Label>Género</Label>
                              <select className="h-10 w-full rounded-md border bg-background px-2 text-sm" value={genero} onChange={e => setGenero(e.target.value as any)}>
                                <option value="todos">Todos</option><option value="hombres">Hombres</option><option value="mujeres">Mujeres</option>
                              </select>
                            </div>
                          </div>
                          <div><Label>Intereses (separados por coma)</Label><Input value={intereses} onChange={e => setIntereses(e.target.value)} placeholder="Ej: Fitness, Salud y bienestar" /></div>
                          <div><Label>Audiencias propias (IDs, coma)</Label><Input value={audienciasPropias} onChange={e => setAudienciasPropias(e.target.value)} placeholder="Ej: 238475612345" /></div>
                          <div className="md:col-span-2"><Label>Audiencias excluidas (IDs, coma)</Label><Input value={audienciasExcluidas} onChange={e => setAudienciasExcluidas(e.target.value)} placeholder="Ej: compradores de los últimos 30 días" /></div>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
                          <label className="flex items-center gap-2"><input type="checkbox" checked={advantagePlus} onChange={e => setAdvantagePlus(e.target.checked)} /> Advantage+ Audience (Meta amplía el público)</label>
                          <label className="flex items-center gap-2"><input type="checkbox" checked={ubicacionesManuales} onChange={e => setUbicacionesManuales(e.target.checked)} /> Elegir ubicaciones a mano</label>
                          {ubicacionesManuales ? (
                            <>
                              <label className="flex items-center gap-1"><input type="checkbox" checked={enFacebook} onChange={e => setEnFacebook(e.target.checked)} /> Facebook</label>
                              <label className="flex items-center gap-1"><input type="checkbox" checked={enInstagram} onChange={e => setEnInstagram(e.target.checked)} /> Instagram</label>
                              <label className="flex items-center gap-1"><input type="checkbox" checked={enMessenger} onChange={e => setEnMessenger(e.target.checked)} /> Messenger</label>
                            </>
                          ) : <span className="text-muted-foreground">Sin elegir, Meta reparte en todas (Advantage+ Placements).</span>}
                        </div>
                        <p className="text-xs text-muted-foreground">El anuncio se crea <b>PAUSADO</b>: esta pantalla prepara la campaña y no inicia ningún gasto. Los intereses se validan contra Meta; si alguno no existe, se avisa y no se crea nada.</p>
                        <Button onClick={createAd} disabled={creating} className="w-full">
                          {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Megaphone className="mr-2 h-4 w-4" />}
                          {creating ? "Creando..." : `Crear anuncio para ${selectedProduct.name}`}
                        </Button>

                        {/* ── Generar campaña en un clic ───────────────────────
                            Mismo camino que Atlas por chat: segmentación +
                            copy investigado + borrador, de una sola vez. */}
                        <div className="mt-4 space-y-3 rounded-md border border-dashed p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <p className="text-sm font-medium">Generar campaña en un clic</p>
                              <p className="text-xs text-muted-foreground">Segmentación + copy + borrador, sin ir paso a paso.</p>
                            </div>
                            <select
                              className="h-9 rounded-md border bg-background px-2 text-sm"
                              value={objetivoCampana}
                              onChange={(e) => setObjetivoCampana(e.target.value as any)}
                            >
                              <option value="ventas">Ventas (web)</option>
                              <option value="mensajes">Mensajes (WhatsApp)</option>
                              <option value="trafico">Tráfico (clics)</option>
                              <option value="reconocimiento">Reconocimiento</option>
                            </select>
                          </div>
                          <Button variant="secondary" onClick={() => generarCampanaUnClic()} disabled={generandoCampana || !selectedProduct} className="w-full">
                            {generandoCampana ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Target className="mr-2 h-4 w-4" />}
                            {generandoCampana ? "Generando (busca, investiga y escribe)..." : `Generar campaña para ${selectedProduct.name}`}
                          </Button>
                          {campanaResult && (
                            <div className="space-y-3 rounded-md border bg-muted/40 p-3 text-xs">
                              {/* Estado: lo primero es si el copy salió investigado o no.
                                  Un anuncio sin investigación es honesto pero no detiene
                                  a nadie: el admin tiene que poder verlo de un vistazo. */}
                              <div className="flex flex-wrap items-center gap-2">
                                <span className={`rounded-full px-2 py-0.5 font-medium ${campanaResult.investigado ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
                                  {campanaResult.investigado ? "✓ Con investigación de mercado" : "⚠ Sin investigación"}
                                </span>
                                {campanaResult.draftId && (
                                  <span className="rounded-full bg-background px-2 py-0.5 text-muted-foreground">
                                    Borrador #{campanaResult.draftId}
                                  </span>
                                )}
                              </div>

                              <p className="font-semibold break-words">{campanaResult.resumen}</p>

                              {campanaResult.copy?.headline && (
                                <div className="rounded border bg-background p-2">
                                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Titular</p>
                                  <p className="font-medium whitespace-pre-wrap break-words">{campanaResult.copy.headline}</p>
                                </div>
                              )}
                              {campanaResult.copy?.primaryText && (
                                <div className="rounded border bg-background p-2">
                                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Texto del anuncio</p>
                                  <p className="max-h-56 overflow-y-auto whitespace-pre-wrap break-words">{campanaResult.copy.primaryText}</p>
                                </div>
                              )}

                              {Array.isArray(campanaResult.pasos) && campanaResult.pasos.length > 0 && (
                                <div className="space-y-1">
                                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Qué hizo, paso por paso</p>
                                  {campanaResult.pasos.map((p: any, i: number) => (
                                    <p key={i} className={p.ok ? "text-green-700" : "text-amber-700"}>
                                      {p.ok ? "✓" : "⚠"} <span className="font-medium">{p.paso}</span>: {p.detalle}
                                    </p>
                                  ))}
                                </div>
                              )}

                              {campanaResult.draftId && (
                                <p className="text-muted-foreground">
                                  Revisalo, cambiá el copy o las fotos, y publicalo desde la pestaña{" "}
                                  <b>Borradores</b>.
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  </>
                )}
                {result && (
                  <Alert className="border-green-500">
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    <AlertDescription>
                      <p className="font-semibold">Anuncio creado</p>
                      <p className="text-sm break-all">Campaña: {result.campaignId} | Anuncio: {result.adId}</p>
                      {result.adCopy && <div className="mt-2 p-2 bg-muted rounded text-xs break-words"><p className="whitespace-pre-wrap break-words"><strong>Texto:</strong> {result.adCopy.primaryText}</p></div>}
                    </AlertDescription>
                  </Alert>
                )}
                <div className="flex justify-center">
                  <Button variant="outline" onClick={syncCatalog} disabled={syncing}>
                    {syncing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                    Sincronizar catálogo
                  </Button>
                </div>
                </div></details>
              </div>
            )}

            {tab === "drafts" && (
              <div className="grid grid-cols-1 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5" /> Borradores de Anuncios (Megapacks)</CardTitle>
                    <CardDescription>Gestiona los borradores de anuncios para tus productos. Los borradores se crean en estado PAUSED en Facebook.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="min-w-0">
                        <Label>Crear borrador para producto</Label>
                        <select
                          className="flex h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 py-2 text-sm"
                          value={selectedDraftProduct || ""}
                          onChange={e => setSelectedDraftProduct(Number(e.target.value) || null)}
                        >
                          <option value="">-- Selecciona un producto --</option>
                          {products.map(p => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                        </select>
                      </div>
                      <div className="flex items-end">
                        <Button onClick={createDraftForProduct} disabled={!selectedDraftProduct || creatingDraft} className="w-full">
                          {creatingDraft ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
                          Crear borrador
                        </Button>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button data-tour="facebook-megapack-button" variant="outline" onClick={createAllDrafts} disabled={creatingAllDrafts} className="w-full sm:w-auto">
                        {creatingAllDrafts ? <Loader2 className="mr-2 h-4 w-4 animate-spin shrink-0" /> : <Package className="mr-2 h-4 w-4 shrink-0" />}
                        Crear borradores para TODOS los productos (Megapacks)
                      </Button>
                      <Button variant="outline" onClick={loadDrafts} disabled={loadingDrafts} className="w-full sm:w-auto">
                        {loadingDrafts ? <Loader2 className="mr-2 h-4 w-4 animate-spin shrink-0" /> : <RefreshCw className="mr-2 h-4 w-4 shrink-0" />}
                        Actualizar lista
                      </Button>
                      {/* El arreglo de la lista desbordada: cada clic viejo de
                          Megapacks duplicó borradores (132 filas). Esto deja el
                          MÁS RECIENTE de cada producto y quita el resto. */}
                      <Button variant="destructive" onClick={limpiarDuplicados} disabled={limpiandoDuplicados} className="w-full sm:w-auto">
                        {limpiandoDuplicados ? <Loader2 className="mr-2 h-4 w-4 animate-spin shrink-0" /> : <Trash2 className="mr-2 h-4 w-4 shrink-0" />}
                        Limpiar borradores duplicados
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                {drafts.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Borradores guardados ({drafts.length})</CardTitle>
                      <CardDescription>Estos borradores están almacenados localmente y en Facebook (estado PAUSED).</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {drafts.map(d => (
                          <div key={d.id} className="flex flex-col md:flex-row items-start justify-between p-4 bg-muted rounded-lg gap-4">
                            <div className="flex-1 min-w-0">
                              <div className="flex flex-wrap items-center gap-2 min-w-0 mb-1">
                                <h4 className="font-semibold truncate min-w-0">{d.productName}</h4>
                                <span className={`shrink-0 px-2 py-0.5 rounded text-xs font-medium ${d.status === "published" ? "bg-green-500/20 text-green-500" : "bg-amber-500/20 text-amber-500"}`}>
                                  {d.status === "published" ? "Publicado" : d.status === "created" ? "Creado en FB" : "Borrador"}
                                </span>
                                {d.fbStatus && <span className="shrink-0 px-2 py-0.5 rounded text-xs bg-blue-500/20 text-blue-500">{d.fbStatus}</span>}
                              </div>
                              {d.niche && <p className="text-xs text-muted-foreground break-words">Estrategia: {d.niche}</p>}
                              {/* La rúbrica: qué le falta a este borrador para ser profesional. */}
                              {d.calidad && (
                                <details className="mt-2">
                                  <summary className={`text-xs cursor-pointer font-medium ${d.calidad.puntaje >= 100 ? "text-green-600" : d.calidad.puntaje >= 75 ? "text-amber-600" : "text-red-600"}`}>
                                    Calidad del anuncio: {d.calidad.criterios.filter((c) => c.ok).length}/{d.calidad.criterios.length}
                                    {d.calidad.criterios.some((c) => !c.ok) ? ` · falta: ${d.calidad.criterios.filter((c) => !c.ok).map((c) => c.nombre.toLowerCase()).join(", ")}` : " · listo para subir"}
                                  </summary>
                                  <ul className="mt-2 space-y-1">
                                    {d.calidad.criterios.map((c) => (
                                      <li key={c.id} className="text-xs flex gap-1.5 break-words">
                                        <span className={c.ok ? "text-green-600" : "text-red-600"}>{c.ok ? "✓" : "✗"}</span>
                                        <span><span className="font-medium">{c.nombre}:</span> <span className="text-muted-foreground">{c.detalle}</span></span>
                                      </li>
                                    ))}
                                  </ul>
                                </details>
                              )}
                              <div className="flex flex-wrap gap-3 mt-2 text-xs">
                                {d.budget && <span className="text-muted-foreground">💰 ${d.budget.toLocaleString("es-CO")} COP/día</span>}
                                {d.headline && <span className="text-foreground font-medium break-words min-w-0">📝 {d.headline}</span>}
                              </div>
                              {d.primaryText && (
                                <details className="mt-2">
                                  <summary className="text-xs text-primary cursor-pointer hover:underline">Ver texto del anuncio</summary>
                                  <p className="text-xs text-muted-foreground mt-2 whitespace-pre-wrap break-words bg-background/50 p-2 rounded border max-h-40 overflow-y-auto">{d.primaryText}</p>
                                </details>
                              )}
                              <p className="text-xs text-muted-foreground mt-2">
                                Creado: {new Date(d.createdAt).toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                              </p>
                              {d.campaignId && (
                                <div className="mt-3 pt-3 border-t border-border/50">
                                  {!insights[d.id] ? (
                                    <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => loadInsights(d.id)} disabled={loadingInsights[d.id]}>
                                      {loadingInsights[d.id] ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <BarChart3 className="h-3.5 w-3.5 mr-1" />}
                                      Ver métricas
                                    </Button>
                                  ) : insights[d.id] === "error" ? (
                                    <p className="text-xs text-red-500">No se pudieron cargar las métricas. <button className="underline" onClick={() => loadInsights(d.id)}>Reintentar</button></p>
                                  ) : (
                                    <div>
                                      <div className="flex items-center justify-between mb-2">
                                        <span className="text-xs font-medium text-muted-foreground">Rendimiento del anuncio</span>
                                        <div className="flex items-center gap-1">
                                          <select
                                            className="text-xs bg-background border rounded px-1 py-0.5"
                                            value={insightsRange[d.id] || "last_7d"}
                                            onChange={(e) => loadInsights(d.id, e.target.value)}
                                          >
                                            <option value="today">Hoy</option>
                                            <option value="last_3d">3 días</option>
                                            <option value="last_7d">7 días</option>
                                            <option value="last_30d">30 días</option>
                                          </select>
                                          <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => loadInsights(d.id)} disabled={loadingInsights[d.id]} title="Actualizar">
                                            <RefreshCw className={`h-3 w-3 ${loadingInsights[d.id] ? "animate-spin" : ""}`} />
                                          </Button>
                                        </div>
                                      </div>
                                      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-center">
                                        <div className="bg-background/50 rounded p-1.5">
                                          <p className="text-sm font-semibold">${(insights[d.id] as DraftInsights).spend.toLocaleString("es-CO")}</p>
                                          <p className="text-[10px] text-muted-foreground">Gastado</p>
                                        </div>
                                        <div className="bg-background/50 rounded p-1.5">
                                          <p className="text-sm font-semibold">{(insights[d.id] as DraftInsights).impressions.toLocaleString("es-CO")}</p>
                                          <p className="text-[10px] text-muted-foreground">Impresiones</p>
                                        </div>
                                        <div className="bg-background/50 rounded p-1.5">
                                          <p className="text-sm font-semibold">{(insights[d.id] as DraftInsights).clicks.toLocaleString("es-CO")}</p>
                                          <p className="text-[10px] text-muted-foreground">Clics</p>
                                        </div>
                                        <div className="bg-background/50 rounded p-1.5">
                                          <p className="text-sm font-semibold">{(insights[d.id] as DraftInsights).ctr.toFixed(2)}%</p>
                                          <p className="text-[10px] text-muted-foreground">CTR</p>
                                        </div>
                                        <div className="bg-background/50 rounded p-1.5">
                                          <p className="text-sm font-semibold">{(insights[d.id] as DraftInsights).results}</p>
                                          <p className="text-[10px] text-muted-foreground">Resultados</p>
                                        </div>
                                        <div className="bg-background/50 rounded p-1.5">
                                          <p className="text-sm font-semibold">${(insights[d.id] as DraftInsights).costPerResult.toLocaleString("es-CO")}</p>
                                          <p className="text-[10px] text-muted-foreground">Costo/resultado</p>
                                        </div>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                            {/* ── Acciones ────────────────────────────────
                                En móvil los 5 botones en fila no caben y el
                                ÚLTIMO (Eliminar) se corta del ancho (reportado
                                por el dueño, 04-10). Acá el compromiso: en
                                móvil las acciones van en UN menú desplegable
                                ("Acciones" + las 4); en desktop siguen en
                                fila como siempre. Nada del listado cambia. */}
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild className="sm:hidden">
                                <Button size="sm" variant="outline" className="shrink-0" title="Acciones del borrador">⋯</Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-52">
                                {!d.adId && d.status !== "published" && (
                                  <DropdownMenuItem onClick={() => uploadDraft(d.id)}>
                                    <LogoMarca marca="meta" className="h-4 w-4 mr-2" /> Subir a Meta (en pausa)
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem onClick={() => openEditDraft(d)}><Pencil className="h-4 w-4 mr-2" /> Editar</DropdownMenuItem>
                                {d.adId && (
                                  <DropdownMenuItem onClick={() => window.open(`https://www.facebook.com/adsmanager/manage/ads?act=${config.adAccountId}&selected_ad_ids=${d.adId}`, "_blank")}>
                                    <LogoMarca marca="facebook" className="h-4 w-4 mr-2" /> Ver en Facebook
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuSeparator />
                                <DropdownMenuItem className="text-red-600 focus:text-red-600" onClick={() => { if (confirm(`¿Eliminar el borrador de ${d.productName}?`)) deleteDraft(d.id); }}>
                                  <Trash2 className="h-4 w-4 mr-2" /> Eliminar
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                            <div className="hidden sm:flex md:flex-col gap-2 shrink-0">
                              {!d.adId && d.status !== "published" && (
                                <Button size="sm" variant="outline" onClick={() => uploadDraft(d.id)} title="Subir borrador a Meta en pausa (no gasta)">
                                  <Globe className="h-4 w-4 mr-1" /> Subir
                                </Button>
                              )}
                              {d.status !== "published" && (
                                <Button size="sm" variant="default" onClick={() => publishDraft(d.id)} title={d.adId ? "Publicar anuncio en Facebook" : "Primero Subir a Meta, luego Publicar"} disabled={!d.adId}>
                                  <Play className="h-4 w-4 mr-1" /> Publicar
                                </Button>
                              )}
                              <Button size="sm" variant="outline" onClick={() => openEditDraft(d)} title="Editar borrador">
                                <Pencil className="h-4 w-4 mr-1" /> Editar
                              </Button>
                              {d.adId && (
                                <Button size="sm" variant="outline" onClick={() => window.open(`https://www.facebook.com/adsmanager/manage/ads?act=${config.adAccountId}&selected_ad_ids=${d.adId}`, "_blank")} title="Ver anuncio en Facebook Ads Manager">
                                  <Globe className="h-4 w-4 mr-1" /> Ver en FB
                                </Button>
                              )}
                              <Button size="sm" variant="destructive" onClick={() => { if (confirm(`¿Eliminar el borrador de ${d.productName}?`)) deleteDraft(d.id); }} title="Eliminar borrador">
                                <Trash2 className="h-4 w-4 mr-1" /> Eliminar
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {drafts.length === 0 && !loadingDrafts && (
                  <Card>
                    <CardContent className="p-8">
                      <div className="text-center text-muted-foreground">
                        <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
                        <p>No hay borradores de anuncios.</p>
                        <p className="text-sm">Crea borradores para productos individuales o para todos (Megapacks).</p>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}

            {tab === "messenger" && connected && (
              <div className="grid gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2"><LogoMarca marca="messenger" className="h-5 w-5" /> Facebook Messenger Bot</CardTitle>
                    <CardDescription>Configura el bot para responder automáticamente mensajes de Messenger con la misma IA de WhatsApp.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {pageInfo && (
                      <div className="flex items-center gap-4 p-4 bg-muted rounded-lg">
                        {pageInfo.picture && <img src={pageInfo.picture} alt="" className="w-12 h-12 rounded-full shrink-0" />}
                        <div className="min-w-0">
                          <p className="font-semibold truncate">{pageInfo.name}</p>
                          <p className="text-sm text-muted-foreground break-all">ID: {pageInfo.id}</p>
                        </div>
                      </div>
                    )}
                    <div className="space-y-2">
                      <Label>Webhook Verify Token</Label>
                      {/* Acá había un valor FIJO escrito en el código
                          ("salesbot_messenger_2024") que NO es el token que el
                          servidor valida. Quien lo copiaba a Facebook
                          Developers se quedaba con la verificación del webhook
                          fallando sin entender por qué. Ahora se muestra el
                          token real del negocio, y si no hay ninguno se dice
                          en vez de inventar uno. */}
                      {/* Nunca el valor: solo que existe y sus últimos 4. Es el
                          mismo que el dueño escribió y pegó en Meta. */}
                      <Input
                        value={config.hasMessengerVerifyToken ? `Guardado ••••${config.messengerVerifyTokenUltimos4 || ""}` : ""}
                        readOnly
                        placeholder="Sin configurar — poné uno en Configuración y usá ESE en Meta"
                        className="font-mono text-sm"
                      />
                      <p className="text-xs text-muted-foreground">
                        {config.hasMessengerVerifyToken
                          ? "Usa este token al configurar el webhook en Facebook Developers. La URL del webhook es:"
                          : "Todavía no hay token propio: cargá uno arriba y usá ese mismo en Facebook Developers. La URL del webhook es:"}
                        <code className="block mt-1 p-1 bg-muted rounded text-xs break-all">{window.location.origin}/api/facebook/messenger/webhook</code>
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button onClick={subscribeMessenger} disabled={subscribing || !pageInfo}>
                        {subscribing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <MessageCircle className="mr-2 h-4 w-4" />}
                        Suscribir al webhook
                      </Button>
                      <Button variant="outline" onClick={loadPageInfo}>
                        <RefreshCw className="mr-2 h-4 w-4" /> Actualizar info
                      </Button>
                    </div>
                    <Alert>
                      <Globe className="h-4 w-4" />
                      <AlertDescription>
                        Una vez suscrito, los mensajes que lleguen a tu página de Facebook serán respondidos automáticamente por el agente de IA.
                      </AlertDescription>
                    </Alert>
                  </CardContent>
                </Card>
              </div>
            )}

            {tab === "comments" && connected && (
              <div className="grid gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2"><MessageSquare className="h-5 w-5" /> Respuesta automática a comentarios</CardTitle>
                    <CardDescription>El bot responde automáticamente a los comentarios en tus publicaciones de Facebook.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <Alert>
                      <Globe className="h-4 w-4" />
                      <AlertDescription>
                        Para activar la respuesta automática a comentarios, configura el webhook de Facebook en:
                        <code className="block mt-1 p-1 bg-muted rounded text-xs break-all">{window.location.origin}/api/facebook/comments/webhook</code>
                        {/* Mismo caso que en Messenger: el valor fijo que
                            estaba acá no es el que el servidor valida. */}
                        <span className="block mt-1 text-xs">
                          Verify Token: <strong>{config.hasMessengerVerifyToken ? `el que guardaste (••••${config.messengerVerifyTokenUltimos4 || ""})` : "sin configurar — cargá uno en Configuración"}</strong>
                        </span>
                      </AlertDescription>
                    </Alert>
                    <p className="text-sm text-muted-foreground">
                      También puedes activar el polling automático para revisar comentarios nuevos cada 60 segundos:
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Button onClick={startPolling} disabled={pollingActive}>
                        <Radio className="mr-2 h-4 w-4 shrink-0" /> Iniciar monitoreo automático
                      </Button>
                      <Button variant="outline" onClick={stopPolling} disabled={!pollingActive}>
                        Detener monitoreo
                      </Button>
                    </div>
                    {pollingActive && (
                      <Alert className="border-green-500">
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                        <AlertDescription>Monitoreo automático de comentarios ACTIVO (cada 60s)</AlertDescription>
                      </Alert>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}

            {tab === "agent" && (
              <div className="grid gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2"><Radio className="h-5 w-5" /> Agente de Anuncios (asistido)</CardTitle>
                    <CardDescription>
                      Revisa tus campañas activas dos veces: cada hora frena las que están quemando presupuesto sin resultados,
                      y cada 6 horas mira la tendencia de los últimos días para sugerir escalar o bajar presupuesto.
                      Nunca ejecuta nada solo -- te manda la sugerencia por WhatsApp y espera tu aprobación.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex flex-wrap gap-2">
                      <Button onClick={runAgentNow} disabled={runningAgentNow}>
                        {runningAgentNow ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                        Revisar ahora
                      </Button>
                      <Button variant="outline" onClick={loadAgentLogs} disabled={loadingAgentLogs}>
                        {loadingAgentLogs ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                        Actualizar historial
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Historial de decisiones ({agentLogs.length})</CardTitle>
                    <CardDescription>Cada fila es una revisión: lo que encontró, qué propuso, y si la aprobaste.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {agentLogs.length === 0 ? (
                      <div className="text-center text-muted-foreground py-8">
                        <Radio className="h-10 w-10 mx-auto mb-2 opacity-50" />
                        <p>Todavía no hay revisiones registradas.</p>
                        <p className="text-sm">El agente corre solo cada 1h y 6h, o tocá "Revisar ahora".</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {agentLogs.map(log => {
                          const statusColor: Record<string, string> = {
                            suggested: "bg-amber-500/20 text-amber-500",
                            approved: "bg-green-500/20 text-green-500",
                            rejected: "bg-red-500/20 text-red-500",
                            auto_applied: "bg-blue-500/20 text-blue-500",
                            no_action: "bg-muted text-muted-foreground",
                          };
                          const statusLabel: Record<string, string> = {
                            suggested: "Esperando respuesta",
                            approved: "Aprobado y aplicado",
                            rejected: "Descartado",
                            auto_applied: "Aplicado",
                            no_action: "Sin acción",
                          };
                          const actionLabel: Record<string, string> = {
                            pause: "⏸️ Pausar", resume: "▶️ Reactivar",
                            increase_budget: "📈 Subir presupuesto", decrease_budget: "📉 Bajar presupuesto",
                          };
                          return (
                            <div key={log.id} className="p-4 bg-muted rounded-lg">
                              <div className="flex flex-wrap items-center gap-2 mb-1">
                                <h4 className="font-semibold min-w-0 truncate">{log.productName || log.campaignId}</h4>
                                <span className={`shrink-0 px-2 py-0.5 rounded text-xs font-medium ${statusColor[log.status] || ""}`}>
                                  {statusLabel[log.status] || log.status}
                                </span>
                                <span className="shrink-0 px-2 py-0.5 rounded text-xs bg-primary/10 text-primary">
                                  {log.checkType === "spend_protection" ? "Protección de gasto" : "Revisión de tendencia"}
                                </span>
                                {log.suggestedAction && (
                                  <span className="shrink-0 text-xs text-muted-foreground">{actionLabel[log.suggestedAction]}</span>
                                )}
                              </div>
                              <p className="text-sm text-muted-foreground">{log.reason}</p>
                              <p className="text-xs text-muted-foreground mt-1">
                                {new Date(log.createdAt).toLocaleDateString("es-CO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                              </p>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}

            {tab === "channels" && (
              <div className="grid gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2"><Radio className="h-5 w-5" /> Estado de Canales</CardTitle>
                    <CardDescription>Visión general de todos los canales de comunicación integrados con el mismo agente de IA.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {channelStatus.map(ch => (
                        <div key={ch.channel} className="flex items-center justify-between p-4 bg-muted rounded-lg">
                          <div className="flex items-center gap-3">
                            {ch.connected ? <CheckCircle2 className="h-5 w-5 text-green-500" /> : <XCircle className="h-5 w-5 text-destructive" />}
                            <div>
                              <p className="font-medium">{ch.label}</p>
                              {/* El motivo se venía calculando y tirando: decir
                                  "Desconectado" sin decir qué falta obliga a
                                  adivinar cuál de cinco campos es. */}
                              <p className="text-sm text-muted-foreground">
                                {ch.connected ? "Conectado" : (ch.error || "Desconectado")}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                      {channelStatus.length === 0 && (
                        <div className="text-center py-8 text-muted-foreground">
                          <Radio className="h-12 w-12 mx-auto mb-2 opacity-50" />
                          <p>No hay información de canales. Conecta Facebook primero.</p>
                        </div>
                      )}
                    </div>
                    <div className="mt-4">
                      <Button variant="outline" onClick={loadChannelStatus} className="w-full">
                        <RefreshCw className="mr-2 h-4 w-4" /> Actualizar estado
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Arquitectura Multi-Canal</CardTitle>
                    <CardDescription>Todos los canales usan el mismo agente de IA y catálogo de productos.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="p-4 bg-muted rounded-lg text-sm space-y-2">
                      <p>🤖 <strong>Agente IA Unificado</strong> → Misma IA para todos los canales</p>
                      <p>📦 <strong>Catálogo compartido</strong> → Mismos productos en todos los canales</p>
                      <p>💳 <strong>Pagos integrados</strong> → Mercado Pago, PayPal, Nequi</p>
                      <p>📊 <strong>Dashboard único</strong> → Todas las conversaciones en un solo lugar</p>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {tab !== "config" && tab !== "channels" && !connected && (
              <Alert><XCircle className="h-4 w-4" /><AlertDescription>Configura y conecta Facebook primero en la pestaña "Configuración".</AlertDescription></Alert>
            )}
          </>
        )}

        {/* Modal: Detalle de producto (pestaña Anuncios) */}
        <Dialog open={!!productDetail} onOpenChange={(open) => { if (!open) setProductDetail(null); }}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Package className="h-5 w-5" /> {productDetail?.name}
              </DialogTitle>
              <DialogDescription>Informacion completa del producto seleccionado.</DialogDescription>
            </DialogHeader>
            {productDetail && (
              <div className="space-y-4">
                {productDetail.imageUrl && (
                  <div className="rounded-lg overflow-hidden border">
                    <img src={productDetail.imageUrl} alt={productDetail.name} className="w-full max-h-64 object-cover" />
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><Label className="text-muted-foreground">ID</Label><p className="font-semibold">{productDetail.id}</p></div>
                  <div><Label className="text-muted-foreground">Categoria</Label><p className="font-semibold">{productDetail.category || "Sin categoria"}</p></div>
                  <div><Label className="text-muted-foreground">Precio</Label><p className="font-semibold text-lg text-green-600">${Number(productDetail.price).toLocaleString("es-CO")} COP</p></div>
                </div>
                {(productDetail as any).description && (
                  <div>
                    <Label className="text-muted-foreground">Descripcion</Label>
                    <p className="text-sm mt-1 whitespace-pre-wrap">{(productDetail as any).description}</p>
                  </div>
                )}
                {Array.isArray((productDetail as any).features) && (productDetail as any).features.length > 0 && (
                  <div>
                    <Label className="text-muted-foreground">Caracteristicas</Label>
                    <ul className="text-sm mt-1 space-y-1">
                      {(productDetail as any).features.map((f: string, i: number) => (
                        <li key={i} className="flex items-start gap-2"><CheckCircle2 className="h-4 w-4 text-green-500 shrink-0 mt-0.5" /> {f}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
            <DialogFooter className="flex gap-2">
              <Button variant="outline" onClick={() => setProductDetail(null)}>Cerrar</Button>
              <Button onClick={() => { if (productDetail) suggestAudience(productDetail); setProductDetail(null); }}>
                <Megaphone className="h-4 w-4 mr-2" /> Crear anuncio con este producto
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Modal: Editor de borrador */}
        <Dialog open={!!editingDraft} onOpenChange={(open) => { if (!open) setEditingDraft(null); }}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Pencil className="h-5 w-5" /> Editar borrador: {editingDraft?.productName}
              </DialogTitle>
              <DialogDescription>Modifica el texto del anuncio, el titulo y el presupuesto antes de publicarlo en Facebook.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Titular (headline)</Label>
                <Input value={editHeadline} onChange={(e) => setEditHeadline(e.target.value)} maxLength={40} placeholder="Ej: Curso profesional de piano" />
                <p className="text-xs text-muted-foreground mt-1">{editHeadline.length}/40 caracteres</p>
              </div>
              <div>
                <Label>Texto principal del anuncio</Label>
                <Textarea
                  value={editPrimaryText}
                  onChange={(e) => setEditPrimaryText(e.target.value)}
                  rows={6}
                  placeholder="Ej: Aprende a tocar piano desde cero..."
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {editPrimaryText.length} caracteres · lo que se ve antes de "Ver más" son las primeras ~125: ahí tiene que estar el gancho.
                </p>
              </div>
              <div>
                <Label>Descripción (línea del enlace)</Label>
                <Input value={editDescription} onChange={(e) => setEditDescription(e.target.value)} maxLength={60} placeholder="Ej: $45.000 · Pagas al recibir" />
                <p className={`text-xs mt-1 ${editDescription.length > 30 ? "text-amber-600" : "text-muted-foreground"}`}>
                  {editDescription.length}/30 caracteres · se muestra bajo el titular{editDescription.length > 30 ? " — Meta la corta pasando los 30" : ""}.
                </p>
              </div>
              <div>
                <Label>Presupuesto diario (COP)</Label>
                <Input type="number" value={editBudget} onChange={(e) => setEditBudget(Number(e.target.value))} min={1000} />
              </div>

              {/* ── SEGMENTACIÓN y OBJETIVO ────────────────────────────────
                  La segmentación ya se generaba (y Meta la leía) pero no se
                  veía: para ajustar el público había que pedirle otro
                  borrador a Atlas. Y el objetivo quedaba SIEMPRE en el
                  default por modelo (físico → WhatsApp) aunque hubiera
                  landing publicada — pedido del dueño 03-10. */}
              <div className="rounded-md border p-3 space-y-3 bg-muted/30">
                <div className="flex items-center gap-2">
                  <Target className="h-4 w-4 text-muted-foreground" />
                  <Label className="mb-0">Segmentación del público</Label>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  <div><Label>Edad mín.</Label><Input type="number" min={13} max={65} value={editAgeMin} onChange={(e) => setEditAgeMin(Number(e.target.value))} /></div>
                  <div><Label>Edad máx.</Label><Input type="number" min={13} max={65} value={editAgeMax} onChange={(e) => setEditAgeMax(Number(e.target.value))} /></div>
                  <div><Label>Género</Label>
                    <select className="h-10 w-full rounded-md border bg-background px-2 text-sm" value={editGenero} onChange={(e) => setEditGenero(e.target.value as any)}>
                      <option value="todos">Todos</option><option value="hombres">Hombres</option><option value="mujeres">Mujeres</option>
                    </select>
                  </div>
                  <div><Label>Objetivo</Label>
                    <select className="h-10 w-full rounded-md border bg-background px-2 text-sm" value={editObjetivo} onChange={(e) => setEditObjetivo(e.target.value as any)}>
                      <option value="mensajes">Mensajes (WhatsApp)</option>
                      <option value="ventas">Ventas (landing/tienda)</option>
                      <option value="trafico">Tráfico (landing/tienda)</option>
                      <option value="reconocimiento">Reconocimiento</option>
                    </select>
                  </div>
                </div>
                <div><Label>Intereses (separados por coma)</Label><Input value={editIntereses} onChange={(e) => setEditIntereses(e.target.value)} placeholder="Ej: Compras online, Bienestar, Hogar" /></div>
                <div><Label>Ciudades (separadas por coma — vacío = todo el país)</Label><Input value={editCiudades} onChange={(e) => setEditCiudades(e.target.value)} placeholder="Ej: Cali, Palmira" /></div>
                <p className="text-xs text-muted-foreground">
                  {editObjetivo === "mensajes"
                    ? "El anuncio abre el WhatsApp del negocio con el mensaje ya escrito."
                    : "El anuncio lleva a la landing publicada del producto; si no hay, a la página del producto en la tienda."}
                  {" "}Los intereses se validan contra la taxonomía de Meta al subir; si alguno no existe, te avisa y NO se crea nada.
                </p>
              </div>

              <div>
                <Label>Fotos del anuncio ({editImages.length}{editImages.length > 1 ? " · se publica como carrusel" : ""})</Label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {editImages.map((url, i) => (
                    <div key={i} className="relative w-24 h-24 rounded-lg overflow-hidden border group">
                      <img src={url} alt={`Foto ${i + 1}`} className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => removeDraftImage(i)}
                        className="absolute top-1 right-1 bg-black/60 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        ✕
                      </button>
                      {i === 0 && <span className="absolute bottom-0 inset-x-0 bg-black/60 text-white text-[10px] text-center py-0.5">Principal</span>}
                    </div>
                  ))}
                  <label className="w-24 h-24 rounded-lg border-2 border-dashed flex flex-col items-center justify-center cursor-pointer text-muted-foreground hover:border-primary hover:text-primary transition-colors">
                    {uploadingImage ? <Loader2 className="h-5 w-5 animate-spin" /> : <span className="text-2xl leading-none">+</span>}
                    <span className="text-[10px] mt-1">Agregar</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={uploadingImage}
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) addDraftImage(f); e.target.value = ""; }}
                    />
                  </label>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Subí tu propia foto (o varias — se publican como carrusel, la persona desliza entre ellas). Si no subís ninguna, se usa la del producto.
                </p>
                {/* ── Las MEJORAS DE IA DE META que llevará el anuncio ──────
                    La misma verdad que el backend arma en el creativo
                    (creative_features_spec): texto/CTA siempre; los retoques
                    solo con foto REAL (el placeholder los desactiva); y el
                    video solo con el carrusel de fotos reales. Verlo acá
                    evita "por qué mi anuncio no lleva mejoras". */}
                {(() => {
                  const conFotoReal = editImages.length > 0 && !editImages.some((u) => /placehold\.co/i.test(u));
                  const conVideo = conFotoReal && editImages.length > 1;
                  return (
                    <div className="mt-3 rounded-md border bg-background/60 p-3 space-y-1.5">
                      <p className="text-xs font-semibold">Mejoras de IA de Meta (al subir este anuncio)</p>
                      <p className="text-xs text-muted-foreground">✓ Optimización del texto — Meta prueba variantes del copy</p>
                      <p className="text-xs text-muted-foreground">✓ CTA optimizado automáticamente</p>
                      {conFotoReal ? (
                        <p className="text-xs text-muted-foreground">✓ Retoques de imagen, luz y ajuste a cada formato (feed/reels/stories)</p>
                      ) : (
                        <p className="text-xs text-amber-600">⚠️ Sin foto real del producto: los retoques de imagen quedan desactivados</p>
                      )}
                      {conVideo && <p className="text-xs text-muted-foreground">✓ Meta arma un VIDEO con tus {editImages.length} fotos</p>}
                    </div>
                  );
                })()}
              </div>

              {/* ── CÓMO SE VERÍA PUBLICADO ────────────────────────────────
                  El mock del anuncio tal como lo muestra el feed: los campos
                  de arriba (los editados), no una promesa. Antes no había
                  forma de VERLO sin publicarlo. */}
              <div className="rounded-md border bg-muted/30 p-3">
                <button type="button" onClick={() => setVerVistaPrevia(!verVistaPrevia)} className="flex w-full items-center justify-between text-left">
                  <span className="flex items-center gap-2 text-sm font-medium">
                    <Globe className="h-4 w-4 text-muted-foreground" /> Ver cómo se vería publicado
                  </span>
                  <span className="text-xs text-muted-foreground">{verVistaPrevia ? "ocultar" : "mostrar"}</span>
                </button>
                {verVistaPrevia && (
                  <div className="mt-3 max-w-md mx-auto overflow-hidden rounded-lg border bg-background text-sm">
                    <div className="flex items-center gap-2 p-2.5">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full border bg-primary/15">
                        <span className="text-[10px] font-bold text-primary">FB</span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-[13px] font-semibold leading-tight">Tu página</p>
                        <p className="text-[11px] text-muted-foreground">Patrocinado · ahora</p>
                      </div>
                    </div>
                    {editPrimaryText ? (
                      // Como el feed: solo la primera vista y el "Ver más" (lo de
                      // después lo lee únicamente quien toca).
                      (() => {
                        const { visible, cortado } = primeraVista(editPrimaryText);
                        return (
                          <p className="whitespace-pre-wrap break-words px-2.5 pb-2 text-[13px]">
                            {visible}
                            {cortado ? <span className="text-muted-foreground">… Ver más</span> : null}
                          </p>
                        );
                      })()
                    ) : (
                      <p className="px-2.5 pb-2 text-[13px] text-muted-foreground">(sin texto todavía)</p>
                    )}
                    {editImages[0] ? (
                      <div className="relative bg-muted">
                        <img src={editImages[0]} alt="Creativo del anuncio" className="aspect-[4/5] w-full object-cover" />
                        {editImages.length > 1 ? (
                          <span className="absolute bottom-2 right-2 rounded-full bg-black/70 px-2 py-0.5 text-[11px] text-white">
                            1/{editImages.length} · carrusel
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                    <div className="flex items-center justify-between border-t p-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-[11px] text-muted-foreground">{destinoDelAnuncio(editObjetivo)}</p>
                        {/* El TITULAR va acá, en negrita: antes el mock no lo mostraba. */}
                        {editHeadline ? <p className="truncate text-[13px] font-semibold">{editHeadline}</p> : <p className="text-[12px] text-amber-600">(sin titular)</p>}
                        {editDescription ? <p className="truncate text-[12px] text-muted-foreground">{editDescription}</p> : null}
                      </div>
                      <span className="ml-2 shrink-0 rounded bg-primary/10 px-2.5 py-1.5 text-[12px] font-semibold text-primary">
                        {ctaDelAnuncio(editingDraft, editObjetivo)}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
            <DialogFooter className="flex gap-2">
              <Button variant="outline" onClick={() => setEditingDraft(null)}>Cancelar</Button>
              <Button onClick={saveEditedDraft} disabled={savingDraft}>
                {savingDraft ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                {savingDraft ? "Guardando..." : "Guardar cambios"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}

interface CuentaPub {
  id: string;
  nombre: string;
  moneda: string;
  activa: boolean;
  enUso: boolean;
  empresa?: { id: string; nombre: string } | null;
}

/**
 * Elegir la cuenta publicitaria de ESTE negocio entre las que ve su conexión
 * de Meta (propias + Business Manager), con moneda y estado.
 *
 * Caso real 30-09-2026: la app quedó en una cuenta USD, el candado de
 * cuenta bloqueó la subida (solo se publica en COP), y el panel
 * solo tenía un campo de texto escondido en "manual / avanzado" que además no
 * actualizaba la cuenta autorizada. Esto lista y guarda de verdad.
 */
function CuentaPublicitariaSelector({ onCambio }: { onCambio: (id: string) => void }) {
  const { toast } = useToast();
  const [cuentas, setCuentas] = useState<CuentaPub[]>([]);
  const [avisos, setAvisos] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(true);
  const [elegida, setElegida] = useState("");
  const [guardando, setGuardando] = useState(false);

  const cargar = async () => {
    setCargando(true);
    try {
      const j = await apiRequest("/facebook/adaccounts");
      const lista: CuentaPub[] = j.cuentas || [];
      setCuentas(lista);
      setAvisos(j.avisos || []);
      setError(j.error || "");
      setElegida(lista.find((c) => c.enUso)?.id || "");
    } catch (e: any) {
      setError(e?.message || "No se pudieron leer las cuentas");
    } finally {
      setCargando(false);
    }
  };
  useEffect(() => { cargar(); }, []);

  const enUso = cuentas.find((c) => c.enUso);
  const guardar = async () => {
    if (!elegida || elegida === enUso?.id) return;
    setGuardando(true);
    try {
      const r = await apiRequest("/facebook/adaccounts/activa", { method: "POST", body: JSON.stringify({ adAccountId: elegida }) });
      toast({ title: "Cuenta publicitaria cambiada", description: r.message });
      onCambio(elegida);
      await cargar();
    } catch (e: any) {
      toast({ title: "No se pudo cambiar la cuenta", description: describeError(e, "No se pudo cambiar la cuenta publicitaria."), variant: "destructive" });
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><BarChart3 className="h-5 w-5" /> Cuenta publicitaria</CardTitle>
        <CardDescription>
          Dónde se crean tus anuncios. Solo se publica en una cuenta en pesos colombianos (COP).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {cargando ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Consultando a Meta…</div>
        ) : error ? (
          <Alert variant="destructive"><XCircle className="h-4 w-4" /><AlertDescription className="break-words">No se pudieron leer tus cuentas: {error}</AlertDescription></Alert>
        ) : cuentas.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Tu conexión de Facebook no ve ninguna cuenta publicitaria. Reconectá y, en la pantalla de Meta, tildá la cuenta que querés usar.
          </p>
        ) : (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Select value={elegida} onValueChange={setElegida}>
              <SelectTrigger className="w-full sm:w-[420px]"><SelectValue placeholder="Elegí una cuenta" /></SelectTrigger>
              <SelectContent>
                {cuentas.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.nombre} · {c.moneda || "?"} · {c.id}{c.activa ? "" : " · no activa"}{c.enUso ? " · en uso" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={guardar} disabled={guardando || !elegida || elegida === enUso?.id} className="w-full sm:w-auto">
              {guardando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Usar esta cuenta
            </Button>
          </div>
        )}
        {enUso && enUso.moneda !== "COP" && (
          <Alert variant="destructive">
            <XCircle className="h-4 w-4" />
            <AlertDescription>
              La cuenta en uso está en {enUso.moneda || "otra moneda"}: los anuncios no se van a subir.
              {cuentas.some((c) => c.moneda === "COP") ? " Elegí una cuenta en COP de la lista." : " No hay ninguna cuenta en COP visible: reconectá Facebook y tildá tu cuenta en COP."}
            </AlertDescription>
          </Alert>
        )}
        {avisos.length > 0 && (
          <p className="text-xs text-muted-foreground break-words">{avisos.join(" ")}</p>
        )}
      </CardContent>
    </Card>
  );
}
