import { CreditCard, Download, Headphones, ShieldCheck, Truck } from 'lucide-react';

/**
 * ============================================================
 * LA PORTADA DE MARKET
 * ============================================================
 *
 * La fila que abre la plantilla: columna de categorías a la izquierda, banner
 * grande al centro y dos banners chicos apilados a la derecha. Debajo, la tira
 * de garantías con separadores.
 *
 * ── Por qué la columna de categorías, y no un carrusel ───────────────────
 *
 * Es lo que distingue una mega-tienda de una landing. El visitante que llega
 * buscando algo concreto ve TODO lo que hay sin desplazarse ni adivinar; el que
 * llega a mirar, se lleva la idea de que el catálogo es grande. La portada
 * anterior mostraba tres categorías inventadas ("Digital Pro", "Equipamiento",
 * "Gadgets") con conteos falsos --24, 150+, 89-- que no salían de ningún lado.
 * Acá salen todas del catálogo real, con su número real.
 *
 * ── Los banners y la honestidad ──────────────────────────────────────────
 *
 * Market llena estos huecos con "MEGA SALE 50% OFF" y "Envío gratis". Este
 * sistema no puede: no hay campo de descuento en el catálogo ni promesa de
 * envío gratis configurable, así que un cartel de rebaja sería mentira impresa
 * en la portada, y de las que generan reclamos y contracargos.
 *
 * Los banners muestran lo que la tienda SÍ tiene: sus categorías con más
 * productos, con la foto de un producto de verdad. Cuando el negocio no tiene
 * ni eso cargado, el bloque no se dibuja -- un banner vacío se ve peor que
 * ninguno.
 */

export interface CategoriaPortada {
  key: string;
  name: string;
  type: string;
  count: number;
  image: string;
}

interface Props {
  storeName: string;
  heroImagen: string;
  categorias: CategoriaPortada[];
  hayFisicos: boolean;
  hayDigitales: boolean;
  totalProductos: number;
  onCategoria: (key: string) => void;
  onVerCatalogo: () => void;
}

