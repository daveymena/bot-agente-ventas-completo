import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Heart, Download, Box } from 'lucide-react';
import Swal from 'sweetalert2';
import { useStore, Product } from '../store/useStore';
import { useMoneda } from '@/lib/moneda';
import { trackAddToCart, trackInitiateCheckout } from '../lib/pixel';

/**
 * Tarjeta de producto con el look del kit de referencia (URBANisty).
 *
 * Lo característico del kit: la tarjeta ENTERA va sobre lavanda (#EBEFFC), el
 * producto flota sin marco, y abajo van el nombre centrado, el precio y una
 * píldora púrpura de "agregar". Nada de bordes ni sombras duras.
 *
 * ── Dos datos del kit que NO se copian, a propósito ──────────────────────
 * El diseño muestra un badge "Sale!" con precio tachado y estrellas de
 * reseñas. Ninguno de los dos existe en el catálogo real: `Product` no tiene
 * precio anterior ni valoraciones (ver store/useStore.ts). Inventarlos sería
 * ponerle al cliente un descuento y unas reseñas que no son ciertas.
 *
 * En su lugar, ese espacio muestra el dato REAL que la tienda sí tiene y que
 * al comprador le importa: si el producto es digital (lo recibe al instante)
 * o físico (se lo envían). Las estrellas quedan vacías, igual que en el
 * propio kit para los productos sin reseñas.
 *
 * La lógica de compra se conserva tal cual estaba en Shop.tsx: físico va al
 * checkout (se paga contra entrega) y digital va directo a la pasarela.
 */

const TIPO = {
  digital: { label: 'Digital', icon: Download },
  physical: { label: 'Físico', icon: Box },
} as const;

function Estrellas() {
  // Vacías: no hay reseñas de verdad. El kit las dibuja igual en sus
  // productos sin valorar, así que la maqueta no se rompe.
  return (
    <div className="flex items-center justify-center gap-0.5" aria-hidden="true">
      {[0, 1, 2, 3, 4].map((i) => (
        <svg key={i} viewBox="0 0 20 20" className="w-3 h-3 fill-uv-grey">
          <path d="M10 1.5l2.6 5.3 5.9.9-4.2 4.1 1 5.8-5.3-2.8-5.3 2.8 1-5.8L1.5 7.7l5.9-.9L10 1.5z" />
        </svg>
      ))}
    </div>
  );
}

export default function ProductCard({ product, slug }: { product: Product; slug: string }) {
  const { formatear } = useMoneda();
  const { addToCart, wishlist, toggleWishlist } = useStore();
  const navigate = useNavigate();
  const [imgError, setImgError] = useState(false);
  const [buying, setBuying] = useState(false);

  const detailHref = `/tienda/${slug}/producto/${product.id}`;
  const tipo = TIPO[product.type as keyof typeof TIPO] || TIPO.digital;
  const TipoIcon = tipo.icon;
  const enDeseados = wishlist.includes(product.id);

  // Físico: se paga contra entrega, así que va al checkout donde se piden
  // dirección y cédula. Digital: directo a la pasarela.
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

  const agregar = () => {
    addToCart(product);
    trackAddToCart({ id: product.id, name: product.name, price: product.price });
    Swal.fire({
      toast: true,
      position: 'bottom-end',
      icon: 'success',
      title: `${product.name} al carrito`,
      showConfirmButton: false,
      timer: 1800,
      timerProgressBar: true,
    });
  };

  return (
    <div className="group relative flex flex-col rounded-2xl bg-uv-lav p-4 transition-transform duration-300 hover:-translate-y-1">
      {/* Badge: en el kit dice "Sale!". Acá dice lo que es cierto. */}
      <span className="absolute top-3 right-3 z-10 inline-flex items-center gap-1 rounded-full bg-brand-600 px-2.5 py-1 text-[10px] font-medium text-white">
        <TipoIcon className="h-3 w-3" />
        {tipo.label}
      </span>

      <Link
        to={detailHref}
        className="block aspect-square w-full"
        aria-label={`Ver ${product.name}`}
      >
        {product.image && !imgError ? (
          <img
            src={product.image}
            alt={product.name}
            loading="lazy"
            onError={(e) => {
              const target = e.currentTarget;
              if (!target.src.includes(`/images/products/${product.id}.jpg`)) {
                target.src = `/images/products/${product.id}.jpg`;
              } else {
                setImgError(true);
              }
            }}
            className="h-full w-full object-contain transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <TipoIcon className="h-10 w-10 text-uv-grey" />
          </div>
        )}
      </Link>

      <div className="mt-3 flex flex-1 flex-col items-center text-center">
        <Link
          to={detailHref}
          className="line-clamp-2 text-sm font-medium text-uv-ink hover:text-brand-600"
        >
          {product.name}
        </Link>

        <div className="mt-1.5">
          <Estrellas />
        </div>

        <p className="mt-1.5 text-sm font-bold text-uv-ink">{formatear(product.price)}</p>

        <div className="mt-3 flex w-full items-center justify-center gap-2">
          <button
            onClick={() => toggleWishlist(product.id)}
            aria-label={enDeseados ? 'Quitar de deseados' : 'Guardar en deseados'}
            className="shrink-0 rounded-full p-1.5 text-uv-text transition-colors hover:text-brand-600"
          >
            <Heart className={`h-4 w-4 ${enDeseados ? 'fill-brand-600 text-brand-600' : ''}`} />
          </button>

          <button
            onClick={agregar}
            className="rounded-full bg-brand-600 px-5 py-2 text-xs font-medium text-white transition-colors hover:bg-brand-700"
          >
            Agregar
          </button>
        </div>

        <button
          onClick={comprarAhora}
          disabled={buying}
          className="mt-2 text-[11px] font-medium text-brand-600 underline-offset-2 hover:underline disabled:opacity-50"
        >
          {buying ? 'Abriendo pago…' : 'Comprar ahora'}
        </button>
      </div>
    </div>
  );
}
