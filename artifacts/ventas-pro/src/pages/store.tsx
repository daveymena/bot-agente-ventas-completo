import { useState, useEffect, useCallback } from "react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Store, Search, Copy, ExternalLink, MessageCircle, Loader2, Package, CreditCard, Wallet, Smartphone, RefreshCw, DollarSign, ShoppingBag } from "lucide-react";

interface Product {
  id: number;
  name: string;
  description: string;
  price: string;
  currency: string;
  imageUrl: string | null;
  category: string | null;
  kind: string;
  highlight: string | null;
  sku: string | null;
  paymentLink: string | null;
}

interface GeneratedLink {
  url: string;
  method: string;
  product: string;
  total: number;
  message?: string;
}

function formatCOP(price: string | number, currency = "COP") {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: currency === "USD" ? "USD" : "COP", minimumFractionDigits: 0 }).format(Number(price));
}

const METHOD_CONFIG = {
  mercadopago: { label: "MercadoPago", icon: CreditCard, color: "bg-blue-500/10 text-blue-400 border-blue-500/20 hover:bg-blue-500/20" },
  paypal: { label: "PayPal", icon: Wallet, color: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20 hover:bg-yellow-500/20" },
  transfer: { label: "Transferencia/Nequi", icon: Smartphone, color: "bg-green-500/10 text-green-400 border-green-500/20 hover:bg-green-500/20" },
};

export default function StorePage() {
  const { toast } = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [generatingLink, setGeneratingLink] = useState<{ productId: number; method: string } | null>(null);
  const [generatedLink, setGeneratedLink] = useState<GeneratedLink | null>(null);
  const [showLinkModal, setShowLinkModal] = useState(false);

  const fetchCatalog = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (categoryFilter !== "all") params.set("category", categoryFilter);
    const res = await fetch(`/api/store/catalog?${params}`);
    if (res.ok) {
      const data = await res.json();
      setProducts(data.products);
      setCategories(data.categories);
    }
    setLoading(false);
  }, [search, categoryFilter]);

  useEffect(() => { fetchCatalog(); }, [fetchCatalog]);

  async function handleGenerateLink(product: Product, method: "mercadopago" | "paypal" | "transfer") {
    setGeneratingLink({ productId: product.id, method });
    const res = await fetch("/api/store/generate-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId: product.id, method, quantity: 1 }),
    });
    const data = await res.json();
    setGeneratingLink(null);
    if (!res.ok) {
      toast({ title: "Error al generar link", description: data.message, variant: "destructive" });
      return;
    }
    setGeneratedLink(data);
    setShowLinkModal(true);
  }

  function copyToClipboard(text: string, label = "Link copiado") {
    navigator.clipboard.writeText(text).then(() => toast({ title: label }));
  }

  const filtered = products.filter(p => {
    const matchSearch = !search || p.name.toLowerCase().includes(search.toLowerCase()) || (p.description || "").toLowerCase().includes(search.toLowerCase());
    const matchCat = categoryFilter === "all" || p.category === categoryFilter;
    return matchSearch && matchCat;
  });

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-orange-500 flex items-center justify-center">
                <Store className="h-5 w-5 text-white" />
              </div>
              Tienda Virtual
            </h1>
            <p className="text-muted-foreground mt-1">Genera links de pago por producto y compártelos directamente en WhatsApp</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge className="bg-green-500/10 text-green-400 border-green-500/20">{products.length} productos activos</Badge>
            <Button size="sm" variant="outline" className="border-white/10 gap-2" onClick={fetchCatalog}>
              <RefreshCw className="h-3.5 w-3.5" />Actualizar
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Total productos", value: products.length, icon: Package, color: "text-blue-400" },
            { label: "Categorías", value: categories.length, icon: ShoppingBag, color: "text-purple-400" },
            { label: "Digitales", value: products.filter(p => p.kind === "digital").length, icon: Wallet, color: "text-green-400" },
            { label: "Físicos", value: products.filter(p => p.kind === "physical").length, icon: Store, color: "text-orange-400" },
          ].map(s => (
            <Card key={s.label} className="bg-card/50 border-white/10">
              <CardContent className="pt-5">
                <div className="flex items-center gap-2.5">
                  <s.icon className={`h-7 w-7 ${s.color}`} />
                  <div>
                    <p className="text-xl font-bold">{s.value}</p>
                    <p className="text-[11px] text-muted-foreground">{s.label}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar producto..." className="pl-10 bg-background/50 border-white/10"
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-48 border-white/10 bg-background/50"><SelectValue placeholder="Todas las categorías" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las categorías</SelectItem>
              {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Product Grid */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : filtered.length === 0 ? (
          <Card className="bg-card/50 border-white/10 border-dashed">
            <CardContent className="flex flex-col items-center py-16 gap-4">
              <Package className="h-16 w-16 text-muted-foreground/20" />
              <div className="text-center">
                <p className="font-medium text-lg">Sin productos</p>
                <p className="text-sm text-muted-foreground mt-1">Agrega productos en la sección Productos para verlos aquí</p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filtered.map(product => (
              <Card key={product.id} className="bg-card/50 border-white/10 hover:border-primary/30 transition-all overflow-hidden group">
                {product.imageUrl ? (
                  <div className="h-48 overflow-hidden bg-background/30">
                    <img src={product.imageUrl} alt={product.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                  </div>
                ) : (
                  <div className="h-32 bg-gradient-to-br from-primary/5 to-orange-500/5 flex items-center justify-center">
                    <Package className="h-12 w-12 text-primary/20" />
                  </div>
                )}
                <CardContent className="pt-4 pb-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-sm leading-tight truncate">{product.name}</h3>
                      {product.category && <Badge className="text-[10px] mt-1 bg-background/40 border-white/10">{product.category}</Badge>}
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="font-bold text-primary text-lg">{formatCOP(product.price, product.currency)}</p>
                      <Badge className={`text-[10px] ${product.kind === "digital" ? "bg-blue-500/10 text-blue-400" : "bg-orange-500/10 text-orange-400"}`}>
                        {product.kind === "digital" ? "Digital" : "Físico"}
                      </Badge>
                    </div>
                  </div>

                  {product.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2">{product.description}</p>
                  )}

                  {product.highlight && (
                    <p className="text-xs text-green-400 font-medium">✓ {product.highlight}</p>
                  )}

                  {/* Payment link buttons */}
                  <div className="space-y-2 pt-1">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Generar link de pago</p>
                    <div className="grid grid-cols-3 gap-1.5">
                      {(["mercadopago", "paypal", "transfer"] as const).map(method => {
                        const cfg = METHOD_CONFIG[method];
                        const isGenerating = generatingLink?.productId === product.id && generatingLink.method === method;
                        return (
                          <button key={method}
                            className={`flex flex-col items-center gap-1 p-2 rounded-lg border text-[10px] font-medium transition-all ${cfg.color} disabled:opacity-40`}
                            onClick={() => handleGenerateLink(product, method)}
                            disabled={!!generatingLink}>
                            {isGenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <cfg.icon className="h-3.5 w-3.5" />}
                            {isGenerating ? "..." : cfg.label.split("/")[0]}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {product.paymentLink && (
                    <div className="flex gap-1.5">
                      <button
                        className="flex-1 text-[11px] py-1.5 px-2 rounded-lg bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-colors flex items-center justify-center gap-1"
                        onClick={() => copyToClipboard(product.paymentLink!, "Link existente copiado")}>
                        <Copy className="h-3 w-3" />Link guardado
                      </button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Generated Link Modal */}
      <Dialog open={showLinkModal} onOpenChange={setShowLinkModal}>
        <DialogContent className="sm:max-w-md bg-background/95 border-white/10">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-green-400" />Link de pago generado
            </DialogTitle>
          </DialogHeader>
          {generatedLink && (
            <div className="space-y-4 py-2">
              <div className="p-4 rounded-xl bg-green-500/5 border border-green-500/10">
                <p className="text-sm font-medium text-green-400 mb-1">✅ {generatedLink.product}</p>
                <p className="text-xs text-muted-foreground">
                  Total: <strong className="text-white">{formatCOP(generatedLink.total)}</strong> · Método: <strong className="text-white capitalize">{generatedLink.method}</strong>
                </p>
              </div>

              {generatedLink.method === "transfer" && generatedLink.message ? (
                <div className="space-y-3">
                  <div className="p-3 rounded-lg bg-background/50 border border-white/10">
                    <p className="text-xs text-muted-foreground mb-2">Mensaje para WhatsApp:</p>
                    <p className="text-sm whitespace-pre-wrap">{generatedLink.message}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Button size="sm" variant="outline" className="border-white/10 gap-2"
                      onClick={() => copyToClipboard(generatedLink.message!, "Mensaje copiado")}>
                      <Copy className="h-3.5 w-3.5" />Copiar mensaje
                    </Button>
                    <Button size="sm" className="gap-2 bg-green-600 hover:bg-green-700"
                      onClick={() => window.open(generatedLink.url, "_blank")}>
                      <MessageCircle className="h-3.5 w-3.5" />Enviar por WA
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="p-3 rounded-lg bg-background/50 border border-white/10 break-all">
                    <p className="text-xs text-muted-foreground mb-1">URL de pago:</p>
                    <p className="text-xs font-mono text-primary">{generatedLink.url}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Button size="sm" variant="outline" className="border-white/10 gap-2"
                      onClick={() => copyToClipboard(generatedLink.url)}>
                      <Copy className="h-3.5 w-3.5" />Copiar link
                    </Button>
                    <Button size="sm" className="gap-2 bg-green-600 hover:bg-green-700"
                      onClick={() => {
                        const msg = `Hola 👋 Aquí está tu link de pago para *${generatedLink.product}*:\n\n${generatedLink.url}`;
                        window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank");
                      }}>
                      <MessageCircle className="h-3.5 w-3.5" />Enviar por WA
                    </Button>
                  </div>
                  <Button size="sm" variant="outline" className="w-full border-white/10 gap-2"
                    onClick={() => window.open(generatedLink.url, "_blank")}>
                    <ExternalLink className="h-3.5 w-3.5" />Abrir link en nueva pestaña
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
