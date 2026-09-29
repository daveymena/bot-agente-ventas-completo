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
    <header className="sticky top-0 z-50 bg-white shadow-[0_1px_12px_rgba(76,29,149,0.06)]">
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

            {/* El buscador: píldora redondeada con botón circular violeta.
                El selector de categoría se conserva (filtra de verdad); en el
                diseño de referencia no existe, pero quitarlo sería perder
                función por estética. */}
            <form onSubmit={buscar} className="hidden h-11 max-w-2xl flex-1 items-center gap-1 rounded-full border border-violet-200 bg-violet-50/60 py-1 pl-1 pr-1 md:flex">
              {categorias.length > 0 && (
                <select
                  value={categoria}
                  onChange={(e) => setCategoria(e.target.value)}
                  aria-label="Categoría"
                  className="h-full max-w-[150px] rounded-full bg-transparent px-3 text-[13px] font-semibold text-[var(--tech-tinta)] outline-none"
                >
                  <option value="all">Todas</option>
                  {categorias.map((c) => (
                    <option key={c.key} value={c.key}>{c.name}</option>
                  ))}
                </select>
              )}
              <input
                value={termino}
                onChange={(e) => setTermino(e.target.value)}
                placeholder="Buscá productos..."
                className="h-full min-w-0 flex-1 bg-transparent px-3 text-sm text-[var(--tech-tinta)] outline-none placeholder:text-[var(--tech-gris)]"
              />
              <button
                type="submit"
                aria-label="Buscar"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--tech-violeta)] text-white transition-colors hover:bg-[var(--tech-violeta-hover)]"
              >
                <Search className="h-[18px] w-[18px]" />
              </button>
            </form>

            <div className="ml-auto flex items-center gap-2 md:gap-3">
              <Link
                to={`${base}/wishlist`}
                aria-label="Lista de deseos"
                className="relative hidden h-10 w-10 items-center justify-center rounded-full border border-violet-200 text-[var(--tech-tinta)] transition-colors hover:border-[var(--tech-violeta)] hover:text-[var(--tech-violeta)] md:flex"
              >
                <Heart className="h-[18px] w-[18px]" />
                {wishlistCount > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[var(--tech-violeta)] px-1 text-[10px] font-bold text-white">
                    {wishlistCount}
                  </span>
                )}
              </Link>

              <Link to={`${base}/carrito`} className="group flex items-center gap-2.5">
                <span className="relative flex h-10 w-10 items-center justify-center rounded-full bg-[var(--tech-violeta)] text-white">
                  <ShoppingCart className="h-[18px] w-[18px]" />
                  {cartCount > 0 && (
                    <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[var(--tech-marino)] px-1 text-[10px] font-bold text-white">
                      {cartCount}
                    </span>
                  )}
                </span>
                <span className="hidden leading-tight lg:block">
                  <span className="block text-[11px] text-[var(--tech-gris)]">Mi carrito</span>
                  <span className="block text-[13px] font-bold text-[var(--tech-tinta)] transition-colors group-hover:text-[var(--tech-violeta)]">
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
          <form onSubmit={buscar} className="mt-3 flex h-11 items-center gap-1 rounded-full border border-violet-200 bg-violet-50/60 py-1 pl-4 pr-1 md:hidden">
            <input
              value={termino}
              onChange={(e) => setTermino(e.target.value)}
              placeholder="Buscá un producto..."
              className="h-full min-w-0 flex-1 bg-transparent text-sm text-[var(--tech-tinta)] outline-none placeholder:text-[var(--tech-gris)]"
            />
            <button type="submit" aria-label="Buscar" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--tech-violeta)] text-white">
              <Search className="h-[18px] w-[18px]" />
            </button>
          </form>
        </div>
      </div>

      {/* ── 3. NAVEGACIÓN CLARA ─────────────────────────────────────────
          En el diseño tech esta fila es blanca: píldora violeta de
          categorías a la izquierda, enlaces al centro, contacto a la
          derecha. Se conserva la misma lógica (dropdown real, mismas
          rutas). */}
      <div className="hidden border-t border-violet-100 md:block">
        <div className="mx-auto flex h-[58px] max-w-6xl items-center gap-2 px-4 sm:px-6 lg:px-8">
          {/* El bloque de categorías: la firma de Market. Si la tienda
              todavía no tiene categorías cargadas no se dibuja, porque un
              menú que se abre vacío se lee como una tienda rota. */}
          {categorias.length > 0 && (
            <div ref={contenedorLista} className="relative h-full shrink-0">
              <button
                onClick={() => setListaAbierta((v) => !v)}
                aria-expanded={listaAbierta}
                className="flex h-10 items-center gap-2.5 self-center rounded-full bg-[var(--tech-violeta)] px-5 text-[13px] font-bold text-white transition-colors hover:bg-[var(--tech-violeta-hover)]"
              >
                <Menu className="h-4 w-4" />
                Todas las categorías
                <ChevronDown className={`h-4 w-4 transition-transform ${listaAbierta ? 'rotate-180' : ''}`} />
              </button>
              {listaAbierta && (
                <div className="absolute left-0 top-full z-50 mt-1 w-[260px] overflow-y-auto rounded-2xl border border-violet-100 bg-white py-2 shadow-xl shadow-violet-900/10 max-h-[70vh]">
                  {categorias.map((c) => (
                    <button
                      key={c.key}
                      onClick={() => irACategoria(c.key)}
                      className="flex w-full items-center justify-between px-5 py-2.5 text-left text-[13px] font-medium text-[var(--tech-tinta)] transition-colors hover:bg-violet-50 hover:text-[var(--tech-violeta)]"
                    >
                      <span className="truncate">{c.name}</span>
                      <span className="ml-2 shrink-0 text-[11px] text-[var(--tech-gris)]">{c.count}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <nav className="flex items-center gap-1">
            <Link to={base} className="flex h-full items-center px-4 text-[13px] font-bold text-[var(--tech-tinta)] transition-colors hover:text-[var(--tech-violeta)]">
              Inicio
            </Link>
            <Link to={`${base}?cat=all#catalogo`} className="flex h-full items-center px-4 text-[13px] font-bold text-[var(--tech-tinta)] transition-colors hover:text-[var(--tech-violeta)]">
              Tienda
            </Link>
            <Link to={`${base}/wishlist`} className="flex h-full items-center px-4 text-[13px] font-bold text-[var(--tech-tinta)] transition-colors hover:text-[var(--tech-violeta)]">
              Deseados
            </Link>
          </nav>

          {waHref && (
            <a
              href={waHref}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto flex items-center gap-2 text-[var(--tech-tinta)] transition-colors hover:text-[var(--tech-violeta)]"
            >
              <MessageCircle className="h-4 w-4 text-[#25D366]" />
              <span className="text-[13px] font-bold">+{wa}</span>
            </a>
          )}
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
