import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Heart, Download, Box, ShoppingCart } from 'lucide-react';
import Swal from 'sweetalert2';
import { useStore, Product } from '../store/useStore';
import { useMoneda } from '@/lib/moneda';
import { trackAddToCart, trackInitiateCheckout } from '../lib/pixel';

/**
 * Tarjeta de producto con el look de la maqueta tech: borde suave, foto sobre
 * fondo gris claro, nombre alineado a la izquierda y precio en negrita.
 *
 * ── Lo que la maqueta muestra y acá NO se copia ──────────────────────────
 * Badge "-20%" con precio tachado y estrellas de calificación. Ninguno de
 * los dos existe en el catálogo: `Product` no tiene precio anterior ni
 * valoraciones (ver store/useStore.ts). Inventarlos sería mostrarle al
 * cliente un descuento y unas reseñas que no son ciertas.
 *
 * La lógica de compra no cambia: físico va al checkout (se paga contra
 * entrega) y digital va directo a la pasarela.
 */

const TIPO = {
  digital: { label: 'Digital', icon: Download },
  physical: { label: 'Físico', icon: Box },
} as const;

export default function ProductCard({
  product,
  slug,
  // Solo tiene sentido decir "Digital" o "Físico" cuando la tienda vende LAS
  // DOS cosas. En un catálogo 100% digital, las 54 tarjetas diciendo "Digital"
  // no informan nada: son ruido repetido que además tapa la foto.
  //
  // Por defecto true para no romper a quien la use sin el dato.
  mostrarTipo = true,
  // Qué botones lleva. En la portada la maqueta usa tarjetas sin botón
  // (ofertas) o con solo "Agregar al carrito" (destacados); el catálogo
  // completo conserva "Comprar ahora", que lleva al digital directo a pagar.
  acciones = 'ambas',
}: { product: Product; slug: string; mostrarTipo?: boolean; acciones?: 'ambas' | 'carrito' | 'ninguna' }) {
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
    <div className="group relative flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-3 transition-all duration-200 hover:-translate-y-0.5 hover:border-violet-200 hover:shadow-[0_14px_32px_-16px_rgba(30,27,51,0.28)]">
      {/* La maqueta pone acá un "-20%" rojo con precio tachado. No se copia:
          el catálogo no tiene precio anterior (ver store/useStore.ts), así
          que sería un descuento inventado. Ese lugar muestra el dato REAL
          --digital o físico-- y solo cuando la tienda vende de los dos. */}
      {mostrarTipo && (
        <span className="absolute left-5 top-5 z-10 inline-flex items-center gap-1 rounded-md bg-[var(--tech-violeta)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
          <TipoIcon className="h-3 w-3" />
          {tipo.label}
        </span>
      )}

      <button
        onClick={() => toggleWishlist(product.id)}
        aria-label={enDeseados ? 'Quitar de deseados' : 'Guardar en deseados'}
        className="absolute right-5 top-5 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white text-slate-400 shadow-sm transition-colors hover:text-rose-500"
      >
        <Heart className={`h-4 w-4 ${enDeseados ? 'fill-rose-500 text-rose-500' : ''}`} />
      </button>

      {/* Alto FIJO, no `aspect-square`: el catálogo real trae fotos de
          cualquier proporción y con la cuadrada la grilla salía despareja
          (nombre y precio a distinta altura en la misma fila). */}
      <Link to={detailHref} className="flex h-[150px] w-full items-center justify-center rounded-xl bg-slate-50 p-3 md:h-[180px]" aria-label={`Ver ${product.name}`}>
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
            className="h-full w-full object-contain mix-blend-multiply transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <TipoIcon className="h-10 w-10 text-slate-300" />
        )}
      </Link>

      <div className="flex flex-1 flex-col px-1 pt-3">
        <Link
          to={detailHref}
          className="line-clamp-2 min-h-[2.5rem] text-[13px] font-medium leading-5 text-[var(--tech-tinta)] hover:text-[var(--tech-violeta)]"
        >
          {product.name}
        </Link>

        <p className="mt-1.5 text-[16px] font-extrabold text-[var(--tech-tinta)]">{formatear(product.price)}</p>

        {/* Botones siempre visibles (en el teléfono no hay hover, y por ahí
            entra casi todo el tráfico del bot). */}
        {acciones === 'carrito' && (
          <button
            onClick={agregar}
            className="mt-3 flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-slate-200 text-[12px] font-semibold text-[var(--tech-tinta)] transition-colors hover:border-[var(--tech-violeta)] hover:bg-[var(--tech-violeta)] hover:text-white"
          >
            <ShoppingCart className="h-3.5 w-3.5" /> Agregar al carrito
          </button>
        )}
        {acciones === 'ambas' && (
          <div className="mt-3 flex gap-2">
            <button
              onClick={comprarAhora}
              disabled={buying}
              className="h-9 flex-1 rounded-lg bg-[var(--tech-violeta)] text-[12px] font-bold text-white transition-colors hover:bg-[var(--tech-violeta-hover)] disabled:opacity-50"
            >
              {buying ? 'Abriendo pago…' : 'Comprar ahora'}
            </button>
            <button
              onClick={agregar}
              aria-label="Agregar al carrito"
              title="Agregar al carrito"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-[var(--tech-tinta)] transition-colors hover:border-[var(--tech-violeta)] hover:text-[var(--tech-violeta)]"
            >
              <ShoppingCart className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
