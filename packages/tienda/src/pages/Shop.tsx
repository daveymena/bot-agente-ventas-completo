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
      className="group relative bg-white border border-gray-200 rounded-lg overflow-hidden hover:shadow-md hover:border-gray-300 transition-all flex flex-col"
    >
      <div className="relative aspect-square bg-gray-50 overflow-hidden">
        <Link to={detailHref} className="block w-full h-full" aria-label={`Ver ${product.name}`}>
          {product.image && !imgError ? (
            <img
              src={product.image}
              alt={product.name}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              onError={() => setImgError(true)}
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-300">
              <Package className="w-12 h-12" />
            </div>
          )}
        </Link>
        <div className="absolute top-2 left-2 pointer-events-none">
          <span className="px-2 py-0.5 rounded text-[10px] font-bold text-white bg-indigo-600 shadow-sm">
            Digital
          </span>
        </div>
        <button
          onClick={() => toggleWishlist(product.id)}
          className="absolute top-2 right-2 w-8 h-8 rounded-full bg-white/90 shadow-sm flex items-center justify-center text-gray-400 hover:text-rose-500 transition-colors opacity-0 group-hover:opacity-100"
        >
          <Heart className={`w-4 h-4 ${wishlist.includes(product.id) ? 'fill-rose-500 text-rose-500' : ''}`} />
        </button>
      </div>
      <div className="p-3 flex flex-col gap-1.5 flex-1">
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{product.category || 'General'}</p>
        <Link
          to={detailHref}
          className="text-sm font-semibold leading-snug text-gray-900 line-clamp-2 min-h-[2.5em] hover:text-indigo-600 transition-colors"
        >
          {product.name}
        </Link>
        <div className="flex items-center gap-1">
          <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
          <span className="text-xs font-bold text-gray-700">4.9</span>
          <span className="text-xs text-gray-400">(128)</span>
        </div>
        <div className="mt-auto pt-1.5">
          <div className="flex items-baseline gap-1.5">
            <span className="text-lg font-black text-gray-900">{formatPrice(product.price)}</span>
          </div>
          <div className="mt-2 flex gap-1.5">
            <button
              onClick={comprarAhora}
              disabled={buying}
              className="flex-1 h-9 rounded-lg bg-gray-900 text-white text-xs font-bold flex items-center justify-center gap-1.5 hover:bg-gray-800 transition-colors disabled:opacity-50"
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
                });
              }}
              title="Agregar al carrito"
              aria-label="Agregar al carrito"
              className="w-9 h-9 shrink-0 rounded-lg border border-gray-300 text-gray-700 flex items-center justify-center hover:bg-gray-50 transition-colors"
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
    <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-8">
      {showFilters && (
        <div className="fixed inset-0 bg-black/40 z-40 md:hidden" onClick={() => setShowFilters(false)} />
      )}

      <div className="flex gap-8 items-start">
        <aside
          className={`
            ${showFilters ? 'fixed inset-y-0 left-0 z-50 w-72 bg-white shadow-xl p-5 overflow-y-auto' : 'hidden'}
            md:block md:relative md:inset-auto md:z-auto md:bg-transparent md:shadow-none md:p-0
            flex-shrink-0 w-64
          `}
        >
          <div className="flex items-center justify-between mb-4 md:hidden">
            <h2 className="text-sm font-bold text-gray-900">Filtros</h2>
            <button onClick={() => setShowFilters(false)} className="p-1 text-gray-400 hover:text-gray-600">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-4 mb-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-900 mb-3">Categorías</h3>
            <div className="space-y-0.5">
              <button
                onClick={() => setFilter('all')}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-sm transition-colors ${
                  filter === 'all' ? 'bg-indigo-50 text-indigo-700 font-semibold' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                <span className="flex items-center gap-2">
                  <Layers className="w-4 h-4" />
                  Todos los productos
                </span>
                <span className="text-xs text-gray-400 font-mono">{products.length}</span>
              </button>
              {categories.map((c, i) => (
                <button
                  key={i}
                  onClick={() => setFilter(c.name)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-sm transition-colors ${
                    filter === c.name ? 'bg-indigo-50 text-indigo-700 font-semibold' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                  }`}
                >
                  <span>{c.name}</span>
                  <span className="text-xs text-gray-400 font-mono">{c.count}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="bg-gradient-to-br from-gray-900 to-gray-800 text-white rounded-lg p-5">
            <p className="text-sm font-bold">🚀 Acceso inmediato</p>
            <p className="text-xs text-gray-400 mt-1 leading-relaxed">Todos los productos son digitales. Recibes el enlace de descarga al instante después del pago.</p>
          </div>
        </aside>

        <div className="flex-1 min-w-0">
          <div className="bg-white border border-gray-200 rounded-lg px-4 py-3 flex flex-wrap items-center justify-between gap-3 mb-5">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowFilters(true)}
                className="md:hidden flex items-center gap-1.5 h-8 px-3 border border-gray-300 rounded-md text-xs font-semibold text-gray-600 hover:bg-gray-50"
              >
                <SlidersHorizontal className="w-3.5 h-3.5" /> Filtros
              </button>
              <p className="text-xs text-gray-500">
                Mostrando <strong className="text-gray-800">{displayedProducts.length}</strong> de <strong className="text-gray-800">{filteredProducts.length}</strong> producto(s)
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Buscar productos..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="w-40 sm:w-52 h-9 pl-9 pr-3 rounded-md border border-gray-300 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>
              <div className="hidden sm:flex items-center gap-2 text-xs text-gray-400">
                <span className="flex items-center gap-1.5 h-9 px-3 border border-gray-300 rounded-md text-gray-600 font-medium cursor-default">
                  Ordenar <ChevronDown className="w-3 h-3 text-gray-400" />
                </span>
              </div>
            </div>
          </div>

          {loading ? (
            <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="bg-white border border-gray-200 rounded-lg overflow-hidden animate-pulse">
                  <div className="aspect-square bg-gray-100" />
                  <div className="p-3 space-y-2">
                    <div className="h-3 bg-gray-100 rounded w-1/3" />
                    <div className="h-4 bg-gray-100 rounded w-2/3" />
                    <div className="h-3 bg-gray-100 rounded w-1/4" />
                    <div className="h-5 bg-gray-100 rounded w-1/2" />
                    <div className="h-8 bg-gray-100 rounded" />
                  </div>
                </div>
              ))}
            </div>
          ) : apiError && products.length === 0 ? (
            <div className="text-center py-20 bg-white rounded-lg border border-dashed border-gray-300 px-4">
              <Store className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-bold text-gray-900 mb-1">No hay productos disponibles</h3>
              <p className="text-sm text-gray-500 mb-6 max-w-md mx-auto">Esta tienda aún no tiene productos publicados.</p>
            </div>
          ) : apiError && !paramSlug ? (
            <div className="text-center py-20 bg-white rounded-lg border border-dashed border-gray-300 px-4">
              <Store className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-bold text-gray-900 mb-1">Tienda no configurada</h3>
              <p className="text-sm text-gray-500 mb-6 max-w-md mx-auto">Visita tu tienda desde el slug correcto.</p>
              <button
                onClick={() => navigate('/admin')}
                className="inline-flex items-center gap-2 h-10 px-6 rounded-lg bg-gray-900 text-white text-sm font-bold hover:bg-gray-800 transition-colors"
              >
                Ir al panel
              </button>
            </div>
          ) : filteredProducts.length > 0 ? (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
                {displayedProducts.map((product) => (
                  <ProductCard key={product.id} product={product} slug={slug} />
                ))}
              </div>
              {filteredProducts.length > visibleCount && (
                <div className="flex justify-center mt-8">
                  <button
                    onClick={() => setVisibleCount(prev => prev + 12)}
                    className="inline-flex items-center gap-2 h-11 px-8 rounded-lg border border-gray-300 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    Cargar más productos ({filteredProducts.length - visibleCount} restantes) <ChevronDown className="w-4 h-4" />
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-20 bg-white rounded-lg border border-dashed border-gray-300 px-4">
              <Search className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <h3 className="text-base font-bold text-gray-900 mb-1">No se encontraron productos</h3>
              <p className="text-sm text-gray-500">Prueba con otros filtros o términos de búsqueda.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Shop;
