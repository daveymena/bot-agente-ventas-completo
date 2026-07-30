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
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center gap-3">
          <Store className="h-6 w-6 text-primary" />
          <h1 className="text-xl font-bold">{tenant?.brandName || "Mi Tienda"}</h1>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h2 className="text-2xl font-bold mb-2">Productos</h2>
          <p className="text-muted-foreground">Explora nuestros productos digitales</p>
        </div>

        {products.length === 0 ? (
          <Card className="p-12 text-center rounded-3xl border-0 shadow-lg glass-panel">
            <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No hay productos disponibles</h3>
            <p className="text-sm text-muted-foreground">Pronto agregaremos nuevos productos a la tienda.</p>
          </Card>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {products.map((product) => (
              <Card key={product.id} className="overflow-hidden rounded-2xl border-0 shadow-lg glass-panel group hover:-translate-y-1 transition-all duration-300">
                <div className="aspect-video bg-muted/30 flex items-center justify-center">
                  {product.imageUrl ? (
                    <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover" />
                  ) : (
                    <Package className="h-12 w-12 text-muted-foreground/50" />
                  )}
                </div>
                <CardContent className="p-5">
                  <h3 className="font-semibold text-lg mb-1">{product.name}</h3>
                  <p className="text-sm text-muted-foreground line-clamp-2 mb-4">{product.description}</p>
                  <div className="flex items-center justify-between">
                     <span className="text-2xl font-bold text-primary">${Number(product.price).toLocaleString("es-CO")} COP</span>
                    <Button size="sm" className="gap-2">
                      <ShoppingCart className="h-4 w-4" />
                      Comprar
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
