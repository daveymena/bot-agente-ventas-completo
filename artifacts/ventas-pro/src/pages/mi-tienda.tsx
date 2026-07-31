import { useState, useEffect } from "react";
import { useSession } from "@/App";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Store, ShoppingCart, Package, ArrowLeft, Loader, Settings, ExternalLink, Edit } from "lucide-react";
import { Link, useLocation } from "wouter";

interface StoreProduct {
  id: number;
  name: string;
  description: string;
  price: number;
  imageUrl?: string;
}

export default function MiTiendaPage() {
  const { tenant } = useSession();
  const [, setLocation] = useLocation();
  const slug = tenant?.slug || "mi-tienda";
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (slug) {
      loadStore();
    }
  }, [slug]);

  const loadStore = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/store/${slug}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Tienda no encontrada");
      const data = await res.json();
      setProducts(data.products || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="h-[calc(100vh-4rem)] flex items-center justify-center">
        <Loader className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-[calc(100vh-4rem)] flex items-center justify-center">
        <Card className="max-w-md w-full mx-4 p-8 text-center rounded-3xl border-0 shadow-lg glass-panel">
          <Store className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-xl font-bold mb-2">Tienda no disponible</h2>
          <p className="text-sm text-muted-foreground mb-4">{error}</p>
          <Button variant="outline" onClick={() => window.history.back()}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Volver
          </Button>
        </Card>
      </div>
    );
  }

  const storeUrl = `${window.location.origin}/tienda/${slug}`;

  return (
    <div className="h-[calc(100vh-4rem)] overflow-y-auto bg-[#f8fafc] text-slate-900 rounded-tl-xl border-l border-t relative">
      <header className="sticky top-0 z-10 border-b border-gray-200/50 bg-white/80 backdrop-blur-md px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 bg-indigo-50 rounded-xl flex items-center justify-center border border-indigo-100">
            <Store className="h-5 w-5 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold leading-tight text-slate-900">{tenant?.brandName || "Mi Tienda"}</h1>
            <a href={storeUrl} target="_blank" rel="noreferrer" className="text-xs text-indigo-500 hover:underline flex items-center gap-1 mt-0.5">
              {storeUrl} <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="bg-white hover:bg-slate-50 gap-2" onClick={() => setLocation("/products")}>
            <Settings className="h-4 w-4" /> Administrar Productos
          </Button>
          <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2" onClick={() => window.open(storeUrl, "_blank")}>
            <ExternalLink className="h-4 w-4" /> Ver Tienda Pública
          </Button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-12 relative z-10">
        <div className="mb-10 text-center">
          <h2 className="text-3xl font-extrabold mb-3 tracking-tight text-slate-900">Nuestros Productos</h2>
          <p className="text-slate-500 text-lg">Previsualización de cómo tus clientes ven el catálogo</p>
        </div>

        {products.length === 0 ? (
          <Card className="p-12 text-center rounded-3xl border border-dashed border-gray-300 bg-white/50 backdrop-blur-sm shadow-sm">
            <Package className="h-16 w-16 text-indigo-300 mx-auto mb-4 opacity-70" />
            <h3 className="text-xl font-bold mb-2 text-slate-900">No hay productos publicados</h3>
            <p className="text-sm text-slate-500 mb-6">Agrega productos a tu catálogo para que aparezcan aquí.</p>
            <Button className="bg-indigo-600 hover:bg-indigo-700" onClick={() => setLocation("/products")}>Ir a crear producto</Button>
          </Card>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {products.map((product) => (
              <Card key={product.id} className="overflow-hidden rounded-2xl border border-gray-200 bg-white group hover:-translate-y-1 hover:shadow-lg transition-all duration-300 flex flex-col relative">
                
                {/* Admin Overlay Edit Button */}
                <div className="absolute top-3 right-3 z-20 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button size="icon" variant="secondary" className="h-8 w-8 rounded-full bg-white/90 backdrop-blur shadow-sm hover:bg-indigo-50 hover:text-indigo-600" onClick={() => setLocation("/products")}>
                    <Edit className="h-4 w-4" />
                  </Button>
                </div>

                <div className="aspect-[4/3] bg-slate-50 relative overflow-hidden flex-shrink-0 border-b border-gray-100">
                  {product.imageUrl ? (
                    <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                  ) : (
                    <Package className="h-16 w-16 text-slate-300 m-auto mt-16" />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-100/50 via-transparent to-transparent opacity-60 pointer-events-none" />
                </div>
                
                <CardContent className="p-5 flex flex-col flex-1 relative z-10">
                  <h3 className="font-bold text-lg mb-2 text-slate-900 line-clamp-2 leading-tight">{product.name}</h3>
                  <p className="text-sm text-slate-500 line-clamp-2 mb-5 flex-1 leading-relaxed">{product.description}</p>
                  
                  <div className="flex flex-col gap-3 mt-auto">
                     <span className="text-2xl font-black text-slate-900">${Number(product.price).toLocaleString("es-CO")} <span className="text-xs text-slate-500 font-semibold uppercase">COP</span></span>
                    <Button disabled className="w-full bg-slate-100 text-slate-500 font-semibold py-5 rounded-xl border border-slate-200">
                      <ShoppingCart className="h-4 w-4 mr-2" />
                      Modo Previsualización
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
