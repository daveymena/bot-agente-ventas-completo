import { useState, useEffect } from "react";
import { useSession } from "@/App";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Store, ShoppingCart, Package, Loader, Settings, ExternalLink, Edit, Search, Filter, Heart, Menu, X } from "lucide-react";
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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

  return (
    <div className="min-h-screen bg-white">
      {/* Top Navigation Bar */}
      <nav className="sticky top-0 z-50 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 border-b-2 border-indigo-600 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 bg-gradient-to-br from-indigo-500 to-indigo-700 rounded-xl flex items-center justify-center shadow-lg">
                <Store className="h-7 w-7 text-white" />
              </div>
              <div className="hidden sm:block">
                <h1 className="text-xl font-bold text-white leading-tight">{tenant?.brandName || "Mi Tienda"}</h1>
                <p className="text-xs text-indigo-300">Tienda Online Premium</p>
              </div>
            </div>

            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center gap-6">
              <a href="#productos" className="text-gray-300 hover:text-white font-medium transition">Productos</a>
              <a href="#nosotros" className="text-gray-300 hover:text-white font-medium transition">Sobre Nosotros</a>
              <a href="#contacto" className="text-gray-300 hover:text-white font-medium transition">Contacto</a>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3">
              {/* Admin Button */}
              <Button
                variant="ghost"
                size="sm"
                className="text-gray-300 hover:text-white hover:bg-slate-700 hidden sm:flex gap-2"
                onClick={() => setLocation("/products")}
              >
                <Settings className="h-4 w-4" />
                <span className="text-sm">Admin</span>
              </Button>

              {/* Cart Button */}
              <div className="relative">
                <Button
                  size="sm"
                  className="bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white gap-2 shadow-lg"
                >
                  <ShoppingCart className="h-5 w-5" />
                  <span className="font-bold">{totalItems}</span>
                </Button>
                {totalItems > 0 && (
                  <div className="absolute -top-2 -right-2 bg-red-500 text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center shadow-lg animate-pulse">
                    {totalItems}
                  </div>
                )}
              </div>

              {/* Mobile Menu Button */}
              <Button
                variant="ghost"
                size="sm"
                className="md:hidden text-white hover:bg-slate-700"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              >
                {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
              </Button>
            </div>
          </div>

          {/* Mobile Menu */}
          {mobileMenuOpen && (
            <div className="md:hidden border-t border-slate-700 bg-slate-800 py-3 space-y-2">
              <a href="#productos" className="block px-4 py-2 text-gray-300 hover:text-white hover:bg-slate-700 rounded">Productos</a>
              <a href="#nosotros" className="block px-4 py-2 text-gray-300 hover:text-white hover:bg-slate-700 rounded">Sobre Nosotros</a>
              <a href="#contacto" className="block px-4 py-2 text-gray-300 hover:text-white hover:bg-slate-700 rounded">Contacto</a>
            </div>
          )}
        </div>
      </nav>

      {/* Hero Section - Larger and More Prominent */}
      <div className="bg-gradient-to-b from-indigo-900 via-indigo-800 to-slate-900 text-white relative overflow-hidden">
        {/* Background Pattern */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-400 rounded-full blur-3xl"></div>
          <div className="absolute bottom-0 left-0 w-96 h-96 bg-indigo-500 rounded-full blur-3xl"></div>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24 relative z-10">
          <div className="text-center mb-12">
            <div className="inline-block bg-indigo-400/20 border border-indigo-400/50 rounded-full px-4 py-2 mb-6">
              <span className="text-indigo-200 font-semibold text-sm">✨ CATÁLOGO PREMIUM 2024</span>
            </div>
            <h2 className="text-5xl sm:text-7xl font-black mb-6 leading-tight">
              {tenant?.brandName || "Mi Tienda"}
              <span className="block text-transparent bg-clip-text bg-gradient-to-r from-indigo-300 to-indigo-100">PREMIUM EXCLUSIVO</span>
            </h2>
            <p className="text-xl sm:text-2xl text-indigo-100 mb-8 max-w-2xl mx-auto leading-relaxed">
              Descubre una selección exclusiva de productos de calidad diseñados para ti
            </p>

            {/* Search Bar - Prominent */}
            <div className="flex flex-col sm:flex-row gap-3 max-w-2xl mx-auto mb-8">
              <div className="flex-1 relative">
                <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Buscar productos..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-12 pr-4 py-4 border-0 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 text-slate-900 font-medium shadow-lg"
                />
              </div>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="px-6 py-4 border-0 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 text-slate-900 font-medium shadow-lg"
              >
                <option value="newest">Más recientes</option>
                <option value="price-asc">Menor precio</option>
                <option value="price-desc">Mayor precio</option>
              </select>
            </div>

            <p className="text-indigo-200 text-sm">Mostrando {filteredProducts.length} de {products.length} productos</p>
          </div>
        </div>
      </div>

      {/* Products Grid */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        {filteredProducts.length === 0 ? (
          <div className="text-center py-24">
            <div className="inline-block bg-slate-100 rounded-full p-6 mb-6">
              <Package className="h-16 w-16 text-slate-400" />
            </div>
            <h3 className="text-3xl font-bold text-slate-900 mb-3">No hay productos disponibles</h3>
            <p className="text-slate-600 text-lg mb-8">Vuelve pronto para descubrir nuestros productos</p>
            <Button
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-3 text-lg"
              onClick={() => window.location.reload()}
            >
              Actualizar
            </Button>
          </div>
        ) : (
          <div>
            <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
              {filteredProducts.map((product) => (
                <div
                  key={product.id}
                  className="group relative bg-white rounded-2xl overflow-hidden hover:shadow-2xl transition-all duration-300 flex flex-col h-full border border-gray-200/50"
                >
                  {/* Product Image Container - Larger */}
                  <div className="relative aspect-square bg-gradient-to-br from-slate-100 to-slate-200 overflow-hidden flex-shrink-0">
                    {product.imageUrl ? (
                      <>
                        <img
                          src={product.imageUrl}
                          alt={product.name}
                          className="w-full h-full object-cover group-hover:scale-125 transition-transform duration-700"
                          onError={(e) => {
                            e.currentTarget.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 400'%3E%3Crect fill='%23f1f5f9' width='400' height='400'/%3E%3Ctext x='200' y='200' font-size='20' fill='%23cbd5e1' text-anchor='middle' dominant-baseline='middle'%3EImagen no disponible%3C/text%3E%3C/svg%3E";
                          }}
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                      </>
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-indigo-50 via-slate-50 to-slate-100">
                        <div className="text-center">
                          <Package className="h-16 w-16 text-indigo-200 mx-auto mb-2" />
                          <p className="text-sm text-slate-400">Sin imagen</p>
                        </div>
                      </div>
                    )}

                    {/* Badge */}
                    <div className="absolute top-4 right-4 bg-gradient-to-r from-indigo-600 to-indigo-700 text-white px-3 py-1 rounded-full text-xs font-bold shadow-lg">
                      {product.currency || "COP"}
                    </div>
                  </div>

                  {/* Product Info */}
                  <div className="p-5 flex flex-col flex-1">
                    <h3 className="font-bold text-slate-900 mb-2 line-clamp-2 text-lg leading-snug h-14">{product.name}</h3>
                    <p className="text-sm text-slate-600 line-clamp-2 mb-5 flex-1 leading-relaxed">{product.description}</p>

                    {/* Price - Highlighted */}
                    <div className="mb-5 pb-5 border-t-2 border-gray-100">
                      <p className="text-3xl font-black text-indigo-600">
                        ${Number(product.price).toLocaleString("es-CO")}
                      </p>
                      <p className="text-xs text-slate-500 font-semibold mt-1">Precio fijo</p>
                    </div>

                    {/* Action Buttons */}
                    <div className="space-y-2">
                      <Button
                        className="w-full bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white font-bold py-3 rounded-lg transition-all duration-300 shadow-lg hover:shadow-xl"
                        onClick={() => {
                          setCart([...cart, product.id]);
                          setTimeout(() => alert(`✅ ${product.name} agregado al carrito`), 0);
                        }}
                      >
                        <ShoppingCart className="h-5 w-5 mr-2" />
                        Comprar Ahora
                      </Button>
                      {/* Admin Edit Button (visible on hover) */}
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full opacity-0 group-hover:opacity-100 transition-all duration-300 border-indigo-200 hover:bg-indigo-50"
                        onClick={() => setLocation("/products")}
                      >
                        <Edit className="h-4 w-4 mr-1" />
                        Editar Producto
                      </Button>
                    </div>
                  </div>

                  {/* Like Button - Corner */}
                  <button className="absolute top-4 left-4 bg-white rounded-full p-2 opacity-0 group-hover:opacity-100 transition-opacity shadow-lg hover:bg-indigo-50">
                    <Heart className="h-5 w-5 text-slate-400 hover:text-red-500 transition-colors" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-gradient-to-b from-slate-900 to-black text-white py-16 mt-20 border-t-4 border-indigo-600">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Main Footer Content */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-12">
            {/* Brand */}
            <div>
              <div className="flex items-center gap-3 mb-4">
                <div className="h-10 w-10 bg-gradient-to-br from-indigo-500 to-indigo-700 rounded-lg flex items-center justify-center">
                  <Store className="h-6 w-6 text-white" />
                </div>
                <h3 className="font-bold text-lg">{tenant?.brandName || "Mi Tienda"}</h3>
              </div>
              <p className="text-slate-400 leading-relaxed">Productos de calidad premium con entrega inmediata. Tu tienda online de confianza.</p>
            </div>

            {/* Quick Links */}
            <div>
              <h4 className="font-bold mb-5 text-lg">Navegación</h4>
              <ul className="text-slate-400 space-y-3">
                <li><a href="#productos" className="hover:text-indigo-400 transition font-medium">Productos</a></li>
                <li><a href="#nosotros" className="hover:text-indigo-400 transition font-medium">Sobre Nosotros</a></li>
                <li><a href="#contacto" className="hover:text-indigo-400 transition font-medium">Contacto</a></li>
                <li><a href="#" className="hover:text-indigo-400 transition font-medium">Términos y Condiciones</a></li>
              </ul>
            </div>

            {/* Support */}
            <div>
              <h4 className="font-bold mb-5 text-lg">Soporte</h4>
              <ul className="text-slate-400 space-y-3">
                <li><a href="#" className="hover:text-indigo-400 transition font-medium">Centro de Ayuda</a></li>
                <li><a href="#" className="hover:text-indigo-400 transition font-medium">Rastrear Orden</a></li>
                <li><a href="#" className="hover:text-indigo-400 transition font-medium">Devoluciones</a></li>
                <li><a href="#" className="hover:text-indigo-400 transition font-medium">Política de Privacidad</a></li>
              </ul>
            </div>

            {/* Contact & Social */}
            <div>
              <h4 className="font-bold mb-5 text-lg">Contacto</h4>
              <p className="text-slate-400 mb-4 font-medium">📧 {tenant?.email || "info@tienda.com"}</p>
              <p className="text-slate-400 mb-6 font-medium">💬 Whatsapp 24/7</p>
              <div className="flex gap-3">
                <a href="#" className="bg-indigo-600 hover:bg-indigo-700 p-3 rounded-lg transition transform hover:scale-110">
                  <span className="text-sm font-bold">f</span>
                </a>
                <a href="#" className="bg-indigo-600 hover:bg-indigo-700 p-3 rounded-lg transition transform hover:scale-110">
                  <span className="text-sm font-bold">in</span>
                </a>
                <a href="#" className="bg-indigo-600 hover:bg-indigo-700 p-3 rounded-lg transition transform hover:scale-110">
                  <span className="text-sm font-bold">🐦</span>
                </a>
              </div>
            </div>
          </div>

          {/* Trust Badges */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-12 py-8 border-y border-slate-800">
            <div className="text-center">
              <div className="text-2xl mb-2">🔒</div>
              <p className="text-sm font-semibold">Pagos Seguros</p>
              <p className="text-xs text-slate-500">SSL Certificado</p>
            </div>
            <div className="text-center">
              <div className="text-2xl mb-2">📦</div>
              <p className="text-sm font-semibold">Envío Rápido</p>
              <p className="text-xs text-slate-500">En 24-48 horas</p>
            </div>
            <div className="text-center">
              <div className="text-2xl mb-2">⚡</div>
              <p className="text-sm font-semibold">Entrega Inmediata</p>
              <p className="text-xs text-slate-500">Productos digitales</p>
            </div>
            <div className="text-center">
              <div className="text-2xl mb-2">✅</div>
              <p className="text-sm font-semibold">Garantía</p>
              <p className="text-xs text-slate-500">100% satisfacción</p>
            </div>
          </div>

          {/* Bottom Footer */}
          <div className="pt-8 border-t border-slate-800">
            <div className="text-center">
              <p className="text-slate-400 mb-2">© 2026 <span className="font-bold text-white">{tenant?.brandName || "Mi Tienda"}</span>. Todos los derechos reservados.</p>
              <p className="text-slate-500 text-sm">Impulsado por <span className="text-indigo-400 font-semibold">VentasPro</span> | Solución E-commerce Premium</p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
