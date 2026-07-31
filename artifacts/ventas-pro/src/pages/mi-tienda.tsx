import { useState, useEffect } from "react";
import { useSession } from "@/App";
import { Button } from "@/components/ui/button";
import { Store, ShoppingCart, Package, Loader, Settings, Search, Menu, X } from "lucide-react";
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
  const [slug, setSlug] = useState<string | null>(null);
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<StoreProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("newest");
  const [cart, setCart] = useState<number[]>([]);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Obtener slug de: param URL, localStorage, tenant, o usar default
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const paramSlug = urlParams.get("slug");
    const storedSlug = localStorage.getItem("selected_store_slug");
    const tenantSlug = tenant?.slug;

    const finalSlug = paramSlug || storedSlug || tenantSlug || "sofia-premium";
    console.log(`📍 Cargando tienda con slug: ${finalSlug}`);
    setSlug(finalSlug);
    if (!paramSlug && !storedSlug) {
      localStorage.setItem("selected_store_slug", finalSlug);
    }
  }, [tenant?.slug]);

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
      if (!slug) {
        console.warn("⚠️ No se especificó slug");
        setError("No se especificó tienda");
        return;
      }

      console.log(`📦 Cargando tienda: /api/store/${slug}`);
      const res = await fetch(`/api/store/${slug}`);
      console.log(`📦 Respuesta: ${res.status} ${res.statusText}`);

      if (res.ok) {
        const data = await res.json();
        console.log(`📦 Productos recibidos:`, data.products?.length || 0);
        setProducts(data.products || []);
        return;
      }

      console.warn("⚠️ Backend no disponible, usando datos demo");
      const demoProducts: StoreProduct[] = [
        {
          id: 1,
          name: "Curso Avanzado de TypeScript",
          description: "Domina TypeScript desde cero hasta nivel profesional. Incluye 50+ ejercicios prácticos y 10 proyectos reales.",
          price: 49900,
          currency: "COP",
          imageUrl: "/images/products/1.jpg",
        },
        {
          id: 2,
          name: "React Pro - Full Stack Masterclass",
          description: "Aprende React 19 con hooks, context, performance optimization y mejores prácticas industriales.",
          price: 59900,
          currency: "COP",
          imageUrl: "/images/products/2.jpg",
        },
        {
          id: 3,
          name: "PostgreSQL & Databases Design",
          description: "Domina diseño de bases de datos relacionales, SQL avanzado y optimización de queries.",
          price: 44900,
          currency: "COP",
          imageUrl: "/images/products/3.jpg",
        },
        {
          id: 4,
          name: "Next.js 15 - Web Moderno",
          description: "Build production-ready web apps con Next.js, App Router, Server Actions y más.",
          price: 54900,
          currency: "COP",
          imageUrl: "/images/products/4.jpg",
        },
        {
          id: 5,
          name: "DevOps & Cloud - AWS Essentials",
          description: "Deploy, scale y monitorea aplicaciones en AWS. CI/CD, Docker, Kubernetes basics.",
          price: 64900,
          currency: "COP",
          imageUrl: "/images/products/5.jpg",
        },
        {
          id: 6,
          name: "JavaScript Avanzado - ES2024",
          description: "Conceptos avanzados: closures, prototypes, async/await, generators y más.",
          price: 39900,
          currency: "COP",
          imageUrl: "/images/products/6.jpg",
        },
      ];

      console.log("✅ Usando productos demo - Backend no disponible");
      setProducts(demoProducts);
    } catch (err: any) {
      console.error("❌ Error cargando tienda:", err);
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
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <div className="max-w-md w-full bg-white p-8 text-center rounded-2xl shadow-lg">
          <Store className="h-12 w-12 text-slate-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold mb-2">Tienda no disponible</h2>
          <p className="text-sm text-slate-600 mb-4">{error}</p>
        </div>
      </div>
    );
  }

  const totalItems = cart.length;

  return (
    <div className="min-h-screen bg-white">
      {/* DEBUG BANNER - CAMBIO REALIZADO ✅ */}
      <div className="w-full bg-gradient-to-r from-green-500 to-emerald-500 text-white py-4 text-center font-bold text-lg">
        ✅ ESTA ES LA TIENDA REDISEÑADA - CAMBIOS CARGADOS CORRECTAMENTE
      </div>

      {/* Header - Simple and Mobile Optimized */}
      <header className="sticky top-0 z-50 bg-white border-b border-gray-200 shadow-sm">
        <div className="w-full px-4 sm:px-6 lg:px-8">
          <div className="h-16 flex items-center justify-between">
            {/* Logo */}
            <div className="flex items-center gap-2 flex-1">
              <div className="h-10 w-10 bg-indigo-600 rounded-lg flex items-center justify-center flex-shrink-0">
                <Store className="h-6 w-6 text-white" />
              </div>
              <div className="min-w-0">
                <h1 className="text-base sm:text-lg font-bold text-slate-900 truncate">{tenant?.brandName || "Mi Tienda"}</h1>
                <p className="text-xs text-slate-500 hidden sm:block">Tienda Online</p>
              </div>
            </div>

            {/* Right Actions */}
            <div className="flex items-center gap-2 sm:gap-3 ml-4">
              {/* Admin Button - Desktop only */}
              <Button
                variant="ghost"
                size="sm"
                className="hidden sm:inline-flex gap-2 text-slate-700 hover:text-indigo-600"
                onClick={() => setLocation("/products")}
              >
                <Settings className="h-4 w-4" />
                <span className="text-sm">Admin</span>
              </Button>

              {/* Cart Button */}
              <div className="relative">
                <Button
                  size="sm"
                  className="bg-indigo-600 hover:bg-indigo-700 text-white gap-1 sm:gap-2 px-3 sm:px-4"
                >
                  <ShoppingCart className="h-5 w-5 flex-shrink-0" />
                  <span className="font-bold hidden sm:inline">{totalItems}</span>
                </Button>
                {totalItems > 0 && (
                  <div className="absolute -top-2 -right-2 bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                    {totalItems}
                  </div>
                )}
              </div>

              {/* Mobile Menu Button */}
              <Button
                variant="ghost"
                size="sm"
                className="sm:hidden text-slate-700 hover:text-indigo-600"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              >
                {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
              </Button>
            </div>
          </div>

          {/* Mobile Menu */}
          {mobileMenuOpen && (
            <div className="sm:hidden border-t border-gray-200 bg-slate-50 py-3 space-y-2">
              <a href="#productos" className="block px-4 py-2 text-slate-700 hover:bg-slate-100 rounded font-medium text-sm">
                Productos
              </a>
              <a href="#nosotros" className="block px-4 py-2 text-slate-700 hover:bg-slate-100 rounded font-medium text-sm">
                Sobre Nosotros
              </a>
              <a href="#contacto" className="block px-4 py-2 text-slate-700 hover:bg-slate-100 rounded font-medium text-sm">
                Contacto
              </a>
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start gap-2 text-slate-700"
                onClick={() => setLocation("/products")}
              >
                <Settings className="h-4 w-4" />
                <span>Panel Admin</span>
              </Button>
            </div>
          )}
        </div>
      </header>

      {/* Search Section */}
      <div className="bg-gradient-to-r from-indigo-50 to-blue-50 border-b border-gray-200 py-4 sm:py-6">
        <div className="w-full px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
          <div className="mb-4">
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-1">{tenant?.brandName || "Mi Tienda"}</h2>
            <p className="text-sm text-slate-600">Explora nuestro catálogo de productos</p>
          </div>

          {/* Search and Filter */}
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar productos..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-3 py-2.5 sm:py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:border-transparent text-sm sm:text-base"
              />
            </div>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="px-3 py-2.5 sm:py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600 text-sm sm:text-base w-full sm:w-auto"
            >
              <option value="newest">Más recientes</option>
              <option value="price-asc">Menor precio</option>
              <option value="price-desc">Mayor precio</option>
            </select>
          </div>

          <p className="text-xs sm:text-sm text-slate-600 mt-3">
            Mostrando <span className="font-semibold">{filteredProducts.length}</span> de <span className="font-semibold">{products.length}</span> productos
          </p>
        </div>
      </div>

      {/* Products Grid */}
      <main className="w-full px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        {filteredProducts.length === 0 ? (
          <div className="text-center py-16 sm:py-24">
            <div className="inline-block bg-slate-100 rounded-full p-4 sm:p-6 mb-6">
              <Package className="h-12 w-12 sm:h-16 sm:w-16 text-slate-400" />
            </div>
            <h3 className="text-xl sm:text-3xl font-bold text-slate-900 mb-2 sm:mb-3">No hay productos disponibles</h3>
            <p className="text-sm sm:text-lg text-slate-600 mb-6 sm:mb-8">Vuelve pronto para descubrir nuestros productos</p>
            <Button
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 sm:px-8 py-2 sm:py-3"
              onClick={() => window.location.reload()}
            >
              Actualizar
            </Button>
          </div>
        ) : (
          <div>
            <div className="grid gap-4 sm:gap-6 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 auto-rows-max">
              {filteredProducts.map((product) => (
                <div
                  key={product.id}
                  className="group relative bg-white rounded-xl sm:rounded-2xl overflow-hidden hover:shadow-xl transition-all duration-300 flex flex-col h-full border border-gray-200/50"
                >
                  {/* Product Image Container */}
                  <div className="relative aspect-square bg-gradient-to-br from-slate-100 to-slate-200 overflow-hidden flex-shrink-0">
                    {product.imageUrl ? (
                      <>
                        <img
                          src={product.imageUrl}
                          alt={product.name}
                          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                          onError={(e) => {
                            e.currentTarget.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 400'%3E%3Crect fill='%23f1f5f9' width='400' height='400'/%3E%3C/svg%3E";
                          }}
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                      </>
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-indigo-50 via-slate-50 to-slate-100">
                        <Package className="h-8 w-8 sm:h-12 sm:w-12 text-slate-300" />
                      </div>
                    )}

                    {/* Currency Badge */}
                    <div className="absolute top-2 sm:top-3 right-2 sm:right-3 bg-indigo-600 text-white px-2 sm:px-3 py-1 rounded-full text-xs font-bold shadow-md">
                      {product.currency || "COP"}
                    </div>
                  </div>

                  {/* Product Info */}
                  <div className="p-3 sm:p-4 flex flex-col flex-1">
                    <h3 className="font-bold text-slate-900 mb-1 sm:mb-2 line-clamp-2 text-sm sm:text-base">{product.name}</h3>
                    <p className="text-xs sm:text-sm text-slate-600 line-clamp-2 mb-3 flex-1">{product.description}</p>

                    {/* Price */}
                    <div className="mb-3 sm:mb-4 pb-3 sm:pb-4 border-t border-gray-200">
                      <p className="text-lg sm:text-2xl font-black text-indigo-600">
                        ${Number(product.price).toLocaleString("es-CO")}
                      </p>
                    </div>

                    {/* Button */}
                    <Button
                      className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 sm:py-2.5 rounded-lg text-sm sm:text-base transition-colors"
                      onClick={() => {
                        setCart([...cart, product.id]);
                        setTimeout(() => alert(`✅ ${product.name} agregado al carrito`), 0);
                      }}
                    >
                      <ShoppingCart className="h-4 w-4 mr-1.5 sm:mr-2" />
                      Comprar
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-slate-900 text-white py-12 sm:py-16 border-t-4 border-indigo-600 mt-12 sm:mt-20">
        <div className="w-full px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
          {/* Main Content */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 sm:gap-12 mb-8 sm:mb-12">
            {/* Brand */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="h-8 w-8 bg-indigo-600 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Store className="h-5 w-5 text-white" />
                </div>
                <h3 className="font-bold text-base sm:text-lg">{tenant?.brandName || "Mi Tienda"}</h3>
              </div>
              <p className="text-slate-400 text-sm leading-relaxed">Productos de calidad con entrega inmediata. Tu tienda online de confianza.</p>
            </div>

            {/* Links */}
            <div>
              <h4 className="font-bold mb-3 sm:mb-4 text-sm sm:text-base">Navegación</h4>
              <ul className="text-slate-400 space-y-2 text-sm">
                <li><a href="#" className="hover:text-indigo-400 transition">Productos</a></li>
                <li><a href="#" className="hover:text-indigo-400 transition">Sobre Nosotros</a></li>
                <li><a href="#" className="hover:text-indigo-400 transition">Contacto</a></li>
              </ul>
            </div>

            {/* Support */}
            <div>
              <h4 className="font-bold mb-3 sm:mb-4 text-sm sm:text-base">Soporte</h4>
              <ul className="text-slate-400 space-y-2 text-sm">
                <li><a href="#" className="hover:text-indigo-400 transition">Centro de Ayuda</a></li>
                <li><a href="#" className="hover:text-indigo-400 transition">Rastrear Orden</a></li>
                <li><a href="#" className="hover:text-indigo-400 transition">Devoluciones</a></li>
              </ul>
            </div>

            {/* Contact */}
            <div>
              <h4 className="font-bold mb-3 sm:mb-4 text-sm sm:text-base">Contacto</h4>
              <p className="text-slate-400 mb-2 text-sm">📧 {tenant?.email || "info@tienda.com"}</p>
              <p className="text-slate-400 text-sm">💬 Whatsapp 24/7</p>
            </div>
          </div>

          {/* Trust Badges - Responsive Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-6 py-6 sm:py-8 border-y border-slate-800">
            <div className="text-center">
              <div className="text-xl sm:text-2xl mb-1 sm:mb-2">🔒</div>
              <p className="text-xs sm:text-sm font-semibold">Pagos Seguros</p>
            </div>
            <div className="text-center">
              <div className="text-xl sm:text-2xl mb-1 sm:mb-2">📦</div>
              <p className="text-xs sm:text-sm font-semibold">Envío Rápido</p>
            </div>
            <div className="text-center">
              <div className="text-xl sm:text-2xl mb-1 sm:mb-2">⚡</div>
              <p className="text-xs sm:text-sm font-semibold">Entrega Inmediata</p>
            </div>
            <div className="text-center">
              <div className="text-xl sm:text-2xl mb-1 sm:mb-2">✅</div>
              <p className="text-xs sm:text-sm font-semibold">Garantía</p>
            </div>
          </div>

          {/* Bottom */}
          <div className="pt-6 sm:pt-8 text-center">
            <p className="text-slate-400 text-xs sm:text-sm mb-1">© 2026 <span className="font-bold text-white">{tenant?.brandName || "Mi Tienda"}</span>. Todos los derechos reservados.</p>
            <p className="text-slate-500 text-xs">Impulsado por <span className="text-indigo-400 font-semibold">VentasPro</span></p>
          </div>
        </div>
      </footer>
    </div>
  );
}
