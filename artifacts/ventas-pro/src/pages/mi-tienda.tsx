import { useState, useEffect } from "react";
import { useParams } from "wouter";
import { useSession } from "@/App";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Store, ShoppingCart, Package, ArrowLeft, Loader } from "lucide-react";

interface StoreProduct {
  id: number;
  name: string;
  description: string;
  price: number;
  imageUrl?: string;
}

export default function MiTiendaPage() {
  const { tenant } = useSession();
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
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
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

  return (
    <div className="min-h-screen bg-[#09090b] text-white">
      <header className="sticky top-0 z-10 border-b border-white/10 bg-[#09090b]/80 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center gap-3">
          <Store className="h-6 w-6 text-indigo-400" />
          <h1 className="text-xl font-bold">{tenant?.brandName || "Mi Tienda"}</h1>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-12 relative z-10">
        <div className="mb-10 text-center">
          <h2 className="text-3xl md:text-5xl font-extrabold mb-4 tracking-tight">Nuestros Productos</h2>
          <p className="text-gray-400 text-lg">Explora nuestros productos digitales premium</p>
        </div>

        {products.length === 0 ? (
          <Card className="p-12 text-center rounded-3xl border border-white/10 shadow-[0_0_40px_-15px_rgba(99,102,241,0.2)] bg-[#09090b]/50 backdrop-blur-md">
            <Package className="h-16 w-16 text-indigo-400 mx-auto mb-4 opacity-50" />
            <h3 className="text-xl font-bold mb-2 text-white">No hay productos disponibles</h3>
            <p className="text-sm text-gray-400">Pronto agregaremos nuevos productos a la tienda.</p>
          </Card>
        ) : (
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {products.map((product) => (
              <Card key={product.id} className="overflow-hidden rounded-3xl border border-white/10 bg-white/5 backdrop-blur-md group hover:-translate-y-2 hover:border-indigo-500/50 hover:shadow-[0_0_40px_-15px_rgba(99,102,241,0.3)] transition-all duration-500 flex flex-col">
                <div className="aspect-square bg-[#040405] relative overflow-hidden flex-shrink-0">
                  {product.imageUrl ? (
                    <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover opacity-90 group-hover:opacity-100 group-hover:scale-110 transition-all duration-700" />
                  ) : (
                    <Package className="h-16 w-16 text-gray-600 m-auto mt-24" />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-[#09090b] via-transparent to-transparent opacity-80 pointer-events-none" />
                </div>
                
                <CardContent className="p-6 flex flex-col flex-1 relative z-10 bg-[#09090b]/40">
                  <h3 className="font-extrabold text-xl mb-2 text-white line-clamp-2">{product.name}</h3>
                  <p className="text-sm text-gray-400 line-clamp-2 mb-6 flex-1">{product.description}</p>
                  
                  <div className="flex flex-col gap-4 mt-auto">
                     <span className="text-3xl font-black text-white">${Number(product.price).toLocaleString("es-CO")} <span className="text-sm text-gray-500 font-semibold">COP</span></span>
                    <Button className="w-full bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-bold py-6 rounded-xl hover:scale-[1.02] transition-transform border-0 shadow-[0_0_20px_-5px_rgba(99,102,241,0.5)]">
                      <ShoppingCart className="h-5 w-5 mr-2" />
                      Comprar Ahora
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
