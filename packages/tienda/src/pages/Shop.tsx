import { useState, useEffect, useMemo } from 'react';
import { useStore, Product } from '../store/useStore';
import { Search, Store } from 'lucide-react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import TrustBar from '../components/TrustBar';
import ProductCard from '../components/ProductCard';

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

// El mapa de etiquetas por tipo (TYPE_BADGE) se fue junto con la tarjeta a
// components/ProductCard.tsx: es el único que lo pinta. Dejarlo duplicado acá
// era pedir que las dos copias se contradijeran.

// Exportada porque la lista de deseos (Wishlist.tsx) muestra exactamente la
// misma tarjeta -- duplicarla ahí hacía que el botón "Comprar ahora" y el
// badge de tipo se fueran desincronizando entre las dos pantallas.
// La tarjeta vivía escrita acá adentro. Se movió a components/ProductCard.tsx
// con el look del kit de referencia (fondo lavanda, badge, píldora de
// agregar) y la MISMA lógica de compra: físico al checkout, digital directo
// a la pasarela.
//
// Se sigue reexportando con el mismo nombre porque Wishlist.tsx la importa
// desde este archivo, que es justo el motivo por el que se exportó en su día:
// que las dos pantallas no se fueran desincronizando.
export { ProductCard };

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

  // ¿Esta tienda mezcla las dos cosas?
  //
  // No todas las tiendas del sistema venden de los dos tipos: unas son 100%
  // cursos digitales, otras 100% producto físico. Distinguir "Digital" vs
  // "Físico" solo informa cuando conviven; si no, es una etiqueta repetida en
  // cada tarjeta y cada categoría que no ayuda a decidir y tapa la foto.
  const catalogoMixto = hayFisicos && hayDigitales;

  const [filter, setFilter] = useState('all');

  /**
   * Elegir una categoría además BAJA hasta los resultados.
   *
   * Antes solo cambiaba el filtro: el visitante tocaba "Físico" o una
   * categoría, la lista de abajo se actualizaba, y él seguía viendo el mismo
   * héroe con la pantalla igual que antes. Parecía que el botón no hacía
   * nada, y había que descubrir a mano que la respuesta estaba más abajo.
   *
   * Reportado por el dueño el 2026-08-23: "al darle a productos digitales o
   * físico debería llevarlo al producto, es muy molesto darle scroll".
   *
   * El ancla `#catalogo` ya existía (la usa el botón "Ver productos" del
   * héroe); lo que faltaba era que los filtros la usaran también.
   */
  // Al llegar con #catalogo desde otra página, React Router cambia la ruta
  // pero NO baja: el navegador solo resuelve el hash en una carga completa,
  // no en una navegación de SPA. Sin esto, "Productos" desde la ficha de un
  // producto deja al visitante arriba, que es el mismo problema.
  useEffect(() => {
    if (window.location.hash !== '#catalogo') return;
    // Dos cuadros: uno para que monte la grilla, otro para que el ancla ya
    // tenga su posición definitiva.
    requestAnimationFrame(() =>
      requestAnimationFrame(() =>
        document.getElementById('catalogo')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      )
    );
  }, []);

  const irAlCatalogo = () => {
    // El header es sticky, así que el ancla ya lleva `scroll-mt-24` para no
    // quedar tapada por él.
    document.getElementById('catalogo')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const elegirFiltro = (clave: string) => {
    setFilter(clave);
    // Tras el re-render, para que el ancla ya esté en su posición final.
    requestAnimationFrame(irAlCatalogo);
  };
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
    // Cada categoría se queda con la FOTO del primer producto suyo que tenga
    // una. Es lo que separa este diseño de un tablero de colores: en el kit de
    // referencia cada bloque de categoría es una foto real con el texto
    // encima, no un rectángulo de color con una etiqueta.
    //
    // La imagen sale del catálogo, nunca de un banco de fotos: una tienda que
    // ilustra "Audio" con una foto de stock que no vende se nota, y encima
    // sería mostrar algo que el cliente no puede comprar.
    //
    // Si ninguna producto de la categoría tiene imagen, `image` queda vacío y
    // la tarjeta cae al bloque de color. Preferible a inventar una.
    const counts: Record<string, { key: string; name: string; type: string; count: number; image: string }> = {};
    products.forEach(p => {
      const key = categoryKey(p);
      if (!counts[key]) counts[key] = { key, name: p.category || 'General', type: p.type || 'digital', count: 0, image: '' };
      counts[key].count++;
      if (!counts[key].image && p.image) counts[key].image = p.image;
    });
    return Object.values(counts).sort((a, b) => b.count - a.count);
  }, [products]);

  // El backend solo reconoce "digital" | "physical" en products.kind (ver
  // routes/products.ts: row.kind === "physical" ? "physical" : "digital") --
  // cualquier otro valor cae a "digital" ahí, así que se replica el mismo
  // fallback acá para que el label nunca contradiga lo que el backend hace.
  const typeLabel = (type: string) => type === 'physical' ? 'Físico' : 'Digital';

  // Portada: la que cargó el dueño y, si no, la foto del primer producto que
  // tenga una. Nunca una imagen de stock: se muestra algo que está a la venta.
  const heroImagen = config.heroImage || products.find(p => p.image)?.image || '';

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
          de "una foto con letras encima". Los dos bloques usan el azul y el
          naranja del kit: es el contraste que define su héroe, y el que hace
          que no quede todo del mismo púrpura del encabezado. */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4 mb-4 sm:mb-6">
        <div
          className="lg:col-span-2 relative overflow-hidden rounded-uv-lg bg-[var(--store-blue)] text-white p-6 sm:p-10 min-h-[240px] sm:min-h-[320px] flex flex-col justify-center"
        >
          {/* La foto del negocio, si la cargó, se apoya a la derecha en vez de
              ocupar todo el fondo: en el kit el producto se ve entero sobre el
              bloque de color, no recortado detrás de un velo negro.
              Va con margen y esquinas redondeadas porque el dueño sube lo que
              quiera: un PNG recortado se ve flotando, pero una foto rectangular
              pegada al borde se lee como un pantallazo mal pegado. Con el
              recuadro, las dos opciones se ven intencionales. */}
          {/* Si el dueño no cargó una foto de portada, se usa la de un
              producto real del catálogo. Un héroe sin imagen es un rectángulo
              de color, que es justo lo que hace que la tienda no se vea
              profesional -- y en el kit de referencia el hero SIEMPRE tiene
              producto. Se prefiere una foto que el cliente pueda comprar
              antes que un banco de imágenes. */}
          {heroImagen && (
            <img
              src={heroImagen}
              alt=""
              aria-hidden="true"
              loading="eager"
              onError={(e) => { e.currentTarget.style.display = 'none'; }}
              className="pointer-events-none absolute right-4 sm:right-8 top-1/2 -translate-y-1/2 h-[80%] w-[46%] object-cover object-center rounded-uv shadow-2xl hidden sm:block"
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
            onClick={() => elegirFiltro(categories[0].key)}
            className="group relative overflow-hidden rounded-uv-lg bg-[var(--store-orange)] text-white p-6 sm:p-8 min-h-[160px] sm:min-h-[320px] flex flex-col justify-center text-left"
          >
            {/* La foto de un producto real de la categoría, flotando sobre el
                color como los audífonos del kit. Sin ella el bloque es un
                rectángulo naranja con letras. */}
            {categories[0].image && (
              <img
                src={categories[0].image}
                alt=""
                aria-hidden="true"
                loading="lazy"
                onError={(e) => { e.currentTarget.style.display = 'none'; }}
                className="pointer-events-none absolute -right-6 -top-6 h-40 w-40 rounded-full object-cover opacity-90 shadow-2xl transition-transform duration-500 group-hover:scale-105 sm:h-52 sm:w-52"
              />
            )}
            <p className="relative text-xs font-bold uppercase tracking-[0.2em] opacity-70 mb-2">Lo más surtido</p>
            <h2 className="relative text-2xl sm:text-3xl font-black leading-tight mb-1">{categories[0].name}</h2>
            <p className="relative text-sm opacity-80 mb-6">
              {categories[0].count} producto{categories[0].count === 1 ? '' : 's'} · {typeLabel(categories[0].type)}
            </p>
            <span className="relative inline-flex w-fit items-center gap-2 h-10 px-6 rounded-full bg-white text-gray-900 text-sm font-bold group-hover:-translate-y-0.5 transition-transform">
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
                onClick={() => elegirFiltro('all')}
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
                  onClick={() => elegirFiltro(activa ? 'all' : c.key)}
                  aria-pressed={activa}
                  className={`group relative isolate overflow-hidden rounded-uv p-4 sm:p-6 min-h-[150px] sm:min-h-[210px] flex flex-col justify-end text-left transition-all hover:-translate-y-1 ${
                    c.image
                      ? 'text-white shadow-md'
                      : activa
                        ? 'bg-[var(--store-primary)] text-[var(--store-on-primary)] shadow-md'
                        : 'bg-[var(--store-primary-soft)] text-gray-900 hover:shadow-md'
                  }`}
                >
                  {/* La FOTO de un producto real de la categoría, a sangre.
                      Es lo que hace que el mosaico se lea como una tienda y
                      no como un tablero de colores. */}
                  {c.image && (
                    <>
                      <img
                        src={c.image}
                        alt=""
                        aria-hidden="true"
                        loading="lazy"
                        onError={(e) => { e.currentTarget.style.display = 'none'; }}
                        className="absolute inset-0 -z-20 h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                      />
                      {/* Velo de abajo hacia arriba: sin él, el texto blanco
                          desaparece sobre las fotos claras. Se tiñe del color
                          de marca cuando la categoría está activa, para que se
                          note cuál está filtrando. */}
                      <span
                        aria-hidden="true"
                        className={`absolute inset-0 -z-10 ${
                          activa
                            ? 'bg-[var(--store-primary)]/75'
                            // Oscurece ARRIBA tambien: con el velo solo abajo,
                            // el rotulo de tipo (DIGITAL/FISICO) quedaba
                            // ilegible sobre las fotos claras -- visto en
                            // "General" y "Musica" del catalogo real.
                            : 'bg-gradient-to-t from-black/85 via-black/45 to-black/30'
                        }`}
                      />
                    </>
                  )}

                  {catalogoMixto && (
                    <span className={`text-[10px] font-bold uppercase tracking-wider ${
                      c.image ? 'text-white/85' : activa ? 'opacity-80' : 'text-[var(--store-primary)]'
                    }`}>
                      {typeLabel(c.type)}
                    </span>
                  )}
                  <span className="mb-auto" />
                  <span className="text-base sm:text-xl font-black leading-tight line-clamp-2">{c.name}</span>
                  <span className={`text-xs font-semibold ${
                    c.image ? 'text-white/80' : activa ? 'opacity-80' : 'text-gray-500'
                  }`}>
                    {c.count} producto{c.count === 1 ? '' : 's'}
                  </span>

                  {/* Píldora "Ver" como en el kit: da a entender que el bloque
                      es accionable, que era justo lo que no se leía. */}
                  <span className={`mt-3 inline-flex w-fit items-center rounded-full px-4 py-1.5 text-[11px] font-bold transition-colors ${
                    c.image
                      ? 'bg-white text-[var(--store-ink)] group-hover:bg-[var(--store-yellow)]'
                      : 'bg-[var(--store-primary)] text-white'
                  }`}>
                    {activa ? 'Quitar filtro' : 'Ver productos'}
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
              <ProductCard key={product.id} product={product} slug={slug} mostrarTipo={catalogoMixto} />
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
