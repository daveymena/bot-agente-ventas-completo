import { useState, useEffect, useCallback } from "react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Search, TrendingUp, TrendingDown, Minus, Package, Plus, Loader2, BookOpen, Target, DollarSign, Users, BarChart2, AlertTriangle, CheckCircle2, History, Download } from "lucide-react";

interface TrendingProduct {
  name: string;
  estimatedCost: number;
  estimatedSellPrice: number;
  margin: number;
  demandLevel: string;
  description: string;
  keywords: string[];
  imageSearch: string;
}

interface NicheResult {
  nicheName: string;
  summary: string;
  demandScore: number;
  competitionLevel: string;
  estimatedMargin: number;
  monthlySearchVolume: string;
  trendDirection: string;
  targetAudience: string;
  recommendedPrice: { min: number; max: number };
  currency: string;
  trendingProducts: TrendingProduct[];
  marketInsights: string[];
  topChannels: string[];
  seasonality: string;
  warnings: string[];
}

interface SavedSearch {
  id: number;
  query: string;
  category: string | null;
  region: string;
  results: NicheResult;
  createdAt: string;
}

const CATEGORIES = [
  { value: "electronics", label: "Electrónica y Gadgets" },
  { value: "fashion", label: "Moda y Accesorios" },
  { value: "beauty", label: "Belleza y Cuidado Personal" },
  { value: "home", label: "Hogar y Decoración" },
  { value: "sports", label: "Deportes y Fitness" },
  { value: "kids", label: "Niños y Bebés" },
  { value: "pets", label: "Mascotas" },
  { value: "health", label: "Salud y Bienestar" },
  { value: "automotive", label: "Automotriz" },
  { value: "food", label: "Alimentos y Cocina" },
  { value: "digital", label: "Productos Digitales" },
  { value: "other", label: "Otro" },
];

const REGIONS = [
  { value: "CO", label: "Colombia" },
  { value: "MX", label: "México" },
  { value: "AR", label: "Argentina" },
  { value: "PE", label: "Perú" },
  { value: "CL", label: "Chile" },
  { value: "EC", label: "Ecuador" },
  { value: "LATAM", label: "Latinoamérica" },
];

function formatCOP(n: number) {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", minimumFractionDigits: 0 }).format(n);
}

function TrendIcon({ dir }: { dir: string }) {
  if (dir === "up") return <TrendingUp className="h-4 w-4 text-green-400" />;
  if (dir === "down") return <TrendingDown className="h-4 w-4 text-red-400" />;
  return <Minus className="h-4 w-4 text-yellow-400" />;
}

function DemandBadge({ level }: { level: string }) {
  const map: Record<string, string> = {
    high: "bg-green-500/10 text-green-400 border-green-500/20",
    medium: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
    low: "bg-red-500/10 text-red-400 border-red-500/20",
  };
  return <Badge className={`text-[10px] ${map[level] ?? map.medium}`}>{level === "high" ? "Alta demanda" : level === "low" ? "Baja demanda" : "Demanda media"}</Badge>;
}

