import { useState, useEffect, useMemo } from 'react';
import { useStore, Product } from '../store/useStore';
import { Search, Store } from 'lucide-react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import ProductCard from '../components/ProductCard';
import Portada, { TituloDeSeccion } from '../components/market/Portada';

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
  const categoriaDeLaUrl = searchParams.get('cat') || '';

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

  const [filter, setFilter] = useState(categoriaDeLaUrl || 'all');

  // El encabezado navega con ?q= y ?cat=, así que el catálogo tiene que
  // reaccionar a la URL y no solo a su estado interno. Sin esto, buscar desde
  // el encabezado cambia la barra de direcciones y la grilla no se mueve --
  // que se lee como que el buscador está roto.
  useEffect(() => {
    setFilter(categoriaDeLaUrl || 'all');
    setSearchTerm(searchQuery);
  }, [categoriaDeLaUrl, searchQuery]);

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
    const lista = Object.values(counts);
    // Misma categoría en digital y en físico (p. ej. dos "General"): se
    // distinguen en el rótulo, si no el cliente ve dos entradas iguales.
    const porNombre: Record<string, number> = {};
    lista.forEach(c => { porNombre[c.name.toLowerCase()] = (porNombre[c.name.toLowerCase()] || 0) + 1; });
    lista.forEach(c => { if (porNombre[c.name.toLowerCase()] > 1) c.name = `${c.name} (${c.type === 'physical' ? 'físico' : 'digital'})`; });
    return lista.sort((a, b) => b.count - a.count);
  }, [products]);


  // Portada: la que cargó el dueño y, si no, la foto del primer producto que
  // tenga una. Nunca una imagen de stock: se muestra algo que está a la venta.
  // Las de relleno NO cuentan. `placeholderBanner()` devuelve un SVG en un
  // data: URI, y el config por defecto trae uno con el texto "Tu tienda": sin
  // este filtro, el banner de apertura mostraba un rectángulo verde con una
  // "T" gigante encima del nombre del negocio. Un relleno sirve como hueco a
  // completar en el editor, no como portada de una tienda que está vendiendo.
  const esRelleno = (u: string) => u.startsWith('data:image/svg');
  const heroImagen = [config.heroImage, products.find(p => p.image)?.image]
    .find((u): u is string => !!u && !esRelleno(u)) || '';


  const [visibleCount, setVisibleCount] = useState(12);

  useEffect(() => { setVisibleCount(12); }, [filter, searchTerm]);

  const displayedProducts = filteredProducts.slice(0, visibleCount);

  return (
    <div className="max-w-6xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-8 pb-24 md:pb-8">
      {/* ── PORTADA ────────────────────────────────────────────────────
          La fila de apertura de Market --columna de categorías, banner grande,
          dos banners chicos-- más la tira de garantías.

          Reemplaza al héroe de dos bloques del kit anterior, al buscador
          suelto (ahora vive en el encabezado, o sea en todas las páginas) y al
          mosaico de ocho categorías con foto. El mosaico no se pierde: sus
          categorías son las mismas y con los mismos conteos reales, pero ya no
          empujan el catálogo fuera de la pantalla -- en Market la lista de
          categorías es una columna angosta al costado, y el producto se ve
          desde el primer scroll. */}
      <Portada
        storeName={config.storeName || 'Tienda'}
        heroImagen={heroImagen}
        categorias={categories}
        hayFisicos={hayFisicos}
        hayDigitales={hayDigitales}
        totalProductos={products.length}
        onCategoria={elegirFiltro}
        onVerCatalogo={irAlCatalogo}
      />

      {/* ── CATÁLOGO ──────────────────────────────────────────────────────
          El ancla que usa el botón "Ver productos" del héroe. */}
      <div id="catalogo" className="scroll-mt-28">
        <TituloDeSeccion
          titulo={filter === 'all' ? 'Todos los productos' : categories.find(c => c.key === filter)?.name || 'Productos'}
          derecha={
            <span className="text-[12px] text-[var(--mk-muted)]">
              Mostrando <strong className="text-[var(--mk-ink)]">{displayedProducts.length}</strong> de{' '}
              <strong className="text-[var(--mk-ink)]">{filteredProducts.length}</strong>
              {filter !== 'all' && (
                <button
                  onClick={() => elegirFiltro('all')}
                  className="ml-3 text-[var(--store-primary)] font-semibold hover:underline"
                >
                  Quitar filtro
                </button>
              )}
            </span>
          }
        />
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
