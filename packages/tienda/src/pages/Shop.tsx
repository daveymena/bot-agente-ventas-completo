import { useState, useEffect, useMemo } from 'react';
import { useStore, Product } from '../store/useStore';
import { Search, Star, ShoppingCart, Heart, Eye, Repeat2, ChevronDown, SlidersHorizontal, ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';
import Swal from 'sweetalert2';
import { useParams, useSearchParams } from 'react-router-dom';

interface ApiProduct {
  id: number;
  name: string;
  description: string;
  price: string;
  image: string | null;
  category: string;
  kind: string;
}

const ProductCard = ({ product }: { product: Product }) => {
  const { addToCart, wishlist, toggleWishlist } = useStore();
  const [imgError, setImgError] = useState(false);
  const discount = product.type === 'digital' ? '-50%' : product.type === 'physical' ? '-40%' : '-35%';
  const flagBg = product.type === 'digital' ? '#4f46e5' : product.type === 'physical' ? '#0f766e' : '#b45309';
  const flag = product.type === 'digital' ? 'Digital' : product.type === 'physical' ? 'Oferta' : 'Combo';
  const note = product.type === 'digital' ? 'Acceso inmediato y de por vida' : 'Envío en 24 h · Contra entrega';
  const noteFg = product.type === 'digital' ? '#15803d' : '#4f46e5';

  return (
    <motion.div
      layout
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="group relative bg-white border border-gray-100 rounded-xl overflow-hidden hover:shadow-lg hover:border-gray-200 transition-all flex flex-col"
    >
      <div className="relative aspect-square bg-white overflow-hidden flex items-center justify-center border-b border-gray-50">
        {product.image && !imgError ? (
          <img
            src={product.image}
            alt={product.name}
            className="w-full h-full object-contain p-4 group-hover:scale-105 transition-transform duration-500"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-indigo-50 to-indigo-100 flex flex-col items-center justify-center text-indigo-300">
            <span className="text-3xl mb-1">{product.type === 'digital' ? '📄' : '📦'}</span>
            <span className="text-[10px] font-semibold">{product.category || 'Producto'}</span>
          </div>
        )}
        <div className="absolute top-2.5 left-2.5 flex flex-col gap-1.5 items-start">
          <span className="px-2 py-0.5 rounded text-[9px] font-extrabold uppercase tracking-wide text-white" style={{ background: flagBg }}>{flag}</span>
          <span className="px-2 py-0.5 rounded text-[9px] font-extrabold text-white bg-rose-700">{discount}</span>
        </div>
        <div className="absolute top-2.5 right-2.5 flex flex-col gap-1.5">
          <button className="w-7 h-7 rounded-full bg-white shadow flex items-center justify-center text-slate-400 hover:text-rose-500 transition-colors">
            <Heart className={`w-3.5 h-3.5 ${wishlist.includes(product.id) ? 'fill-rose-500 text-rose-500' : ''}`}
              onClick={() => toggleWishlist(product.id)} />
          </button>
          <button className="w-7 h-7 rounded-full bg-white shadow flex items-center justify-center text-slate-400 hover:text-indigo-600 transition-colors">
            <Eye className="w-3.5 h-3.5" />
          </button>
          <button className="w-7 h-7 rounded-full bg-white shadow flex items-center justify-center text-slate-400 hover:text-indigo-600 transition-colors">
            <Repeat2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      <div className="p-3.5 flex flex-col gap-1.5 flex-1">
        <p className="text-[10px] font-bold text-slate-300 uppercase tracking-wider">{product.category}</p>
        <h3 className="text-sm font-semibold leading-snug text-slate-900 line-clamp-2">{product.name}</h3>
        <div className="flex items-center gap-1">
          <Star className="w-2.5 h-2.5 fill-amber-400 text-amber-400" />
          <span className="text-[11px] font-bold text-slate-600">4.9</span>
          <span className="text-[11px] text-slate-300">(128)</span>
        </div>
        <div className="mt-auto pt-2">
          <div className="flex items-baseline gap-2">
            <span className="text-xs text-slate-300 line-through font-semibold">${(product.price * 1.5).toFixed(0)}</span>
            <span className="text-lg font-extrabold tracking-tight text-slate-900">${product.price}</span>
          </div>
          <p className="text-[10px] font-bold mt-1 flex items-center gap-1" style={{ color: noteFg }}>{note}</p>
          <button
            onClick={() => {
              addToCart(product);
              Swal.fire({ title: '¡Agregado!', text: `${product.name} al carrito`, icon: 'success', toast: true, position: 'top-end', showConfirmButton: false, timer: 1500 });
            }}
            className="mt-2.5 w-full h-9 rounded-lg bg-indigo-600 text-white text-xs font-bold flex items-center justify-center gap-1.5 hover:bg-indigo-700 transition-colors"
          >
            <ShoppingCart className="w-3.5 h-3.5" />
            {product.type === 'digital' ? 'Comprar ahora' : 'Añadir al carrito'}
          </button>
        </div>
      </div>
    </motion.div>
  );
};

const Shop = () => {
  const { addToCart, wishlist, toggleWishlist, updateConfig, products: localProducts } = useStore();
  const { slug: paramSlug } = useParams();
  const [searchParams] = useSearchParams();
  const slug = paramSlug || 'demo';
  const searchQuery = searchParams.get('q') || '';

  const [apiProducts, setApiProducts] = useState<ApiProduct[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!paramSlug) { setLoading(false); return; }
    fetch(`/api/public/products/${slug}`)
      .then(r => { if (!r.ok) throw new Error('No encontrada'); return r.json(); })
      .then(data => {
        setApiProducts(data.products);
        updateConfig({
          storeName: data.store.name,
          logoUrl: data.store.logo || '',
          whatsappPhone: data.store.whatsappPhone || '573208270414',
        });
        if (data.store.colors) {
          updateConfig({ primaryColor: data.store.colors.primary || '#4f46e5' });
        }
      })
      .catch(() => setApiProducts([]))
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
    const matchesFilter = filter === 'all' || p.type === filter;
    const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const categories = useMemo(() => {
    const counts: Record<string, number> = {};
    products.forEach(p => {
      const cat = p.category || 'General';
      counts[cat] = (counts[cat] || 0) + 1;
    });
    return Object.entries(counts).map(([name, count], i) => ({
      name,
      count,
      fg: i === 0 ? '#4f46e5' : '#0f172a',
    }));
  }, [products]);

  return (
    <div className="max-w-7xl mx-auto px-2 sm:px-4 py-4 sm:py-7 flex gap-7 items-start flex-wrap">
      {showFilters && <div className="fixed inset-0 bg-black/30 z-40 md:hidden" onClick={() => setShowFilters(false)} />}
      <aside className={`${showFilters ? 'fixed inset-0 z-50 md:relative md:inset-auto bg-white md:bg-transparent p-4 md:p-0 overflow-y-auto' : 'hidden'} md:block flex-1 min-w-[230px] max-w-[260px] flex flex-col gap-4`}>
        <div className="bg-white border border-gray-100 rounded-xl p-4.5">
          <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-900 mb-3.5">Filtrar por categoría</h3>
          <div className="flex flex-col gap-0.5">
            {categories.map((c, i) => (
              <div key={i} className="flex items-center justify-between gap-2 py-2 border-b border-slate-50 last:border-0">
                <button
                  onClick={() => setFilter(c.name.toLowerCase())}
                  className="text-sm font-semibold hover:text-indigo-600 transition-colors"
                  style={{ color: filter === c.name.toLowerCase() ? '#4f46e5' : c.fg }}
                >
                  {c.name}
                </button>
                <span className="text-[11px] font-semibold text-slate-300 font-mono">{c.count}</span>
              </div>
            ))}
            <button
              onClick={() => setFilter('all')}
              className={`text-sm font-semibold py-2 text-left ${filter === 'all' ? 'text-indigo-600' : 'text-slate-700'} hover:text-indigo-600`}
            >
              Todos los productos
            </button>
          </div>
        </div>

        <div className="bg-white border border-gray-100 rounded-xl p-4.5">
          <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-900 mb-3.5">Precio</h3>
          <div className="relative h-1 rounded-full bg-gray-100 mx-1.5 mt-4 mb-4">
            <div className="absolute left-[8%] right-[34%] top-0 h-1 rounded-full bg-indigo-600"></div>
            <span className="absolute left-[8%] top-[-5px] w-3.5 h-3.5 -ml-1.5 rounded-full bg-white border-3 border-indigo-600 shadow-sm"></span>
            <span className="absolute right-[34%] top-[-5px] w-3.5 h-3.5 -mr-2 rounded-full bg-white border-3 border-indigo-600 shadow-sm"></span>
          </div>
          <p className="text-xs font-semibold text-slate-600 mt-3">$29.900 — $480.000</p>
        </div>

        <div className="bg-slate-950 text-white rounded-xl p-5">
          <p className="text-[10px] font-extrabold tracking-widest uppercase text-indigo-300">Solo digital</p>
          <p className="text-lg font-extrabold tracking-tight leading-tight mt-2">Cursos con acceso inmediato</p>
          <p className="text-xs leading-relaxed text-slate-400 mt-2">Sin envíos, sin esperas. Recibes el enlace apenas confirmas el pago.</p>
          <button className="inline-flex items-center gap-1.5 mt-4 h-9 px-4 rounded-lg bg-indigo-600 text-xs font-bold hover:bg-indigo-700 transition-colors">
            Ver cursos <ArrowRight className="w-3 h-3" />
          </button>
        </div>
      </aside>

      <div className="flex-[999] min-w-0">
        <div className="bg-white border border-gray-100 rounded-xl px-3 sm:px-4.5 py-3 flex flex-wrap items-center justify-between gap-2 mb-5">
          <p className="text-[11px] sm:text-xs text-slate-400 font-medium m-0">
            <strong className="text-slate-800">{filteredProducts.length}</strong> producto(s)
          </p>
          <div className="flex items-center gap-2 sm:gap-4">
            <button onClick={() => setShowFilters(!showFilters)} className="md:hidden flex items-center gap-1.5 h-8 px-2.5 border border-gray-200 rounded-lg text-[11px] font-semibold text-slate-600">
              <SlidersHorizontal className="w-3 h-3" /> Filtros
            </button>
            <div className="hidden sm:flex items-center gap-2 text-xs text-slate-400 font-medium">
              Mostrar
              <span className="font-extrabold text-indigo-600">12</span>
              <span className="text-slate-200">/</span>
              <span>24</span>
              <span className="text-slate-200">/</span>
              <span>48</span>
            </div>
            <div className="hidden sm:flex items-center gap-1.5 h-9 px-3.5 border border-gray-200 rounded-lg text-xs font-semibold text-slate-600">
              Ordenar por popularidad <ChevronDown className="w-3 h-3 text-slate-300" />
            </div>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-20 text-slate-400 text-sm">Cargando productos...</div>
        ) : filteredProducts.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2 sm:gap-4">
            {filteredProducts.slice(0, 12).map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        ) : (
          <div className="text-center py-16 sm:py-20 bg-white rounded-2xl border border-dashed border-gray-200 px-4">
            <div className="w-12 h-12 rounded-full bg-indigo-50 flex items-center justify-center mx-auto mb-4">
              <Search className="w-5 h-5 text-indigo-300" />
            </div>
            <h3 className="text-base sm:text-lg font-bold text-slate-900 mb-1">No se encontraron productos</h3>
            <p className="text-xs sm:text-sm text-slate-400">Prueba con otros filtros o términos de búsqueda.</p>
          </div>
        )}

        {filteredProducts.length > 12 && (
          <div className="flex justify-center mt-8">
            <button className="inline-flex items-center gap-2 h-12 px-8 rounded-xl bg-white border border-gray-200 text-sm font-bold text-slate-800 hover:bg-slate-50 transition-colors">
              Cargar más productos <ChevronDown className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default Shop;
