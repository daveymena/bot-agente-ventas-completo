import { useState, useEffect, useMemo, useRef } from 'react';
import { useStore, Product } from '../store/useStore';
import { useMoneda } from '@/lib/moneda';
import { Search, ShoppingCart, Heart, Store, Package, Download, Box, ChevronLeft, ChevronRight } from 'lucide-react';
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

// El precio se muestra en la moneda del visitante (ver lib/moneda.ts):
// a un colombiano en pesos, a un extranjero en SU moneda con el dolar al lado.
const formatPrice = (price: number) => {
  return '$' + Math.round(price).toLocaleString('es-CO');
};

// Etiqueta visual por tipo de producto: digital se entrega al instante,
// físico requiere envío. Solo estos dos valores existen de verdad en el
// backend (products.kind, ver routes/products.ts) -- cualquier otro valor
// cae a "digital" ahí, así que este mapa hace lo mismo.
const TYPE_BADGE: Record<string, { label: string; icon: typeof Download; className: string }> = {
  digital: { label: 'Digital', icon: Download, className: 'bg-indigo-600' },
  physical: { label: 'Físico', icon: Box, className: 'bg-emerald-600' },
};

// Exportada porque la lista de deseos (Wishlist.tsx) muestra exactamente la
// misma tarjeta -- duplicarla ahí hacía que el botón "Comprar ahora" y el
// badge de tipo se fueran desincronizando entre las dos pantallas.
export const ProductCard = ({ product, slug }: { product: Product; slug: string }) => {
  // Precio en la moneda del visitante (ver lib/moneda.ts).
  const { formatear } = useMoneda();
  const { addToCart, wishlist, toggleWishlist } = useStore();
  const [imgError, setImgError] = useState(false);
  const [buying, setBuying] = useState(false);
  const detailHref = `/tienda/${slug}/producto/${product.id}`;
  const badge = TYPE_BADGE[product.type] || TYPE_BADGE.digital;
  const BadgeIcon = badge.icon;

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
      className="group relative bg-white rounded-2xl overflow-hidden flex flex-col transition-all duration-300 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_4px_8px_rgba(0,0,0,0.04),0_10px_20px_-4px_rgba(0,0,0,0.05)] hover:shadow-[0_2px_4px_rgba(0,0,0,0.06),0_10px_20px_rgba(0,0,0,0.08),0_24px_40px_-8px_rgba(0,0,0,0.12)] hover:-translate-y-1"
    >
      {/* Fondo tenue DERIVADO del color de marca (--store-primary-soft),
          no un gris fijo: es lo que le da aire al producto en el diseno de
          referencia, y cambia solo cuando el dueno cambia su color. */}
      <div className="relative aspect-square bg-[var(--store-primary-soft)] overflow-hidden">
        <Link to={detailHref} className="block w-full h-full" aria-label={`Ver ${product.name}`}>
          {product.image && !imgError ? (
            <img
              src={product.image || `/images/products/${product.id}.jpg`}
              alt={product.name}
              className="w-full h-full object-contain p-4 group-hover:scale-105 transition-transform duration-500"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                if (!target.src.includes(`/images/products/${product.id}.jpg`)) {
                  target.src = `/images/products/${product.id}.jpg`;
                } else {
                  setImgError(true);
                }
              }}
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-300">
              <Package className="w-12 h-12" />
            </div>
          )}
        </Link>
        <div className="absolute top-2 right-2 pointer-events-none">
          <span className={`px-2 py-1 rounded text-[10px] font-bold text-white flex items-center gap-1 ${badge.className}`}>
            <BadgeIcon className="w-3 h-3" /> {badge.label}
          </span>
        </div>
        <button
          onClick={() => toggleWishlist(product.id)}
          className="absolute top-2 left-2 w-8 h-8 rounded-full bg-white/90 backdrop-blur-sm border border-gray-200 shadow-sm flex items-center justify-center text-gray-400 hover:text-[var(--store-primary)] hover:bg-white transition-all"
        >
          <Heart className={`w-4 h-4 ${wishlist.includes(product.id) ? 'fill-[var(--store-primary)] text-[var(--store-primary)]' : ''}`} />
        </button>
      </div>

      <div className="p-3 flex flex-col gap-1.5 flex-1 text-center">
        <p className="text-[10px] font-bold text-[var(--store-primary)] uppercase tracking-wider">{product.category || 'General'}</p>
        <Link
          to={detailHref}
          className="text-sm font-bold leading-snug text-gray-900 line-clamp-2 min-h-[2.5em] hover:text-[var(--store-primary)] transition-colors"
        >
          {product.name}
        </Link>

        {/* Acá había un "★ 5.0 (128)" FIJO, idéntico en los 84 productos.
            Con cero ventas registradas esas 128 reseñas no existen: es prueba
            social fabricada. Además de que el mismo (128) repetido en todo el
            catálogo se nota a simple vista, en Colombia cae bajo el Estatuto
            del Consumidor y Meta puede rechazar anuncios que lleven a una
            landing así. Se muestra solo cuando hay reseñas de verdad; mientras
            no las haya, no se muestra nada -- un catálogo sin estrellas es más
            creíble que uno con estrellas clonadas. */}
        {/* No se muestra ninguna calificación: no existe sistema de reseñas,
            así que cualquier estrella sería inventada. Cuando haya reseñas
            reales, mostrar acá el promedio y el conteo VERDADEROS. */}

        <div className="mt-auto pt-2">
          <span className="text-lg font-black text-gray-900">{formatear(product.price)}</span>
          <div className="mt-2 flex gap-2">
            <button
              onClick={comprarAhora}
              disabled={buying}
              className="flex-1 h-9 rounded-full bg-[var(--store-primary)] text-[var(--store-on-primary)] text-xs font-bold flex items-center justify-center gap-1.5 hover:bg-[var(--store-primary-hover)] transition-all disabled:opacity-50"
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
              className="w-9 h-9 shrink-0 rounded-full border border-gray-200 text-gray-500 bg-white flex items-center justify-center hover:bg-gray-50 hover:text-[var(--store-primary)] transition-all"
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
  const { config, updateConfig, products: localProducts } = useStore();
  const { slug: paramSlug } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const DEFAULT_SLUG = 'sofia-premium';
  const slug = paramSlug || DEFAULT_SLUG;
  const searchQuery = searchParams.get('q') || '';
  const scrollerRef = useRef<HTMLDivElement>(null);

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
          socialLinks: data.store.socialLinks || {},
        });
        if (data.store.colors) {
          updateConfig({ primaryColor: data.store.colors.primary || '#dc2626' });
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
        type: (p.kind || 'digital') as Product['type'],
        stock: 999,
      }))
    : localProducts;

  // Qué vende REALMENTE esta tienda, para no prometer envíos que no existen
  // ni entrega digital de algo que se manda por correo (ver el hero abajo).
  const hayFisicos = products.some(p => p.type === 'physical');
  const hayDigitales = products.some(p => p.type !== 'physical');

  const [filter, setFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState(searchQuery || '');

  // La clave de categoría es "nombre + tipo", no solo el nombre: un curso
  // "Tecnología" (digital) y un gadget "Tecnología" (físico) son catálogos
  // distintos para el dueño de la tienda -- agruparlos bajo un solo botón
  // "Tecnología" los mezclaría en el mismo filtro aunque sean cosas muy
  // distintas (una se entrega por WhatsApp, la otra por transportadora).
  const categoryKey = (p: { category?: string; type?: string }) =>
    `${p.category || 'General'}__${p.type || 'digital'}`;

  const filteredProducts = products.filter(p => {
    const matchesFilter = filter === 'all' || categoryKey(p) === filter;
    const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.category && p.category.toLowerCase().includes(searchTerm.toLowerCase()));
    return matchesFilter && matchesSearch;
  });

  const categories = useMemo(() => {
    const counts: Record<string, { key: string; name: string; type: string; count: number }> = {};
    products.forEach(p => {
      const key = categoryKey(p);
      if (!counts[key]) counts[key] = { key, name: p.category || 'General', type: p.type || 'digital', count: 0 };
      counts[key].count++;
    });
    return Object.values(counts).sort((a, b) => b.count - a.count);
  }, [products]);

  // El backend solo reconoce "digital" | "physical" en products.kind (ver
  // routes/products.ts: row.kind === "physical" ? "physical" : "digital") --
  // cualquier otro valor cae a "digital" ahí, así que se replica el mismo
  // fallback acá para que el label nunca contradiga lo que el backend hace.
  const typeLabel = (type: string) => type === 'physical' ? 'Físico' : 'Digital';

  const [visibleCount, setVisibleCount] = useState(12);

  useEffect(() => { setVisibleCount(12); }, [filter, searchTerm]);

  const displayedProducts = filteredProducts.slice(0, visibleCount);

  const scrollCategories = (dir: 'left' | 'right') => {
    scrollerRef.current?.scrollBy({ left: dir === 'left' ? -240 : 240, behavior: 'smooth' });
  };

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-8 pb-24 md:pb-8">
      {/* HERO BANNER */}
      <div
        className="rounded-2xl text-white p-6 sm:p-10 mb-6 relative overflow-hidden bg-zinc-900 bg-cover bg-center"
        style={config.heroImage ? { backgroundImage: `url(${config.heroImage})` } : undefined}
      >
        {/* Overlay oscuro para que el texto quede legible sobre la foto */}
        <div className="absolute inset-0 bg-gradient-to-r from-black via-black/80 to-black/20" />
        <div className="relative z-10 max-w-lg">
          <p className="text-[var(--store-primary)] text-xs font-bold uppercase tracking-widest mb-2">Nueva colección</p>
          <h1 className="text-2xl sm:text-4xl font-black mb-2 leading-tight">Encuentra lo que buscas</h1>
          {/* El hero prometía "Envío a todo el país" y "productos físicos y
              digitales" SIEMPRE, aunque el catálogo fuera 100% digital (en
              esta tienda: 84 de 84). Prometer un envío que no existe genera
              reclamos y disputas de pago. No se reemplaza por un texto
              digital fijo porque otra tienda sí puede vender físico: se dice
              lo que el catálogo REALMENTE tiene. */}
          <p className="text-sm text-gray-300 mb-4">
            {hayFisicos && hayDigitales
              ? "Productos físicos y digitales en un solo lugar"
              : hayFisicos
                ? "Productos seleccionados, con envío a tu puerta"
                : "Acceso inmediato, sin esperas ni envíos"}
          </p>
          <div className="flex flex-wrap gap-2">
            {hayFisicos && (
              <span className="bg-[var(--store-primary)] text-[var(--store-on-primary)] px-3 py-1.5 rounded-lg text-xs font-bold">🚚 Envío a todo el país</span>
            )}
            {hayDigitales && (
              <span className="bg-white/10 text-white px-3 py-1.5 rounded-lg text-xs font-bold backdrop-blur-sm">⚡ Entrega digital inmediata</span>
            )}
          </div>
        </div>
      </div>

      {/* SEARCH BAR */}
      <div className="relative mb-6">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          type="text"
          placeholder="Buscar productos..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="w-full h-12 pl-12 pr-4 rounded-xl border border-gray-200 bg-white text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[var(--store-primary)]/30 focus:border-[var(--store-primary)] transition-all shadow-sm"
        />
      </div>

      {/* CATEGORIES CAROUSEL */}
      {categories.length > 0 && (
        <div className="mb-8 relative">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-bold text-gray-900">Categorías</h3>
            <div className="hidden sm:flex gap-1">
              <button onClick={() => scrollCategories('left')} className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center hover:bg-gray-50 text-gray-500">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button onClick={() => scrollCategories('right')} className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center hover:bg-gray-50 text-gray-500">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div ref={scrollerRef} className="flex gap-2 overflow-x-auto pb-2 scroll-smooth [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <button
              onClick={() => setFilter('all')}
              className={`flex-shrink-0 px-4 py-2 rounded-lg font-semibold whitespace-nowrap text-sm transition-colors ${
                filter === 'all' ? 'bg-[var(--store-primary)] text-[var(--store-on-primary)]' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Todos ({products.length})
            </button>
            {categories.map((c) => (
              <button
                key={c.key}
                onClick={() => setFilter(c.key)}
                className={`flex-shrink-0 px-4 py-2 rounded-lg font-semibold whitespace-nowrap text-sm transition-colors ${
                  filter === c.key ? 'bg-[var(--store-primary)] text-[var(--store-on-primary)]' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {c.name} <span className="opacity-70 font-normal">· {typeLabel(c.type)}</span> ({c.count})
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mb-4">
        <p className="text-xs text-gray-500">
          Mostrando <strong className="text-gray-900">{displayedProducts.length}</strong> de <strong className="text-gray-900">{filteredProducts.length}</strong> producto(s)
        </p>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-6">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 overflow-hidden animate-pulse">
              <div className="aspect-square bg-gray-100" />
              <div className="p-3 space-y-2">
                <div className="h-2.5 bg-gray-100 rounded w-1/3" />
                <div className="h-3 bg-gray-100 rounded w-2/3" />
                <div className="h-4 bg-gray-100 rounded w-1/2 mt-3" />
                <div className="h-9 bg-gray-100 rounded mt-2" />
              </div>
            </div>
          ))}
        </div>
      ) : apiError && products.length === 0 ? (
        <div className="text-center py-24 bg-white rounded-2xl px-6 border border-dashed border-gray-200">
          <div className="w-20 h-20 bg-[var(--store-primary)]/10 rounded-full flex items-center justify-center mx-auto mb-6">
            <Store className="w-10 h-10 text-[var(--store-primary)]" />
          </div>
          <h3 className="text-xl font-bold text-gray-900 mb-2">No hay productos disponibles</h3>
          <p className="text-sm text-gray-500 mb-6 max-w-md mx-auto">Esta tienda aún no tiene productos publicados.</p>
        </div>
      ) : apiError && !paramSlug ? (
        <div className="text-center py-24 bg-white rounded-2xl px-6 border border-dashed border-gray-200">
          <div className="w-20 h-20 bg-[var(--store-primary)]/10 rounded-full flex items-center justify-center mx-auto mb-6">
            <Store className="w-10 h-10 text-[var(--store-primary)]" />
          </div>
          <h3 className="text-xl font-bold text-gray-900 mb-2">Tienda no configurada</h3>
          <p className="text-sm text-gray-500 mb-8 max-w-md mx-auto">Visita tu tienda desde el slug correcto.</p>
          <button
            onClick={() => navigate('/admin')}
            className="inline-flex items-center gap-2 h-11 px-8 rounded-xl bg-[var(--store-primary)] text-[var(--store-on-primary)] text-sm font-bold hover:bg-[var(--store-primary-hover)] transition-all"
          >
            Ir al panel de control
          </button>
        </div>
      ) : filteredProducts.length > 0 ? (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-6">
            {displayedProducts.map((product) => (
              <ProductCard key={product.id} product={product} slug={slug} />
            ))}
          </div>
          {filteredProducts.length > visibleCount && (
            <div className="flex justify-center mt-10">
              <button
                onClick={() => setVisibleCount(prev => prev + 12)}
                className="inline-flex items-center gap-2 h-12 px-8 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50 hover:border-[var(--store-primary)]/50 hover:text-[var(--store-primary)] transition-all"
              >
                Cargar más productos ({filteredProducts.length - visibleCount} restantes)
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="text-center py-24 bg-white rounded-2xl px-6 border border-dashed border-gray-200">
          <div className="w-20 h-20 bg-[var(--store-primary)]/10 rounded-full flex items-center justify-center mx-auto mb-6">
            <Search className="w-10 h-10 text-[var(--store-primary)]" />
          </div>
          <h3 className="text-xl font-bold text-gray-900 mb-2">No se encontraron productos</h3>
          <p className="text-sm text-gray-500">Prueba con otros filtros o términos de búsqueda.</p>
        </div>
      )}
    </div>
  );
};

export default Shop;
