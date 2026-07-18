import { useState, useMemo, useEffect } from "react";
import { useLocation, Link } from "wouter";
import {
  Search, Star, Zap, Package, ShieldCheck, Truck, CreditCard,
  BatteryFull, BatteryCharging,
  TrendingUp, Clock, Users, ShoppingBag, Filter, X, Grid3X3, List
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useStoreCart } from "./store-context";

/* ─── Battery Stock Indicator ─── */
function StockBattery({ level, color }: { level: number; color: string }) {
  const pct = Math.min(100, Math.max(0, level));
  let bgColor = "bg-green-500";
  let Icon = BatteryFull;
  if (pct < 50) { bgColor = "bg-amber-500"; Icon = BatteryCharging; }
  if (pct < 25) { bgColor = "bg-red-500"; Icon = BatteryCharging; }
  return (
    <div className="flex items-center gap-2 text-xs">
      <Icon className="w-3.5 h-3.5 text-slate-400" />
      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${bgColor}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-slate-400 font-medium">{pct}%</span>
    </div>
  );
}

/* ─── Trust Badges ─── */
function TrustBar({ color }: { color: string }) {
  const badges = [
    { icon: ShieldCheck, label: "Pago Seguro" },
    { icon: Truck, label: "Envío Rápido" },
    { icon: CreditCard, label: "Tarjetas" },
    { icon: Clock, label: "24/7 Soporte" },
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {badges.map((b, i) => (
        <div key={i} className="flex items-center gap-2 bg-white rounded-xl px-4 py-3 border border-slate-100 shadow-sm">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${color}15` }}>
            <b.icon className="w-4 h-4" style={{ color }} />
          </div>
          <span className="text-xs font-semibold text-slate-700">{b.label}</span>
        </div>
      ))}
    </div>
  );
}

/* ─── Live Stats Bar ─── */
function LiveStats({ color }: { color: string }) {
  const { products } = useStoreCart();
  const [sales, setSales] = useState(127);
  const [visitors, setVisitors] = useState(89);

  useEffect(() => {
    const t = setInterval(() => {
      setSales(s => s + Math.floor(Math.random() * 3));
      setVisitors(v => v + Math.floor(Math.random() * 5));
    }, 8000);
    return () => clearInterval(t);
  }, []);

  const totalValue = products.reduce((a, p) => a + Number(p.price), 0);
  const stats = [
    { icon: ShoppingBag, label: "Ventas hoy", value: `$${sales.toFixed(0)}` },
    { icon: Users, label: "Visitantes", value: visitors },
    { icon: Package, label: "Productos", value: products.length },
    { icon: TrendingUp, label: "Inventario", value: `$${totalValue.toFixed(0)}` },
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

/* ─── Live Notification Toast ─── */
function LiveNotifications() {
  const [notif, setNotif] = useState<{ name: string; product: string } | null>(null);

  useEffect(() => {
    const names = ["María", "Carlos", "Laura", "Pedro", "Ana", "Luis", "Sofía", "Diego"];
    const t = setInterval(() => {
      setNotif({
        name: names[Math.floor(Math.random() * names.length)],
        product: ["Curso Pro", "Teclado RGB", "Audífonos", "Laptop", "Sofá", "Crema Facial"][Math.floor(Math.random() * 6)],
      });
      setTimeout(() => setNotif(null), 4000);
    }, 12000);
    return () => clearInterval(t);
  }, []);

  return (
    <AnimatePresence>
      {notif && (
        <motion.div
          initial={{ opacity: 0, x: 100 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 100 }}
          className="fixed bottom-6 right-6 z-50 bg-white rounded-2xl shadow-2xl border border-slate-100 px-5 py-4 max-w-xs"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-green-100 flex items-center justify-center">
              <ShoppingBag className="w-4 h-4 text-green-600" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-900">{notif.name} compró</p>
              <p className="text-xs text-slate-400">{notif.product}</p>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
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
            placeholder="Buscar..."
            className="w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 outline-none bg-slate-50"
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
        <div className="space-y-2">
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
          <div className="flex justify-between text-[10px] text-slate-400">
            <span>$0</span>
            <span>${maxPrice.toFixed(0)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Product Card ─── */
function ProductCard({ product, idx, color }: { product: any; idx: number; color: string }) {
  const { addToCart, cart } = useStoreCart();
  const inCart = cart.find(i => i.id === product.id);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: idx * 0.04 }}
      whileHover={{ y: -6 }}
      className="bg-white rounded-2xl overflow-hidden border border-gray-100 shadow-sm group"
    >
      {/* Image */}
      <div className="aspect-square overflow-hidden relative bg-slate-50">
        <img
          src={product.image || `https://placehold.co/400x400/f1f5f9/64748b?text=${encodeURIComponent(product.name.slice(0, 12))}`}
          alt={product.name}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
        />
        <div className="absolute top-3 left-3 flex gap-1.5">
          <span className={`px-2.5 py-1 rounded-lg text-[9px] font-bold uppercase tracking-wider shadow-sm ${
            product.kind === "digital" ? "bg-blue-500/90 text-white" :
            product.kind === "physical" ? "bg-green-500/90 text-white" : "bg-purple-500/90 text-white"
          }`}>
            {product.kind === "digital" ? "Digital" : product.kind === "physical" ? "Físico" : "Drop"}
          </span>
        </div>
      </div>

      {/* Info */}
      <div className="p-5">
        <h3 className="font-bold text-slate-900 mb-1 group-hover:text-slate-600 transition-colors leading-tight line-clamp-1">{product.name}</h3>
        <p className="text-xs text-slate-400 line-clamp-2 mb-3 leading-relaxed">{product.description}</p>

        {/* Price + CTA */}
        <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-50">
          <div>
            <span className="text-lg font-black text-slate-900">
              {product.currency === "COP" ? "$" : product.currency === "USD" ? "$" : ""}
              {Number(product.price).toLocaleString("es-CO", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
            </span>
          </div>
          <button
            onClick={() => addToCart(product)}
            style={{ backgroundColor: color }}
            className="p-2.5 text-white rounded-xl hover:opacity-90 transition-all hover:shadow-lg active:scale-95"
          >
            <Zap className="w-4 h-4" />
          </button>
        </div>

        {inCart && (
          <div className="mt-2 text-[10px] font-bold px-2 py-1 rounded-lg text-center" style={{ color, backgroundColor: `${color}15` }}>
            {inCart.quantity} en carrito
          </div>
        )}
      </div>
    </motion.div>
  );
}

/* ─── Main Shop Component ─── */
export default function StoreShop() {
  const { products, config } = useStoreCart();
  const [location] = useLocation();
  const slug = location.split("/")[2];
  const [searchTerm, setSearchTerm] = useState("");
  const [filter, setFilter] = useState("all");
  const [kindFilter, setKindFilter] = useState("all");
  const [priceRange, setPriceRange] = useState<[number, number]>([0, 9999999]);
  const [showFilters, setShowFilters] = useState(true);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  const categories = useMemo(() => ["all", ...new Set(products.map((p: any) => p.category).filter(Boolean))], [products]);
  const color = config.primaryColor;

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
      <LiveNotifications />

      {/* Header */}
      <div className="bg-white border-b border-slate-100 sticky top-0 z-30 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="py-6">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <h1 className="text-3xl md:text-4xl font-black text-slate-950 tracking-tighter uppercase">{config.name}</h1>
                <p className="text-slate-400 text-sm mt-1">
                  <span className="font-bold" style={{ color }}>{filtered.length}</span> productos disponibles
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setViewMode(v => v === "grid" ? "list" : "grid")}
                  className="p-2.5 rounded-xl border border-slate-200 text-slate-400 hover:text-slate-900 hover:border-slate-300 transition-all"
                >
                  {viewMode === "grid" ? <List className="w-4 h-4" /> : <Grid3X3 className="w-4 h-4" />}
                </button>
                <button
                  onClick={() => setShowFilters(!showFilters)}
                  className="p-2.5 rounded-xl border transition-all"
                  style={showFilters ? { backgroundColor: color, color: "white", borderColor: color } : { borderColor: "#e2e8f0", color: "#94a3b8" }}
                >
                  <Filter className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Trust Bar + Stats */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 space-y-4">
        <TrustBar color={color} />
        <LiveStats color={color} />
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex gap-8">
          {/* Sidebar Filters (Desktop) */}
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

          {/* Products */}
          <div className="flex-1 min-w-0">
            {/* Mobile filters bar */}
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
              <div className={viewMode === "grid" ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5" : "space-y-4"}>
                {filtered.map((product, idx) =>
                  viewMode === "grid" ? (
                    <ProductCard key={product.id} product={product} idx={idx} color={color} />
                  ) : (
                    <motion.div
                      key={product.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="bg-white rounded-2xl border border-slate-100 p-4 flex gap-5 shadow-sm"
                    >
                      <img
                        src={product.image || ""}
                        alt={product.name}
                        className="w-24 h-24 rounded-xl object-cover"
                      />
                      <div className="flex-1">
                        <h3 className="font-bold text-slate-900">{product.name}</h3>
                        <p className="text-xs text-slate-400 mt-1">{product.description}</p>
                        <div className="flex items-center justify-between mt-3">
                          <span className="text-lg font-black text-slate-900">
                            {Number(product.price).toLocaleString("es-CO", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                          </span>
                          <button
                            onClick={() => useStoreCart().addToCart(product)}
                            style={{ backgroundColor: color }}
                            className="px-4 py-2 text-white rounded-xl text-sm font-bold hover:opacity-90"
                          >
                            Agregar
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )
                )}
              </div>
            ) : (
              <div className="text-center py-24 bg-white rounded-2xl border border-dashed border-slate-200">
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

      {/* CTA Footer - Brand colored */}
      <section className="py-16 mt-12" style={{ background: `linear-gradient(to right, ${config.primaryColor}, ${config.secondaryColor})` }}>
        <div className="max-w-7xl mx-auto px-4 text-center">
          <h2 className="text-3xl md:text-4xl font-black text-white mb-4">¿Listo para tu pedido?</h2>
          <p className="text-white/80 text-lg mb-8 max-w-lg mx-auto">
            Agrega productos al carrito y recíbelos donde quieras
          </p>
          <Link
            to={`/store/${slug}/carrito`}
            className="inline-flex items-center gap-2 bg-white px-8 py-4 rounded-full font-black hover:scale-105 transition-all shadow-2xl"
            style={{ color: config.primaryColor }}
          >
            <ShoppingBag className="w-5 h-5" /> IR AL CARRITO
          </Link>
        </div>
      </section>
    </div>
  );
}