import { useState, useEffect, useMemo } from 'react';
import { useStore, Product } from '../store/useStore';
import { Search, Star, ShoppingCart, Heart, SlidersHorizontal, ChevronDown, X, Store, Package, Layers } from 'lucide-react';
import { motion } from 'framer-motion';
import Swal from 'sweetalert2';
import { trackAddToCart, trackInitiateCheckout } from '../lib/pixel';
import { useParams, useSearchParams, useNavigate, Link } from 'react-router-dom';

interface ApiProduct {
  id: number;
  name: string;
  description: string;
  price: string;
  image: string | null;
  category: string;
  kind: string;
}

const formatPrice = (price: number) => {
  return '$' + Math.round(price).toLocaleString('es-CO');
};

const ProductCard = ({ product, slug }: { product: Product; slug: string }) => {
  const { addToCart, wishlist, toggleWishlist } = useStore();
  const [imgError, setImgError] = useState(false);
  const [buying, setBuying] = useState(false);
  const detailHref = `/tienda/${slug}/producto/${product.id}`;

  // "Comprar" va DIRECTO a la pasarela: antes decía Comprar pero solo metía el
  // producto al carrito, así que el cliente creía haber comprado y se quedaba
  // en la misma página. Para acumular varios productos está "Agregar".
  const comprarAhora = async () => {
    setBuying(true);
    trackInitiateCheckout({ ids: [product.id], value: product.price });
    try {
      const res = await fetch(`/api/public/checkout/${slug}/${product.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method: 'mercadopago' }),
      });
      const data = await res.json();
      if (!res.ok || !data.checkoutUrl) {
        throw new Error(data?.message || 'No se pudo generar el enlace de pago');
      }
      window.location.href = data.checkoutUrl;
    } catch (err) {
      setBuying(false);
      Swal.fire({
        title: 'No pudimos abrir el pago',
        text: err instanceof Error ? err.message : 'Intenta de nuevo.',
        icon: 'error',
      });
    }
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="group relative glass-panel rounded-2xl overflow-hidden hover:border-indigo-500/30 transition-all duration-300 flex flex-col hover:-translate-y-1 hover:shadow-[0_20px_40px_-15px_rgba(79,70,229,0.15)] bg-white"
    >
      <div className="relative aspect-square bg-slate-50 overflow-hidden">
        <Link to={detailHref} className="block w-full h-full" aria-label={`Ver ${product.name}`}>
          {product.image && !imgError ? (
            <img
              src={product.image}
              alt={product.name}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 opacity-90 group-hover:opacity-100"
              onError={() => setImgError(true)}
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-slate-300 bg-slate-50">
              <Package className="w-12 h-12" />
            </div>
          )}
        </Link>
        <div className="absolute top-3 left-3 pointer-events-none">
          <span className="px-2.5 py-1 rounded-md text-[10px] font-bold text-white bg-indigo-500 shadow-glow backdrop-blur-md">
            DIGITAL
          </span>
        </div>
        <button
          onClick={() => toggleWishlist(product.id)}
          className="absolute top-3 right-3 w-9 h-9 rounded-full bg-white/80 backdrop-blur-md border border-gray-200 shadow-sm flex items-center justify-center text-gray-400 hover:text-rose-500 hover:bg-white transition-all opacity-0 group-hover:opacity-100 translate-y-2 group-hover:translate-y-0"
        >
          <Heart className={`w-4 h-4 ${wishlist.includes(product.id) ? 'fill-rose-500 text-rose-500' : ''}`} />
        </button>
        {/* Subtle gradient overlay at the bottom of the image */}
        <div className="absolute bottom-0 left-0 right-0 h-1/3 bg-gradient-to-t from-black/5 to-transparent pointer-events-none" />
      </div>

      <div className="p-4 flex flex-col gap-2 flex-1 relative z-10 bg-white">
        <p className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest">{product.category || 'General'}</p>
        <Link
          to={detailHref}
          className="text-base font-heading font-semibold leading-snug text-slate-800 line-clamp-2 min-h-[2.5em] hover:text-indigo-600 transition-colors"
        >
          {product.name}
        </Link>
        
        <div className="flex items-center gap-1.5 mt-1">
          <div className="flex -space-x-1">
            {[1,2,3,4,5].map(i => <Star key={i} className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />)}
          </div>
          <span className="text-xs font-bold text-slate-700 ml-1">5.0</span>
          <span className="text-xs text-slate-500">(128)</span>
        </div>

        <div className="mt-auto pt-4">
          <div className="flex items-baseline gap-2">
            <span className="text-xl font-heading font-bold text-slate-900">{formatPrice(product.price)}</span>
          </div>
          <div className="mt-4 flex gap-2">
            <button
              onClick={comprarAhora}
              disabled={buying}
              className="flex-1 h-10 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 text-white text-xs font-bold flex items-center justify-center gap-1.5 hover:from-indigo-400 hover:to-purple-500 transition-all disabled:opacity-50 shadow-glow"
            >
              {buying ? 'Abriendo…' : 'Comprar ahora'}
            </button>
            <button
              onClick={() => {
                addToCart(product);
                trackAddToCart({ id: product.id, name: product.name, price: product.price });
                Swal.fire({
                  title: '¡Agregado!',
                  text: `${product.name} al carrito`,
                  icon: 'success',
                  toast: true,
                  position: 'top-end',
                  showConfirmButton: false,
                  timer: 1500,
                  background: '#18181b',
                  color: '#fff',
                });
              }}
              title="Agregar al carrito"
              aria-label="Agregar al carrito"
              className="w-10 h-10 shrink-0 rounded-xl border border-gray-200 text-slate-500 bg-white flex items-center justify-center hover:bg-slate-50 hover:text-indigo-600 transition-all shadow-sm"
            >
              <ShoppingCart className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

const Shop = () => {
  const { addToCart, wishlist, toggleWishlist, updateConfig, products: localProducts } = useStore();
  const { slug: paramSlug } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
const DEFAULT_SLUG = 'sofia-premium';
  const slug = paramSlug || DEFAULT_SLUG;
  const searchQuery = searchParams.get('q') || '';

  const [apiProducts, setApiProducts] = useState<ApiProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState(false);

  useEffect(() => {
    setLoading(true);
    setApiError(false);
    fetch(`/api/public/products/${slug}`)
      .then(r => { if (!r.ok) throw new Error('No encontrada'); return r.json(); })
      .then(data => {
        setApiProducts(data.products);
        updateConfig({
          storeName: data.store.name,
          logoUrl: data.store.logo || '',
          whatsappPhone: data.store.whatsappPhone || '',
        });
        if (data.store.colors) {
          updateConfig({ primaryColor: data.store.colors.primary || '#4f46e5' });
        }
      })
      .catch(() => { setApiProducts([]); setApiError(true); })
      .finally(() => setLoading(false));
  }, [slug]);

  const products = apiProducts.length > 0
    ? apiProducts.map(p => ({
        id: p.id.toString(),
        name: p.name,
        description: p.description,
        price: Number(p.price),
        image: p.image ?? '',
        category: p.category,
        type: p.kind as Product['type'],
        stock: 999,
      }))
    : localProducts;

  const [filter, setFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState(searchQuery || '');
  const [showFilters, setShowFilters] = useState(false);

  const filteredProducts = products.filter(p => {
    const matchesFilter = filter === 'all' || p.category?.toLowerCase() === filter.toLowerCase();
    const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.category && p.category.toLowerCase().includes(searchTerm.toLowerCase()));
    return matchesFilter && matchesSearch;
  });

  const categories = useMemo(() => {
    const counts: Record<string, number> = {};
    products.forEach(p => {
      const cat = p.category || 'General';
      counts[cat] = (counts[cat] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [products]);

  const [visibleCount, setVisibleCount] = useState(12);

  useEffect(() => { setVisibleCount(12); }, [filter, searchTerm]);

  const displayedProducts = filteredProducts.slice(0, visibleCount);

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-6 sm:py-10 relative z-10">
      {showFilters && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-40 md:hidden" onClick={() => setShowFilters(false)} />
      )}

      <div className="flex gap-8 items-start">
        <aside
          className={`
            ${showFilters ? 'fixed inset-y-0 left-0 z-50 w-72 glass-panel p-5 overflow-y-auto' : 'hidden'}
            md:block md:relative md:inset-auto md:z-auto md:bg-transparent md:border-none md:shadow-none md:backdrop-blur-none md:p-0
            flex-shrink-0 w-64
          `}
        >
          <div className="flex items-center justify-between mb-6 md:hidden">
            <h2 className="text-sm font-heading font-bold text-slate-900">Filtros</h2>
            <button onClick={() => setShowFilters(false)} className="p-1.5 text-slate-500 hover:text-indigo-600 bg-white rounded-lg border border-gray-200 shadow-sm">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="glass-panel rounded-2xl p-5 mb-6">
            <h3 className="text-xs font-bold uppercase tracking-widest text-indigo-600 mb-4">Categorías</h3>
            <div className="space-y-1">
              <button
                onClick={() => setFilter('all')}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm transition-all ${
                  filter === 'all' ? 'bg-indigo-500/20 text-indigo-300 font-semibold border border-indigo-500/30' : 'text-gray-400 hover:text-white hover:bg-white/5 border border-transparent'
                }`}
              >
                <span className="flex items-center gap-2.5">
                  <Layers className="w-4 h-4" />
                  Todos
                </span>
                <span className="text-xs text-gray-500 font-mono">{products.length}</span>
              </button>
              {categories.map((c, i) => (
                <button
                  key={i}
                  onClick={() => setFilter(c.name)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm transition-all ${
                    filter === c.name ? 'bg-indigo-500/20 text-indigo-300 font-semibold border border-indigo-500/30' : 'text-gray-400 hover:text-white hover:bg-white/5 border border-transparent'
                  }`}
                >
                  <span>{c.name}</span>
                  <span className="text-xs text-gray-500 font-mono">{c.count}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="bg-gradient-to-br from-indigo-500/20 to-purple-600/20 border border-indigo-500/30 text-white rounded-2xl p-6 relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/20 rounded-full blur-2xl -mr-10 -mt-10 pointer-events-none group-hover:bg-indigo-400/30 transition-colors" />
            <p className="text-sm font-heading font-bold flex items-center gap-2">
              <span className="animate-pulse">🚀</span> Acceso inmediato
            </p>
            <p className="text-xs text-gray-400 mt-2 leading-relaxed relative z-10">Todos los productos son digitales. Recibes el enlace al instante tras el pago.</p>
          </div>
        </aside>

        <div className="flex-1 min-w-0">
          <div className="glass-panel rounded-2xl px-5 py-4 flex flex-wrap items-center justify-between gap-4 mb-6">
            <div className="flex items-center gap-4">
              <button
                onClick={() => setShowFilters(true)}
                className="md:hidden flex items-center gap-2 h-9 px-4 border border-white/10 rounded-xl text-xs font-semibold text-gray-300 bg-white/5 hover:bg-white/10 hover:text-white transition-all"
              >
                <SlidersHorizontal className="w-4 h-4" /> Filtros
              </button>
              <p className="text-xs text-gray-400">
                Mostrando <strong className="text-white">{displayedProducts.length}</strong> de <strong className="text-white">{filteredProducts.length}</strong> producto(s)
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="relative group">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-focus-within:text-indigo-400 transition-colors" />
                <input
                  type="text"
                  placeholder="Buscar productos..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="w-48 sm:w-64 h-10 pl-10 pr-4 rounded-xl border border-white/10 bg-[#09090b]/50 text-xs text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all shadow-inner"
                />
              </div>
            </div>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="glass-panel rounded-2xl overflow-hidden animate-pulse">
                  <div className="aspect-square bg-white/5" />
                  <div className="p-4 space-y-3">
                    <div className="h-3 bg-gray-100 rounded w-1/3" />
                    <div className="h-3 bg-white/10 rounded w-1/3" />
                    <div className="h-4 bg-white/10 rounded w-2/3" />
                    <div className="h-3 bg-white/10 rounded w-1/4" />
                    <div className="h-5 bg-white/10 rounded w-1/2 mt-4" />
                    <div className="h-10 bg-white/10 rounded mt-2" />
                  </div>
                </div>
              ))}
            </div>
          ) : apiError && products.length === 0 ? (
            <div className="text-center py-24 glass-panel rounded-2xl px-6 border-dashed border-white/10">
              <div className="w-20 h-20 bg-indigo-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
                <Store className="w-10 h-10 text-indigo-400" />
              </div>
              <h3 className="text-xl font-heading font-bold text-white mb-2">No hay productos disponibles</h3>
              <p className="text-sm text-gray-400 mb-6 max-w-md mx-auto">Esta tienda aún no tiene productos publicados.</p>
            </div>
          ) : apiError && !paramSlug ? (
            <div className="text-center py-24 glass-panel rounded-2xl px-6 border-dashed border-white/10">
              <div className="w-20 h-20 bg-rose-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
                <Store className="w-10 h-10 text-rose-400" />
              </div>
              <h3 className="text-xl font-heading font-bold text-white mb-2">Tienda no configurada</h3>
              <p className="text-sm text-gray-400 mb-8 max-w-md mx-auto">Visita tu tienda desde el slug correcto.</p>
              <button
                onClick={() => navigate('/admin')}
                className="inline-flex items-center gap-2 h-11 px-8 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 text-white text-sm font-bold hover:from-indigo-400 hover:to-purple-500 transition-all shadow-glow"
              >
                Ir al panel de control
              </button>
            </div>
          ) : filteredProducts.length > 0 ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
                {displayedProducts.map((product) => (
                  <ProductCard key={product.id} product={product} slug={slug} />
                ))}
              </div>
              {filteredProducts.length > visibleCount && (
                <div className="flex justify-center mt-10">
                  <button
                    onClick={() => setVisibleCount(prev => prev + 12)}
                    className="inline-flex items-center gap-2 h-12 px-8 rounded-xl border border-white/10 bg-white/5 text-sm font-semibold text-white hover:bg-white/10 hover:border-white/20 transition-all"
                  >
                    Cargar más productos ({filteredProducts.length - visibleCount} restantes) <ChevronDown className="w-4 h-4" />
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-24 glass-panel rounded-2xl px-6 border-dashed border-white/10">
              <div className="w-20 h-20 bg-indigo-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
                <Search className="w-10 h-10 text-indigo-400" />
              </div>
              <h3 className="text-xl font-heading font-bold text-white mb-2">No se encontraron productos</h3>
              <p className="text-sm text-gray-400">Prueba con otros filtros o términos de búsqueda.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Shop;
