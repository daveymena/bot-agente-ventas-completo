import { useMoneda } from '@/lib/moneda';
import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useStore } from '../store/useStore';
import { ShoppingCart, Check, Package, ShieldCheck, Infinity as InfinityIcon, Download, MessageCircle, Truck } from 'lucide-react';
import { initPixel, trackViewContent, trackAddToCart, trackInitiateCheckout, trackContact } from '../lib/pixel';
import { sanitizeRichHtml, plainTextToHtml } from '../lib/rich-text';
import TrustBar from '../components/TrustBar';

interface DetailProduct {
  /** Galería completa (principal primero) y video principal, si el dueño los cargó. */
  images?: string[];
  video?: string | null;
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

// El precio que ve el visitante lo resuelve formatear() de useMoneda().
// Acá había un formatPrice() fijo en pesos que ya nadie llamaba.

const ProductDetail = () => {
  // Precio en la moneda del visitante (ver lib/moneda.ts).
  const { formatear } = useMoneda();
  const { slug: paramSlug, productId } = useParams();
  const slug = paramSlug || 'sofia-premium';
  const navigate = useNavigate();
  const { addToCart, config } = useStore();

  const [product, setProduct] = useState<DetailProduct | null>(null);
  const [related, setRelated] = useState<RelatedProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [fotoActiva, setFotoActiva] = useState(0);
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
        <div className="w-24 h-24 bg-[var(--store-primary)]/10 rounded-full flex items-center justify-center mx-auto mb-6">
          <Package className="w-12 h-12 text-[var(--store-primary)]" />
        </div>
        <h2 className="text-3xl font-extrabold text-gray-900 mb-3">Producto no disponible</h2>
        <p className="text-gray-500 mb-10 text-lg">Puede que ya no esté publicado o el enlace sea incorrecto.</p>
        <Link
          to={`/tienda/${slug}`}
          className="inline-flex items-center gap-2 bg-[var(--store-primary)] text-[var(--store-on-primary)] px-8 py-4 rounded-xl font-bold hover:bg-[var(--store-primary-hover)] transition-all"
        >
          Ver todos los productos
        </Link>
      </div>
    );
  }

  const price = Number(product.price);
  const features = Array.isArray(product.features) ? product.features : [];
  // Primero se le devuelve la estructura al texto plano (las descripciones
  // viejas son texto con saltos de linea, y HTML colapsa los saltos: por eso
  // se veian como un bloque corrido), y recien despues se sanitiza.
  const descriptionHtml = sanitizeRichHtml(plainTextToHtml(product.description || ''));
  // Un curso y una rodillera no se entregan igual: lo que se le promete al
  // cliente cambia con esto, no es solo un texto distinto.
  const esDigital = String(product.kind || 'digital') !== 'physical';

  const waHref = config.whatsappPhone
    ? `https://wa.me/${config.whatsappPhone}?text=${encodeURIComponent(
        `Hola! Me interesa ${product.name} (${formatear(price)}). ¿Me das más información?`,
      )}`
    : null;

  // Galería: la principal primero (la que eligió el dueño) y las demás.
  const fotos: string[] = (() => {
    const lista = Array.isArray(product.images) && product.images.length ? product.images : (product.image ? [product.image] : []);
    return Array.from(new Set(lista.filter(Boolean)));
  })();
  const videoEmbed = embedDeVideo(product.video || null);

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="mb-8 flex items-center gap-2 text-sm text-gray-500 font-medium">
        <Link to={`/tienda/${slug}`} className="hover:text-[var(--store-primary)] transition-colors">Inicio</Link>
        <span className="text-gray-300">/</span>
        <span className="capitalize text-gray-500">{product.category || 'General'}</span>
        <span className="text-gray-300">/</span>
        <span className="text-gray-700 truncate">{product.name}</span>
      </div>

      <div className="grid md:grid-cols-2 gap-10 lg:gap-16">
        <div className="md:sticky md:top-24 md:self-start group">
          {/* Mismo bloque de color pálido que la tarjeta del catálogo
              (--store-primary-soft): en el kit el producto se apoya sobre un
              tono de la marca, no sobre un gris con borde. Es lo que hace que
              la foto "flote" -- y sigue al color que elija el dueño. */}
          <div className="aspect-square bg-[var(--store-primary-soft)] rounded-uv overflow-hidden relative">
            {(fotos[fotoActiva] || product.image) && !imgError ? (
              <img
                src={fotos[fotoActiva] || product.image || `/images/products/${product.id}.jpg`}
                alt={product.name}
                /* ver nota abajo */
                className="w-full h-full object-contain p-4 group-hover:scale-105 transition-transform duration-700"
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  if (!target.src.includes(`/images/products/${product.id}.jpg`)) {
                    target.src = `/images/products/${product.id}.jpg`;
                  } else {
                    setImgError(true);
                  }
                }}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-300">
                <Package className="w-24 h-24" />
              </div>
            )}
          </div>
          {fotos.length > 1 && (
            <div className="mt-3 grid grid-cols-5 sm:grid-cols-6 gap-2">
              {fotos.map((u, i) => (
                <button
                  key={u}
                  type="button"
                  onClick={() => { setFotoActiva(i); setImgError(false); }}
                  className={`aspect-square rounded-lg overflow-hidden border-2 bg-white transition-colors ${i === fotoActiva ? 'border-[var(--store-primary)]' : 'border-transparent hover:border-gray-300'}`}
                  aria-label={`Foto ${i + 1}`}
                >
                  <img src={u} alt="" className="w-full h-full object-cover" loading="lazy" />
                </button>
              ))}
            </div>
          )}
          {videoEmbed && (
            <div className="mt-4 rounded-uv overflow-hidden bg-black aspect-video">
              {videoEmbed.tipo === 'iframe' ? (
                <iframe src={videoEmbed.src} title="Video del producto" className="w-full h-full" allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
              ) : (
                <video src={videoEmbed.src} controls playsInline className="w-full h-full" />
              )}
            </div>
          )}
        </div>

        <div className="flex flex-col">
          <p className="text-[11px] font-bold text-[var(--store-primary)] uppercase tracking-widest mb-3">
            {product.category}
          </p>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 leading-tight mb-3 tracking-tight">
            {product.name}
          </h1>

          {/* Estrellas VACÍAS, igual que en las tarjetas del catálogo.
              El kit de referencia las pone con "(1 customer review)" al lado,
              pero acá no hay reseñas: `products` no guarda valoraciones. Se
              dibujan sin rellenar --como hace el propio kit con sus productos
              sin valorar-- para no romper la composición, y sin número al lado
              porque afirmar "5 reseñas" que nadie escribió es inventar prueba
              social. El mismo criterio por el que se sacó "Más Vendido". */}
          <div className="flex items-center gap-0.5 mb-4" aria-hidden="true">
            {[0, 1, 2, 3, 4].map(i => (
              <svg key={i} viewBox="0 0 20 20" className="w-4 h-4 fill-[var(--store-grey,#CAC7C7)]">
                <path d="M10 1.5l2.6 5.3 5.9.9-4.2 4.1 1 5.8-5.3-2.8-5.3 2.8 1-5.8L1.5 7.7l5.9-.9L10 1.5z" />
              </svg>
            ))}
          </div>

          {/* "Más Vendido" estaba fijo en TODOS los productos: es prueba
              social inventada --el mismo problema que las estrellas clonadas
              que ya se sacaron de las tarjetas-- y encima se nota apenas el
              cliente ve dos fichas seguidas. Sin datos de ventas reales, no
              se afirma. */}
          <div className="flex flex-wrap items-center gap-3 mb-6">
            <span className="inline-flex items-center gap-1.5 bg-[var(--store-primary)]/10 border border-[var(--store-primary)]/20 text-[var(--store-primary)] text-xs font-bold px-3 py-1.5 rounded-full">
              <Check className="w-3.5 h-3.5" /> {esDigital ? 'Acceso inmediato' : 'Envío a domicilio'}
            </span>
          </div>

          <div className="mb-8">
            <div className="flex items-baseline gap-2">
              {/* En celular text-5xl desborda con precios de siete cifras
                  ($1.899.000): el numero se sale de la columna. */}
              <span className="text-3xl sm:text-4xl font-black text-gray-900">{formatear(price)}</span>
              <span className="text-base font-semibold text-gray-500">{product.currency || 'COP'}</span>
            </div>
            <p className="text-sm text-emerald-600 font-bold mt-1">
              {esDigital ? 'Pago único — sin mensualidades' : 'Precio final — sin sorpresas'}
            </p>
          </div>

          {/* En celular UNA columna: con dos, textos como "Coordinamos por
              WhatsApp" se parten en tres renglones y la ficha se alarga sin
              ganar nada. Desde sm hacia arriba, dos. */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-8">
            {/* Un producto FISICO no se descarga, no llega por Drive y no
                tiene "acceso de por vida". Esta lista estaba fija para todo el
                catalogo, asi que una rodillera termica mostraba "Entrega por
                Google Drive" -- reportado por el admin. Se ramifica por kind. */}
            {(esDigital
              ? [
                  { icon: InfinityIcon, text: 'Acceso de por vida' },
                  { icon: Download, text: 'Descargable u online' },
                  { icon: ShieldCheck, text: 'Entrega por Google Drive' },
                  { icon: Check, text: 'Acceso inmediato' },
                ]
              : [
                  { icon: Truck, text: 'Envio a tu direccion' },
                  { icon: MessageCircle, text: 'Coordinamos por WhatsApp' },
                  { icon: ShieldCheck, text: 'Producto original' },
                  { icon: Check, text: 'Pagas al recibir o en linea' },
                ]
            ).map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-2.5 text-sm text-gray-700 bg-[var(--store-primary-soft)] rounded-xl px-3 py-2.5">
                <Icon className="w-4 h-4 text-[var(--store-primary)] shrink-0" />
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
                  // Faltaba `description` y el objeto entraba al carrito con
                  // `as any`: el ítem quedaba sin descripción y el tipo mentía.
                  description: product.description ?? '',
                  price: Number(product.price),
                  image: product.image ?? '',
                  category: product.category,
                  // El backend solo emite 'physical' | 'digital'; el checkout
                  // decide contra entrega vs pasarela leyendo justo esto, así
                  // que no puede quedar en `any`.
                  type: product.kind === 'physical' ? 'physical' : 'digital',
                  stock: 999,
                });
                // El precio viaja como string desde la API; el píxel espera un
                // número. Enviarlo sin convertir le manda a Meta el valor de la
                // conversión como texto.
                trackAddToCart({ id: product.id, name: product.name, price: Number(product.price) });
                trackInitiateCheckout({ ids: [product.id], value: price, currency: product.currency });
                navigate(`/tienda/${slug}/checkout`);
              }}
              className="w-full bg-[var(--store-primary)] text-[var(--store-on-primary)] py-4 rounded-full font-bold hover:bg-[var(--store-primary-hover)] transition-all flex items-center justify-center gap-2.5"
            >
              <ShoppingCart className="w-5 h-5" />
              Comprar ahora
            </button>

            {waHref && (
              <a
                href={waHref}
                target="_blank"
                rel="noreferrer"
                onClick={() => trackContact(product.name)}
                className="w-full bg-white text-gray-900 border border-gray-200 py-3.5 rounded-full font-bold hover:bg-gray-50 transition-all flex items-center justify-center gap-2.5"
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

          {product.sku && (
            <p className="text-xs text-gray-400 mt-5">SKU: {product.sku}</p>
          )}
        </div>
      </div>

      {/* ── DESCRIPCIÓN A ANCHO COMPLETO ──────────────────────────────────
          En el kit la descripción va abajo, cruzando las dos columnas, no
          apretada bajo el botón de compra. Con las descripciones largas en
          HTML del catálogo, en media columna quedaban en una tira angosta de
          texto; acá se leen. Se limita el ancho de línea (max-w-3xl) porque un
          párrafo de 1200px de ancho tampoco se lee. */}
      {descriptionHtml && (
        <div className="mt-14 border-t border-gray-200 pt-10">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--store-primary)] mb-1">Detalles</p>
          <h2 className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight mb-5">Descripción</h2>
          <div
            className="max-w-3xl text-[15px] text-gray-600 leading-relaxed whitespace-pre-line space-y-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_strong]:font-bold"
            dangerouslySetInnerHTML={{ __html: descriptionHtml }}
          />
        </div>
      )}

      {/* ── TAMBIÉN TE PUEDE INTERESAR ────────────────────────────────────
          Mismo lenguaje que la tarjeta del catálogo: foto sobre el bloque de
          color de la marca, texto centrado, esquinas redondeadas. No se
          reutiliza el <ProductCard/> de Shop.tsx a propósito: el endpoint de
          relacionados no devuelve `kind`, así que la tarjeta pintaría a todos
          la etiqueta "Digital" y una rodillera aparecería como descargable.
          Cuando el backend mande el tipo, esto se reemplaza por ProductCard. */}
      {related.length > 0 && (
        <div className="mt-16 border-t border-gray-200 pt-10">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--store-primary)] mb-1">Más productos</p>
          <h2 className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight mb-6">También te puede interesar</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-6">
            {related.map(r => (
              <Link
                key={r.id}
                to={`/tienda/${slug}/producto/${r.id}`}
                className="group rounded-2xl bg-[var(--store-primary-soft)] p-4 flex flex-col transition-transform duration-300 hover:-translate-y-1"
              >
                <div className="aspect-square overflow-hidden">
                  {r.image ? (
                    <img
                      src={r.image}
                      alt={r.name}
                      className="w-full h-full object-contain p-4 group-hover:scale-105 transition-transform duration-500"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-300">
                      <Package className="w-10 h-10" />
                    </div>
                  )}
                </div>
                <div className="p-3 flex flex-col gap-1.5 flex-1 text-center">
                  <p className="text-[10px] font-bold text-[var(--store-primary)] uppercase tracking-wider">
                    {r.category || 'General'}
                  </p>
                  <h3 className="text-sm font-bold text-gray-900 line-clamp-2 min-h-[2.5em] leading-snug group-hover:text-[var(--store-primary)] transition-colors">
                    {r.name}
                  </h3>
                  <p className="mt-auto pt-2 text-lg font-black text-gray-900">
                    {formatear(Number(r.price))}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* El kit cierra la ficha de producto con la misma barra de garantías
          del catálogo. Acá se calcula sobre ESTE producto: una ficha digital
          no promete envío, y una física no promete entrega inmediata. */}
      <TrustBar hayFisicos={!esDigital} hayDigitales={esDigital} className="mt-16" />
    </div>
  );
};

export default ProductDetail;

/**
 * Convierte la URL que cargó el dueño en algo que se pueda mostrar dentro
 * de la tienda: YouTube → iframe embed, .mp4/.webm → <video>, otro → nada
 * (Drive/Terabox piden cuenta y no se pueden incrustar sin permiso).
 */
function embedDeVideo(url: string | null): { tipo: 'iframe' | 'video'; src: string } | null {
  if (!url) return null;
  const yt = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/);
  if (yt) return { tipo: 'iframe', src: `https://www.youtube.com/embed/${yt[1]}` };
  if (/\.(mp4|webm|ogg)(\?|$)/i.test(url) || url.startsWith('/videos/')) return { tipo: 'video', src: url };
  return null;
}
