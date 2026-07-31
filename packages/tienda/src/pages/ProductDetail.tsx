import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useStore } from '../store/useStore';
import {
  ShoppingCart, Check, Package, Star, ShieldCheck,
  Infinity as InfinityIcon, Download, MessageCircle,
} from 'lucide-react';
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
  const slug = paramSlug || 'sofia-premium';
  const navigate = useNavigate();
  const { addToCart, config } = useStore();

  const [product, setProduct] = useState<DetailProduct | null>(null);
  const [related, setRelated] = useState<RelatedProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
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

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-16">
        <div className="grid md:grid-cols-2 gap-10 animate-pulse">
          <div className="aspect-square bg-gray-100 rounded-2xl" />
          <div className="space-y-4">
            <div className="h-4 w-24 bg-gray-100 rounded-lg" />
            <div className="h-10 w-3/4 bg-gray-100 rounded-xl" />
            <div className="h-12 w-40 bg-gray-100 rounded-xl" />
            <div className="h-32 bg-gray-100 rounded-2xl" />
          </div>
        </div>
      </div>
    );
  }

  if (notFound || !product) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-24 text-center">
        <div className="w-24 h-24 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-6">
          <Package className="w-12 h-12 text-red-400" />
        </div>
        <h2 className="text-3xl font-extrabold text-gray-900 mb-3">Producto no disponible</h2>
        <p className="text-gray-500 mb-10 text-lg">Puede que ya no esté publicado o el enlace sea incorrecto.</p>
        <Link
          to={`/tienda/${slug}`}
          className="inline-flex items-center gap-2 bg-red-600 text-white px-8 py-4 rounded-xl font-bold hover:bg-red-700 transition-all"
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
      <div className="mb-8 flex items-center gap-2 text-sm text-gray-500 font-medium">
        <Link to={`/tienda/${slug}`} className="hover:text-red-600 transition-colors">Inicio</Link>
        <span className="text-gray-300">/</span>
        <span className="capitalize text-gray-500">{product.category || 'General'}</span>
        <span className="text-gray-300">/</span>
        <span className="text-gray-700 truncate">{product.name}</span>
      </div>

      <div className="grid md:grid-cols-2 gap-10 lg:gap-16">
        <div className="md:sticky md:top-24 md:self-start group">
          <div className="aspect-square bg-gray-50 rounded-2xl overflow-hidden relative border border-gray-200">
            {product.image && !imgError ? (
              <img
                src={product.image}
                alt={product.name}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                onError={() => setImgError(true)}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-300 bg-gray-50">
                <Package className="w-24 h-24" />
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col">
          <p className="text-[11px] font-bold text-red-600 uppercase tracking-widest mb-3">
            {product.category}
          </p>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 leading-tight mb-4 tracking-tight">
            {product.name}
          </h1>

          <div className="flex flex-wrap items-center gap-3 mb-6">
            <span className="inline-flex items-center gap-1.5 bg-amber-50 border border-amber-200 text-amber-700 text-xs font-bold px-3 py-1.5 rounded-full">
              <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500" /> Más Vendido
            </span>
            <span className="inline-flex items-center gap-1.5 bg-red-50 border border-red-200 text-red-700 text-xs font-bold px-3 py-1.5 rounded-full">
              <Check className="w-3.5 h-3.5" /> Acceso Inmediato
            </span>
          </div>

          <div className="mb-8">
            <div className="flex items-baseline gap-2">
              <span className="text-5xl font-black text-gray-900">{formatPrice(price)}</span>
              <span className="text-base font-semibold text-gray-500">{product.currency || 'COP'}</span>
            </div>
            <p className="text-sm text-emerald-600 font-bold mt-1">
              Pago único — sin mensualidades
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-8">
            {[
              { icon: InfinityIcon, text: 'Acceso de por vida' },
              { icon: Download, text: 'Descargable u online' },
              { icon: ShieldCheck, text: 'Entrega por Google Drive' },
              { icon: Check, text: 'Acceso inmediato' },
            ].map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-2.5 text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded-lg p-2">
                <Icon className="w-4 h-4 text-red-600 shrink-0" />
                <span>{text}</span>
              </div>
            ))}
          </div>

          <div className="space-y-3 mb-8">
            <button
              onClick={() => {
                addToCart({
                  id: String(product.id),
                  name: product.name,
                  price: Number(product.price),
                  image: product.image ?? '',
                  category: product.category,
                  type: (product.kind || 'digital') as any,
                  stock: 999,
                });
                trackAddToCart({ id: product.id, name: product.name, price: product.price });
                trackInitiateCheckout({ ids: [product.id], value: price, currency: product.currency });
                navigate(`/tienda/${slug}/checkout`);
              }}
              className="w-full bg-red-600 text-white py-4 rounded-xl font-bold hover:bg-red-700 transition-all flex items-center justify-center gap-2.5"
            >
              <ShoppingCart className="w-5 h-5" />
              Comprar ahora
            </button>

            {waHref && (
              <a
                href={waHref}
                target="_blank"
                rel="noreferrer"
                onClick={() => trackContact({ content_name: product.name })}
                className="w-full bg-white text-gray-900 border border-gray-200 py-3.5 rounded-xl font-bold hover:bg-gray-50 transition-all flex items-center justify-center gap-2.5"
              >
                <MessageCircle className="w-5 h-5 text-emerald-600" />
                Consultar por WhatsApp
              </a>
            )}
          </div>

          {features.length > 0 && (
            <div className="border border-gray-200 rounded-xl p-5 mb-6">
              <h3 className="text-sm font-extrabold text-gray-900 uppercase tracking-wide mb-3">
                Qué incluye
              </h3>
              <ul className="space-y-2">
                {features.map((f, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm text-gray-700">
                    <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
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