export default function Portada({
  storeName, heroImagen, categorias, hayFisicos, hayDigitales,
  totalProductos, onCategoria, onVerCatalogo,
}: Props) {
  const principales = categorias.slice(0, 2);

  return (
    <>
      {/* ── FILA DE APERTURA ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-5 mb-6">
        {/* Columna de categorías: en Market va pegada al bloque naranja del
            menú, así que arranca justo debajo y comparte su ancho. */}
        {categorias.length > 0 && (
          <aside className="hidden lg:block border border-[var(--mk-border)] bg-white">
            <p className="px-5 h-11 flex items-center text-[12px] font-bold uppercase tracking-wide text-[var(--mk-ink)] border-b border-[var(--mk-border)] bg-[var(--mk-panel)]">
              Categorías
            </p>
            <div className="max-h-[420px] overflow-y-auto">
              {categorias.map((c) => (
                <button
                  key={c.key}
                  onClick={() => onCategoria(c.key)}
                  className="w-full flex items-center justify-between px-5 py-2.5 text-[13px] text-[var(--mk-ink)] hover:bg-[var(--mk-panel)] hover:text-[var(--store-primary)] transition-colors border-b border-[var(--mk-border)] last:border-0 text-left"
                >
                  <span className="truncate">{c.name}</span>
                  <span className="text-[11px] text-[var(--mk-muted)] shrink-0 ml-2">{c.count}</span>
                </button>
              ))}
            </div>
          </aside>
        )}

        <div className="grid grid-cols-1 md:grid-cols-[1fr_260px] gap-5">
          {/* Banner principal. La foto de portada del negocio y, si no la
              cargó, la de un producto real: nunca una imagen de banco. Se
              muestra algo que el visitante puede comprar. */}
          <div className="relative overflow-hidden bg-[var(--mk-nav)] text-white min-h-[240px] md:min-h-[300px] flex items-center">
            {heroImagen && (
              <img
                src={heroImagen}
                alt=""
                aria-hidden="true"
                loading="eager"
                onError={(e) => { e.currentTarget.style.display = 'none'; }}
                className="absolute right-0 top-0 hidden h-full w-1/2 object-cover md:block"
              />
            )}
            {/* Velo de izquierda a derecha. Sin él el texto era ilegible: la
                foto de respaldo es un producto del catálogo, y acá casi todos
                son flyers cargados de texto y colores. Poner la imagen de fondo
                a media opacidad --el primer intento-- ensuciaba las dos cosas:
                no se leía el título ni se entendía la foto. Con la foto a la
                derecha y el velo encima, cada una tiene su mitad. */}
            {heroImagen && (
              <span
                aria-hidden="true"
                className="absolute inset-0 z-[5] hidden md:block bg-gradient-to-r from-[var(--mk-nav)] via-[var(--mk-nav)] to-transparent"
                style={{ backgroundImage: 'linear-gradient(to right, var(--mk-nav) 0%, var(--mk-nav) 45%, transparent 85%)' }}
              />
            )}
            <div className="relative z-10 px-6 md:px-10 py-8 max-w-lg">
              <p className="inline-block text-[11px] font-bold uppercase tracking-[0.25em] text-white/70 mb-3">
                {totalProductos} producto{totalProductos === 1 ? '' : 's'} disponibles
              </p>
              <h1 className="text-2xl md:text-[34px] font-black leading-[1.1] tracking-tight mb-4">
                {storeName}
              </h1>
              <p className="text-sm md:text-base text-white/85 mb-7 leading-relaxed">
                {hayFisicos && hayDigitales
                  ? 'Productos físicos y digitales, en un solo lugar.'
                  : hayFisicos
                    ? 'Productos seleccionados, con envío a tu puerta.'
                    : 'Acceso inmediato, sin esperas ni envíos.'}
              </p>
              <button
                onClick={onVerCatalogo}
                className="inline-flex items-center h-11 px-8 bg-[var(--store-primary)] text-[var(--store-on-primary)] text-[13px] font-bold uppercase tracking-wide hover:bg-[var(--store-primary-hover)] transition-colors"
              >
                Ver catálogo
              </button>
            </div>
          </div>

          {/* Los dos banners chicos apilados. Categorías reales, no rebajas
              inventadas (ver la nota de arriba). */}
          {principales.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-1 gap-5">
              {principales.map((c, i) => (
                <button
                  key={c.key}
                  onClick={() => onCategoria(c.key)}
                  className="group relative overflow-hidden min-h-[120px] md:min-h-[142px] flex flex-col justify-center text-left px-5 py-4 text-white"
                  style={{ backgroundColor: i === 0 ? 'var(--store-primary)' : 'var(--mk-nav)' }}
                >
                  {c.image && (
                    <img
                      src={c.image}
                      alt=""
                      aria-hidden="true"
                      loading="lazy"
                      onError={(e) => { e.currentTarget.style.display = 'none'; }}
                      className="absolute -right-4 -bottom-4 h-24 w-24 md:h-28 md:w-28 object-cover opacity-80 transition-transform duration-500 group-hover:scale-110"
                    />
                  )}
                  <span className="relative text-[10px] font-bold uppercase tracking-[0.2em] opacity-75 mb-1">
                    {i === 0 ? 'Lo más surtido' : 'También te puede servir'}
                  </span>
                  <span className="relative text-lg md:text-xl font-black leading-tight line-clamp-2">{c.name}</span>
                  <span className="relative text-[11px] opacity-80 mt-0.5">
                    {c.count} producto{c.count === 1 ? '' : 's'}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── TIRA DE GARANTÍAS ────────────────────────────────────────────
          Con separadores verticales, como en la plantilla. Cada celda dice
          algo CIERTO para esta tienda: la de envío solo aparece si vende algo
          que se envíe, y la de descarga inmediata solo si vende digital. Un
          catálogo 100% digital prometiendo "envío gratis" es exactamente el
          tipo de detalle que hace que una tienda se lea como plantilla sin
          terminar -- y encima genera el reclamo. */}
      <div className="grid grid-cols-2 lg:grid-cols-4 border border-[var(--mk-border)] bg-white mb-8">
        {[
          hayFisicos
            ? { icon: Truck, titulo: 'Envío a domicilio', bajada: 'Coordinamos la entrega con vos' }
            : { icon: Download, titulo: 'Entrega inmediata', bajada: 'Lo recibís apenas se confirma el pago' },
          { icon: ShieldCheck, titulo: 'Pago verificado', bajada: 'Confirmamos antes de entregar' },
          { icon: CreditCard, titulo: 'Varios medios de pago', bajada: 'Elegí el que te quede cómodo' },
          { icon: Headphones, titulo: 'Te atendemos por WhatsApp', bajada: 'Preguntá lo que necesites' },
        ].map((f, i) => (
          <div
            key={i}
            className="flex items-center gap-3 px-4 py-5 border-[var(--mk-border)] [&:not(:nth-child(2n))]:border-r lg:[&:not(:last-child)]:border-r [&:nth-child(-n+2)]:border-b lg:[&:nth-child(-n+2)]:border-b-0"
          >
            <f.icon className="w-7 h-7 shrink-0 text-[var(--store-primary)]" strokeWidth={1.5} />
            <div className="min-w-0">
              <p className="text-[13px] font-bold text-[var(--mk-ink)] leading-tight">{f.titulo}</p>
              <p className="text-[11px] text-[var(--mk-muted)] leading-tight mt-0.5">{f.bajada}</p>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

/**
 * El encabezado de sección de Market: título a la izquierda con una barra de
 * color debajo, y el enlace de "ver todo" a la derecha, sobre una línea que
 * cruza el ancho. Se exporta acá para que el catálogo y los destacados usen
 * exactamente el mismo, en vez de que cada bloque invente el suyo.
 */
export function TituloDeSeccion({
  titulo, derecha,
}: { titulo: string; derecha?: React.ReactNode }) {
  return (
    <div className="flex items-end justify-between border-b-2 border-[var(--mk-border)] mb-5">
      <h2 className="relative text-[17px] md:text-xl font-black uppercase tracking-wide text-[var(--mk-ink)] pb-3 after:absolute after:left-0 after:-bottom-0.5 after:h-0.5 after:w-full after:bg-[var(--store-primary)]">
        {titulo}
      </h2>
      {derecha && <div className="pb-2">{derecha}</div>}
    </div>
  );
}
