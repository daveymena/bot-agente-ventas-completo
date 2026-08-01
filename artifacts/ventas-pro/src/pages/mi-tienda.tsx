import { useState, useEffect } from "react";
import { useSession } from "@/App";
import { Button } from "@/components/ui/button";
import { Store, ShoppingCart, Package, Loader, Settings, Search, Menu, X, Heart, User, ChevronLeft, ChevronRight, Download, Box, MessageCircle } from "lucide-react";
import { useLocation } from "wouter";

interface StoreProduct {
  id: number;
  name: string;
  description: string;
  price: number;
  imageUrl?: string;
  currency?: string;
  type?: "físico" | "digital";
  category?: string;
  rating?: number;
  reviews?: number;
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
  const [cart, setCart] = useState<number[]>([]);
  const [wishlist, setWishlist] = useState<number[]>([]);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  // Categorías con icono
  const categories = [
    { id: "audifonos", name: "Audífonos", icon: "🎧" },
    { id: "smartwatch", name: "Smartwatch", icon: "⌚" },
    { id: "libros", name: "Libros", icon: "📚" },
    { id: "cursos", name: "Cursos", icon: "🎓" },
    { id: "suscripciones", name: "Suscripciones", icon: "🔔" },
  ];

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const paramSlug = urlParams.get("slug");
    const storedSlug = localStorage.getItem("selected_store_slug");
    const tenantSlug = tenant?.slug;

