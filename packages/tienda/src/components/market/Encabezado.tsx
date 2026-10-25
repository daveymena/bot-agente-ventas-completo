import { Fragment, useEffect, useRef, useState } from 'react';
import { DEPARTAMENTOS, ORDEN_DEPARTAMENTOS, departamentoDe } from '../../lib/departamentos';
import { Link, useNavigate } from 'react-router-dom';
import {
  ChevronDown, Heart, LayoutDashboard, Menu, Pencil,
  Search, ShoppingBag, ShoppingCart, Truck, User, X, Zap,
} from 'lucide-react';
import { LogoTienda } from '../PaymentIcons';

/**
 * ============================================================
 * EL ENCABEZADO — DOS PISOS, COMO LA MAQUETA TECH
 * ============================================================
 *
 *   1. Blanco: logo · buscador píldora ancho · ayuda, deseados y carrito.
 *   2. Navegación: botón violeta "Todas las categorías" (mismo ancho que la
 *      tarjeta de categorías del hero), enlaces, y a la derecha lo que la
 *      tienda de verdad ofrece en la entrega.
 *
 * La barra gris de arriba del estilo Market se quitó: la maqueta no la
 * tiene y su contenido (WhatsApp, deseados, carrito) ya está en el piso 1.
 *
 * El buscador vive acá, o sea en TODAS las páginas: quien entra por el
 * enlace de un producto (el que manda el bot) tiene que poder buscar otra
 * cosa sin volver atrás.
 *
 * Lo que no se copia: "Login / Register" (no hay cuentas de cliente) y
 * "Envío gratis sobre $50" (no existe esa regla). Poner adornos que no
 * hacen nada es peor que no tenerlos.
 */

export interface CategoriaDelMenu {
  /** Clave interna nombre__tipo, la misma que usa el filtro del catálogo. */
  key: string;
  name: string;
  count: number;
  /** physical | digital | servicio: decide en qué departamento se lista. */
  tipo?: string;
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
  /** Si vende algo físico: decide si se promete envío o entrega inmediata. */
  hayFisicos?: boolean;
}

