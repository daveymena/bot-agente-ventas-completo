import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ChevronDown, Heart, LayoutDashboard, Menu, MessageCircle, Pencil,
  Search, ShoppingCart, Store, X,
} from 'lucide-react';

/**
 * ============================================================
 * EL ENCABEZADO DE MARKET — TRES PISOS
 * ============================================================
 *
 * La plantilla que pidió el dueño no tiene "un header": tiene tres franjas
 * apiladas, y es lo que la hace leer como una tienda grande en vez de como una
 * landing.
 *
 *   1. Barra superior gris, letra chica: contacto y accesos de servicio.
 *   2. Encabezado blanco: logo · BUSCADOR ANCHO · resumen del carrito.
 *   3. Navegación oscura: bloque de color "Todas las categorías" a la
 *      izquierda, enlaces al centro, teléfono a la derecha.
 *
 * ── El buscador es la diferencia real, no un detalle ─────────────────────
 *
 * En el encabezado anterior el buscador NO estaba: vivía dentro del catálogo,
 * más abajo. Quien entraba por el enlace de un producto (que es el caso normal
 * en este sistema: es el enlace que manda el bot por WhatsApp) no tenía forma
 * de buscar otra cosa sin volver atrás. En Market el buscador es la pieza
 * central del encabezado y está en TODAS las páginas, y así queda acá.
 *
 * ── Lo que no se copia del template ──────────────────────────────────────
 *
 * Market muestra "Mi cuenta", "Comparar" y un selector de moneda/idioma. Acá
 * no hay login de cliente, no hay comparador y la moneda ya se resuelve sola
 * por el país del visitante (ver lib/moneda.ts). Poner los tres como adorno
 * daría tres enlaces que no hacen nada, que es peor que no tenerlos.
 */

export interface CategoriaDelMenu {
  /** Clave interna nombre__tipo, la misma que usa el filtro del catálogo. */
  key: string;
  name: string;
  count: number;
}

interface Props {
  base: string;
  storeName: string;
  logoUrl?: string;
  whatsappPhone?: string;
  cartCount: number;
  wishlistCount: number;
  isOwner: boolean;
  categorias: CategoriaDelMenu[];
}

