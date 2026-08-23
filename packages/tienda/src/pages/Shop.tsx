import { useState, useEffect, useMemo } from 'react';
import { useStore, Product } from '../store/useStore';
import { useMoneda } from '@/lib/moneda';
import { Search, ShoppingCart, Heart, Store, Package, Download, Box } from 'lucide-react';
import { motion } from 'framer-motion';
import Swal from 'sweetalert2';
import { trackAddToCart, trackInitiateCheckout } from '../lib/pixel';
import { useParams, useSearchParams, useNavigate, Link } from 'react-router-dom';
import TrustBar from '../components/TrustBar';

interface ApiProduct {
  id: number;
  name: string;
  description: string;
  price: string;
  image: string | null;
  category: string;
  kind: string;
}

// El precio se muestra en la moneda del visitante: lo resuelve formatear() de
// useMoneda() (ver lib/moneda.ts) -- a un colombiano en pesos, a un extranjero
// en SU moneda con el dólar al lado. Acá había además un formatPrice() fijo en
// pesos que ya nadie llamaba; se quitó para que no vuelva a usarse por error y
// deje precios sin convertir.

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
  const navigate = useNavigate();
  const [imgError, setImgError] = useState(false);
  const [buying, setBuying] = useState(false);
  const detailHref = `/tienda/${slug}/producto/${product.id}`;
  const badge = TYPE_BADGE[product.type] || TYPE_BADGE.digital;
  const BadgeIcon = badge.icon;

  // "Comprar" va DIRECTO a la pasarela: antes decía Comprar pero solo metía el
  // producto al carrito, así que el cliente creía haber comprado y se quedaba
  // en la misma página. Para acumular varios productos está "Agregar".
  //
  // Salvo si es FÍSICO: eso se paga contra entrega, así que mandarlo a
  // MercadoPago es cobrarle por adelantado algo que iba a pagarle al
  // mensajero. Va al checkout, donde se le piden dirección y cédula.
  const comprarAhora = async () => {
    if (product.type === 'physical' || product.type === 'dropshipping') {
      addToCart(product);
      trackInitiateCheckout({ ids: [product.id], value: product.price });
      navigate(`/tienda/${slug}/checkout`);
      return;
    }

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

  // El mosaico de categorías muestra 8; una tienda con muchas más las
  // despliega bajo demanda en vez de empujar el catálogo fuera de pantalla.
  const [mostrarTodasCategorias, setMostrarTodasCategorias] = useState(false);

  const [visibleCount, setVisibleCount] = useState(12);

  useEffect(() => { setVisibleCount(12); }, [filter, searchTerm]);

  const displayedProducts = filteredProducts.slice(0, visibleCount);

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-8 pb-24 md:pb-8">
      {/* ── HERO A DOS BLOQUES (kit Urbanisty) ────────────────────────────
          El kit abre con dos tarjetas de color pegadas, no con un banner
          oscuro de ancho completo: una grande con la propuesta y el botón, y
          una angosta al lado. Es lo que le da el aire de tienda armada en vez
          de "una foto con letras encima". Los dos bloques salen del color de
          marca (primary y primary-deep), así que siguen cambiando con el
          picker del panel. */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4 mb-4 sm:mb-6">
        <div
          className="lg:col-span-2 relative overflow-hidden rounded-3xl bg-[var(--store-primary)] text-[var(--store-on-primary)] p-6 sm:p-10 min-h-[240px] sm:min-h-[320px] flex flex-col justify-center"
        >
          {/* La foto del negocio, si la cargó, se apoya a la derecha en vez de
              ocupar todo el fondo: en el kit el producto se ve entero sobre el
              bloque de color, no recortado detrás de un velo negro.
              Va con margen y esquinas redondeadas porque el dueño sube lo que
              quiera: un PNG recortado se ve flotando, pero una foto rectangular
              pegada al borde se lee como un pantallazo mal pegado. Con el
              recuadro, las dos opciones se ven intencionales. */}
          {config.heroImage && (
            <img
              src={config.heroImage}
              alt=""
              aria-hidden="true"
              className="pointer-events-none absolute right-5 top-1/2 -translate-y-1/2 h-[78%] w-[42%] object-cover object-center rounded-2xl shadow-lg hidden sm:block"
            />
          )}
          <div className="relative z-10 max-w-md">
            <p className="text-xs font-bold uppercase tracking-[0.2em] opacity-80 mb-3">Nueva colección</p>
            <h1 className="text-3xl sm:text-5xl font-black leading-[1.05] tracking-tight mb-3">
              {config.storeName || 'Encuentra lo que buscas'}
            </h1>
            {/* El héroe prometía "Envío a todo el país" y "productos físicos y
                digitales" SIEMPRE, aunque el catálogo fuera 100% digital (en
                esta tienda: 84 de 84). Prometer un envío que no existe genera
                reclamos y disputas de pago. No se reemplaza por un texto
                digital fijo porque otra tienda sí puede vender físico: se dice
                lo que el catálogo REALMENTE tiene. */}
            <p className="text-sm sm:text-base opacity-90 mb-6 leading-relaxed">
              {hayFisicos && hayDigitales
                ? "Productos físicos y digitales en un solo lugar"
                : hayFisicos
                  ? "Productos seleccionados, con envío a tu puerta"
                  : "Acceso inmediato, sin esperas ni envíos"}
            </p>
            <a
              href="#catalogo"
              className="inline-flex items-center gap-2 h-11 px-7 rounded-full bg-white text-gray-900 text-sm font-bold shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all"
            >
              Ver productos
            </a>
          </div>
        </div>

        {/* Bloque angosto: en el kit anuncia una categoría destacada. Acá
            muestra la categoría con MÁS productos de esta tienda -- dato real,
            no un "Best Seller" inventado -- y filtra al tocarla. Si la tienda
            todavía no tiene categorías, el bloque no se dibuja. */}
        {categories.length > 0 && (
          <button
            type="button"
            onClick={() => { setFilter(categories[0].key); }}
            className="group relative overflow-hidden rounded-3xl bg-[var(--store-primary-deep)] text-white p-6 sm:p-8 min-h-[160px] sm:min-h-[320px] flex flex-col justify-center text-left"
          >
            <p className="text-xs font-bold uppercase tracking-[0.2em] opacity-70 mb-2">Lo más surtido</p>
            <h2 className="text-2xl sm:text-3xl font-black leading-tight mb-1">{categories[0].name}</h2>
            <p className="text-sm opacity-80 mb-6">
              {categories[0].count} producto{categories[0].count === 1 ? '' : 's'} · {typeLabel(categories[0].type)}
            </p>
            <span className="inline-flex w-fit items-center gap-2 h-10 px-6 rounded-full bg-white text-gray-900 text-sm font-bold group-hover:-translate-y-0.5 transition-transform">
              Ver categoría
            </span>
          </button>
        )}
      </div>

      {/* Barra de garantías del kit, justo bajo el héroe. */}
      <TrustBar hayFisicos={hayFisicos} hayDigitales={hayDigitales} className="mb-6 sm:mb-8" />

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

      {/* ── CATEGORÍAS EN MOSAICO (kit Urbanisty) ─────────────────────────
          Antes eran pastillas grises en un carrusel horizontal con flechas:
          en móvil la mitad quedaba fuera de pantalla y no se veía que hubiera
          más. El kit las trata como bloques grandes de color, que es lo que
          invita a entrar. Se mantiene exactamente el mismo comportamiento de
          filtro (setFilter con la misma clave nombre+tipo), solo cambia cómo
          se ven. Se muestran 8 y el resto se despliega, para que una tienda
          con 30 categorías no empuje el catálogo fuera de la pantalla. */}
      {categories.length > 0 && (
        <div className="mb-8">
          <div className="flex items-end justify-between mb-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--store-primary)] mb-1">Explora</p>
              <h3 className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight">Categorías</h3>
            </div>
            {filter !== 'all' && (
              <button
                onClick={() => setFilter('all')}
                className="h-9 px-5 rounded-full border border-gray-200 bg-white text-xs font-bold text-gray-700 hover:border-[var(--store-primary)] hover:text-[var(--store-primary)] transition-colors"
              >
                Ver todo ({products.length})
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
            {(mostrarTodasCategorias ? categories : categories.slice(0, 8)).map((c) => {
              const activa = filter === c.key;
              return (
                <button
                  key={c.key}
                  onClick={() => setFilter(activa ? 'all' : c.key)}
                  aria-pressed={activa}
                  className={`group relative overflow-hidden rounded-2xl p-4 sm:p-6 min-h-[104px] sm:min-h-[132px] flex flex-col justify-between text-left transition-all hover:-translate-y-0.5 ${
                    activa
                      ? 'bg-[var(--store-primary)] text-[var(--store-on-primary)] shadow-md'
                      : 'bg-[var(--store-primary-soft)] text-gray-900 hover:shadow-md'
                  }`}
                >
                  <span className={`text-[10px] font-bold uppercase tracking-wider ${activa ? 'opacity-80' : 'text-[var(--store-primary)]'}`}>
                    {typeLabel(c.type)}
                  </span>
                  <span className="text-base sm:text-xl font-black leading-tight line-clamp-2">{c.name}</span>
                  <span className={`text-xs font-semibold ${activa ? 'opacity-80' : 'text-gray-500'}`}>
                    {c.count} producto{c.count === 1 ? '' : 's'}
                  </span>
                </button>
              );
            })}
          </div>

          {categories.length > 8 && (
            <div className="flex justify-center mt-4">
              <button
                onClick={() => setMostrarTodasCategorias(v => !v)}
                className="h-10 px-6 rounded-full border border-gray-200 bg-white text-xs font-bold text-gray-700 hover:border-[var(--store-primary)] hover:text-[var(--store-primary)] transition-colors"
              >
                {mostrarTodasCategorias
                  ? 'Ver menos categorías'
                  : `Ver las ${categories.length} categorías`}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── CATÁLOGO ──────────────────────────────────────────────────────
          El ancla que usa el botón "Ver productos" del héroe. */}
      <div id="catalogo" className="scroll-mt-24 flex items-end justify-between mb-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--store-primary)] mb-1">Catálogo</p>
          <h3 className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight">
            {filter === 'all' ? 'Todos los productos' : categories.find(c => c.key === filter)?.name || 'Productos'}
          </h3>
        </div>
        <p className="text-xs text-gray-500 pb-1">
          Mostrando <strong className="text-gray-900">{displayedProducts.length}</strong> de <strong className="text-gray-900">{filteredProducts.length}</strong>
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
