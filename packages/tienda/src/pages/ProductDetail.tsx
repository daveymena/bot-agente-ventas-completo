import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useStore } from '../store/useStore';
import {
  ShoppingCart, Check, ChevronLeft, Package, Star, ShieldCheck,
  Infinity as InfinityIcon, Download, MessageCircle, CreditCard,
} from 'lucide-react';
import Swal from 'sweetalert2';
import { initPixel, trackViewContent, trackAddToCart, trackInitiateCheckout, trackContact } from '../lib/pixel';

interface DetailProduct {
  id: number;
  name: string;
  description: string | null;
  price: string;
  currency: string | null;
  image: string | null;
  category: string;
  kind: string;
  sku: string | null;
  features: string[] | null;
}

interface RelatedProduct {
  id: number;
  name: string;
  price: string;
  image: string | null;
  category: string;
}

const formatPrice = (price: number) => '$' + Math.round(price).toLocaleString('es-CO');

const ProductDetail = () => {
  const { slug: paramSlug, productId } = useParams();
  const slug = paramSlug || 'demo';
  const navigate = useNavigate();
  const { addToCart, config } = useStore();

  const [product, setProduct] = useState<DetailProduct | null>(null);
  const [related, setRelated] = useState<RelatedProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [buying, setBuying] = useState<'mp' | 'pp' | null>(null);
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    setLoading(true);
    setNotFound(false);
    window.scrollTo(0, 0);
    fetch(`/api/public/product/${slug}/${productId}`)
      .then(r => { if (!r.ok) throw new Error('404'); return r.json(); })
      .then(data => {
        setProduct(data.product);
        setRelated(data.related || []);

        // ViewContent: el evento que Meta usa para armar audiencias de
        // remarketing (quien vio el producto pero no compró).
        if (data.store?.pixelId) initPixel(data.store.pixelId);
        trackViewContent({
          id: data.product.id,
          name: data.product.name,
          price: Number(data.product.price),
          currency: data.product.currency,
          category: data.product.category,
        });
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [slug, productId]);

  const comprar = async (method: 'mp' | 'pp') => {
    if (!product) return;
    setBuying(method);

    // Se dispara ANTES de redirigir: una vez en la pasarela ya salimos del sitio
    // y no hay forma de medir desde aquí.
    trackInitiateCheckout({
      ids: [product.id],
      value: Number(product.price),
      currency: product.currency,
    });

    try {
      const res = await fetch(`/api/public/checkout/${slug}/${product.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method: method === 'mp' ? 'mercadopago' : 'paypal' }),
      });
      const data = await res.json();
      if (!res.ok || !data.checkoutUrl) {
        throw new Error(data?.message || 'No se pudo generar el enlace de pago');
      }
      window.location.href = data.checkoutUrl;
    } catch (err) {
      setBuying(null);
      Swal.fire({
        title: 'No pudimos abrir el pago',
        text: err instanceof Error ? err.message : 'Intenta de nuevo.',
        icon: 'error',
      });
    }
  };

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-16">
        <div className="grid md:grid-cols-2 gap-10 animate-pulse">
          <div className="aspect-square bg-gray-100 rounded-2xl" />
          <div className="space-y-4">
            <div className="h-4 w-24 bg-gray-100 rounded" />
            <div className="h-8 w-3/4 bg-gray-100 rounded" />
            <div className="h-10 w-40 bg-gray-100 rounded" />
            <div className="h-24 bg-gray-100 rounded" />
          </div>
        </div>
      </div>
    );
  }

  if (notFound || !product) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-20 text-center">
        <Package className="w-14 h-14 text-gray-300 mx-auto mb-5" />
        <h2 className="text-2xl font-extrabold text-gray-900 mb-3">Producto no disponible</h2>
        <p className="text-gray-500 mb-8">Puede que ya no esté publicado o el enlace sea incorrecto.</p>
        <Link
          to={`/tienda/${slug}`}
          className="inline-flex items-center gap-2 bg-indigo-600 text-white px-7 py-3 rounded-xl font-bold hover:bg-indigo-700 transition-colors"
        >
          Ver todos los productos
        </Link>
      </div>
    );
  }

  const price = Number(product.price);
  const features = Array.isArray(product.features) ? product.features : [];
  // Las descripciones traen saltos de línea propios (vienen del catálogo);
  // se respetan como párrafos en vez de aplastarlas en un bloque ilegible.
  const paragraphs = (product.description || '')
    .split(/\r?\n/)
    .map(s => s.trim())
    .filter(Boolean);

  const waHref = config.whatsappPhone
    ? `https://wa.me/${config.whatsappPhone}?text=${encodeURIComponent(
        `Hola! Me interesa ${product.name} (${formatPrice(price)}). ¿Me das más información?`,
      )}`
    : null;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <button
        onClick={() => navigate(`/tienda/${slug}`)}
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-indigo-600 mb-6 transition-colors"
      >
        <ChevronLeft className="w-4 h-4" /> Volver a la tienda
      </button>

      <div className="grid md:grid-cols-2 gap-10 lg:gap-14">
        <div className="md:sticky md:top-24 md:self-start">
          <div className="aspect-square bg-gray-50 rounded-2xl overflow-hidden border border-gray-200">
            {product.image && !imgError ? (
              <img
                src={product.image}
                alt={product.name}
                className="w-full h-full object-cover"
                onError={() => setImgError(true)}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-300">
                <Package className="w-20 h-20" />
              </div>
            )}
          </div>
        </div>

        <div>
          <p className="text-[11px] font-bold text-indigo-600 uppercase tracking-wider mb-2">
            {product.category}
          </p>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 leading-tight mb-3">
            {product.name}
          </h1>

          <div className="flex items-center gap-2 mb-5">
            <div className="flex">
              {[...Array(5)].map((_, i) => (
                <Star key={i} className="w-4 h-4 fill-amber-400 text-amber-400" />
              ))}
            </div>
            <span className="text-sm font-bold text-gray-700">4.9</span>
            <span className="text-sm text-gray-400">(128 valoraciones)</span>
          </div>

          <div className="mb-6">
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-black text-gray-900">{formatPrice(price)}</span>
              <span className="text-sm font-semibold text-gray-400">{product.currency || 'COP'}</span>
            </div>
            <p className="text-sm text-green-600 font-bold mt-1">
              Pago único — sin mensualidades
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2.5 mb-6">
            {[
              { icon: InfinityIcon, text: 'Acceso de por vida' },
              { icon: Download, text: 'Descargable u online' },
              { icon: ShieldCheck, text: 'Entrega por Google Drive' },
              { icon: Check, text: 'Acceso inmediato' },
            ].map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-2 text-sm text-gray-700">
                <Icon className="w-4 h-4 text-indigo-600 shrink-0" />
                <span>{text}</span>
              </div>
            ))}
          </div>

          <div className="space-y-2.5 mb-6">
            <button
              onClick={() => comprar('mp')}
              disabled={buying !== null}
              className="w-full bg-gray-900 text-white py-4 rounded-xl font-bold hover:bg-gray-800 transition-all flex items-center justify-center gap-2.5 disabled:opacity-50"
            >
              <CreditCard className="w-5 h-5" />
              {buying === 'mp' ? 'Abriendo pago…' : 'Comprar ahora'}
            </button>

            <div className="grid grid-cols-2 gap-2.5">
              <button
                onClick={() => {
                  addToCart({
                    id: String(product.id),
                    name: product.name,
                    description: product.description || '',
                    price,
                    image: product.image || '',
                    category: product.category,
                    type: (product.kind as any) || 'digital',
                    stock: 999,
                  });
                  trackAddToCart({
                    id: product.id,
                    name: product.name,
                    price,
                    currency: product.currency,
                  });
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
                className="border border-gray-300 text-gray-800 py-3 rounded-xl font-bold hover:bg-gray-50 transition-colors flex items-center justify-center gap-2 text-sm"
              >
                <ShoppingCart className="w-4 h-4" /> Agregar
              </button>

              <a
                href={waHref || '#'}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => trackContact('ficha-producto')}
                className={`py-3 rounded-xl font-bold transition-colors flex items-center justify-center gap-2 text-sm ${
                  waHref
                    ? 'bg-green-500 text-white hover:bg-green-600'
                    : 'bg-gray-100 text-gray-400 pointer-events-none'
                }`}
              >
                <MessageCircle className="w-4 h-4" /> Preguntar
              </a>
            </div>
          </div>

          {features.length > 0 && (
            <div className="border border-gray-200 rounded-xl p-5 mb-6">
              <h3 className="text-sm font-extrabold text-gray-900 uppercase tracking-wide mb-3">
                Qué incluye
              </h3>
              <ul className="space-y-2">
                {features.map((f, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm text-gray-700">
                    <Check className="w-4 h-4 text-green-600 shrink-0 mt-0.5" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {paragraphs.length > 0 && (
            <div className="border-t border-gray-200 pt-6">
              <h3 className="text-sm font-extrabold text-gray-900 uppercase tracking-wide mb-3">
                Descripción
              </h3>
              <div className="space-y-2.5">
                {paragraphs.map((p, i) => (
                  <p key={i} className="text-sm text-gray-600 leading-relaxed">{p}</p>
                ))}
              </div>
            </div>
          )}

          {product.sku && (
            <p className="text-xs text-gray-400 mt-5">SKU: {product.sku}</p>
          )}
        </div>
      </div>

      {related.length > 0 && (
        <div className="mt-16 border-t border-gray-200 pt-10">
          <h2 className="text-lg font-extrabold text-gray-900 mb-5">También te puede interesar</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {related.map(r => (
              <Link
                key={r.id}
                to={`/tienda/${slug}/producto/${r.id}`}
                className="group bg-white border border-gray-200 rounded-lg overflow-hidden hover:shadow-md hover:border-gray-300 transition-all"
              >
                <div className="aspect-square bg-gray-50 overflow-hidden">
                  {r.image ? (
                    <img
                      src={r.image}
                      alt={r.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-300">
                      <Package className="w-10 h-10" />
                    </div>
                  )}
                </div>
                <div className="p-3">
                  <h3 className="text-xs font-semibold text-gray-900 line-clamp-2 min-h-[2.5em] leading-snug">
                    {r.name}
                  </h3>
                  <p className="text-sm font-black text-gray-900 mt-1.5">
                    {formatPrice(Number(r.price))}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ProductDetail;
