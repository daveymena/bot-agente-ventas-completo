import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, CheckCircle2, XCircle, RefreshCw, Megaphone, Package, Target, MapPin, Settings2 } from "lucide-react";
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
  const [tab, setTab] = useState<"config" | "ads">("config");

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

  return (
    <Layout>
      <div className="space-y-6 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Facebook Ads</h1>
            <p className="text-muted-foreground">Conecta tu cuenta de Facebook Business y crea anuncios para tus productos</p>
          </div>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}

        {!loading && (
          <>
            {/* ── Pestañas ── */}
            <div className="flex gap-2 border-b pb-2">
              <Button variant={tab === "config" ? "default" : "ghost"} onClick={() => setTab("config")} size="sm">
                <Settings2 className="mr-2 h-4 w-4" /> Configuración
              </Button>
              <Button variant={tab === "ads" ? "default" : "ghost"} onClick={() => setTab("ads")} size="sm" disabled={!connected}>
                <Megaphone className="mr-2 h-4 w-4" /> Crear anuncios
              </Button>
            </div>

            {/* ── TAB: Configuración ── */}
            {tab === "config" && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Settings2 className="h-5 w-5" />
                    Credenciales de Facebook
                  </CardTitle>
                  <CardDescription>
                    Ingresa los datos de tu cuenta de Facebook Business. Estos datos se guardan en tu cuenta.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label>Access Token</Label>
                      <Input
                        type="password"
                        value={rawToken || (config.hasToken ? "••••••••" : "")}
                        onChange={e => setRawToken(e.target.value)}
                        placeholder={config.hasToken ? "Token configurado" : "FB_ACCESS_TOKEN"}
                      />
                      {config.hasToken && !rawToken && <p className="text-xs text-muted-foreground mt-1">Token ya configurado. Escribe uno nuevo solo si quieres cambiarlo.</p>}
                    </div>
                    <div>
                      <Label>Pixel ID</Label>
                      <Input value={config.pixelId} onChange={e => setConfig({...config, pixelId: e.target.value})} placeholder="FB_PIXEL_ID" />
                    </div>
                    <div>
                      <Label>Catalog ID</Label>
                      <Input value={config.catalogId} onChange={e => setConfig({...config, catalogId: e.target.value})} placeholder="FB_CATALOG_ID" />
                    </div>
                    <div>
                      <Label>Page ID</Label>
                      <Input value={config.pageId} onChange={e => setConfig({...config, pageId: e.target.value})} placeholder="FB_PAGE_ID" />
                    </div>
                    <div>
                      <Label>Ad Account ID</Label>
                      <Input value={config.adAccountId} onChange={e => setConfig({...config, adAccountId: e.target.value})} placeholder="FB_AD_ACCOUNT_ID (solo números)" />
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button onClick={saveConfig} disabled={saving}>
                      {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      Guardar configuración
                    </Button>
                    <Button variant="outline" onClick={testConnection} disabled={testing}>
                      {testing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                      {connected === true ? "✓ Conectado" : connected === false ? "Reconectar" : "Probar conexión"}
                    </Button>
                  </div>

                  {connected === true && (
                    <Alert className="border-green-500">
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                      <AlertDescription>Conexión con Facebook exitosa. Ya puedes crear anuncios.</AlertDescription>
                    </Alert>
                  )}
                  {connected === false && (
                    <Alert variant="destructive">
                      <XCircle className="h-4 w-4" />
                      <AlertDescription>No se pudo conectar con Facebook. Verifica tu Access Token.</AlertDescription>
                    </Alert>
                  )}
                </CardContent>
              </Card>
            )}

            {/* ── TAB: Crear anuncios ── */}
            {tab === "ads" && connected && (
              <div className="grid gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Package className="h-5 w-5" />
                      Productos
                    </CardTitle>
                    <CardDescription>Selecciona un producto para crear un anuncio. La IA generará el copy y la audiencia sugerida automáticamente.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {products.map(p => (
                        <Card key={p.id} className={`cursor-pointer transition-all ${selectedProduct?.id === p.id ? "ring-2 ring-primary" : "hover:bg-accent/50"}`} onClick={() => suggestAudience(p)}>
                          <CardContent className="p-4">
                            <div className="aspect-video bg-muted rounded-md mb-3 overflow-hidden">
                              {p.image_url ? (
                                <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" />
                              ) : (
                                <div className="flex items-center justify-center h-full text-muted-foreground"><Megaphone className="h-8 w-8" /></div>
                              )}
                            </div>
                            <h3 className="font-semibold truncate">{p.name}</h3>
                            <p className="text-sm text-muted-foreground">${Number(p.price).toLocaleString("es-CO")} COP</p>
                            <p className="text-xs text-muted-foreground">{p.category || "General"}</p>
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
                        <CardTitle className="flex items-center gap-2">
                          <Target className="h-5 w-5" />
                          Audiencia sugerida para {selectedProduct.name}
                        </CardTitle>
                        <CardDescription>{audience.description}</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <Label>Edad mínima</Label>
                            <p className="text-2xl font-bold">{audience.targeting.ageMin}</p>
                          </div>
                          <div>
                            <Label>Edad máxima</Label>
                            <p className="text-2xl font-bold">{audience.targeting.ageMax}</p>
                          </div>
                        </div>
                        {audience.targeting.interests && audience.targeting.interests.length > 0 && (
                          <div>
                            <Label>Intereses sugeridos</Label>
                            <div className="flex flex-wrap gap-2 mt-1">
                              {audience.targeting.interests.map((i, idx) => (
                                <span key={idx} className="px-2 py-1 bg-primary/10 text-primary text-xs rounded-full">{i.name}</span>
                              ))}
                            </div>
                          </div>
                        )}
                        <p className="text-xs text-muted-foreground italic">{audience.rationale}</p>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <MapPin className="h-5 w-5" />
                          Configurar anuncio
                        </CardTitle>
                        <CardDescription>Ajusta presupuesto, ciudad y crea el anuncio</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <Label>Presupuesto diario (COP)</Label>
                            <Input type="number" value={budget} onChange={e => setBudget(Number(e.target.value))} min={1000} />
                          </div>
                          <div>
                            <Label>Ciudad objetivo (opcional)</Label>
                            <Input value={city} onChange={e => setCity(e.target.value)} placeholder="Ej: Bogotá, Medellín, Cali" />
                          </div>
                        </div>
                        <Button onClick={createAd} disabled={creating} className="w-full">
                          {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Megaphone className="mr-2 h-4 w-4" />}
                          {creating ? "Creando anuncio..." : `Crear anuncio para ${selectedProduct.name}`}
                        </Button>
                      </CardContent>
                    </Card>
                  </>
                )}

                {result && (
                  <Alert className="border-green-500">
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    <AlertDescription>
                      <p className="font-semibold">Anuncio creado exitosamente</p>
                      <p className="text-sm">Campaña: {result.campaignId} | Anuncio: {result.adId}</p>
                      <p className="text-sm">Estado: {result.status}</p>
                      {result.adCopy && (
                        <div className="mt-2 p-2 bg-muted rounded text-xs">
                          <p><strong>Texto:</strong> {result.adCopy.primaryText}</p>
                          <p><strong>Título:</strong> {result.adCopy.headline}</p>
                        </div>
                      )}
                      <Button variant="outline" size="sm" className="mt-2" onClick={() => window.open(result.previewUrl, "_blank")}>
                        Ver en Ads Manager
                      </Button>
                    </AlertDescription>
                  </Alert>
                )}

                {connected && (
                  <div className="flex justify-center">
                    <Button variant="outline" onClick={syncCatalog} disabled={syncing}>
                      {syncing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                      Sincronizar catálogo con Facebook
                    </Button>
                  </div>
                )}
              </div>
            )}

            {tab === "ads" && !connected && (
              <Alert>
                <XCircle className="h-4 w-4" />
                <AlertDescription>
                  Debes configurar y conectar Facebook en la pestaña "Configuración" primero.
                </AlertDescription>
              </Alert>
            )}
          </>
        )}
      </div>
    </Layout>
  );
}
