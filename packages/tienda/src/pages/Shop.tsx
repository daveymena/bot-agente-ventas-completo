import { useState, useEffect } from 'react';
import { useStore } from '../store/useStore';
import { Search, Filter, Star, Zap } from 'lucide-react';
import { motion } from 'framer-motion';
import Swal from 'sweetalert2';
import { useParams } from 'react-router-dom';

interface ApiProduct {
  id: number;
  name: string;
  description: string;
  price: string;
  image: string | null;
  category: string;
  kind: string;
}

const Shop = () => {
  const { addToCart, wishlist, toggleWishlist, updateConfig } = useStore();
  const { slug: paramSlug } = useParams();
  const slug = paramSlug || 'demo';

  const [apiProducts, setApiProducts] = useState<ApiProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [storeName, setStoreName] = useState('');

  useEffect(() => {
    fetch(`/api/public/products/${slug}`)
      .then(r => { if (!r.ok) throw new Error('No encontrada'); return r.json(); })
      .then(data => {
        setApiProducts(data.products);
        setStoreName(data.store.name);
        updateConfig({ storeName: data.store.name });
      })
      .catch(() => setApiProducts([]))
      .finally(() => setLoading(false));
  }, [slug]);

  const products = apiProducts.map(p => ({
    id: p.id.toString(),
    name: p.name,
    description: p.description,
    price: Number(p.price),
    image: p.image ?? '',
    category: p.category,
    type: p.kind as 'digital' | 'physical' | 'dropshipping',
  }));

  const [filter, setFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  const filteredProducts = products.filter(p => {
    const matchesFilter = filter === 'all' || p.type === filter;
    const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const searchResults = searchTerm.length > 0 
    ? products.filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase())).slice(0, 4)
    : [];

  return (
    <div className="max-w-7xl mx-auto px-4 py-12">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-16">
        <div className="max-w-xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 text-[10px] font-black uppercase tracking-widest mb-4">
            Catálogo Oficial
          </div>
          <h1 className="text-5xl font-black text-slate-950 mb-4 tracking-tighter uppercase">Nuestra Tienda</h1>
          <p className="text-slate-500 text-lg">Explora una selección curada de productos de alta gama diseñados para el máximo rendimiento.</p>
        </div>

        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Buscar productos..."
              className="pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none w-full sm:w-64"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            {/* Predictive Results */}
            {searchResults.length > 0 && (
              <div className="absolute top-full mt-2 left-0 right-0 bg-white rounded-2xl shadow-2xl border border-slate-100 p-2 z-50">
                {searchResults.map(p => (
                  <button 
                    key={p.id}
                    onClick={() => { setSearchTerm(p.name); }}
                    className="w-full flex items-center gap-3 p-2 hover:bg-slate-50 rounded-xl transition-colors text-left"
                  >
                    <img src={p.image} className="w-10 h-10 rounded-lg object-cover" />
                    <div>
                      <p className="text-xs font-bold text-slate-900">{p.name}</p>
                      <p className="text-[10px] text-indigo-600 font-bold">${p.price}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="flex bg-white border border-gray-200 rounded-xl p-1">
            {['all', 'digital', 'physical', 'dropshipping'].map((t) => (
              <button
                key={t}
                onClick={() => setFilter(t)}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold capitalize transition-all ${
                  filter === t ? 'bg-indigo-600 text-white shadow-md' : 'text-gray-500 hover:text-indigo-600'
                }`}
              >
                {t === 'all' ? 'Todos' : t}
              </button>
            ))}
          </div>
        </div>
      </div>

      {filteredProducts.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
          {filteredProducts.map((product) => (
            <motion.div
              layout
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              key={product.id}
              className="bg-white rounded-2xl overflow-hidden border border-gray-100 shadow-sm hover:shadow-xl transition-all group"
            >
              <div className="aspect-[4/5] overflow-hidden relative">
                <img
                  src={product.image}
                  alt={product.name}
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                />
                <div className="absolute top-4 right-4">
                  <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase shadow-sm ${
                    product.type === 'digital' ? 'bg-blue-600 text-white' :
                    product.type === 'physical' ? 'bg-emerald-600 text-white' : 'bg-purple-600 text-white'
                  }`}>
                    {product.type}
                  </span>
                </div>
              </div>
              <div className="p-6">
                <p className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest mb-1">{product.category}</p>
                <h3 className="font-bold text-gray-900 mb-2 group-hover:text-indigo-600 transition-colors truncate">
                  {product.name}
                </h3>
                <div className="flex items-center gap-1 mb-4">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="w-3 h-3 fill-yellow-400 text-yellow-400" />
                  ))}
                  <span className="text-[10px] text-gray-400 font-bold ml-1">4.9/5.0</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-[10px] text-gray-400 font-bold line-through">$ {(product.price * 1.2).toFixed(2)}</span>
                    <span className="text-xl font-extrabold text-gray-900">${product.price}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => toggleWishlist(product.id)}
                      className={`p-3 rounded-xl border transition-all ${
                        wishlist.includes(product.id) 
                        ? 'bg-red-50 border-red-100 text-red-500' 
                        : 'bg-white border-slate-100 text-slate-400 hover:text-red-500'
                      }`}
                    >
                      <Star className={`w-4 h-4 ${wishlist.includes(product.id) ? 'fill-current' : ''}`} />
                    </button>
                    <button
                      onClick={() => {
                        addToCart(product);
                        Swal.fire({
                          title: '¡Agregado!',
                          text: `${product.name} al carrito`,
                          icon: 'success',
                          toast: true,
                          position: 'top-end',
                          showConfirmButton: false,
                          timer: 2000
                        });
                      }}
                      className="p-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-all active:scale-95 shadow-lg shadow-indigo-100"
                    >
                      <Zap className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      ) : (
        <div className="text-center py-32 bg-white rounded-[2rem] border border-dashed border-gray-200">
           <Filter className="w-12 h-12 text-gray-200 mx-auto mb-4" />
           <h3 className="text-xl font-bold text-gray-900 mb-1">No se encontraron productos</h3>
           <p className="text-gray-500">Prueba con otros filtros o términos de búsqueda.</p>
        </div>
      )}
    </div>
  );
};

export default Shop;