export default function Encabezado({
  base, storeName, logoUrl, whatsappPhone,
  cartCount, wishlistCount, isOwner, categorias,
}: Props) {
  const navigate = useNavigate();
  const [termino, setTermino] = useState('');
  const [categoria, setCategoria] = useState('all');
  const [menuMovil, setMenuMovil] = useState(false);
  const [listaAbierta, setListaAbierta] = useState(false);
  const contenedorLista = useRef<HTMLDivElement | null>(null);

  const wa = whatsappPhone ? String(whatsappPhone).replace(/[^0-9]/g, '') : '';
  const waHref = wa ? `https://wa.me/${wa}` : null;

  // El desplegable se cierra al tocar fuera y con Escape. Sin esto queda
  // abierto tapando el catálogo, y en móvil no hay forma de cerrarlo.
  useEffect(() => {
    if (!listaAbierta) return;
    const fuera = (e: MouseEvent) => {
      if (!contenedorLista.current?.contains(e.target as Node)) setListaAbierta(false);
    };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setListaAbierta(false); };
    document.addEventListener('mousedown', fuera);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', fuera);
      document.removeEventListener('keydown', esc);
    };
  }, [listaAbierta]);

  /**
   * Buscar lleva al catálogo con los parámetros en la URL, no a un estado
   * interno: así el resultado se puede compartir y volver atrás funciona.
   * Shop.tsx lee `q` y `cat`.
   */
  const buscar = (e: React.FormEvent) => {
    e.preventDefault();
    const p = new URLSearchParams();
    if (termino.trim()) p.set('q', termino.trim());
    if (categoria !== 'all') p.set('cat', categoria);
    navigate(`${base}${p.toString() ? `?${p}` : ''}#catalogo`);
    setMenuMovil(false);
  };

  const irACategoria = (key: string) => {
    setListaAbierta(false);
    setMenuMovil(false);
    navigate(`${base}?cat=${encodeURIComponent(key)}#catalogo`);
  };

  return (
    <header className="sticky top-0 z-50 bg-white">
      {/* ── 1. BARRA SUPERIOR ─────────────────────────────────────────── */}
      <div className="hidden md:block bg-[var(--mk-topbar)] border-b border-[var(--mk-border)]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-9 flex items-center justify-between text-[12px] text-[var(--mk-muted)]">
          <div className="flex items-center gap-5">
            {/* Solo se muestra el contacto que EXISTE. Una dirección o un
                horario inventados para "verse profesional" es justo lo que
                hace que una tienda se lea como plantilla sin terminar. */}
            {waHref ? (
              <a href={waHref} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 hover:text-[var(--store-primary)] transition-colors">
                <MessageCircle className="w-3.5 h-3.5" /> +{wa}
              </a>
            ) : (
              <span>Bienvenido a {storeName}</span>
            )}
          </div>
          <div className="flex items-center gap-5">
            <Link to={`${base}/wishlist`} className="hover:text-[var(--store-primary)] transition-colors">Mi lista de deseos</Link>
            <Link to={`${base}/carrito`} className="hover:text-[var(--store-primary)] transition-colors">Carrito</Link>
            {isOwner && (
              <>
                <Link to="/editor" className="flex items-center gap-1 font-semibold text-[var(--store-primary)]">
                  <Pencil className="w-3 h-3" /> Editar
                </Link>
                <Link to="/admin" className="flex items-center gap-1 font-semibold text-[var(--store-primary)]">
                  <LayoutDashboard className="w-3 h-3" /> Panel
                </Link>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── 2. ENCABEZADO: LOGO · BUSCADOR · CARRITO ──────────────────── */}
      <div className="border-b border-[var(--mk-border)]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-3 md:py-5">
          <div className="flex items-center gap-4 md:gap-8">
            <Link to={base} className="flex items-center gap-2.5 shrink-0">
              {logoUrl ? (
                <img src={logoUrl} alt={storeName} className="h-9 md:h-11 w-auto max-w-[160px] object-contain" />
              ) : (
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--store-primary)]">
                  <Store className="w-5 h-5 text-[var(--store-on-primary)]" />
                </span>
              )}
              <span className="text-lg md:text-2xl font-black tracking-tight text-[var(--mk-ink)] leading-none max-w-[9ch] md:max-w-none truncate md:whitespace-normal">
                {storeName}
              </span>
            </Link>

            {/* El buscador de Market: selector de categoría pegado al campo y
                botón de color. En móvil baja a su propia fila. */}
            <form onSubmit={buscar} className="hidden md:flex flex-1 max-w-2xl h-11 rounded-md border-2 border-[var(--store-primary)] overflow-hidden">
              {categorias.length > 0 && (
                <select
                  value={categoria}
                  onChange={(e) => setCategoria(e.target.value)}
                  aria-label="Categoría"
                  className="h-full bg-[var(--mk-panel)] border-r border-[var(--mk-border)] px-3 text-[13px] text-[var(--mk-ink)] outline-none max-w-[170px]"
                >
                  <option value="all">Todas las categorías</option>
                  {categorias.map((c) => (
                    <option key={c.key} value={c.key}>{c.name}</option>
                  ))}
                </select>
              )}
              <input
                value={termino}
                onChange={(e) => setTermino(e.target.value)}
                placeholder="Buscá un producto..."
                className="flex-1 h-full px-4 text-sm text-[var(--mk-ink)] placeholder-[var(--mk-muted)] outline-none"
              />
              <button
                type="submit"
                aria-label="Buscar"
                className="h-full px-6 bg-[var(--store-primary)] text-[var(--store-on-primary)] hover:bg-[var(--store-primary-hover)] transition-colors"
              >
                <Search className="w-5 h-5" />
              </button>
            </form>

            <div className="ml-auto flex items-center gap-2 md:gap-4">
              <Link
                to={`${base}/wishlist`}
                aria-label="Lista de deseos"
                className="relative hidden md:flex h-10 w-10 items-center justify-center rounded-full border border-[var(--mk-border)] text-[var(--mk-ink)] hover:border-[var(--store-primary)] hover:text-[var(--store-primary)] transition-colors"
              >
                <Heart className="w-[18px] h-[18px]" />
                {wishlistCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[var(--store-primary)] text-[var(--store-on-primary)] text-[10px] font-bold flex items-center justify-center">
                    {wishlistCount}
                  </span>
                )}
              </Link>

              <Link to={`${base}/carrito`} className="flex items-center gap-2.5 group">
                <span className="relative flex h-10 w-10 items-center justify-center rounded-full bg-[var(--store-primary)] text-[var(--store-on-primary)]">
                  <ShoppingCart className="w-[18px] h-[18px]" />
                  {cartCount > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[var(--mk-nav)] text-white text-[10px] font-bold flex items-center justify-center">
                      {cartCount}
                    </span>
                  )}
                </span>
                <span className="hidden lg:block leading-tight">
                  <span className="block text-[11px] text-[var(--mk-muted)]">Mi carrito</span>
                  <span className="block text-[13px] font-bold text-[var(--mk-ink)] group-hover:text-[var(--store-primary)] transition-colors">
                    {cartCount} {cartCount === 1 ? 'artículo' : 'artículos'}
                  </span>
                </span>
              </Link>

              <button
                onClick={() => setMenuMovil((v) => !v)}
                aria-label="Menú"
                className="md:hidden p-2 text-[var(--mk-ink)]"
              >
                {menuMovil ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
              </button>
            </div>
          </div>

          {/* Buscador en móvil: fila propia, siempre visible. */}
          <form onSubmit={buscar} className="md:hidden mt-3 flex h-11 rounded-md border-2 border-[var(--store-primary)] overflow-hidden">
            <input
              value={termino}
              onChange={(e) => setTermino(e.target.value)}
              placeholder="Buscá un producto..."
              className="flex-1 h-full px-3 text-sm text-[var(--mk-ink)] placeholder-[var(--mk-muted)] outline-none"
            />
            <button type="submit" aria-label="Buscar" className="h-full px-5 bg-[var(--store-primary)] text-[var(--store-on-primary)]">
              <Search className="w-5 h-5" />
            </button>
          </form>
        </div>
      </div>

      {/* ── 3. NAVEGACIÓN OSCURA ──────────────────────────────────────── */}
      <div className="hidden md:block bg-[var(--mk-nav)]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-stretch h-[46px]">
            {/* El bloque de categorías: la firma de Market. Si la tienda
                todavía no tiene categorías cargadas no se dibuja, porque un
                menú que se abre vacío se lee como una tienda rota. */}
            {categorias.length > 0 && (
              <div ref={contenedorLista} className="relative w-[260px] shrink-0">
                <button
                  onClick={() => setListaAbierta((v) => !v)}
                  aria-expanded={listaAbierta}
                  className="w-full h-full flex items-center gap-2.5 px-5 bg-[var(--store-primary)] text-[var(--store-on-primary)] text-[13px] font-bold uppercase tracking-wide"
                >
                  <Menu className="w-4 h-4" />
                  Todas las categorías
                  <ChevronDown className={`w-4 h-4 ml-auto transition-transform ${listaAbierta ? 'rotate-180' : ''}`} />
                </button>
                {listaAbierta && (
                  <div className="absolute left-0 top-full w-full bg-white border border-[var(--mk-border)] border-t-0 shadow-xl max-h-[70vh] overflow-y-auto">
                    {categorias.map((c) => (
                      <button
                        key={c.key}
                        onClick={() => irACategoria(c.key)}
                        className="w-full flex items-center justify-between px-5 py-2.5 text-[13px] text-[var(--mk-ink)] hover:bg-[var(--mk-panel)] hover:text-[var(--store-primary)] transition-colors border-b border-[var(--mk-border)] last:border-0 text-left"
                      >
                        <span className="truncate">{c.name}</span>
                        <span className="text-[11px] text-[var(--mk-muted)] shrink-0 ml-2">{c.count}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <nav className="flex items-center gap-1 px-2">
              <Link to={base} className="px-4 h-full flex items-center text-[13px] font-semibold text-white/90 hover:bg-[var(--mk-nav-hover)] hover:text-white transition-colors uppercase tracking-wide">
                Inicio
              </Link>
              <Link to={`${base}?cat=all#catalogo`} className="px-4 h-full flex items-center text-[13px] font-semibold text-white/90 hover:bg-[var(--mk-nav-hover)] hover:text-white transition-colors uppercase tracking-wide">
                Catálogo
              </Link>
              <Link to={`${base}/wishlist`} className="px-4 h-full flex items-center text-[13px] font-semibold text-white/90 hover:bg-[var(--mk-nav-hover)] hover:text-white transition-colors uppercase tracking-wide">
                Deseados
              </Link>
            </nav>

            {waHref && (
              <a
                href={waHref}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-auto flex items-center gap-2 px-4 text-white/90 hover:text-white transition-colors"
              >
                <MessageCircle className="w-4 h-4 text-[#25D366]" />
                <span className="text-[13px] font-bold">+{wa}</span>
              </a>
            )}
          </div>
        </div>
      </div>

      {/* ── Menú móvil ────────────────────────────────────────────────── */}
      {menuMovil && (
        <div className="md:hidden border-t border-[var(--mk-border)] bg-white max-h-[70vh] overflow-y-auto">
          <Link to={base} onClick={() => setMenuMovil(false)} className="block px-5 py-3 text-sm font-semibold text-[var(--mk-ink)] border-b border-[var(--mk-border)]">
            Inicio
          </Link>
          {waHref && (
            <a href={waHref} target="_blank" rel="noopener noreferrer" onClick={() => setMenuMovil(false)}
              className="flex items-center gap-2 px-5 py-3 text-sm font-semibold text-[var(--mk-ink)] border-b border-[var(--mk-border)]">
              <MessageCircle className="w-4 h-4 text-[#25D366]" /> Escribinos por WhatsApp
            </a>
          )}
          {categorias.length > 0 && (
            <>
              <p className="px-5 pt-4 pb-2 text-[11px] font-bold uppercase tracking-wider text-[var(--mk-muted)]">Categorías</p>
              {categorias.map((c) => (
                <button key={c.key} onClick={() => irACategoria(c.key)}
                  className="w-full flex items-center justify-between px-5 py-3 text-sm text-[var(--mk-ink)] border-b border-[var(--mk-border)] text-left">
                  <span className="truncate">{c.name}</span>
                  <span className="text-[11px] text-[var(--mk-muted)] ml-2 shrink-0">{c.count}</span>
                </button>
              ))}
            </>
          )}
          {isOwner && (
            <>
              <Link to="/editor" onClick={() => setMenuMovil(false)} className="flex items-center gap-2 px-5 py-3 text-sm font-semibold text-[var(--store-primary)] border-b border-[var(--mk-border)]">
                <Pencil className="w-4 h-4" /> Editar página
              </Link>
              <Link to="/admin" onClick={() => setMenuMovil(false)} className="flex items-center gap-2 px-5 py-3 text-sm font-semibold text-[var(--store-primary)]">
                <LayoutDashboard className="w-4 h-4" /> Panel Admin
              </Link>
            </>
          )}
        </div>
      )}
    </header>
  );
}
