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
        <svg key={i} viewBox="0 0 20 20" className="w-3 h-3 fill-[var(--mk-border)]">
          <path d="M10 1.5l2.6 5.3 5.9.9-4.2 4.1 1 5.8-5.3-2.8-5.3 2.8 1-5.8L1.5 7.7l5.9-.9L10 1.5z" />
        </svg>
      ))}
    </div>
  );
}

export default function ProductCard({
  product,
  slug,
  // Solo tiene sentido decir "Digital" o "Físico" cuando la tienda vende LAS
  // DOS cosas. En un catálogo 100% digital, las 54 tarjetas diciendo "Digital"
  // no informan nada: son ruido repetido que además tapa la foto.
  //
  // Por defecto true para no romper a quien la use sin el dato.
  mostrarTipo = true,
}: { product: Product; slug: string; mostrarTipo?: boolean }) {
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
    <div className="group relative flex flex-col border border-[var(--mk-border)] bg-white transition-all duration-200 hover:border-[var(--store-primary)] hover:shadow-[0_6px_20px_rgba(0,0,0,0.10)]">
      {/* Market pone acá un globo rojo de "Sale!" con el precio anterior
          tachado. No se copia, y no por descuido: el catálogo no tiene campo
          de precio anterior (ver store/useStore.ts), así que cada "Sale!"
          sería un descuento inventado impreso en la tienda. Ese espacio lo usa
          el dato REAL que sí cambia la decisión de compra --si lo recibe al
          instante o se lo envían-- y solo cuando la tienda vende de los dos
          tipos; si no, es una etiqueta repetida que solo tapa la foto. */}
      {mostrarTipo && (
        <span className="absolute top-0 left-0 z-10 inline-flex items-center gap-1 bg-[var(--store-primary)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-[var(--store-on-primary)]">
          <TipoIcon className="h-3 w-3" />
          {tipo.label}
        </span>
      )}

      <button
        onClick={() => toggleWishlist(product.id)}
        aria-label={enDeseados ? 'Quitar de deseados' : 'Guardar en deseados'}
        className="absolute top-2 right-2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-[var(--mk-muted)] transition-colors hover:text-[var(--store-primary)]"
      >
        <Heart className={`h-4 w-4 ${enDeseados ? 'fill-[var(--store-primary)] text-[var(--store-primary)]' : ''}`} />
      </button>

      {/* ── Alto FIJO, no `aspect-square` ─────────────────────────────────
          Con la proporción cuadrada, la grilla real salía despareja: la foto
          vertical de un curso empujaba su tarjeta 90px más abajo que la
          horizontal de al lado, y las cuatro de la fila terminaban con el
          nombre y el precio a distinta altura. Market usa un recuadro de alto
          fijo justamente por eso -- el catálogo de un negocio real trae fotos
          de cualquier proporción y la grilla tiene que absorberlas. */}
      <Link to={detailHref} className="block h-[190px] w-full p-4 md:h-[215px]" aria-label={`Ver ${product.name}`}>
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
            <TipoIcon className="h-10 w-10 text-[var(--mk-border)]" />
          </div>
        )}
      </Link>

      <div className="flex flex-1 flex-col border-t border-[var(--mk-border)] px-4 py-3 text-center">
        <Link
          to={detailHref}
          className="line-clamp-2 h-[2.4rem] overflow-hidden text-[13px] leading-[1.2rem] text-[var(--mk-ink)] hover:text-[var(--store-primary)]"
        >
          {product.name}
        </Link>

        <div className="mt-2">
          <Estrellas />
        </div>

        <p className="mt-2 text-[17px] font-black text-[var(--store-primary)]">{formatear(product.price)}</p>

        {/* Market revela estos botones al pasar el mouse. Se descartó: como el
            hover solo cambia la OPACIDAD, el espacio queda reservado igual y
            dejaba una banda muerta debajo de cada precio (visto en la captura
            de las 84 fichas). Y en el teléfono no hay hover, que es por donde
            entra casi todo el tráfico del bot. Van siempre visibles. */}
        <div className="mt-3 flex flex-col gap-1.5">
          <button
            onClick={agregar}
            className="h-9 w-full bg-[var(--store-primary)] text-[11px] font-bold uppercase tracking-wide text-[var(--store-on-primary)] transition-colors hover:bg-[var(--store-primary-hover)]"
          >
            Agregar al carrito
          </button>
          <button
            onClick={comprarAhora}
            disabled={buying}
            className="h-8 w-full border border-[var(--mk-border)] text-[11px] font-semibold text-[var(--mk-ink)] transition-colors hover:border-[var(--store-primary)] hover:text-[var(--store-primary)] disabled:opacity-50"
          >
            {buying ? 'Abriendo pago…' : 'Comprar ahora'}
          </button>
        </div>
      </div>
    </div>
  );
}