    const finalSlug = paramSlug || storedSlug || tenantSlug || "menadanyer";
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
  }, [products, searchQuery, selectedCategory]);

  const loadStore = async () => {
    try {
      setLoading(true);
      if (!slug) return;

      const res = await fetch(`/api/store/${slug}`);
      if (res.ok) {
        const data = await res.json();
        setProducts(data.products || []);
        return;
      }

      // DEMO PRODUCTS - Físicos y Digitales
      const demoProducts: StoreProduct[] = [
        {
          id: 1,
          name: "Audífonos Inalámbricos Pro",
          description: "Audífonos Bluetooth con cancelación de ruido activa",
          price: 149900,
          currency: "COP",
          type: "físico",
          category: "audifonos",
          imageUrl: "/images/products/1.jpg",
          rating: 4.8,
          reviews: 128,
        },
        {
          id: 2,
          name: "Smartwatch Ultra",
          description: "Reloj inteligente con monitores de salud",
          price: 299900,
          currency: "COP",
          type: "físico",
          category: "smartwatch",
          imageUrl: "/images/products/2.jpg",
          rating: 4.6,
          reviews: 92,
        },
        {
          id: 3,
          name: "Clean Code - Robert Martin",
          description: "Guía completa para escribir código limpio",
          price: 49900,
          currency: "COP",
          type: "digital",
          category: "libros",
          imageUrl: "/images/products/3.jpg",
          rating: 4.9,
          reviews: 256,
        },
        {
          id: 4,
          name: "Curso TypeScript Avanzado",
          description: "Domina TypeScript desde cero hasta nivel profesional",
          price: 79900,
          currency: "COP",
          type: "digital",
          category: "cursos",
          imageUrl: "/images/products/4.jpg",
          rating: 4.7,
          reviews: 145,
        },
        {
          id: 5,
          name: "Suscripción Premium Plus",
          description: "Acceso a todos los cursos y certificaciones",
          price: 29900,
          currency: "COP",
          type: "digital",
          category: "suscripciones",
          imageUrl: "/images/products/5.jpg",
          rating: 4.5,
          reviews: 89,
        },
      ];

      setProducts(demoProducts);
    } catch (err: any) {
      console.error("Error:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const filterAndSortProducts = () => {
    let filtered = products;

    if (selectedCategory) {
      filtered = filtered.filter(p => p.category === selectedCategory);
    }

    if (searchQuery) {
      filtered = filtered.filter(p =>
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.description.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    setFilteredProducts(filtered);
  };

  const toggleWishlist = (id: number) => {
    setWishlist(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const addToCart = (id: number) => {
    setCart(prev => [...prev, id]);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader className="h-8 w-8 animate-spin text-red-600" />
      </div>
    );
  }

  const cartCount = cart.length;
  const wishlistCount = wishlist.length;

  return (
    <div className="min-h-screen bg-white text-slate-900">
      {/* HEADER */}
      <header className="sticky top-0 z-40 bg-white border-b border-gray-200">
        <div className="px-4 py-3">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-2xl font-black text-gray-900">SMARTJOYS</h1>
            <div className="flex items-center gap-3">
              <ShoppingCart className="h-6 w-6 text-slate-900" />
              {cartCount > 0 && (
                <span className="absolute -top-2 -right-2 bg-red-600 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                  {cartCount}
                </span>
              )}
              <Menu className="h-6 w-6 cursor-pointer text-slate-900" onClick={() => setMobileMenuOpen(!mobileMenuOpen)} />
            </div>
          </div>

          {/* SEARCH BAR */}
          <div className="relative mb-3">
            <input
              type="text"
              placeholder="Buscar productos"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-4 py-2 bg-gray-100 rounded-full text-sm text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-red-600"
            />
            <Search className="absolute right-3 top-2.5 h-5 w-5 text-gray-400" />
          </div>

          {/* WHATSAPP LINE */}
          <div className="flex items-center gap-2 text-sm bg-red-50 p-2 rounded-lg">
            <MessageCircle className="h-4 w-4 text-red-600" />
            <span className="text-gray-700">Línea WhatsApp: <strong>320 827 0414</strong></span>
          </div>
        </div>
      </header>

      {/* HERO BANNER */}
      <div className="bg-gradient-to-r from-gray-900 via-red-900 to-gray-900 text-white p-6 mb-6">
        <h2 className="text-3xl font-black mb-2 text-white">ENCUENTRA LO QUE BUSCAS</h2>
        <p className="text-sm text-gray-200 mb-4">Productos físicos y digitales en un solo lugar</p>
        <div className="flex gap-2">
          <span className="bg-red-600 text-white px-3 py-1 rounded text-sm font-bold">Envío Gratis</span>
          <span className="bg-gray-700 text-white px-3 py-1 rounded text-sm font-bold">Entrega Inmediata</span>
        </div>
      </div>

      {/* CATEGORIES CAROUSEL */}
      <div className="px-4 mb-6">
        <h3 className="text-lg font-bold mb-3 text-gray-900">Categorías</h3>
        <div className="flex gap-2 overflow-x-auto pb-2">
          <button
            onClick={() => setSelectedCategory(null)}
            className={`flex-shrink-0 px-4 py-2 rounded-lg font-semibold whitespace-nowrap ${
              selectedCategory === null
                ? "bg-red-600 text-white"
                : "bg-gray-100 text-gray-700"
            }`}
          >
            Todos
          </button>
          {categories.map(cat => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`flex-shrink-0 px-4 py-2 rounded-lg font-semibold whitespace-nowrap flex items-center gap-2 ${
                selectedCategory === cat.id
                  ? "bg-red-600 text-white"
                  : "bg-gray-100 text-gray-700"
              }`}
            >
              <span>{cat.icon}</span> {cat.name}
            </button>
          ))}
        </div>
      </div>

      {/* PRODUCTS GRID */}
      <div className="px-4 pb-24">
        {filteredProducts.length === 0 ? (
          <div className="text-center py-12">
            <Package className="h-16 w-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-bold text-gray-900 mb-2">No hay productos</h3>
            <p className="text-gray-600">Intenta con otra búsqueda</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {filteredProducts.map(product => (
              <div
                key={product.id}
                className="bg-white rounded-lg border border-gray-200 overflow-hidden hover:shadow-lg transition-shadow"
              >
                {/* PRODUCT IMAGE */}
                <div className="relative aspect-square bg-gray-100 overflow-hidden flex items-center justify-center">
                  <img
                    src={product.imageUrl || `/images/products/${product.id}.jpg`}
                    alt={product.name}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      if (!target.src.includes(`/images/products/${product.id}.jpg`)) {
                        target.src = `/images/products/${product.id}.jpg`;
                      } else {
                        target.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 400'%3E%3Crect fill='%23f1f5f9' width='400' height='400'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' dy='.3em' fill='%2394a3b8' font-size='24' font-family='sans-serif'%3ESin imagen%3C/text%3E%3C/svg%3E";
                      }
                    }}
                  />
                  {/* TYPE BADGE */}
                  <div className="absolute top-2 right-2">
                    {product.type === "digital" ? (
                      <span className="bg-blue-600 text-white px-2 py-1 rounded text-xs font-bold flex items-center gap-1 shadow-sm">
                        <Download className="h-3 w-3" /> Digital
                      </span>
                    ) : (
                      <span className="bg-green-600 text-white px-2 py-1 rounded text-xs font-bold flex items-center gap-1 shadow-sm">
                        <Box className="h-3 w-3" /> Físico
                      </span>
                    )}
                  </div>

                  {/* WISHLIST BUTTON */}
                  <button
                    onClick={() => toggleWishlist(product.id)}
                    className="absolute top-2 left-2 bg-white rounded-full p-2 hover:bg-red-100 transition"
                  >
                    <Heart
                      className={`h-5 w-5 ${
                        wishlist.includes(product.id)
                          ? "fill-red-600 text-red-600"
                          : "text-gray-400"
                      }`}
                    />
                  </button>
                </div>

                {/* PRODUCT INFO */}
                <div className="p-3">
                  <h3 className="font-bold text-sm text-gray-900 line-clamp-2 mb-1">
                    {product.name}
                  </h3>

                  {/* RATING */}
                  {product.rating && (
                    <div className="flex items-center gap-1 mb-2">
                      <span className="text-yellow-400">★</span>
                      <span className="text-xs font-semibold text-gray-700">
                        {product.rating} ({product.reviews})
                      </span>
                    </div>
                  )}

                  <p className="text-xs text-gray-600 line-clamp-1 mb-2">
                    {product.description}
                  </p>

                  {/* PRICE */}
                  <div className="mb-2">
                    <p className="text-lg font-black text-red-600">
                      ${Number(product.price).toLocaleString("es-CO")}
                    </p>
                  </div>

                  {/* BUTTON */}
                  <button
                    onClick={() => addToCart(product.id)}
                    className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-2 rounded-lg text-sm flex items-center justify-center gap-2 transition"
                  >
                    <ShoppingCart className="h-4 w-4" />
                    {product.type === "digital" ? "Descargar" : "Comprar"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* BOTTOM NAVIGATION */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-3 flex justify-around items-center">
        <button className="flex flex-col items-center gap-1 text-gray-700 hover:text-red-600">
          <Store className="h-6 w-6" />
          <span className="text-xs font-semibold">Tienda</span>
        </button>
        <button className="flex flex-col items-center gap-1 text-gray-700 hover:text-red-600">
          <Search className="h-6 w-6" />
          <span className="text-xs font-semibold">Filtros</span>
        </button>
        <button
          onClick={() => setWishlist(prev => (prev.length === 0 ? [] : prev))}
          className="flex flex-col items-center gap-1 text-gray-700 hover:text-red-600 relative"
        >
          <Heart className="h-6 w-6" />
          <span className="text-xs font-semibold">Deseos</span>
          {wishlistCount > 0 && (
            <span className="absolute -top-1 -right-1 bg-red-600 text-white text-xs font-bold rounded-full w-4 h-4 flex items-center justify-center">
              {wishlistCount}
            </span>
          )}
        </button>
        <button className="flex flex-col items-center gap-1 text-gray-700 hover:text-red-600 relative">
          <ShoppingCart className="h-6 w-6" />
          <span className="text-xs font-semibold">Carrito</span>
          {cartCount > 0 && (
            <span className="absolute -top-1 -right-1 bg-red-600 text-white text-xs font-bold rounded-full w-4 h-4 flex items-center justify-center">
              {cartCount}
            </span>
          )}
        </button>
        <button className="flex flex-col items-center gap-1 text-gray-700 hover:text-red-600">
          <User className="h-6 w-6" />
          <span className="text-xs font-semibold">Cuenta</span>
        </button>
      </div>
    </div>
  );
}