function CompetitionBadge({ level }: { level: string }) {
  const map: Record<string, { label: string; color: string }> = {
    low: { label: "Baja competencia", color: "bg-green-500/10 text-green-400 border-green-500/20" },
    medium: { label: "Competencia media", color: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20" },
    high: { label: "Alta competencia", color: "bg-red-500/10 text-red-400 border-red-500/20" },
  };
  const cfg = map[level] ?? map.medium;
  return <Badge className={`text-xs ${cfg.color}`}>{cfg.label}</Badge>;
}

export default function NichesPage() {
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [region, setRegion] = useState("CO");
  const [searching, setSearching] = useState(false);
  const [result, setResult] = useState<NicheResult | null>(null);
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
  const [importingProducts, setImportingProducts] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState("search");

  const fetchSaved = useCallback(async () => {
    const res = await fetch("/api/niches/saved");
    if (res.ok) setSavedSearches(await res.json());
  }, []);

  useEffect(() => { fetchSaved(); }, [fetchSaved]);

  async function handleSearch() {
    if (!query.trim()) return;
    setSearching(true);
    setResult(null);
    const res = await fetch("/api/niches/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, category: category || undefined, region }),
    });
    const data = await res.json();
    setSearching(false);
    if (!res.ok) { toast({ title: "Error en búsqueda", description: data.message, variant: "destructive" }); return; }
    setResult(data.results);
    fetchSaved();
  }

  async function handleImportProduct(product: TrendingProduct) {
    const key = product.name;
    setImportingProducts(p => new Set([...p, key]));
    const res = await fetch("/api/niches/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        products: [{ name: product.name, description: product.description, price: product.estimatedSellPrice, cost: product.estimatedCost, keywords: product.keywords }],
        category: category || "dropshipping",
      }),
    });
    setImportingProducts(p => { const n = new Set(p); n.delete(key); return n; });
    if (res.ok) {
      toast({ title: "Producto importado al catálogo", description: `"${product.name}" agregado exitosamente` });
    } else {
      toast({ title: "Error al importar", variant: "destructive" });
    }
  }

  async function handleImportAll(products: TrendingProduct[]) {
    const res = await fetch("/api/niches/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        products: products.map(p => ({ name: p.name, description: p.description, price: p.estimatedSellPrice, cost: p.estimatedCost, keywords: p.keywords })),
        category: category || "dropshipping",
      }),
    });
    const data = await res.json();
    if (res.ok) {
      toast({ title: `${data.inserted} productos importados al catálogo` });
    } else {
      toast({ title: "Error al importar", variant: "destructive" });
    }
  }

  function renderNicheResult(r: NicheResult) {
    return (
      <div className="space-y-6">
        {/* Header */}
        <Card className="bg-gradient-to-br from-primary/10 to-orange-500/5 border-primary/20">
          <CardContent className="pt-6">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <h2 className="text-2xl font-bold">{r.nicheName}</h2>
                  <TrendIcon dir={r.trendDirection} />
                </div>
                <p className="text-muted-foreground">{r.summary}</p>
                <div className="flex gap-2 mt-3 flex-wrap">
                  <CompetitionBadge level={r.competitionLevel} />
                  {r.topChannels?.map(ch => <Badge key={ch} className="text-xs bg-background/40 border-white/10">{ch}</Badge>)}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3 text-center">
                {[
                  { label: "Demanda", value: `${r.demandScore}%`, icon: Target, color: "text-blue-400" },
                  { label: "Margen est.", value: `${r.estimatedMargin}%`, icon: DollarSign, color: "text-green-400" },
                  { label: "Búsquedas/mes", value: r.monthlySearchVolume, icon: BarChart2, color: "text-purple-400" },
                ].map(s => (
                  <div key={s.label} className="bg-background/40 rounded-xl p-3 min-w-[90px]">
                    <s.icon className={`h-5 w-5 mx-auto mb-1 ${s.color}`} />
                    <p className="font-bold text-sm">{s.value}</p>
                    <p className="text-[10px] text-muted-foreground">{s.label}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-4 space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Score de demanda</span>
                <span className="font-medium">{r.demandScore}/100</span>
              </div>
              <Progress value={r.demandScore} className="h-2" />
            </div>
          </CardContent>
        </Card>

        {/* Market insights */}
        <div className="grid md:grid-cols-2 gap-4">
          <Card className="bg-card/50 border-white/10">
            <CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><Target className="h-4 w-4 text-primary" />Público objetivo</CardTitle></CardHeader>
            <CardContent><p className="text-sm text-muted-foreground">{r.targetAudience}</p></CardContent>
          </Card>
          <Card className="bg-card/50 border-white/10">
            <CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><DollarSign className="h-4 w-4 text-green-400" />Rango de precios recomendado</CardTitle></CardHeader>
            <CardContent>
              <p className="text-lg font-bold">{formatCOP(r.recommendedPrice?.min ?? 0)} — {formatCOP(r.recommendedPrice?.max ?? 0)}</p>
              <p className="text-xs text-muted-foreground mt-1">{r.seasonality}</p>
            </CardContent>
          </Card>
        </div>

        {/* Insights & Warnings */}
        {(r.marketInsights?.length > 0 || r.warnings?.length > 0) && (
          <div className="grid md:grid-cols-2 gap-4">
            {r.marketInsights?.length > 0 && (
              <Card className="bg-card/50 border-white/10">
                <CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><BookOpen className="h-4 w-4 text-blue-400" />Insights de mercado</CardTitle></CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {r.marketInsights.map((ins, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                        <CheckCircle2 className="h-3.5 w-3.5 text-green-400 mt-0.5 flex-shrink-0" />{ins}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}
            {r.warnings?.length > 0 && (
              <Card className="bg-card/50 border-orange-500/10">
                <CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-orange-400" />Advertencias</CardTitle></CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {r.warnings.map((w, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                        <AlertTriangle className="h-3.5 w-3.5 text-orange-400 mt-0.5 flex-shrink-0" />{w}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Trending products */}
        {r.trendingProducts?.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold flex items-center gap-2"><Package className="h-4 w-4 text-primary" />Productos trending ({r.trendingProducts.length})</h3>
              <Button size="sm" className="gap-2 bg-gradient-to-r from-green-600 to-emerald-600 hover:opacity-90 text-xs"
                onClick={() => handleImportAll(r.trendingProducts)}>
                <Download className="h-3.5 w-3.5" />Importar todos al catálogo
              </Button>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {r.trendingProducts.map((p, i) => (
                <Card key={i} className="bg-card/50 border-white/10 hover:border-primary/30 transition-all group">
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex-1">
                        <p className="font-semibold text-sm">{p.name}</p>
                        <div className="flex gap-1.5 mt-1 flex-wrap"><DemandBadge level={p.demandLevel} /></div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="font-bold text-green-400">{formatCOP(p.estimatedSellPrice)}</p>
                        <p className="text-[11px] text-muted-foreground">Costo: {formatCOP(p.estimatedCost)}</p>
                        <p className="text-[11px] font-medium text-primary">{p.margin}% margen</p>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mb-3 line-clamp-2">{p.description}</p>
                    {p.keywords?.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-3">
                        {p.keywords.slice(0, 4).map(k => <Badge key={k} className="text-[9px] bg-background/40 border-white/10">{k}</Badge>)}
                      </div>
                    )}
                    <Button size="sm" className="w-full gap-2 h-7 text-xs bg-primary/20 hover:bg-primary/30 text-primary border border-primary/20"
                      onClick={() => handleImportProduct(p)} disabled={importingProducts.has(p.name)}>
                      {importingProducts.has(p.name) ? <><Loader2 className="h-3 w-3 animate-spin" />Importando...</> : <><Plus className="h-3 w-3" />Agregar al catálogo</>}
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Buscador de Nichos</h1>
          <p className="text-muted-foreground mt-1">Encuentra nichos rentables para dropshipping e importa productos directamente a tu catálogo</p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="bg-background/50 border border-white/10">
            <TabsTrigger value="search" className="gap-2"><Search className="h-4 w-4" />Buscar nicho</TabsTrigger>
            <TabsTrigger value="history" className="gap-2"><History className="h-4 w-4" />Historial ({savedSearches.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="search" className="mt-4 space-y-6">
            {/* Search form */}
            <Card className="bg-card/50 border-white/10">
              <CardContent className="pt-6">
                <div className="grid gap-4 md:grid-cols-[1fr_auto_auto_auto]">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Nicho o producto a investigar</Label>
                    <Input
                      placeholder="ej: accesorios para mascota, gadgets cocina, ropa deportiva..."
                      className="bg-background/50 border-white/10"
                      value={query}
                      onChange={e => setQuery(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && !searching && handleSearch()}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Categoría</Label>
                    <Select value={category} onValueChange={setCategory}>
                      <SelectTrigger className="w-48 border-white/10 bg-background/50">
                        <SelectValue placeholder="Todas las categorías" />
                      </SelectTrigger>
                      <SelectContent>
                        {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Región</Label>
                    <Select value={region} onValueChange={setRegion}>
                      <SelectTrigger className="w-36 border-white/10 bg-background/50">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {REGIONS.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-end">
                    <Button onClick={handleSearch} disabled={searching || !query.trim()} className="gap-2 bg-gradient-to-r from-primary to-orange-500 hover:opacity-90 h-10 px-6">
                      {searching ? <><Loader2 className="h-4 w-4 animate-spin" />Analizando...</> : <><Search className="h-4 w-4" />Analizar</>}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {searching && (
              <Card className="bg-card/50 border-primary/20 border-dashed">
                <CardContent className="flex flex-col items-center py-16 gap-4">
                  <div className="relative">
                    <div className="w-16 h-16 rounded-full border-2 border-primary/20 flex items-center justify-center">
                      <TrendingUp className="h-8 w-8 text-primary animate-pulse" />
                    </div>
                    <div className="absolute inset-0 rounded-full border-t-2 border-primary animate-spin" />
                  </div>
                  <div className="text-center">
                    <p className="font-medium">Analizando nicho con IA...</p>
                    <p className="text-sm text-muted-foreground mt-1">Investigando tendencias, márgenes y productos para "{query}"</p>
                  </div>
                </CardContent>
              </Card>
            )}

            {result && !searching && renderNicheResult(result)}

            {!result && !searching && (
              <Card className="bg-card/50 border-white/10 border-dashed">
                <CardContent className="flex flex-col items-center py-16 gap-4">
                  <div className="w-20 h-20 rounded-2xl bg-primary/5 border border-primary/10 flex items-center justify-center">
                    <TrendingUp className="h-10 w-10 text-primary/40" />
                  </div>
                  <div className="text-center max-w-md">
                    <p className="text-lg font-medium">Descubre nichos rentables</p>
                    <p className="text-sm text-muted-foreground mt-2">La IA analiza demanda, competencia y márgenes en tu región. Luego importa los productos directamente a tu catálogo con un clic.</p>
                  </div>
                  <div className="flex gap-2 flex-wrap justify-center mt-2">
                    {["accesorios gaming", "belleza coreana", "gadgets hogar", "ropa fitness", "juguetes educativos"].map(s => (
                      <Button key={s} size="sm" variant="outline" className="border-white/10 text-xs h-7"
                        onClick={() => { setQuery(s); }}>
                        {s}
                      </Button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="history" className="mt-4">
            {savedSearches.length === 0 ? (
              <Card className="bg-card/50 border-white/10 border-dashed">
                <CardContent className="flex flex-col items-center py-12 gap-3">
                  <History className="h-12 w-12 text-muted-foreground/30" />
                  <p className="text-muted-foreground">No hay búsquedas guardadas aún</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {savedSearches.map(s => (
                  <Card key={s.id} className="bg-card/50 border-white/10 hover:border-primary/20 transition-all cursor-pointer"
                    onClick={() => { setResult(s.results); setQuery(s.query); setActiveTab("search"); }}>
                    <CardContent className="pt-4 pb-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                            <TrendingUp className="h-5 w-5 text-primary" />
                          </div>
                          <div>
                            <p className="font-medium">{s.results?.nicheName ?? s.query}</p>
                            <p className="text-xs text-muted-foreground">{s.query} • {s.region} • {s.results?.trendingProducts?.length ?? 0} productos</p>
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-sm font-bold text-green-400">{s.results?.estimatedMargin ?? 0}% margen</p>
                          <p className="text-xs text-muted-foreground">{new Date(s.createdAt).toLocaleDateString("es-CO")}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