export default function Encabezado({
  base, storeName, logoUrl, whatsappPhone,
  cartCount, wishlistCount, isOwner, categorias, hayFisicos = false,
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

  // Las categorías agrupadas por departamento: en el menú un curso y un
  // producto físico no quedan en la misma lista (ver lib/departamentos.ts).
  const grupos = ORDEN_DEPARTAMENTOS
    .map((dep) => ({ dep, cats: categorias.filter((c) => departamentoDe(c.tipo) === dep) }))
    .filter((g) => g.cats.length > 0);
  const envio = hayFisicos
    ? { Icono: Truck, titulo: 'Entrega a domicilio', bajada: 'Consulta cobertura y condiciones' }
    : { Icono: Zap, titulo: 'Explora el catálogo', bajada: 'Conoce qué incluye cada oferta' };
  const contenedor = 'mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8';
  const enlaceNav = 'flex h-full items-center px-4 text-[13px] font-semibold text-[var(--tech-tinta)] transition-colors hover:text-[var(--tech-violeta)]';

  return (
    <header className="sticky top-0 z-50 bg-white shadow-[0_1px_0_rgba(15,23,42,0.06)]">
      {/* ── 1. LOGO · BUSCADOR · AYUDA / DESEADOS / CARRITO ───────────── */}
      <div className={`${contenedor} py-3 md:py-5`}>
        <div className="flex items-center gap-4 md:gap-8">
          <Link to={base} className="flex shrink-0 items-center gap-2.5">
            {logoUrl ? (
              <img src={logoUrl} alt={storeName} className="h-9 w-auto max-w-[160px] object-contain md:h-11" />
            ) : (
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--tech-violeta)] md:h-11 md:w-11">
                <ShoppingBag className="h-5 w-5 text-white" />
              </span>
            )}
            <span className="max-w-[10ch] truncate text-lg font-extrabold leading-none tracking-tight text-[var(--tech-tinta)] md:max-w-[16ch] md:text-[22px]">
              {storeName}
            </span>
          </Link>

          {/* Buscador: píldora con botón circular violeta. El selector de
              categoría se conserva (filtra de verdad) aunque la maqueta no
              lo tenga: quitarlo sería perder función por estética. */}
          <form onSubmit={buscar} className="mx-auto hidden h-11 max-w-[560px] flex-1 items-center gap-1 rounded-full border border-slate-200 bg-slate-50 py-1 pl-1 pr-1 transition-colors focus-within:border-violet-300 focus-within:bg-white md:flex">
            {categorias.length > 0 && (
              <select
                value={categoria}
                onChange={(e) => setCategoria(e.target.value)}
                aria-label="Categoría"
                className="h-full max-w-[140px] rounded-full bg-transparent px-3 text-[12px] font-semibold text-[var(--tech-tinta)] outline-none"
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
              placeholder="Busca productos, marcas y más..."
              className="h-full min-w-0 flex-1 bg-transparent px-3 text-[13px] text-[var(--tech-tinta)] outline-none placeholder:text-slate-400"
            />
            <button type="submit" aria-label="Buscar"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--tech-violeta)] text-white transition-colors hover:bg-[var(--tech-violeta-hover)]">
              <Search className="h-[17px] w-[17px]" />
            </button>
          </form>

          <div className="ml-auto flex items-center gap-1 md:ml-0 md:gap-2">
            {/* "Login / Register" de la maqueta: acá no hay cuentas de
                cliente, así que ese lugar lo ocupa lo que sí existe. */}
            {isOwner ? (
              <Link to="/admin" className="mr-2 hidden items-center gap-2 text-[13px] font-semibold text-[var(--tech-tinta)] hover:text-[var(--tech-violeta)] lg:flex">
                <LayoutDashboard className="h-[18px] w-[18px]" /> Panel
              </Link>
            ) : waHref ? (
              <a href={waHref} target="_blank" rel="noopener noreferrer" className="mr-2 hidden items-center gap-2 text-[13px] font-semibold text-[var(--tech-tinta)] hover:text-[var(--tech-violeta)] lg:flex">
                <User className="h-[18px] w-[18px]" /> Ayuda
              </a>
            ) : null}
            {isOwner && (
              <Link to="/editor" aria-label="Editar tienda" className="hidden h-10 w-10 items-center justify-center rounded-full text-[var(--tech-tinta)] hover:text-[var(--tech-violeta)] md:flex">
                <Pencil className="h-[18px] w-[18px]" />
              </Link>
            )}
            <Link to={`${base}/wishlist`} aria-label="Lista de deseos"
              className="relative hidden h-10 w-10 items-center justify-center rounded-full text-[var(--tech-tinta)] transition-colors hover:text-[var(--tech-violeta)] md:flex">
              <Heart className="h-5 w-5" />
              {wishlistCount > 0 && (
                <span className="absolute right-0.5 top-0.5 flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-[var(--tech-violeta)] px-1 text-[10px] font-bold text-white">
                  {wishlistCount}
                </span>
              )}
            </Link>
            <Link to={`${base}/carrito`} aria-label="Carrito"
              className="relative flex h-10 w-10 items-center justify-center rounded-full text-[var(--tech-tinta)] transition-colors hover:text-[var(--tech-violeta)]">
              <ShoppingCart className="h-5 w-5" />
              {cartCount > 0 && (
                <span className="absolute right-0.5 top-0.5 flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-[var(--tech-violeta)] px-1 text-[10px] font-bold text-white">
                  {cartCount}
                </span>
              )}
            </Link>
            <button onClick={() => setMenuMovil((v) => !v)} aria-label="Menú" className="p-2 text-[var(--tech-tinta)] md:hidden">
              {menuMovil ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>

        {/* Buscador en móvil: fila propia, siempre visible. */}
        <form onSubmit={buscar} className="mt-3 flex h-11 items-center gap-1 rounded-full border border-slate-200 bg-slate-50 py-1 pl-4 pr-1 md:hidden">
          <input
            value={termino}
            onChange={(e) => setTermino(e.target.value)}
            placeholder="Busca un producto..."
            className="h-full min-w-0 flex-1 bg-transparent text-sm text-[var(--tech-tinta)] outline-none placeholder:text-slate-400"
          />
          <button type="submit" aria-label="Buscar" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--tech-violeta)] text-white">
            <Search className="h-[18px] w-[18px]" />
          </button>
        </form>
      </div>

      {/* ── 2. NAVEGACIÓN: botón de categorías · enlaces · envío ────────
          El botón mide lo mismo que la tarjeta de categorías del hero
          (264px) para que queden alineados, como en la maqueta. */}
      <div className="hidden border-t border-slate-100 md:block">
        <div className={`${contenedor} flex h-[60px] items-center gap-6`}>
          {categorias.length > 0 && (
            <div ref={contenedorLista} className="relative shrink-0">
              <button
                onClick={() => setListaAbierta((v) => !v)}
                aria-expanded={listaAbierta}
                className="flex h-11 w-[264px] items-center gap-3 rounded-xl bg-[var(--tech-violeta)] px-4 text-[13px] font-bold text-white transition-colors hover:bg-[var(--tech-violeta-hover)]"
              >
                <Menu className="h-[18px] w-[18px]" />
                <span className="flex-1 text-left">Todas las categorías</span>
                <ChevronDown className={`h-4 w-4 transition-transform ${listaAbierta ? 'rotate-180' : ''}`} />
              </button>
              {listaAbierta && (
                <div className="absolute left-0 top-full z-50 mt-2 max-h-[70vh] w-[264px] overflow-y-auto rounded-2xl border border-slate-200 bg-white py-2 shadow-xl shadow-slate-900/10">
                  {grupos.map((g, gi) => (
                    <Fragment key={g.dep}>
                      {grupos.length > 1 && (
                        <p className={`px-5 pb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--tech-violeta)] ${gi > 0 ? 'mt-1 border-t border-slate-100 pt-3' : 'pt-2'}`}>
                          {DEPARTAMENTOS[g.dep].nombre}
                        </p>
                      )}
                      {g.cats.map((c) => (
                        <button
                          key={c.key}
                          onClick={() => irACategoria(c.key)}
                          className="flex w-full items-center justify-between px-5 py-2.5 text-left text-[13px] font-medium text-[var(--tech-tinta)] transition-colors hover:bg-violet-50 hover:text-[var(--tech-violeta)]"
                        >
                          <span className="truncate">{c.name}</span>
                          <span className="ml-2 shrink-0 text-[11px] text-[var(--tech-gris)]">{c.count}</span>
                        </button>
                      ))}
                    </Fragment>
                  ))}
                </div>
              )}
            </div>
          )}

          <nav className="flex h-full items-center">
            <Link to={base} className={`${enlaceNav} text-[var(--tech-violeta)]`}>Inicio</Link>
            {grupos.length > 1 ? (
              grupos.map((g) => (
                <Link key={g.dep} to={`${base}?dep=${g.dep}#catalogo`} className={enlaceNav}>{DEPARTAMENTOS[g.dep].corto}</Link>
              ))
            ) : (
              <Link to={`${base}?cat=all#catalogo`} className={enlaceNav}>Tienda</Link>
            )}
            <Link to={`${base}/wishlist`} className={enlaceNav}>Deseados</Link>
            {waHref && (
              <a href={waHref} target="_blank" rel="noopener noreferrer" className={enlaceNav}>Contacto</a>
            )}
          </nav>

          <div className="ml-auto hidden items-center gap-2.5 lg:flex">
            <envio.Icono className="h-6 w-6 text-[var(--tech-tinta)]" />
            <span className="leading-tight">
              <span className="block text-[12px] font-bold text-[var(--tech-tinta)]">{envio.titulo}</span>
              <span className="block text-[11px] text-[var(--tech-gris)]">{envio.bajada}</span>
            </span>
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
              <LogoTienda archivo="whatsapp.svg" className="w-4 h-4" /> Escríbenos por WhatsApp
            </a>
          )}
          {grupos.map((g) => (
            <Fragment key={g.dep}>
              <p className="px-5 pt-4 pb-2 text-[11px] font-bold uppercase tracking-wider text-[var(--mk-muted)]">
                {grupos.length > 1 ? DEPARTAMENTOS[g.dep].nombre : 'Categorías'}
              </p>
              {g.cats.map((c) => (
                <button key={c.key} onClick={() => irACategoria(c.key)}
                  className="w-full flex items-center justify-between px-5 py-3 text-sm text-[var(--mk-ink)] border-b border-[var(--mk-border)] text-left">
                  <span className="truncate">{c.name}</span>
                  <span className="text-[11px] text-[var(--mk-muted)] ml-2 shrink-0">{c.count}</span>
                </button>
              ))}
            </Fragment>
          ))}
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
