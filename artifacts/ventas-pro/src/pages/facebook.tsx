import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, CheckCircle2, XCircle, RefreshCw, Megaphone, Package, Target, MapPin, Settings2, MessageCircle, Store, MessageSquare, Radio, Globe, FileText, Trash2, Play, Pencil } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Layout } from "@/components/layout";

const apiRequest = async (endpoint: string, options: RequestInit = {}) => {
  const response = await fetch(`/api${endpoint}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
    credentials: "include",
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Error desconocido" }));
    throw new Error(error.error || error.message || "Error en la solicitud");
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
}

interface Product {
  id: number;
  name: string;
  price: number;
  category: string;
  image_url: string;
}

interface FbAudience {
  description: string;
  targeting: { ageMin: number; ageMax: number; genders: number[]; geoLocations?: any; interests?: Array<{ id: string; name: string }> };
  rationale: string;
}

interface MarketplaceListing {
  id: string;
  name: string;
  price: string;
  status: string;
  listingUrl: string;
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
  niche: string | null;
  budget: number | null;
  createdAt: string;
}

type Tab = "config" | "ads" | "messenger" | "marketplace" | "comments" | "channels" | "drafts";

export default function FacebookAdsPage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [connected, setConnected] = useState<boolean | null>(null);

  const [config, setConfig] = useState<FbConfig>({
    accessToken: "", pixelId: "", catalogId: "", pageId: "", adAccountId: "", hasToken: false,
  });
  const [rawToken, setRawToken] = useState("");

  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [audience, setAudience] = useState<FbAudience | null>(null);
  const [budget, setBudget] = useState(5000);
  const [city, setCity] = useState("");
  const [creating, setCreating] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [tab, setTab] = useState<Tab>("config");

  const [pageInfo, setPageInfo] = useState<PageInfo | null>(null);
  const [subscribing, setSubscribing] = useState(false);
  const [listings, setListings] = useState<MarketplaceListing[]>([]);
  const [loadingListings, setLoadingListings] = useState(false);
  const [creatingListing, setCreatingListing] = useState(false);
  const [selectedListingProduct, setSelectedListingProduct] = useState<number | null>(null);
  const [channelStatus, setChannelStatus] = useState<ChannelStatus[]>([]);
  const [pollingActive, setPollingActive] = useState(false);

  const [drafts, setDrafts] = useState<DraftAd[]>([]);
  const [loadingDrafts, setLoadingDrafts] = useState(false);
  const [creatingDraft, setCreatingDraft] = useState(false);
  const [creatingAllDrafts, setCreatingAllDrafts] = useState(false);
  const [selectedDraftProduct, setSelectedDraftProduct] = useState<number | null>(null);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [cfg, prods] = await Promise.all([
        apiRequest("/facebook/config").catch(() => null),
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
          accessToken: rawToken || undefined,
          pixelId: config.pixelId,
          catalogId: config.catalogId,
          pageId: config.pageId,
          adAccountId: config.adAccountId,
        }),
      });
      toast({ title: "Guardado", description: "Configuración de Facebook guardada" });
      setRawToken("");
      const cfg = await apiRequest("/facebook/config");
      if (cfg) setConfig(cfg);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
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
      toast({ title: "Error", description: e.message, variant: "destructive" });
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
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const createAd = async () => {
    if (!selectedProduct) return;
    try {
      setCreating(true);
      setResult(null);
      const targeting: any = {};
      if (city) targeting.geoLocations = { cities: [city.trim()], countries: ["CO"] };
      if (audience) { targeting.ageMin = audience.targeting.ageMin; targeting.ageMax = audience.targeting.ageMax; }
      const res = await apiRequest(`/facebook/create-ad/${selectedProduct.id}`, {
        method: "POST",
        body: JSON.stringify({ budget, targeting }),
      });
      setResult(res);
      toast({ title: "Anuncio creado", description: `Anuncio para ${selectedProduct.name} creado (pausado)` });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setCreating(false); }
  };

  const syncCatalog = async () => {
    try {
      setSyncing(true);
      const res = await apiRequest("/facebook/sync-catalog", { method: "POST" });
      toast({ title: "Catálogo sincronizado", description: `${res.synced} productos, ${res.failed} fallos` });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
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
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setSubscribing(false); }
  };

  const loadListings = async () => {
    try {
      setLoadingListings(true);
      const res = await apiRequest("/facebook/marketplace/listings?status=ALL");
      setListings(res.listings || []);
    } catch { setListings([]); }
    finally { setLoadingListings(false); }
  };

  const createListing = async () => {
    if (!selectedListingProduct) return;
    try {
      setCreatingListing(true);
      const res = await apiRequest(`/facebook/marketplace/listings/${selectedListingProduct}`, { method: "POST" });
      if (res.id) {
        toast({ title: "Listing creado", description: `Producto publicado en Marketplace` });
        loadListings();
      }
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setCreatingListing(false); }
  };

  const syncAllMarketplace = async () => {
    try {
      const res = await apiRequest("/facebook/marketplace/sync", { method: "POST" });
      toast({ title: "Sincronizado", description: `${res.created} creados, ${res.failed} fallos` });
      loadListings();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const loadChannelStatus = async () => {
    try {
      const res = await apiRequest("/facebook/channels/status");
      setChannelStatus(res.channels || []);
    } catch { setChannelStatus([]); }
  };

  const startPolling = async () => {
    try {
      await apiRequest("/facebook/channels/polling/start", { method: "POST" });
      setPollingActive(true);
      toast({ title: "Polling iniciado", description: "Monitoreo automático de comentarios activado" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const stopPolling = async () => {
    try {
      await apiRequest("/facebook/channels/polling/stop", { method: "POST" });
      setPollingActive(false);
      toast({ title: "Polling detenido" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
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
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setCreatingDraft(false); }
  };

  const createAllDrafts = async () => {
    try {
      setCreatingAllDrafts(true);
      const res = await apiRequest("/facebook/strategist/draft-all", { method: "POST" });
      toast({ title: "Borradores creados", description: `${res.created} creados, ${res.failed} fallos` });
      loadDrafts();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setCreatingAllDrafts(false); }
  };

  const deleteDraft = async (draftId: number) => {
    try {
      await apiRequest(`/facebook/strategist/draft/${draftId}`, { method: "DELETE" });
      toast({ title: "Borrador eliminado" });
      loadDrafts();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const publishDraft = async (draftId: number) => {
    try {
      const res = await apiRequest(`/facebook/strategist/draft/${draftId}/publish`, { method: "POST" });
      toast({ title: res.ok ? "Publicado" : "Error", description: res.message });
      loadDrafts();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const tabs = [
    { id: "config" as Tab, label: "Configuración", icon: Settings2, disabled: false },
    { id: "ads" as Tab, label: "Anuncios", icon: Megaphone, disabled: !connected },
    { id: "drafts" as Tab, label: "Borradores", icon: FileText, disabled: false },
    { id: "messenger" as Tab, label: "Messenger", icon: MessageCircle, disabled: !connected },
    { id: "marketplace" as Tab, label: "Marketplace", icon: Store, disabled: !connected },
    { id: "comments" as Tab, label: "Comentarios", icon: MessageSquare, disabled: !connected },
    { id: "channels" as Tab, label: "Canales", icon: Radio, disabled: false },
  ];

  return (
    <Layout>
      <div className="space-y-6 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Facebook Multi-Canal</h1>
            <p className="text-muted-foreground">Conecta todos los canales de Facebook: Ads, Messenger, Marketplace y Comentarios</p>
          </div>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}

        {!loading && (
          <>
            <div className="flex gap-2 border-b pb-2 flex-wrap">
              {tabs.map(t => (
                <Button
                  key={t.id}
                  variant={tab === t.id ? "default" : "ghost"}
                  onClick={() => { setTab(t.id); if (t.id === "messenger") loadPageInfo(); if (t.id === "marketplace") loadListings(); if (t.id === "channels") loadChannelStatus(); if (t.id === "drafts") loadDrafts(); }}
                  size="sm"
                  disabled={t.disabled}
                >
                  <t.icon className="mr-2 h-4 w-4" /> {t.label}
                </Button>
              ))}
            </div>

            {tab === "config" && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><Settings2 className="h-5 w-5" /> Credenciales de Facebook</CardTitle>
                  <CardDescription>Datos de tu cuenta de Facebook Business para todos los canales.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label>Access Token</Label>
                      <Input type="password" value={rawToken || (config.hasToken ? "••••••••" : "")} onChange={e => setRawToken(e.target.value)} placeholder="FB_ACCESS_TOKEN" />
                      {config.hasToken && !rawToken && <p className="text-xs text-muted-foreground mt-1">Token ya configurado</p>}
                    </div>
                    <div><Label>Pixel ID</Label><Input value={config.pixelId} onChange={e => setConfig({...config, pixelId: e.target.value})} placeholder="FB_PIXEL_ID" /></div>
                    <div><Label>Catalog ID</Label><Input value={config.catalogId} onChange={e => setConfig({...config, catalogId: e.target.value})} placeholder="FB_CATALOG_ID" /></div>
                    <div><Label>Page ID</Label><Input value={config.pageId} onChange={e => setConfig({...config, pageId: e.target.value})} placeholder="FB_PAGE_ID" /></div>
                    <div><Label>Ad Account ID</Label><Input value={config.adAccountId} onChange={e => setConfig({...config, adAccountId: e.target.value})} placeholder="FB_AD_ACCOUNT_ID (solo números)" /></div>
                  </div>
                  <div className="flex gap-2">
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
            )}

            {tab === "ads" && connected && (
              <div className="grid gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2"><Package className="h-5 w-5" /> Productos</CardTitle>
                    <CardDescription>Selecciona un producto para crear un anuncio.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {products.map(p => (
                        <Card key={p.id} className={`cursor-pointer transition-all ${selectedProduct?.id === p.id ? "ring-2 ring-primary" : "hover:bg-accent/50"}`} onClick={() => suggestAudience(p)}>
                          <CardContent className="p-4">
                            <div className="aspect-video bg-muted rounded-md mb-3 overflow-hidden">
                              {p.image_url ? <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" /> : <div className="flex items-center justify-center h-full text-muted-foreground"><Megaphone className="h-8 w-8" /></div>}
                            </div>
                            <h3 className="font-semibold truncate">{p.name}</h3>
                            <p className="text-sm text-muted-foreground">${Number(p.price).toLocaleString("es-CO")} COP</p>
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
                          <div><Label>Ciudad objetivo</Label><Input value={city} onChange={e => setCity(e.target.value)} placeholder="Ej: Bogotá, Medellín" /></div>
                        </div>
                        <Button onClick={createAd} disabled={creating} className="w-full">
                          {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Megaphone className="mr-2 h-4 w-4" />}
                          {creating ? "Creando..." : `Crear anuncio para ${selectedProduct.name}`}
                        </Button>
                      </CardContent>
                    </Card>
                  </>
                )}
                {result && (
                  <Alert className="border-green-500">
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    <AlertDescription>
                      <p className="font-semibold">Anuncio creado</p>
                      <p className="text-sm">Campaña: {result.campaignId} | Anuncio: {result.adId}</p>
                      {result.adCopy && <div className="mt-2 p-2 bg-muted rounded text-xs"><p><strong>Texto:</strong> {result.adCopy.primaryText}</p></div>}
                    </AlertDescription>
                  </Alert>
                )}
                <div className="flex justify-center">
                  <Button variant="outline" onClick={syncCatalog} disabled={syncing}>
                    {syncing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                    Sincronizar catálogo
                  </Button>
                </div>
              </div>
            )}

            {tab === "drafts" && (
              <div className="grid gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5" /> Borradores de Anuncios (Megapacks)</CardTitle>
                    <CardDescription>Gestiona los borradores de anuncios para tus productos. Los borradores se crean en estado PAUSED en Facebook.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label>Crear borrador para producto</Label>
                        <select
                          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
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
                    <div className="flex gap-2">
                      <Button variant="outline" onClick={createAllDrafts} disabled={creatingAllDrafts}>
                        {creatingAllDrafts ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Package className="mr-2 h-4 w-4" />}
                        Crear borradores para TODOS los productos (Megapacks)
                      </Button>
                      <Button variant="outline" onClick={loadDrafts} disabled={loadingDrafts}>
                        {loadingDrafts ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                        Actualizar lista
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
                          <div key={d.id} className="flex items-start justify-between p-4 bg-muted rounded-lg gap-4">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <h4 className="font-semibold truncate">{d.productName}</h4>
                                <span className={`px-2 py-0.5 rounded text-xs font-medium ${d.status === "published" ? "bg-green-500/20 text-green-500" : "bg-amber-500/20 text-amber-500"}`}>
                                  {d.status === "published" ? "Publicado" : d.status === "created" ? "Creado en FB" : "Borrador"}
                                </span>
                                {d.fbStatus && <span className="px-2 py-0.5 rounded text-xs bg-blue-500/20 text-blue-500">{d.fbStatus}</span>}
                              </div>
                              {d.niche && <p className="text-xs text-muted-foreground mt-1">Estrategia: {d.niche}</p>}
                              {d.budget && <p className="text-xs text-muted-foreground">Presupuesto: ${d.budget.toLocaleString("es-CO")} COP/día</p>}
                              {d.headline && <p className="text-sm mt-2 line-clamp-2">{d.headline}</p>}
                              {d.primaryText && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{d.primaryText}</p>}
                              <p className="text-xs text-muted-foreground mt-1">
                                Creado: {new Date(d.createdAt).toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                              </p>
                            </div>
                            <div className="flex flex-col gap-2 shrink-0">
                              {d.status !== "published" && d.adId && (
                                <Button size="sm" onClick={() => publishDraft(d.id)} title="Publicar anuncio">
                                  <Play className="h-4 w-4" />
                                </Button>
                              )}
                              {d.adId && (
                                <Button size="sm" variant="outline" onClick={() => window.open(`https://www.facebook.com/adsmanager/manage/ads?act=${d.adId}`, "_blank")} title="Ver en Facebook">
                                  <Globe className="h-4 w-4" />
                                </Button>
                              )}
                              <Button size="sm" variant="destructive" onClick={() => deleteDraft(d.id)} title="Eliminar borrador">
                                <Trash2 className="h-4 w-4" />
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
                    <CardTitle className="flex items-center gap-2"><MessageCircle className="h-5 w-5" /> Facebook Messenger Bot</CardTitle>
                    <CardDescription>Configura el bot para responder automáticamente mensajes de Messenger con la misma IA de WhatsApp.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {pageInfo && (
                      <div className="flex items-center gap-4 p-4 bg-muted rounded-lg">
                        {pageInfo.picture && <img src={pageInfo.picture} alt="" className="w-12 h-12 rounded-full" />}
                        <div>
                          <p className="font-semibold">{pageInfo.name}</p>
                          <p className="text-sm text-muted-foreground">ID: {pageInfo.id}</p>
                        </div>
                      </div>
                    )}
                    <div className="space-y-2">
                      <Label>Webhook Verify Token</Label>
                      <Input value="salesbot_messenger_2024" readOnly className="font-mono text-sm" />
                      <p className="text-xs text-muted-foreground">
                        Usa este token al configurar el webhook en Facebook Developers. La URL del webhook es:
                        <code className="block mt-1 p-1 bg-muted rounded text-xs">{window.location.origin}/api/facebook/messenger/webhook</code>
                      </p>
                    </div>
                    <div className="flex gap-2">
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

            {tab === "marketplace" && connected && (
              <div className="grid gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2"><Store className="h-5 w-5" /> Publicar en Marketplace</CardTitle>
                    <CardDescription>Publica tus productos directamente en Facebook Marketplace.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label>Seleccionar producto</Label>
                        <select
                          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                          value={selectedListingProduct || ""}
                          onChange={e => setSelectedListingProduct(Number(e.target.value) || null)}
                        >
                          <option value="">-- Selecciona un producto --</option>
                          {products.map(p => (
                            <option key={p.id} value={p.id}>{p.name} - ${Number(p.price).toLocaleString("es-CO")}</option>
                          ))}
                        </select>
                      </div>
                      <div className="flex items-end">
                        <Button onClick={createListing} disabled={!selectedListingProduct || creatingListing} className="w-full">
                          {creatingListing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Store className="mr-2 h-4 w-4" />}
                          Publicar en Marketplace
                        </Button>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" onClick={loadListings} disabled={loadingListings}>
                        {loadingListings ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                        Ver listings activos
                      </Button>
                      <Button variant="outline" onClick={syncAllMarketplace}>
                        <Package className="mr-2 h-4 w-4" /> Sincronizar todos los productos
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                {listings.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Listings en Marketplace ({listings.length})</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {listings.map(l => (
                          <div key={l.id} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                            <div>
                              <p className="font-medium">{l.name}</p>
                              <p className="text-sm text-muted-foreground">{l.price} | {l.status}</p>
                            </div>
                            <Button variant="outline" size="sm" onClick={() => window.open(l.listingUrl, "_blank")}>
                              <Store className="mr-2 h-4 w-4" /> Ver
                            </Button>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
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
                        <code className="block mt-1 p-1 bg-muted rounded text-xs">{window.location.origin}/api/facebook/comments/webhook</code>
                        <span className="block mt-1 text-xs">Verify Token: <strong>salesbot_messenger_2024</strong></span>
                      </AlertDescription>
                    </Alert>
                    <p className="text-sm text-muted-foreground">
                      También puedes activar el polling automático para revisar comentarios nuevos cada 60 segundos:
                    </p>
                    <div className="flex gap-2">
                      <Button onClick={startPolling} disabled={pollingActive}>
                        <Radio className="mr-2 h-4 w-4" /> Iniciar monitoreo automático
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
                              <p className="text-sm text-muted-foreground">{ch.connected ? "Conectado" : "Desconectado"}</p>
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
      </div>
    </Layout>
  );
}
