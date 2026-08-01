import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Heart, ChevronLeft } from 'lucide-react';
import { useStore, Product } from '../store/useStore';
import { ProductCard } from './Shop';

interface ApiProduct {
  id: number;
  name: string;
  description: string;
  price: string;
  image: string | null;
  category: string;
  kind: string;
}

// El corazón del catálogo guardaba ids en `wishlist`, pero no existía ninguna
// ruta /tienda/:slug/wishlist: los tres enlaces de PublicLayout (header, menú
// móvil y barra inferior) caían en el catch-all `*` de App.tsx y mandaban al
// cliente a "/" -- o sea, lo sacaban de la tienda a la landing de demo en vez
// de mostrarle lo que había guardado.
const Wishlist = () => {
  const { wishlist, products: localProducts } = useStore();
  const { slug: paramSlug } = useParams();
  const slug = paramSlug || 'sofia-premium';

  const [apiProducts, setApiProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/public/products/${slug}`)
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (!data?.products) return;
        setApiProducts(
          (data.products as ApiProduct[]).map(p => ({
            id: p.id.toString(),
            name: p.name,
            description: p.description,
            price: Number(p.price),
            image: p.image ?? '',
            category: p.category,
            type: (p.kind || 'digital') as Product['type'],
            stock: 999,
          })),
        );
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [slug]);

  const catalog = apiProducts.length > 0 ? apiProducts : localProducts;
  const saved = catalog.filter(p => wishlist.includes(p.id));

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-6 sm:py-10 pb-24 md:pb-10">
      <div className="flex items-center gap-2 mb-8">
        <Link to={`/tienda/${slug}`} className="text-gray-400 hover:text-[var(--store-primary)]">
          <ChevronLeft className="w-6 h-6" />
        </Link>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900">Lista de deseos</h1>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-6">
          {Array.from({ length: 4 }).map((_, i) => (
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
      ) : saved.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-6">
          {saved.map(product => (
            <ProductCard key={product.id} product={product} slug={slug} />
          ))}
        </div>
      ) : (
        <div className="text-center py-24 bg-white rounded-2xl px-6 border border-dashed border-gray-200">
          <div className="w-20 h-20 bg-[var(--store-primary)]/10 rounded-full flex items-center justify-center mx-auto mb-6">
            <Heart className="w-10 h-10 text-[var(--store-primary)]" />
          </div>
          <h3 className="text-xl font-bold text-gray-900 mb-2">Tu lista está vacía</h3>
          <p className="text-sm text-gray-500 mb-8 max-w-md mx-auto">
            Toca el corazón de cualquier producto para guardarlo aquí y comprarlo después.
          </p>
          <Link
            to={`/tienda/${slug}`}
            className="inline-flex items-center gap-2 h-11 px-8 rounded-xl bg-[var(--store-primary)] text-[var(--store-on-primary)] text-sm font-bold hover:bg-[var(--store-primary-hover)] transition-all"
          >
            Ver productos
          </Link>
        </div>
      )}
    </div>
  );
};

export default Wishlist;
