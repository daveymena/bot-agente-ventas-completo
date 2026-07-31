import { useState, useEffect } from "react";
import { useSession } from "@/App";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Store, ShoppingCart, Package, Loader, Settings, ExternalLink, Edit, Search, Filter, Heart } from "lucide-react";
import { useLocation } from "wouter";

interface StoreProduct {
  id: number;
  name: string;
  description: string;
  price: number;
  imageUrl?: string;
  currency?: string;
}

export default function MiTiendaPage() {
  const { tenant } = useSession();
  const [, setLocation] = useLocation();
  const slug = tenant?.slug || "mi-tienda";
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<StoreProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("newest");
  const [cart, setCart] = useState<number[]>([]);

  useEffect(() => {
    if (slug) {
      loadStore();
    }
  }, [slug]);

  useEffect(() => {
    filterAndSortProducts();
  }, [products, searchQuery, sortBy]);

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

  const filterAndSortProducts = () => {
    let filtered = products;

    if (searchQuery) {
      filtered = filtered.filter(p =>
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.description.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    if (sortBy === "price-asc") {
      filtered.sort((a, b) => a.price - b.price);
    } else if (sortBy === "price-desc") {
      filtered.sort((a, b) => b.price - a.price);
    }

    setFilteredProducts(filtered);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-slate-50 to-slate-100">
        <Loader className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-slate-50 to-slate-100 px-4">
        <Card className="max-w-md w-full p-8 text-center rounded-2xl border-0 shadow-lg">
          <Store className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-xl font-bold mb-2">Tienda no disponible</h2>
          <p className="text-sm text-muted-foreground mb-4">{error}</p>
        </Card>
      </div>
    );
  }

  const storeUrl = `${window.location.origin}/tienda/${slug}`;
  const totalItems = cart.length;
  const totalPrice = cart.reduce((sum, id) => {
    const product = products.find(p => p.id === id);
    return sum + (product?.price || 0);
  }, 0);

  return (
    <div className="min-h-screen bg-white">
      {/* Navigation Header */}
      <nav className="sticky top-0 z-40 border-b border-gray-100 bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 bg-indigo-600 rounded-lg flex items-center justify-center">
                <Store className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-900">{tenant?.brandName || "Mi Tienda"}</h1>
                <p className="text-xs text-slate-500">{tenant?.email || "tienda.online"}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              <Button
                variant="ghost"
                size="sm"
                className="hidden sm:flex gap-2"
                onClick={() => setLocation("/products")}
              >
                <Settings className="h-4 w-4" />
                <span className="hidden sm:inline">Admin</span>
              </Button>
              <div className="relative">
                <Button
                  size="sm"
                  className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2"
                >
                  <ShoppingCart className="h-4 w-4" />
                  <span>{totalItems}</span>
                </Button>
                {totalItems > 0 && (
                  <div className="absolute -top-2 -right-2 bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                    {totalItems}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <div className="bg-gradient-to-b from-indigo-50 via-white to-white py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10">
            <h2 className="text-4xl sm:text-5xl font-bold text-slate-900 mb-4">Catálogo de Productos</h2>
            <p className="text-lg text-slate-600">Descubre nuestros productos premium y de calidad</p>
          </div>

          {/* Search and Filter Bar */}
          <div className="flex flex-col sm:flex-row gap-4 mb-8">
            <div className="flex-1 relative">
              <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar productos..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-12 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:border-transparent"
              />
            </div>
            <div className="flex gap-2">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600"
              >
                <option value="newest">Más recientes</option>
                <option value="price-asc">Menor precio</option>
                <option value="price-desc">Mayor precio</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Products Grid */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {filteredProducts.length === 0 ? (
          <div className="text-center py-16">
            <Package className="h-16 w-16 text-slate-300 mx-auto mb-4" />
            <h3 className="text-2xl font-bold text-slate-900 mb-2">No hay productos disponibles</h3>
            <p className="text-slate-600 mb-6">Vuelve pronto para descubrir nuestros productos</p>
            <Button
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
              onClick={() => window.location.reload()}
            >
              Actualizar
            </Button>
          </div>
        ) : (
          <div>
            <p className="text-sm text-slate-600 mb-6 font-semibold">Mostrando {filteredProducts.length} de {products.length} productos</p>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4 auto-rows-max">
              {filteredProducts.map((product) => (
                <div
                  key={product.id}
                  className="group bg-white border border-gray-200 rounded-xl overflow-hidden hover:shadow-lg hover:-translate-y-1 transition-all duration-300 flex flex-col"
                >
                  {/* Product Image */}
                  <div className="aspect-square bg-slate-100 relative overflow-hidden flex-shrink-0">
                    {product.imageUrl ? (
                      <img
                        src={product.imageUrl}
                        alt={product.name}
                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gradient-to-b from-indigo-50 to-slate-100">
                        <Package className="h-12 w-12 text-slate-300" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>

                  {/* Product Info */}
                  <div className="p-4 flex flex-col flex-1">
                    <h3 className="font-bold text-slate-900 mb-2 line-clamp-2 h-14">{product.name}</h3>
                    <p className="text-sm text-slate-600 line-clamp-2 mb-4 flex-1">{product.description}</p>

                    {/* Price */}
                    <div className="mb-4 pb-4 border-t border-gray-100">
                      <p className="text-2xl font-bold text-indigo-600">
                        ${Number(product.price).toLocaleString("es-CO")}
                        <span className="text-xs text-slate-500 font-semibold ml-1">{product.currency || "COP"}</span>
                      </p>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex gap-2 flex-col">
                      <Button
                        className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 rounded-lg transition-colors"
                        onClick={() => {
                          setCart([...cart, product.id]);
                          setTimeout(() => alert(`${product.name} agregado al carrito`), 0);
                        }}
                      >
                        <ShoppingCart className="h-4 w-4 mr-2" />
                        Comprar Ahora
                      </Button>
                      {/* Admin Edit Button (visible on hover) */}
                      <Button
                        variant="outline"
                        size="sm"
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => setLocation("/products")}
                      >
                        <Edit className="h-3 w-3 mr-1" />
                        Editar
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-slate-900 text-white py-12 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
            <div>
              <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                <Store className="h-5 w-5" />
                {tenant?.brandName || "Mi Tienda"}
              </h3>
              <p className="text-slate-400">Productos de calidad con entrega inmediata.</p>
            </div>
            <div>
              <h4 className="font-bold mb-4">Enlaces</h4>
              <ul className="text-slate-400 space-y-2">
                <li><a href="#" className="hover:text-white transition">Productos</a></li>
                <li><a href="#" className="hover:text-white transition">Sobre nosotros</a></li>
                <li><a href="#" className="hover:text-white transition">Contacto</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-bold mb-4">Soporte</h4>
              <p className="text-slate-400 mb-2">Ayuda rápida y efectiva</p>
              <p className="text-slate-400 text-sm">📧 soporte@ventaspro.com</p>
            </div>
          </div>
          <div className="border-t border-slate-800 pt-8 text-center text-slate-400">
            <p>© 2026 {tenant?.brandName || "Mi Tienda"}. Todos los derechos reservados.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
