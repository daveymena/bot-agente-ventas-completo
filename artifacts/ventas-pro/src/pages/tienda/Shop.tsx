import { useState, useMemo } from "react";
import { useLocation, Link } from "wouter";
import { Search, Star, Zap, Package, ShieldCheck, Truck, CreditCard, Clock, Users, ShoppingBag, Filter, X, Grid3X3, List, BookOpen, PlayCircle, TrendingUp, Lock, Download } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useStoreCart } from "./store-context";

/* ─── Payment helper ─── */
async function generateCheckout(slug: string, productId: number, method: "mercadopago" | "paypal") {
  const res = await fetch(`/api/public/checkout/${slug}/${productId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ method }),
  });
  if (!res.ok) throw new Error("Error generando enlace de pago");
  const data = await res.json();
  if (data.checkoutUrl) window.location.href = data.checkoutUrl;
}

/* ─── WhatsApp helper ─── */
function buyViaWhatsApp(phone: string | null | undefined, product: any) {
  if (!phone) { alert("WhatsApp no disponible. Contacta al administrador."); return; }
  const msg = `¡Hola! 👋%0A%0AQuiero comprar este producto:%0A%0A*${encodeURIComponent(product.name)}*%0APrecio: $${encodeURIComponent(String(product.price))} ${encodeURIComponent(product.currency || "COP")}%0A%0A¿Me ayudas con el proceso de pago y entrega? 🙌`;
  window.open(`https://wa.me/${phone}?text=${msg}`, "_blank", "noopener,noreferrer");
}

/* ─── Trust Badges ─── */
function TrustBar({ color }: { color: string }) {
  const badges = [
    { icon: ShieldCheck, label: "Pago Seguro", desc: "SSL 256-bit" },
    { icon: Clock, label: "Acceso Inmediato", desc: "Tras la compra" },
    { icon: Users, label: "Soporte 24/7", desc: "Siempre contigo" },
    { icon: CreditCard, label: "Pagos Fáciles", desc: "Tarjeta y transferencia" },
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {badges.map((b, i) => (
        <div key={i} className="flex items-center gap-2.5 bg-white rounded-xl px-4 py-3 border border-slate-100 shadow-sm">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${color}15` }}>
            <b.icon className="w-4 h-4" style={{ color }} />
          </div>
          <div>
            <span className="text-xs font-bold text-slate-700 block">{b.label}</span>
            <span className="text-[10px] text-slate-400 block">{b.desc}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─── Live Stats ─── */
function LiveStats({ color }: { color: string }) {
  const { products } = useStoreCart();
  const totalValue = products.reduce((a, p) => a + Number(p.price), 0);
  const stats = [
    { icon: ShoppingBag, label: "Productos", value: products.length },
    { icon: BookOpen, label: "Categorías", value: new Set(products.map((p: any) => p.category).filter(Boolean)).size },
    { icon: TrendingUp, label: "Inventario", value: `$${totalValue.toFixed(0)}` },
    { icon: Users, label: "Soporte", value: "24/7" },
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {stats.map((s, i) => (
        <div key={i} className="bg-white rounded-xl px-4 py-3 border border-slate-100 shadow-sm">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{s.label}</span>
            <s.icon className="w-3.5 h-3.5" style={{ color }} />
          </div>
          <span className="text-lg font-black text-slate-900">{s.value}</span>
        </div>
      ))}
    </div>
  );
}

/* ─── Sidebar Filters ─── */
function FilterSidebar({
  categories, filter, setFilter, kindFilter, setKindFilter, priceRange, setPriceRange,
  products, searchTerm, setSearchTerm, color,
}: {
  categories: string[]; filter: string; setFilter: (v: string) => void;
  kindFilter: string; setKindFilter: (v: string) => void;
  priceRange: [number, number]; setPriceRange: (v: [number, number]) => void;
  products: any[]; searchTerm: string; setSearchTerm: (v: string) => void;
  color: string;
}) {
  const maxPrice = Math.max(...products.map(p => Number(p.price)), 1000);
  return (
    <div className="space-y-6">
      {/* Search */}
      <div>
        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Buscar</h4>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
          <input
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Buscar producto..."
            className="w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-xl text-sm outline-none bg-slate-50"
            style={{ caretColor: color }}
          />
          {searchTerm && (
            <button onClick={() => setSearchTerm("")} className="absolute right-3 top-1/2 -translate-y-1/2">
              <X className="w-3.5 h-3.5 text-slate-300" />
            </button>
          )}
        </div>
      </div>

      {/* Categories */}
      <div>
        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Categorías</h4>
        <div className="space-y-1.5">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setFilter(cat)}
              className="w-full text-left px-3 py-2 rounded-xl text-sm font-medium transition-all"
              style={filter === cat ? { backgroundColor: color, color: "white" } : { color: "#475569" }}
              onMouseEnter={e => { if (filter !== cat) e.currentTarget.style.backgroundColor = "#f1f5f9"; }}
              onMouseLeave={e => { if (filter !== cat) e.currentTarget.style.backgroundColor = "transparent"; }}
            >
              {cat === "all" ? "Todas" : cat}
            </button>
          ))}
        </div>
      </div>

      {/* Tipo */}
      <div>
        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Tipo</h4>
        <div className="space-y-1.5">
          {[{v:"all",l:"Todos"},{v:"digital",l:"Digital"},{v:"physical",l:"Físico"},{v:"dropshipping",l:"Dropshipping"}].map(t => (
            <button
              key={t.v}
              onClick={() => setKindFilter(t.v)}
              className="w-full text-left px-3 py-2 rounded-xl text-sm font-medium transition-all"
              style={kindFilter === t.v ? { backgroundColor: color, color: "white" } : { color: "#475569" }}
              onMouseEnter={e => { if (kindFilter !== t.v) e.currentTarget.style.backgroundColor = "#f1f5f9"; }}
              onMouseLeave={e => { if (kindFilter !== t.v) e.currentTarget.style.backgroundColor = "transparent"; }}
            >
              {t.l}
            </button>
          ))}
        </div>
      </div>

      {/* Price Range */}
      <div>
        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
          Precio: ${priceRange[0]} — ${priceRange[1]}
        </h4>
        <input
          type="range"
          min={0}
          max={maxPrice}
          step={10}
          value={priceRange[1]}
          onChange={e => setPriceRange([priceRange[0], Number(e.target.value)])}
          className="w-full"
          style={{ accentColor: color }}
        />
        <div className="flex justify-between text-[10px] text-slate-400 mt-1">
          <span>$0</span>
          <span>${maxPrice.toFixed(0)}</span>
        </div>
      </div>
    </div>
  );
}

/* ─── Course-style Product Card ─── */
function ProductCard({ product, idx, color }: { product: any; idx: number; color: string }) {
  const { addToCart, cart, config } = useStoreCart();
  const inCart = cart.find(i => i.id === product.id);
  const [paying, setPaying] = useState<string | null>(null);

  const handlePay = async (method: "mercadopago" | "paypal") => {
    if (config.slug == null || product.id == null) return;
    setPaying(method);
    try {
      await generateCheckout(config.slug, product.id, method);
    } catch {
      setPaying(null);
      alert("No se pudo generar el enlace de pago. Intenta de nuevo.");
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: idx * 0.04 }}
      className="bg-white rounded-2xl overflow-hidden border border-slate-100 shadow-sm hover:shadow-xl transition-all group"
    >
      {/* Image 16:9 */}
      <div className="aspect-video overflow-hidden relative bg-slate-100">
        <img
          src={product.image || `https://placehold.co/600x400/f1f5f9/64748b?text=${encodeURIComponent(product.name.slice(0, 12))}`}
          alt={product.name}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
        />
        {/* Category badge */}
        <div className="absolute top-3 left-3">
          <span className="px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-white/90 backdrop-blur-sm text-slate-700 shadow-sm">
            {product.category || "General"}
          </span>
        </div>
        {/* Kind badge */}
        <div className="absolute top-3 right-3">
          <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider text-white shadow-sm ${
            product.kind === "digital" ? "bg-blue-500" :
            product.kind === "physical" ? "bg-green-500" : "bg-purple-500"
          }`}>
            {product.kind === "digital" ? "Digital" : product.kind === "physical" ? "Físico" : "Drop"}
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="p-5">
        <h3 className="font-bold text-slate-900 mb-2 group-hover:text-slate-600 transition-colors leading-tight line-clamp-2">{product.name}</h3>
        <p className="text-xs text-slate-400 line-clamp-2 mb-4 leading-relaxed">{product.description}</p>

        {/* Rating */}
        <div className="flex items-center gap-1 mb-4">
          {[...Array(5)].map((_, i) => (
            <Star key={i} className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
          ))}
          <span className="text-xs text-slate-400 ml-1">5.0</span>
        </div>

        {/* Price + CTA */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-50">
          <div>
            <span className="text-xl font-black text-slate-900">
              {Number(product.price).toLocaleString("es-CO", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
            </span>
            <span className="text-xs text-slate-400 ml-1">{product.currency || "USD"}</span>
          </div>
          <button
            onClick={() => buyViaWhatsApp(config.whatsappPhone, product)}
            style={{ backgroundColor: color }}
            className="px-4 py-2.5 text-white rounded-xl font-bold text-sm hover:opacity-90 transition-all hover:shadow-lg active:scale-95 flex items-center gap-1.5"
          >
            <Zap className="w-4 h-4" /> Comprar
          </button>
        </div>

        {inCart && (
          <div className="mt-3 text-[10px] font-bold px-2.5 py-1.5 rounded-lg text-center" style={{ color, backgroundColor: `${color}15` }}>
            <Package className="w-3 h-3 inline mr-1" /> {inCart.quantity} en carrito
          </div>
        )}

        {/* Payment buttons */}
        <div className="mt-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => handlePay("mercadopago")}
              disabled={paying !== null}
              style={{ borderColor: color, color }}
              className="px-3 py-2 rounded-xl font-bold text-xs border-2 transition-all hover:opacity-80 disabled:opacity-50 flex items-center justify-center gap-1.5"
            >
              <CreditCard className="w-3.5 h-3.5" />
              {paying === "mercadopago" ? "..." : "MercadoPago"}
            </button>
            <button
              onClick={() => handlePay("paypal")}
              disabled={paying !== null}
              style={{ borderColor: "#0070ba", color: "#0070ba" }}
              className="px-3 py-2 rounded-xl font-bold text-xs border-2 transition-all hover:opacity-80 disabled:opacity-50 flex items-center justify-center gap-1.5"
            >
              <Lock className="w-3.5 h-3.5" />
              {paying === "paypal" ? "..." : "PayPal"}
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

/* ─── Main Shop ─── */
export default function StoreShop() {
  const { products, config } = useStoreCart();
  const [location] = useLocation();
  const slug = location.split("/")[2];
  const [searchTerm, setSearchTerm] = useState("");
  const [filter, setFilter] = useState("all");
  const [kindFilter, setKindFilter] = useState("all");
  const [priceRange, setPriceRange] = useState<[number, number]>([0, 9999999]);
  const [showFilters, setShowFilters] = useState(false);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  const color = config.primaryColor;
  const categories = useMemo(() => ["all", ...new Set(products.map((p: any) => p.category).filter(Boolean))], [products]);

  const filtered = useMemo(() => {
    return products.filter((p: any) => {
      if (searchTerm && !p.name.toLowerCase().includes(searchTerm.toLowerCase()) && !p.description.toLowerCase().includes(searchTerm.toLowerCase())) return false;
      if (filter !== "all" && p.category !== filter) return false;
      if (kindFilter !== "all" && p.kind !== kindFilter) return false;
      const price = Number(p.price);
      if (price < priceRange[0] || price > priceRange[1]) return false;
      return true;
    });
  }, [products, searchTerm, filter, kindFilter, priceRange]);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          <div className="text-center mb-6">
            <span className="text-xs font-bold uppercase tracking-widest mb-2 block" style={{ color }}>Catálogo</span>
            <h1 className="text-3xl md:text-4xl font-black text-slate-900">Todos los productos</h1>
            <p className="text-slate-500 text-sm mt-2">
              <span className="font-bold" style={{ color }}>{filtered.length}</span> productos disponibles · Paso a paso, sin conocimiento previo
            </p>
          </div>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => setViewMode(v => v === "grid" ? "list" : "grid")}
              className="p-2.5 rounded-xl border border-slate-200 text-slate-400 hover:text-slate-900 hover:border-slate-300 transition-all"
            >
              {viewMode === "grid" ? <List className="w-4 h-4" /> : <Grid3X3 className="w-4 h-4" />}
            </button>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="p-2.5 rounded-xl border transition-all flex items-center gap-2"
              style={showFilters ? { backgroundColor: color, color: "white", borderColor: color } : { borderColor: "#e2e8f0", color: "#94a3b8" }}
            >
              <Filter className="w-4 h-4" /> Filtros
            </button>
          </div>
        </div>
      </div>

      {/* Trust + Stats */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 space-y-4">
        <TrustBar color={color} />
        <LiveStats color={color} />
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex gap-8">
          {/* Sidebar */}
          <AnimatePresence>
            {showFilters && (
              <motion.aside
                initial={{ opacity: 0, x: -20, width: 0 }}
                animate={{ opacity: 1, x: 0, width: 260 }}
                exit={{ opacity: 0, x: -20, width: 0 }}
                className="hidden lg:block flex-shrink-0"
              >
                <div className="w-[260px] bg-white rounded-2xl border border-slate-100 p-5 shadow-sm sticky top-28">
                  <FilterSidebar
                    categories={categories} filter={filter} setFilter={setFilter}
                    kindFilter={kindFilter} setKindFilter={setKindFilter}
                    priceRange={priceRange} setPriceRange={setPriceRange}
                    products={products} searchTerm={searchTerm} setSearchTerm={setSearchTerm}
                    color={color}
                  />
                </div>
              </motion.aside>
            )}
          </AnimatePresence>

          {/* Products grid */}
          <div className="flex-1 min-w-0">
            {/* Mobile filters */}
            <div className="lg:hidden mb-4 flex gap-2 overflow-x-auto pb-2">
              {categories.slice(0, 6).map(cat => (
                <button
                  key={cat}
                  onClick={() => setFilter(cat)}
                  className="px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wider whitespace-nowrap transition-all"
                  style={filter === cat ? { backgroundColor: color, color: "white" } : { backgroundColor: "white", border: "1px solid #e2e8f0", color: "#475569" }}
                >
                  {cat === "all" ? "Todas" : cat}
                </button>
              ))}
            </div>

            {filtered.length > 0 ? (
              <div className={viewMode === "grid" ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6" : "space-y-4"}>
                {filtered.map((product, idx) =>
                  viewMode === "grid" ? (
                    <ProductCard key={product.id} product={product} idx={idx} color={color} />
                  ) : (
                    <motion.div
                      key={product.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="bg-white rounded-2xl border border-slate-100 shadow-sm flex gap-5 overflow-hidden hover:shadow-md transition-shadow"
                    >
                      <div className="w-40 h-32 overflow-hidden bg-slate-100 flex-shrink-0">
                        <img src={product.image || ""} alt={product.name} className="w-full h-full object-cover" />
                      </div>
                      <div className="flex-1 py-4 pr-4">
                        <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider mb-1">{product.category || "General"}</p>
                        <h3 className="font-bold text-slate-900 mb-1">{product.name}</h3>
                        <p className="text-xs text-slate-400 line-clamp-1 mb-2">{product.description}</p>
                        <div className="flex items-center justify-between mt-2">
                          <span className="text-lg font-black text-slate-900">
                            {Number(product.price).toLocaleString("es-CO")} <span className="text-xs text-slate-400">{product.currency}</span>
                          </span>
                          <button
                            onClick={() => buyViaWhatsApp(config.whatsappPhone, product)}
                            style={{ backgroundColor: color }}
                            className="px-4 py-2 text-white rounded-xl text-sm font-bold hover:opacity-90"
                          >
                            Comprar
                          </button>
                        </div>
                        <div className="mt-2 flex gap-2 flex-wrap">
                          <button
                            onClick={() => { if (config.slug) generateCheckout(config.slug, product.id, "mercadopago").catch(() => alert("Error generando pago")); }}
                            className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1.5 rounded-lg"
                            style={{ borderColor: color, color, border: "1.5px solid" }}
                          >
                            <CreditCard className="w-3 h-3" /> MercadoPago
                          </button>
                          <button
                            onClick={() => { if (config.slug) generateCheckout(config.slug, product.id, "paypal").catch(() => alert("Error generando pago")); }}
                            className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1.5 rounded-lg"
                            style={{ borderColor: "#0070ba", color: "#0070ba", border: "1.5px solid" }}
                          >
                            <Lock className="w-3 h-3" /> PayPal
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )
                )}
              </div>
            ) : (
              <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-slate-200">
                <Package className="w-16 h-16 text-slate-200 mx-auto mb-4" />
                <h3 className="text-xl font-bold text-slate-900 mb-1">No hay productos</h3>
                <p className="text-sm text-slate-400">
                  {searchTerm ? `No encontramos "${searchTerm}"` : "No hay productos en esta categoría"}
                </p>
                {searchTerm && (
                  <button onClick={() => setSearchTerm("")} className="mt-4 text-sm font-medium hover:underline" style={{ color }}>
                    Limpiar búsqueda
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* CTA */}
      <section className="py-16" style={{ background: `linear-gradient(to right, ${config.primaryColor}, ${config.secondaryColor})` }}>
        <div className="max-w-7xl mx-auto px-4 text-center">
          <h2 className="text-3xl md:text-4xl font-black text-white mb-4">¿Listo para tu pedido?</h2>
          <p className="text-white/80 text-lg mb-8 max-w-lg mx-auto">Agrega productos al carrito y recíbelos donde quieras</p>
          <Link
            to={`/store/${slug}/carrito`}
            className="inline-flex items-center gap-2 bg-white px-8 py-4 rounded-xl font-bold hover:scale-105 transition-all shadow-2xl"
            style={{ color: config.primaryColor }}
          >
            <ShoppingBag className="w-5 h-5" /> IR AL CARRITO
          </Link>
        </div>
      </section>
    </div>
  );
}