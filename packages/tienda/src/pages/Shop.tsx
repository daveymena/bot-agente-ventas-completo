import { useState, useEffect, useMemo } from 'react';
import { useStore, Product } from '../store/useStore';
import { Search, Store } from 'lucide-react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import ProductCard from '../components/ProductCard';
import Portada from '../components/market/Portada';
import {
  HeroTech, BarraConfianza, CirculosCategorias, OfertasSemana, PromosDobles,
  DestacadosTech, BandaConfianza, CategoriasDestacadas, OfertaEspecial,
  VistosRecientes, MarcasTop, NovedadesWhatsApp, TituloTech, Pestanas,
  marcasDelCatalogo, esCategoriaGenerica,
} from '../components/tech/SeccionesTech';
import {
  DEPARTAMENTOS, ORDEN_DEPARTAMENTOS, departamentoDe, esDepartamento, type Departamento,
} from '../lib/departamentos';

interface ApiProduct {
  id: number;
  name: string;
  description: string;
  price: string;
  image: string | null;
  category: string;
  kind: string;
  highlight: string | null;
  /** digital | dropshipping | fisico | servicio (ver lib/taxonomia.ts del servidor). */
  linea?: string;
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

const sinTildes = (t: string) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const Shop = () => {
  const { config, updateConfig, products: localProducts } = useStore();
  const { slug: paramSlug } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const DEFAULT_SLUG = 'sofia-premium';
  const slug = paramSlug || DEFAULT_SLUG;
  const searchQuery = searchParams.get('q') || '';
  const categoriaDeLaUrl = searchParams.get('cat') || '';
  const depDeLaUrl = searchParams.get('dep');

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
        resaltado: p.highlight || '',
      }))
    : localProducts.map(p => ({ ...p, resaltado: '' }));

  // Qué vende REALMENTE esta tienda, para no prometer envíos que no existen
  // ni entrega digital de algo que se manda por correo (ver el hero abajo).
  const hayFisicos = products.some(p => p.type === 'physical');
  const hayDigitales = products.some(p => p.type !== 'physical');

  // Ya no hace falta la etiqueta "Digital"/"Físico" en cada tarjeta: cada
  // departamento tiene su propia vitrina y nunca se mezclan (ver
  // lib/departamentos.ts), así que la tarjeta ya está en su lugar.
  const mostrarTipo = false;

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

  // ── Departamentos: físicos, digitales y servicios nunca se mezclan ────────
  const deptosPresentes = ORDEN_DEPARTAMENTOS.filter(d => products.some(p => departamentoDe(p.type) === d));
  const conteoPorDep: Partial<Record<Departamento, number>> = Object.fromEntries(
    deptosPresentes.map(d => [d, products.filter(p => departamentoDe(p.type) === d).length]),
  );
  const [departamento, setDepartamento] = useState<Departamento | null>(esDepartamento(depDeLaUrl) ? depDeLaUrl : null);
  useEffect(() => {
    if (!esDepartamento(depDeLaUrl)) return;
    setDepartamento(depDeLaUrl);
    requestAnimationFrame(() => document.getElementById('catalogo')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }, [depDeLaUrl]);
  // El que manda en el catálogo: el de la categoría elegida; si no, el de la
  // pestaña; si no, el primero. Buscando no hay uno solo: los resultados se
  // muestran agrupados por departamento (null).
  const depDelFiltro = filter !== 'all' ? departamentoDe(categories.find(c => c.key === filter)?.type) : null;
  const depActivo: Departamento | null = depDelFiltro
    || (searchTerm ? null : (departamento && deptosPresentes.includes(departamento) ? departamento : deptosPresentes[0] || null));

  const filteredProducts = products.filter(p => {
    const matchesFilter = filter === 'all' || categoryKey(p) === filter;
    const matchesDep = !depActivo || departamentoDe(p.type) === depActivo;
    // Sin tildes: "camara" tiene que encontrar "Cámara" (antes encontraba 1
    // de las 3 cámaras del catálogo).
    const matchesSearch = sinTildes(p.name).includes(sinTildes(searchTerm)) ||
      (!!p.category && sinTildes(p.category).includes(sinTildes(searchTerm)));
    return matchesFilter && matchesDep && matchesSearch;
  });


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


  // 20: llena filas completas con 2, 4 y 5 columnas (con 12 quedaban dos
  // tarjetas sueltas en la última fila de escritorio).
  const [visibleCount, setVisibleCount] = useState(20);

  useEffect(() => { setVisibleCount(20); }, [filter, searchTerm, depActivo]);

  const displayedProducts = filteredProducts.slice(0, visibleCount);

  // ── Portada tech: secciones armadas con datos reales ────────────────────
  type ConResaltado = (typeof products[number]) & { resaltado?: string };
  const todos = products as ConResaltado[];
  const conFoto = (p: ConResaltado) => !!p.image;
  // Primero lo que tiene foto: una tarjeta vacía en la vidriera se lee como
  // tienda sin terminar.
  const vitrina = [...todos.filter(conFoto), ...todos.filter(p => !conFoto(p))];
  const delDep = (d: Departamento) => vitrina.filter(p => departamentoDe(p.type) === d);
  // El departamento principal arma el hero, las ofertas y los destacados; los
  // demás tienen cada uno su carrusel propio más abajo. Nunca se mezclan.
  const [primario, ...secundarios] = deptosPresentes;
  const vitrinaPrincipal = primario ? delDep(primario) : vitrina;
  const conResaltado = vitrinaPrincipal.filter(p => (p.resaltado || '').trim());
  const ofertas = (conResaltado.length ? conResaltado : vitrinaPrincipal).slice(0, 8);
  const idsOfertas = new Set(ofertas.map(p => p.id));
  const destacados = vitrinaPrincipal.filter(p => !idsOfertas.has(p.id)).slice(0, 10);
  const principalConFoto = vitrinaPrincipal.filter(conFoto);
  const productoHero = principalConFoto[0] || todos.find(conFoto);
  // La oferta especial es OTRO producto del mismo departamento.
  const ofertaEspecial = conResaltado.find(conFoto) || principalConFoto.find(p => p.id !== productoHero?.id);
  const categoriasPrincipales = primario ? categories.filter(c => departamentoDe(c.type) === primario) : categories;
  // Los dos banners: con dos departamentos, uno de cada uno (la mejor
  // categoría con foto de cada lado); con uno solo, sus dos mejores. Nunca
  // "Todo en General", que no vende nada.
  const mejorCategoria = (d: Departamento) => {
    const suyas = categories.filter(c => departamentoDe(c.type) === d && c.image);
    return suyas.find(c => !esCategoriaGenerica(c.name)) || suyas[0];
  };
  const catsPromo = deptosPresentes.length >= 2
    ? deptosPresentes.slice(0, 2).map(mejorCategoria).filter((c): c is NonNullable<typeof c> => !!c)
    : (() => { const conFotoCat = categoriasPrincipales.filter(c => c.image && !esCategoriaGenerica(c.name)); return (conFotoCat.length >= 2 ? conFotoCat : categoriasPrincipales.filter(c => c.image)).slice(0, 2); })();
  const promos = catsPromo.map(c => ({
    key: c.key,
    titulo: `Todo en ${c.name}`,
    bajada: deptosPresentes.length >= 2
      ? `${DEPARTAMENTOS[departamentoDe(c.type)].nombre} · ${c.count}`
      : `${c.count} ${c.count === 1 ? 'producto' : 'productos'}`,
    imagen: c.image,
  }));
  const marcas = marcasDelCatalogo(todos);
  // Sello del hero: propuesta de valor real (sin % inventados: el catálogo
  // no trae precio anterior, así que no hay "40% OFF" que mostrar).
  const sello = hayFisicos && !hayDigitales ? 'Pago contra entrega' : 'Nuevos ingresos';
  const esPortada = !loading && !apiError && products.length > 0 && filter === 'all' && !searchTerm;

  return (
    <div className="mx-auto max-w-[1280px] bg-white px-4 py-4 pb-24 sm:px-6 sm:py-6 md:pb-10 lg:px-8">
      {/* ── PORTADA TECH ───────────────────────────────────────────────
          Una sola columna a lo ancho, en el orden de la maqueta (ver
          components/tech/SeccionesTech.tsx). Solo datos reales del
          catálogo: lo que no tiene dato, no se dibuja. */}
      {esPortada && (
        <>
          <HeroTech
            storeName={config.storeName || 'Tienda'}
            categorias={categories}
            productoHero={productoHero}
            sello={sello}
            onCategoria={elegirFiltro}
            onVerCatalogo={irAlCatalogo}
          />
          <BarraConfianza hayFisicos={hayFisicos} />
          <CirculosCategorias categorias={categoriasPrincipales} onCategoria={elegirFiltro} />
          <OfertasSemana
            productos={ofertas}
            slug={slug}
            mostrarTipo={mostrarTipo}
            onVerTodo={() => { if (primario) setDepartamento(primario); requestAnimationFrame(irAlCatalogo); }}
            eyebrow={primario && deptosPresentes.length > 1 ? DEPARTAMENTOS[primario].nombre : 'Lo más nuevo'}
          />
          <PromosDobles promos={promos} onCategoria={elegirFiltro} />
          <DestacadosTech productos={destacados} slug={slug} mostrarTipo={mostrarTipo} />
          {/* Cada departamento secundario, en su propio carrusel. */}
          {secundarios.map(d => (
            <DestacadosTech
              key={d}
              id={`dep-${d}`}
              productos={delDep(d).slice(0, 10)}
              slug={slug}
              mostrarTipo={mostrarTipo}
              eyebrow={d === 'digital' ? 'Aprende desde casa' : 'Agenda'}
              titulo={DEPARTAMENTOS[d].nombre}
              bajada={DEPARTAMENTOS[d].bajada}
            />
          ))}
          <BandaConfianza hayFisicos={hayFisicos} />
          <CategoriasDestacadas categorias={categories} onCategoria={elegirFiltro} />
          <OfertaEspecial producto={ofertaEspecial} slug={slug} />
          <VistosRecientes productos={todos} slug={slug} />
          <MarcasTop marcas={marcas} />
        </>
      )}

      {/* ── PORTADA CLÁSICA (respaldo) ─────────────────────────────────
          Cuando se está filtrando/buscando, o mientras carga, o si la tienda
          no tiene productos: se muestra la portada anterior, que ya funciona. */}
      {(loading || apiError || products.length === 0 || filter !== 'all' || !!searchTerm) && (
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
      )}

      {/* ── CATÁLOGO ──────────────────────────────────────────────────────
          El ancla que usa el botón "Ver productos" del héroe. */}
      <div id="catalogo" className={`scroll-mt-32 ${esPortada ? 'mt-14' : ''}`}>
        <TituloTech
          eyebrow={depActivo && deptosPresentes.length > 1 ? DEPARTAMENTOS[depActivo].nombre : 'Catálogo'}
          titulo={
            filter !== 'all' ? categories.find(c => c.key === filter)?.name || 'Productos'
              : searchTerm ? `Resultados para “${searchTerm}”`
                : depActivo && deptosPresentes.length > 1 ? DEPARTAMENTOS[depActivo].nombre
                  : 'Todos los productos'
          }
          accion={filter === 'all' && !searchTerm && depActivo && deptosPresentes.length > 1 ? (
            <Pestanas
              grupos={deptosPresentes}
              activo={depActivo}
              onCambiar={setDepartamento}
              conteos={conteoPorDep}
            />
          ) : (
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
          )}
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
      ) : filteredProducts.length > 0 && !depActivo ? (
        // Buscando: un bloque por departamento, nunca una grilla mezclada.
        <div className="space-y-10">
          {ORDEN_DEPARTAMENTOS.map(d => {
            const suyos = filteredProducts.filter(p => departamentoDe(p.type) === d);
            if (!suyos.length) return null;
            return (
              <section key={d}>
                <h3 className="mb-4 flex items-baseline gap-2 text-[17px] font-extrabold text-[var(--tech-tinta)]">
                  {DEPARTAMENTOS[d].nombre}
                  <span className="text-[12px] font-semibold text-[var(--tech-gris)]">{suyos.length}</span>
                </h3>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-5 lg:grid-cols-4 xl:grid-cols-5">
                  {suyos.map((product) => (
                    <ProductCard key={product.id} product={product} slug={slug} mostrarTipo={mostrarTipo} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      ) : filteredProducts.length > 0 ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-5 lg:grid-cols-4 xl:grid-cols-5">
            {displayedProducts.map((product) => (
              <ProductCard key={product.id} product={product} slug={slug} mostrarTipo={mostrarTipo} />
            ))}
          </div>
          {filteredProducts.length > visibleCount && (
            <div className="flex justify-center mt-10">
              <button
                onClick={() => setVisibleCount(prev => prev + 20)}
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

      {esPortada && <NovedadesWhatsApp storeName={config.storeName || 'Tienda'} whatsappPhone={config.whatsappPhone} />}
    </div>
  );
};

export default Shop;
