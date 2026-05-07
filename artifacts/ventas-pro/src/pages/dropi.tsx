import { useState, useEffect, useCallback } from "react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import {
  Package, CheckCircle2, XCircle, Loader2, RefreshCw, Search,
  ShoppingCart, Eye, EyeOff, Unplug, Link2, Download, ExternalLink,
  AlertTriangle, Truck
} from "lucide-react";

interface DropiStatus {
  connected: boolean;
  message?: string;
  store?: any;
  storeId?: string;
  tokenMasked?: string;
}

interface DropiProduct {
  id: number;
  name: string;
  price: number;
  stock?: number;
  images?: Array<{ url: string }>;
  category?: string;
  description?: string;
  sku?: string;
  weight?: number;
}

export default function DropiPage() {
  const { toast } = useToast();
  const [status, setStatus] = useState<DropiStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [products, setProducts] = useState<DropiProduct[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalProducts, setTotalProducts] = useState(0);
  const [importing, setImporting] = useState<number | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<DropiProduct | null>(null);

  const fetchStatus = useCallback(async () => {
    setLoadingStatus(true);
    const res = await fetch("/api/dropi/status");
    if (res.ok) setStatus(await res.json());
    setLoadingStatus(false);
  }, []);

  const fetchProducts = useCallback(async (p = 1, q = "") => {
    setLoadingProducts(true);
    const params = new URLSearchParams({ page: String(p), per_page: "20" });
    if (q) params.set("search", q);
    const res = await fetch(`/api/dropi/products?${params}`);
    if (res.ok) {
      const data = await res.json();
      const items = data.objects || data.data || [];
      setProducts(items);
      setTotalProducts(data.count || items.length);
    }
    setLoadingProducts(false);
  }, []);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);
  useEffect(() => {
    if (status?.connected) fetchProducts(page, search);
  }, [status?.connected, page, fetchProducts]);

  async function handleConnect() {
    if (!token.trim()) return;
    setConnecting(true);
    const res = await fetch("/api/dropi/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: token.trim() }),
    });
    const data = await res.json();
    setConnecting(false);
    if (data.ok) {
      toast({ title: "Dropi conectado", description: `Tienda #${data.storeId || "OK"}` });
      setToken("");
      fetchStatus();
    } else {
      toast({ title: "Error al conectar", description: data.error, variant: "destructive" });
    }
  }

  async function handleDisconnect() {
    await fetch("/api/dropi/disconnect", { method: "POST" });
    toast({ title: "Dropi desconectado" });
    setProducts([]);
    fetchStatus();
  }

  async function handleImport(productId: number) {
    setImporting(productId);
    const res = await fetch("/api/dropi/import-product", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId }),
    });
    const data = await res.json();
    setImporting(null);
    if (data.ok) {
      toast({ title: "Producto importado", description: "Revisa tu catálogo de productos" });
    } else {
      toast({ title: "Error", description: data.error, variant: "destructive" });
    }
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
    fetchProducts(1, search);
  }

  if (loadingStatus) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-yellow-500 flex items-center justify-center">
                <Truck className="h-5 w-5 text-white" />
              </div>
              Dropi Dropshipping
            </h1>
            <p className="text-muted-foreground mt-1">
              Conecta tu cuenta de Dropi para acceder al catálogo, ver productos y crear pedidos directo desde VentasPro
            </p>
          </div>
          <div className="flex items-center gap-2">
            {status?.connected ? (
              <Badge className="bg-green-500/10 text-green-400 border-green-500/20">
                <CheckCircle2 className="h-3.5 w-3.5 mr-1" />Conectado
              </Badge>
            ) : (
              <Badge className="bg-red-500/10 text-red-400 border-red-500/20">
                <XCircle className="h-3.5 w-3.5 mr-1" />Desconectado
              </Badge>
            )}
            <Button size="sm" variant="outline" className="border-white/10 gap-2" onClick={fetchStatus}>
              <RefreshCw className="h-3.5 w-3.5" />Actualizar
            </Button>
          </div>
        </div>

        {/* Connection Card */}
        <Card className="bg-card/50 border-white/10">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Link2 className="h-4 w-4 text-primary" />
              {status?.connected ? "Conexión Activa" : "Conectar Cuenta Dropi"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {status?.connected ? (
              <div className="space-y-4">
                <div className="flex items-center gap-3 p-3 rounded-lg bg-green-500/5 border border-green-500/20">
                  <CheckCircle2 className="h-5 w-5 text-green-400 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-green-400">Conectado a Dropi</p>
                    <p className="text-xs text-muted-foreground">Token: {status.tokenMasked}</p>
                    {status.storeId && (
                      <p className="text-xs text-muted-foreground">Tienda ID: {status.storeId}</p>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="border-red-500/20 text-red-400 hover:bg-red-500/10 gap-2"
                    onClick={handleDisconnect}>
                    <Unplug className="h-3.5 w-3.5" />Desconectar
                  </Button>
                  <a href="https://app.dropi.co" target="_blank" rel="noreferrer">
                    <Button variant="outline" size="sm" className="border-white/10 gap-2">
                      <ExternalLink className="h-3.5 w-3.5" />Abrir Dropi
                    </Button>
                  </a>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="p-3 rounded-lg bg-yellow-500/5 border border-yellow-500/20">
                  <p className="text-xs text-yellow-400 flex items-start gap-2">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    <span>
                      Para obtener tu token de Dropi, ingresa a{" "}
                      <a href="https://app.dropi.co" target="_blank" rel="noreferrer"
                        className="underline hover:text-yellow-300">app.dropi.co</a>
                      {" "}→ Configuración → API Token
                    </span>
                  </p>
                </div>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Input
                      type={showToken ? "text" : "password"}
                      placeholder="Token de Dropi (ej: eyJ0eXAiOiJKV1Qi...)"
                      value={token}
                      onChange={e => setToken(e.target.value)}
                      className="border-white/10 bg-background/50 font-mono text-xs pr-9"
                      onKeyDown={e => e.key === "Enter" && handleConnect()}
                    />
                    <button className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-white"
                      onClick={() => setShowToken(v => !v)}>
                      {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <Button onClick={handleConnect} disabled={connecting || !token.trim()} className="gap-2">
                    {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
                    {connecting ? "Conectando..." : "Conectar"}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Products Section */}
        {status?.connected && (
          <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h2 className="text-xl font-semibold">Catálogo Dropi</h2>
                <p className="text-sm text-muted-foreground">{totalProducts} productos disponibles</p>
              </div>
              <form onSubmit={handleSearch} className="flex gap-2">
                <Input
                  placeholder="Buscar productos..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="border-white/10 bg-background/50 w-60"
                />
                <Button type="submit" size="sm" variant="outline" className="border-white/10 gap-2">
                  <Search className="h-3.5 w-3.5" />Buscar
                </Button>
              </form>
            </div>

            {loadingProducts ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : products.length === 0 ? (
              <Card className="bg-card/50 border-white/10">
                <CardContent className="pt-10 pb-10 text-center">
                  <Package className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground">No se encontraron productos</p>
                  <Button size="sm" variant="outline" className="mt-4 border-white/10"
                    onClick={() => { setSearch(""); fetchProducts(1, ""); }}>
                    Ver todos los productos
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {products.map(product => (
                    <Card key={product.id} className="bg-card/50 border-white/10 hover:border-white/20 transition-all overflow-hidden group">
                      {product.images?.[0]?.url && (
                        <div className="aspect-square overflow-hidden bg-black/20">
                          <img
                            src={product.images[0].url}
                            alt={product.name}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                          />
                        </div>
                      )}
                      <CardContent className="pt-3 pb-3 space-y-2">
                        <p className="text-xs font-semibold leading-snug line-clamp-2">{product.name}</p>
                        {product.category && (
                          <Badge className="text-[10px] bg-primary/10 text-primary border-primary/20">
                            {product.category}
                          </Badge>
                        )}
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-bold text-primary">
                            ${(product.price || 0).toLocaleString("es-CO")} COP
                          </span>
                          {product.stock !== undefined && (
                            <span className={`text-[10px] ${product.stock > 0 ? "text-green-400" : "text-red-400"}`}>
                              Stock: {product.stock}
                            </span>
                          )}
                        </div>
                        <div className="flex gap-1.5 pt-1">
                          <Button size="sm" variant="outline" className="flex-1 h-7 text-[10px] border-white/10 gap-1"
                            onClick={() => setSelectedProduct(product)}>
                            <Eye className="h-3 w-3" />Ver
                          </Button>
                          <Button size="sm" className="flex-1 h-7 text-[10px] gap-1"
                            onClick={() => handleImport(product.id)}
                            disabled={importing === product.id}>
                            {importing === product.id
                              ? <Loader2 className="h-3 w-3 animate-spin" />
                              : <Download className="h-3 w-3" />}
                            Importar
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {/* Pagination */}
                <div className="flex items-center justify-center gap-3 pt-2">
                  <Button size="sm" variant="outline" className="border-white/10"
                    disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>
                    Anterior
                  </Button>
                  <span className="text-sm text-muted-foreground">Página {page}</span>
                  <Button size="sm" variant="outline" className="border-white/10"
                    disabled={products.length < 20} onClick={() => setPage(p => p + 1)}>
                    Siguiente
                  </Button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Product Detail Modal */}
        {selectedProduct && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setSelectedProduct(null)}>
            <Card className="bg-card border-white/20 max-w-lg w-full max-h-[80vh] overflow-y-auto"
              onClick={e => e.stopPropagation()}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{selectedProduct.name}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {selectedProduct.images?.[0]?.url && (
                  <img src={selectedProduct.images[0].url} alt={selectedProduct.name}
                    className="w-full aspect-square object-cover rounded-lg" />
                )}
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Precio</p>
                    <p className="font-bold text-primary">${(selectedProduct.price || 0).toLocaleString("es-CO")} COP</p>
                  </div>
                  {selectedProduct.stock !== undefined && (
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Stock</p>
                      <p className="font-semibold">{selectedProduct.stock}</p>
                    </div>
                  )}
                  {selectedProduct.sku && (
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">SKU</p>
                      <p className="font-mono text-xs">{selectedProduct.sku}</p>
                    </div>
                  )}
                  {selectedProduct.weight && (
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Peso</p>
                      <p>{selectedProduct.weight}g</p>
                    </div>
                  )}
                </div>
                {selectedProduct.description && (
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Descripción</p>
                    <p className="text-xs leading-relaxed text-muted-foreground">{selectedProduct.description}</p>
                  </div>
                )}
                <div className="flex gap-2 pt-2">
                  <Button className="flex-1 gap-2" onClick={() => handleImport(selectedProduct.id)}
                    disabled={importing === selectedProduct.id}>
                    {importing === selectedProduct.id
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : <Download className="h-4 w-4" />}
                    Importar al catálogo
                  </Button>
                  <Button variant="outline" className="border-white/10" onClick={() => setSelectedProduct(null)}>
                    Cerrar
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Info */}
        <Card className="bg-primary/5 border-primary/10">
          <CardContent className="pt-5 pb-5">
            <div className="flex items-start gap-3">
              <ShoppingCart className="h-5 w-5 text-primary mt-0.5 shrink-0" />
              <div className="space-y-1 text-sm text-muted-foreground">
                <p className="font-semibold text-foreground">¿Cómo funciona la integración con Dropi?</p>
                <ul className="space-y-1 text-xs list-disc list-inside">
                  <li>Conecta tu cuenta con el token de la API de Dropi</li>
                  <li>Navega el catálogo completo de productos dropshipping</li>
                  <li>Importa productos directamente a tu catálogo de VentasPro</li>
                  <li>Cuando Luna cierra una venta, el agente puede crear pedidos en Dropi automáticamente</li>
                  <li>Los pedidos se envían directo al proveedor sin que tengas que manejar inventario</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
