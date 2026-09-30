import {
  ArrowRight, ChevronRight, ChevronLeft, CreditCard, Truck, Headphones,
  Zap, BadgeCheck, ShieldCheck, MessageCircle, Eye,
} from 'lucide-react';
import { Fragment, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import ProductCard from '../ProductCard';
import { iconoDeCategoria } from './IconoCategoria';
import { useMoneda } from '../../lib/moneda';
import { leerVistos } from '../../lib/vistos';
import type { Product } from '../../store/useStore';
import { DEPARTAMENTOS, ORDEN_DEPARTAMENTOS, departamentoDe, type Departamento } from '../../lib/departamentos';

/**
 * ============================================================
 * PORTADA TECH — copia de la maqueta de referencia (tienda tech)
 * ============================================================
 *
 * La referencia es UNA página larga presentada en dos columnas (la de la
 * derecha es la mitad de abajo, termina en el footer). La primera versión la
 * leyó como un riel lateral de 290px y por eso "Categorías destacadas",
 * "Oferta especial", "Vistos" y "Marcas" salían chiquitas al costado. Acá
 * todo va a lo ancho, en el orden de la maqueta:
 *
 *   hero (con categorías flotando) · confianza · círculos · ofertas de la
 *   semana · promos dobles · destacados · banda "compra con confianza" ·
 *   categorías destacadas · oferta especial · vistos · marcas · novedades
 *
 * Lo que la maqueta inventa NO se copia: descuentos tachados, estrellas y
 * testimonios. El catálogo no tiene precio anterior, calificaciones ni
 * reseñas; mostrarlos sería afirmar algo que no existe. Todo lo demás sale
 * de datos reales, y lo que no tiene dato no se dibuja.
 */

export interface CategoriaVista {
  key: string;
  name: string;
  type: string;
  count: number;
  image: string;
}

/** "General"/"Otros" filtran de verdad, pero como vidriera no dicen nada. */
export const esCategoriaGenerica = (n: string) =>
  /^(general|otros|varios|sin categor[ií]a|default)/i.test(String(n || '').trim());

/* ── Encabezado de sección ───────────────────────────────────────────────── */
export function TituloTech({
  eyebrow, titulo, bajada, accion,
}: {
  eyebrow?: string;
  titulo: ReactNode;
  bajada?: string;
  accion?: ReactNode;
}) {
  return (
    <div className="mb-6 flex items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && (
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--tech-violeta)]">{eyebrow}</p>
        )}
        <h2 className="mt-1 text-[22px] font-extrabold leading-tight tracking-tight text-[var(--tech-tinta)] sm:text-[28px]">{titulo}</h2>
        {bajada && <p className="mt-1.5 max-w-md text-[13px] leading-relaxed text-[var(--tech-gris)]">{bajada}</p>}
      </div>
      {accion}
    </div>
  );
}

/* ── Carril horizontal con flechas (ofertas, destacados) ─────────────────── */
function useCarril() {
  const ref = useRef<HTMLDivElement | null>(null);
  const mover = (dir: number) => {
    const el = ref.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: 'smooth' });
  };
  return { ref, mover };
}

function Flechas({ mover }: { mover: (d: number) => void }) {
  const cls = 'flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-[var(--tech-tinta)] transition-colors hover:border-[var(--tech-violeta)] hover:text-[var(--tech-violeta)]';
  return (
    <span className="flex shrink-0 gap-2">
      <button onClick={() => mover(-1)} aria-label="Anterior" className={cls}><ChevronLeft className="h-4 w-4" /></button>
      <button onClick={() => mover(1)} aria-label="Siguiente" className={cls}><ChevronRight className="h-4 w-4" /></button>
    </span>
  );
}

const carrilCls = 'flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden';

/** Tile blanco para la foto real sobre fondos oscuros: las fotos de
 *  catálogo traen fondo blanco, y sueltas sobre el morado se ven como un
 *  recorte. Dentro de una tarjeta inclinada se leen como diseño. */
function FotoEnTarjeta({ src, alt, className = '' }: { src: string; alt: string; className?: string }) {
  return (
    <span className={`block rounded-3xl bg-white p-4 shadow-2xl shadow-black/30 ring-1 ring-white/40 ${className}`}>
      <img src={src} alt={alt} loading="lazy" className="h-full w-full object-contain" />
    </span>
  );
}

/* ── 1. HERO: banner con la lista de categorías flotando encima ──────────── */
export function HeroTech({
  storeName, categorias, productoHero, sello, onCategoria, onVerCatalogo,
}: {
  storeName: string;
  categorias: CategoriaVista[];
  productoHero?: Product;
  sello: string;
  onCategoria: (key: string) => void;
  onVerCatalogo: () => void;
}) {
  // Agrupada por departamento: un curso y un producto físico no comparten
  // lista. Con dos departamentos van 4 y 4, con uno solo, 8.
  const deps = ORDEN_DEPARTAMENTOS.filter((d) => categorias.some((c) => departamentoDe(c.type) === d));
  const porDep = Math.max(3, Math.floor(8 / Math.max(1, deps.length)));
  const grupos = deps.map((d) => ({
    dep: d,
    cats: categorias
      .filter((c) => departamentoDe(c.type) === d)
      .sort((a, b) => Number(esCategoriaGenerica(a.name)) - Number(esCategoriaGenerica(b.name)))
      .slice(0, porDep),
  }));
  const lista = grupos.flatMap((g) => g.cats);
  return (
    <>
      {/* Móvil: la columna de categorías pasa a chips arriba del banner. */}
      {lista.length > 0 && (
        <div className="mb-3 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] lg:hidden">
          {lista.map((c) => {
            const Icono = iconoDeCategoria(c.name);
            return (
              <button key={c.key} onClick={() => onCategoria(c.key)}
                className="flex shrink-0 items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-[13px] font-semibold text-[var(--tech-tinta)]">
                <Icono className="h-4 w-4 text-[var(--tech-violeta)]" />
                {c.name}
              </button>
            );
          })}
        </div>
      )}

      <section className="relative overflow-hidden rounded-[22px] text-white">
        <div aria-hidden className="absolute inset-0"
          style={{
            background:
              'radial-gradient(520px 420px at 42% 55%, rgba(236,72,153,0.38), transparent 62%), radial-gradient(640px 420px at 88% 0%, rgba(59,130,246,0.45), transparent 60%), radial-gradient(520px 360px at 20% 100%, rgba(124,58,237,0.55), transparent 60%), linear-gradient(115deg, #120f2e 0%, #1c1850 45%, #2a1a6e 100%)',
          }} />

        <div className="relative z-10 grid items-center gap-6 p-6 sm:p-10 lg:min-h-[440px] lg:grid-cols-[264px_1fr_1.05fr] lg:gap-8 lg:p-4 lg:pr-12">
          {/* Lista de categorías: tarjeta blanca dentro del banner */}
          {lista.length > 0 ? (
            <nav aria-label="Categorías" className="hidden self-stretch rounded-2xl bg-white p-2 text-[var(--tech-tinta)] shadow-xl shadow-black/20 lg:block">
              {grupos.map((g, gi) => (
                <Fragment key={g.dep}>
                  {grupos.length > 1 && (
                    <p className={`px-3 pb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--tech-violeta)] ${gi > 0 ? 'mt-1 border-t border-slate-100 pt-3' : 'pt-2'}`}>
                      {DEPARTAMENTOS[g.dep].nombre}
                    </p>
                  )}
                  {g.cats.map((c) => {
                    const Icono = iconoDeCategoria(c.name);
                    return (
                      <button key={c.key} onClick={() => onCategoria(c.key)}
                        className={`group flex w-full items-center gap-3 rounded-xl px-3 text-left text-[13px] font-medium transition-colors hover:bg-violet-50 hover:text-[var(--tech-violeta)] ${grupos.length > 1 ? 'py-[8px]' : 'py-[11px]'}`}>
                        <Icono className="h-[18px] w-[18px] shrink-0 text-slate-500 transition-colors group-hover:text-[var(--tech-violeta)]" />
                        <span className="min-w-0 flex-1 truncate">{c.name}</span>
                        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-300 group-hover:text-[var(--tech-violeta)]" />
                      </button>
                    );
                  })}
                </Fragment>
              ))}
            </nav>
          ) : <span className="hidden lg:block" />}

          {/* Producto real */}
          <div className="order-2 flex justify-center lg:order-none">
            {productoHero?.image ? (
              <FotoEnTarjeta src={productoHero.image} alt={productoHero.name}
                className="aspect-square w-[62%] max-w-[330px] -rotate-6 sm:w-[48%] lg:w-full" />
            ) : (
              <span className="flex aspect-square w-40 items-center justify-center rounded-3xl bg-white/10">
                <Zap className="h-14 w-14 text-violet-200/70" />
              </span>
            )}
          </div>

          {/* Texto */}
          <div className="order-1 lg:order-none">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/75">Nueva colección</p>
            <h1 className="mt-3 text-[34px] font-extrabold leading-[1.04] tracking-tight sm:text-5xl lg:text-[52px]">
              Mejora tu día a día con{' '}
              <span className="bg-gradient-to-r from-violet-300 to-fuchsia-300 bg-clip-text text-transparent">lo mejor</span>
            </h1>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-white/75 sm:text-[15px]">
              Compra fácil en {storeName} y recibe asesoría directa por WhatsApp.
            </p>
            <button onClick={onVerCatalogo}
              className="mt-6 inline-flex items-center gap-2 rounded-lg bg-[var(--tech-violeta)] px-6 py-3 text-sm font-bold text-white shadow-lg shadow-violet-950/40 transition-colors hover:bg-[var(--tech-violeta-hover)]">
              Comprar ahora <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Sello: propuesta real, nunca un "% OFF" que el catálogo no respalda */}
        <div className="absolute bottom-5 right-5 z-20 hidden h-24 w-24 -rotate-12 flex-col items-center justify-center rounded-full bg-[var(--tech-violeta)] text-center shadow-xl shadow-violet-950/50 ring-4 ring-white/10 sm:flex lg:bottom-8 lg:right-8 lg:h-28 lg:w-28">
          <span className="px-3 text-[12px] font-black leading-tight text-white lg:text-[13px]">{sello}</span>
        </div>
      </section>
    </>
  );
}

/* ── 2. Tira de confianza ────────────────────────────────────────────────── */
export function BarraConfianza({ hayFisicos }: { hayFisicos: boolean }) {
  const items = [
    { Icono: BadgeCheck, titulo: 'Compra protegida', bajada: 'Productos verificados' },
    { Icono: CreditCard, titulo: hayFisicos ? 'Pago contra entrega' : 'Pago seguro', bajada: hayFisicos ? 'Pagas al recibir' : 'Varios medios de pago' },
    { Icono: Truck, titulo: hayFisicos ? 'Envío a todo el país' : 'Entrega inmediata', bajada: hayFisicos ? 'Coordinado por WhatsApp' : 'Directo a tu correo' },
    { Icono: Headphones, titulo: 'Soporte directo', bajada: 'Te asesoramos por WhatsApp' },
  ];
  return (
    <section className="mt-5 grid grid-cols-2 rounded-2xl border border-slate-200 bg-white lg:grid-cols-4">
      {items.map(({ Icono, titulo, bajada }, i) => (
        <div key={titulo}
          className={`flex items-center gap-3 px-4 py-4 sm:px-6 ${i > 0 ? 'lg:border-l lg:border-slate-200' : ''} ${i % 2 === 1 ? 'border-l border-slate-200 lg:border-l' : ''} ${i >= 2 ? 'border-t border-slate-200 lg:border-t-0' : ''}`}>
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 border-slate-200">
            <Icono className="h-5 w-5 text-[var(--tech-tinta)]" />
          </span>
          <span className="min-w-0 leading-tight">
            <span className="block text-[13px] font-bold text-[var(--tech-tinta)]">{titulo}</span>
            <span className="mt-0.5 block text-[11px] text-[var(--tech-gris)]">{bajada}</span>
          </span>
        </div>
      ))}
    </section>
  );
}

/* ── 3. Círculos de categorías (sin título, como en la maqueta) ──────────── */
export function CirculosCategorias({
  categorias, onCategoria,
}: {
  categorias: CategoriaVista[];
  onCategoria: (key: string) => void;
}) {
  if (!categorias.length) return null;
  const ordenadas = [...categorias].sort((a, b) => Number(esCategoriaGenerica(a.name)) - Number(esCategoriaGenerica(b.name)));
  return (
    <section className="mt-10 grid grid-cols-4 gap-x-3 gap-y-5 sm:grid-cols-8 sm:gap-x-5">
      {ordenadas.slice(0, 8).map((c) => {
        const Icono = iconoDeCategoria(c.name);
        return (
          <button key={c.key} onClick={() => onCategoria(c.key)} className="group flex flex-col items-center gap-2.5">
            <span className="flex aspect-square w-full max-w-[112px] items-center justify-center overflow-hidden rounded-full bg-gradient-to-b from-violet-50 via-white to-sky-50 ring-1 ring-slate-200 transition-all group-hover:ring-2 group-hover:ring-[var(--tech-violeta)]">
              {c.image ? (
                <img src={c.image} alt={c.name} loading="lazy" className="h-[72%] w-[72%] object-contain mix-blend-multiply transition-transform duration-300 group-hover:scale-110" />
              ) : (
                <Icono className="h-8 w-8 text-[var(--tech-violeta)]" />
              )}
            </span>
            <span className="line-clamp-2 max-w-full text-center text-[11px] font-semibold leading-snug text-[var(--tech-tinta)] sm:text-[12px]">
              {c.name}
            </span>
          </button>
        );
      })}
    </section>
  );
}

/* ── 4. Ofertas de la semana: texto a la izquierda, carril a la derecha ─── */
export function OfertasSemana({
  productos, slug, mostrarTipo, onVerTodo, eyebrow = 'Lo más nuevo', titulo = 'Elegidos de la semana',
  bajada = 'Una selección de la tienda para que empieces por lo mejor.',
}: {
  productos: Product[];
  slug: string;
  mostrarTipo: boolean;
  onVerTodo: () => void;
  eyebrow?: string;
  titulo?: string;
  bajada?: string;
}) {
  const { ref, mover } = useCarril();
  if (!productos.length) return null;
  return (
    <section id="ofertas" className="relative mt-12 scroll-mt-32 rounded-[22px] bg-slate-50 p-5 sm:p-8 lg:pt-[72px]">
      {productos.length > 4 && (
        <span className="absolute right-8 top-6 hidden lg:block"><Flechas mover={mover} /></span>
      )}
      <div className="grid items-center gap-6 lg:grid-cols-[230px_1fr] lg:gap-8">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-rose-500">{eyebrow}</p>
          <h2 className="mt-2 text-[28px] font-extrabold leading-[1.1] tracking-tight text-[var(--tech-tinta)] sm:text-[34px]">
            {titulo}
          </h2>
          <p className="mt-3 text-[13px] leading-relaxed text-[var(--tech-gris)]">
            {bajada}
          </p>
          <div className="mt-6 flex items-center justify-between gap-4">
            <button onClick={onVerTodo}
              className="inline-flex items-center gap-2 rounded-lg bg-[var(--tech-tinta)] px-5 py-3 text-[13px] font-bold text-white transition-colors hover:bg-black">
              Ver todo <ArrowRight className="h-4 w-4" />
            </button>
            {productos.length > 4 && <span className="lg:hidden"><Flechas mover={mover} /></span>}
          </div>
        </div>
        <div className="relative min-w-0">
          <div ref={ref} className={carrilCls}>
            {productos.map((p) => (
              <div key={p.id} className="w-[46%] shrink-0 snap-start sm:w-[31%] lg:w-[calc((100%-48px)/4)]">
                <ProductCard product={p} slug={slug} mostrarTipo={mostrarTipo} acciones="ninguna" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── 5. Dos banners promocionales ────────────────────────────────────────── */
export function PromosDobles({
  promos, onCategoria,
}: {
  promos: Array<{ key: string; titulo: string; bajada: string; imagen: string }>;
  onCategoria: (key: string) => void;
}) {
  if (promos.length < 2) return null;
  const estilos = [
    { fondo: 'radial-gradient(420px 260px at 85% 30%, rgba(52,211,153,0.28), transparent 65%), linear-gradient(115deg,#062a20 0%,#0b3b2c 55%,#0f5132 100%)', boton: 'bg-emerald-400 text-emerald-950 hover:bg-emerald-300', eyebrow: 'text-emerald-300' },
    { fondo: 'radial-gradient(420px 260px at 85% 30%, rgba(139,92,246,0.35), transparent 65%), linear-gradient(115deg,#14123a 0%,#1f1b54 55%,#2e1f78 100%)', boton: 'bg-[var(--tech-violeta)] text-white hover:bg-[var(--tech-violeta-hover)]', eyebrow: 'text-violet-300' },
  ];
  return (
    <section className="mt-12 grid gap-5 md:grid-cols-2">
      {promos.slice(0, 2).map((p, i) => {
        const e = estilos[i];
        return (
          <button key={p.key} onClick={() => onCategoria(p.key)}
            className="group relative flex min-h-[220px] overflow-hidden rounded-[22px] text-left sm:min-h-[250px]"
            style={{ background: e.fondo }}>
            <div className="relative z-10 flex max-w-[58%] flex-col justify-center p-6 sm:p-8">
              <p className={`text-[11px] font-bold uppercase tracking-[0.16em] ${e.eyebrow}`}>{p.bajada}</p>
              <p className="mt-2 text-[22px] font-extrabold leading-tight text-white sm:text-[28px]">{p.titulo}</p>
              <p className="mt-2 text-[13px] text-white/70">Encuentra lo que buscas.</p>
              <span className={`mt-5 inline-flex w-fit items-center gap-2 rounded-lg px-5 py-2.5 text-[13px] font-bold transition-colors ${e.boton}`}>
                Comprar ahora <ArrowRight className="h-4 w-4" />
              </span>
            </div>
            {p.imagen && (
              <FotoEnTarjeta src={p.imagen} alt={p.titulo}
                className="absolute bottom-6 right-5 aspect-square w-[36%] max-w-[190px] rotate-6 transition-transform duration-500 group-hover:rotate-0 group-hover:scale-105" />
            )}
          </button>
        );
      })}
    </section>
  );
}

/* ── 6. Productos destacados: carril de 5 con "Agregar al carrito" ──────── */
export function DestacadosTech({
  productos, slug, mostrarTipo, eyebrow = 'Tendencia', titulo = 'Productos destacados',
  bajada = 'Seleccionados para ti. Explora lo más nuevo de la tienda.', id,
}: {
  productos: Product[];
  slug: string;
  mostrarTipo: boolean;
  eyebrow?: string;
  titulo?: string;
  bajada?: string;
  id?: string;
}) {
  const { ref, mover } = useCarril();
  if (!productos.length) return null;
  return (
    <section id={id} className="mt-12 scroll-mt-32">
      <TituloTech
        eyebrow={eyebrow}
        titulo={titulo}
        bajada={bajada}
        accion={productos.length > 5 ? <Flechas mover={mover} /> : undefined}
      />
      <div ref={ref} className={carrilCls}>
        {productos.map((p) => (
          <div key={p.id} className="w-[46%] shrink-0 snap-start sm:w-[31%] lg:w-[calc((100%-64px)/5)]">
            <ProductCard product={p} slug={slug} mostrarTipo={mostrarTipo} acciones="carrito" />
          </div>
        ))}
      </div>
    </section>
  );
}

/* ── 7. Banda "Compra con confianza" ─────────────────────────────────────── */
export function BandaConfianza({ hayFisicos }: { hayFisicos: boolean }) {
  const items = [
    { Icono: ShieldCheck, titulo: 'Compra protegida', bajada: 'Productos verificados' },
    { Icono: CreditCard, titulo: hayFisicos ? 'Pago contra entrega' : 'Pagos seguros', bajada: hayFisicos ? 'Pagas al recibir' : 'Varios medios' },
    { Icono: hayFisicos ? Truck : Zap, titulo: hayFisicos ? 'Envío nacional' : 'Entrega inmediata', bajada: hayFisicos ? 'Rápido y seguro' : 'Al confirmar el pago' },
  ];
  return (
    <section className="relative mt-12 overflow-hidden rounded-[22px] px-6 py-8 text-white sm:px-10"
      style={{ background: 'radial-gradient(520px 260px at 95% 50%, rgba(236,72,153,0.35), transparent 60%), radial-gradient(420px 260px at 75% 0%, rgba(59,130,246,0.35), transparent 60%), linear-gradient(110deg,#0f0d27 0%,#17143a 60%,#241a5c 100%)' }}>
      <div className="relative z-10 grid items-center gap-6 lg:grid-cols-[1fr_auto]">
        <div>
          <p className="text-[24px] font-extrabold tracking-tight sm:text-[28px]">Compra con confianza</p>
          <p className="mt-1.5 max-w-md text-[13px] leading-relaxed text-white/65">
            Tu satisfacción es lo primero. Compra fácil, seguro y con ayuda por WhatsApp.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2 sm:gap-0">
          {items.map(({ Icono, titulo, bajada }, i) => (
            <div key={titulo} className={`flex flex-col items-center px-2 text-center sm:px-7 ${i > 0 ? 'sm:border-l sm:border-white/15' : ''}`}>
              <Icono className="h-6 w-6 text-white/90" />
              <span className="mt-2 text-[12px] font-bold sm:text-[13px]">{titulo}</span>
              <span className="text-[11px] text-white/55">{bajada}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── 8. Categorías destacadas: una pestaña por departamento ───────────── */
export function CategoriasDestacadas({
  categorias, onCategoria,
}: {
  categorias: CategoriaVista[];
  onCategoria: (key: string) => void;
}) {
  const grupos = ORDEN_DEPARTAMENTOS
    .map((dep) => ({ dep, lista: categorias.filter((c) => departamentoDe(c.type) === dep && !esCategoriaGenerica(c.name)).slice(0, 6) }))
    .filter((g) => g.lista.length > 0);
  const [activo, setActivo] = useState<Departamento | null>(null);
  const grupo = grupos.find((g) => g.dep === activo) || grupos[0];
  if (!grupo || (grupos.length === 1 && grupo.lista.length < 2)) return null;
  return (
    <section className="mt-14">
      <TituloTech
        eyebrow="Populares"
        titulo="Categorías destacadas"
        bajada="Descubre las categorías con más productos y encuentra lo que necesitas."
        accion={grupos.length > 1 ? <Pestanas grupos={grupos.map((g) => g.dep)} activo={grupo.dep} onCambiar={setActivo} /> : undefined}
      />
      {/* Una columna en el teléfono: a dos, "Programación" se cortaba. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3">
        {grupo.lista.map((c) => {
          const Icono = iconoDeCategoria(c.name);
          return (
            <button key={c.key} onClick={() => onCategoria(c.key)}
              className="group flex h-[112px] items-center justify-between gap-2 overflow-hidden rounded-2xl bg-slate-50 p-4 text-left ring-1 ring-transparent transition-all hover:bg-violet-50/60 hover:ring-violet-200 sm:h-[160px] sm:p-6">
              <span className="min-w-0">
                <span className="line-clamp-2 block text-[14px] font-bold leading-snug text-[var(--tech-tinta)] sm:text-[17px]">{c.name}</span>
                <span className="mt-1 block text-[11px] text-[var(--tech-gris)]">{c.count} {c.count === 1 ? 'producto' : 'productos'}</span>
                <span className="mt-2 inline-flex items-center gap-1 text-[12px] font-semibold text-[var(--tech-violeta)]">
                  Explorar <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                </span>
              </span>
              <span className="flex h-full w-[34%] shrink-0 items-center justify-center sm:w-[42%]">
                {c.image ? (
                  <img src={c.image} alt="" aria-hidden loading="lazy" className="max-h-full max-w-full object-contain mix-blend-multiply transition-transform duration-500 group-hover:scale-110" />
                ) : (
                  <Icono className="h-10 w-10 text-[var(--tech-violeta)]" />
                )}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

/** Pestañas de departamento (píldoras). También las usa el catálogo. */
export function Pestanas({
  grupos, activo, onCambiar, conteos,
}: {
  grupos: Departamento[];
  activo: Departamento;
  onCambiar: (d: Departamento) => void;
  conteos?: Partial<Record<Departamento, number>>;
}) {
  return (
    <div role="tablist" className="flex shrink-0 gap-1 rounded-full bg-slate-100 p-1">
      {grupos.map((d) => (
        <button key={d} role="tab" aria-selected={d === activo} onClick={() => onCambiar(d)}
          className={`whitespace-nowrap rounded-full px-3.5 py-2 text-[12px] font-bold transition-colors sm:px-4 ${d === activo ? 'bg-white text-[var(--tech-violeta)] shadow-sm' : 'text-[var(--tech-gris)] hover:text-[var(--tech-tinta)]'}`}>
          {DEPARTAMENTOS[d].corto}
          {conteos?.[d] != null && <span className="ml-1.5 font-semibold opacity-70">{conteos[d]}</span>}
        </button>
      ))}
    </div>
  );
}

/* ── 9. Oferta especial: banner ancho con un producto real ───────────────── */
export function OfertaEspecial({ producto, slug }: { producto?: Product; slug: string }) {
  const { formatear } = useMoneda();
  if (!producto) return null;
  return (
    <section className="relative mt-12 overflow-hidden rounded-[22px] text-white"
      style={{ background: 'radial-gradient(420px 300px at 80% 20%, rgba(236,72,153,0.45), transparent 60%), linear-gradient(120deg,#3b1d9a 0%,#5b21e6 55%,#7c3aed 100%)' }}>
      <div className="relative z-10 grid items-center gap-6 p-6 sm:p-10 md:grid-cols-[1.2fr_1fr]">
        <div>
          <p className="text-[13px] font-semibold text-white/85">Oferta especial</p>
          <p className="mt-1 line-clamp-2 text-[26px] font-extrabold leading-tight tracking-tight sm:text-[36px]">{producto.name}</p>
          <p className="mt-2 text-[20px] font-extrabold text-fuchsia-100 sm:text-[24px]">{formatear(producto.price)}</p>
          <p className="mt-1 text-[13px] text-white/70">Te asesoramos por WhatsApp antes de comprar.</p>
          <Link to={`/tienda/${slug}/producto/${producto.id}`}
            className="mt-5 inline-flex items-center gap-2 rounded-lg bg-white px-5 py-2.5 text-[13px] font-bold text-[var(--tech-tinta)] transition-transform hover:scale-105">
            Comprar ahora <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        {producto.image && (
          <div className="flex justify-center md:justify-end">
            <FotoEnTarjeta src={producto.image} alt={producto.name} className="aspect-[4/3] w-[70%] max-w-[340px] -rotate-3" />
          </div>
        )}
      </div>
    </section>
  );
}

/* ── 10. Vistos recientemente (historial real del visitante) ─────────────── */
export function VistosRecientes({ productos, slug }: { productos: Product[]; slug: string }) {
  const { formatear } = useMoneda();
  const ids = leerVistos();
  if (!ids.length) return null;
  const porId = new Map(productos.map((p) => [String(p.id), p]));
  const vistos = ids.map((id) => porId.get(id)).filter((p): p is Product => !!p).slice(0, 6);
  if (!vistos.length) return null;
  return (
    <section className="mt-14">
      <TituloTech eyebrow="Sigue donde ibas" titulo="Vistos recientemente" bajada="Los productos que viste. Retoma donde lo dejaste." />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-5 lg:grid-cols-6">
        {vistos.map((p) => (
          <Link key={p.id} to={`/tienda/${slug}/producto/${p.id}`}
            className="group rounded-2xl border border-slate-200 bg-white p-3 transition-shadow hover:shadow-[0_12px_30px_-14px_rgba(30,27,51,0.25)]">
            <span className="flex h-28 items-center justify-center rounded-xl bg-slate-50">
              {p.image ? (
                <img src={p.image} alt={p.name} loading="lazy" className="h-[85%] w-[85%] object-contain mix-blend-multiply transition-transform duration-500 group-hover:scale-105" />
              ) : (
                <Eye className="h-6 w-6 text-[var(--tech-gris)]" />
              )}
            </span>
            <span className="mt-2.5 line-clamp-2 block text-[12px] font-medium leading-snug text-[var(--tech-tinta)]">{p.name}</span>
            <span className="mt-1 block text-[13px] font-extrabold text-[var(--tech-tinta)]">{formatear(p.price)}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

/* ── 11. Top marcas (reales, detectadas en el catálogo) ──────────────────── */
/**
 * No hay campo "marca": se busca en el nombre del producto, pero SOLO contra
 * una lista cerrada de marcas conocidas. Tomar la primera palabra mostraba
 * "Portátil" o "Excel" como marca. Si no hay marcas, la sección no existe.
 */
const MARCAS_CONOCIDAS = [
  'lenovo', 'hp', 'asus', 'epson', 'pantum', 'compumax', 'samsung', 'apple',
  'canon', 'jbl', 'sony', 'dell', 'acer', 'msi', 'gigabyte', 'logitech',
  'kingston', 'sandisk', 'xiaomi', 'huawei', 'nokia', 'motorola', 'lg',
  'brother', 'kyocera', 'ricoh', 'xerox', 'lexmark', 'nike', 'adidas',
];

export interface MarcaVista { nombre: string; count: number }

export function marcasDelCatalogo(productos: Product[]): MarcaVista[] {
  const mapa = new Map<string, MarcaVista>();
  for (const p of productos) {
    const palabras = String(p.name || '').toLowerCase().split(/[^a-z0-9]+/);
    const marca = MARCAS_CONOCIDAS.find((m) => palabras.includes(m));
    if (!marca) continue;
    const actual = mapa.get(marca);
    if (actual) actual.count++;
    else mapa.set(marca, { nombre: marca.toUpperCase(), count: 1 });
  }
  return [...mapa.values()].sort((a, b) => b.count - a.count).slice(0, 10);
}

export function MarcasTop({ marcas }: { marcas: MarcaVista[] }) {
  if (!marcas.length) return null;
  return (
    <section className="mt-14">
      <TituloTech eyebrow="Originales" titulo="Top marcas" bajada="Marcas que encuentras en la tienda." />
      {/* flex-grow: con 3 marcas llenan la fila en vez de dejar dos huecos */}
      <div className="flex flex-wrap gap-3">
        {marcas.map((m) => (
          <div key={m.nombre} title={`${m.nombre} · ${m.count} ${m.count === 1 ? 'producto' : 'productos'}`}
            className="flex h-16 min-w-[120px] flex-1 basis-[calc(33.33%-8px)] items-center sm:basis-[calc(20%-10px)] justify-center rounded-xl border border-slate-200 bg-white px-3 transition-colors hover:border-violet-200 sm:h-20">
            <span className="truncate text-[15px] font-black uppercase tracking-wider text-slate-700 sm:text-[18px]">{m.nombre}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ── 12. Novedades por WhatsApp (el "newsletter" de la maqueta) ──────────── */
/**
 * La maqueta pide un correo. Acá no hay lista de correo: un campo que no
 * guarda nada sería un formulario falso. El canal real del negocio es
 * WhatsApp, así que el bloque abre la conversación con el mensaje escrito.
 */
export function NovedadesWhatsApp({ storeName, whatsappPhone }: { storeName: string; whatsappPhone?: string }) {
  const wa = String(whatsappPhone || '').replace(/[^0-9]/g, '');
  if (!wa) return null;
  const texto = encodeURIComponent(`Hola, quiero recibir las novedades y ofertas de ${storeName}.`);
  return (
    <section className="mt-14 flex flex-col items-start gap-5 rounded-[22px] border border-slate-200 bg-white p-6 sm:p-8 lg:flex-row lg:items-center">
      <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-violet-100">
        <MessageCircle className="h-7 w-7 text-[var(--tech-violeta)]" />
      </span>
      <div className="flex-1">
        <p className="text-[18px] font-extrabold text-[var(--tech-tinta)]">Recibe novedades y ofertas</p>
        <p className="mt-1 text-[13px] text-[var(--tech-gris)]">Escríbenos por WhatsApp y te avisamos cuando lleguen productos nuevos.</p>
      </div>
      <a href={`https://wa.me/${wa}?text=${texto}`} target="_blank" rel="noopener noreferrer"
        className="inline-flex h-12 items-center gap-2 rounded-lg bg-[var(--tech-violeta)] px-6 text-[13px] font-bold text-white transition-colors hover:bg-[var(--tech-violeta-hover)]">
        Quiero recibir novedades <ArrowRight className="h-4 w-4" />
      </a>
    </section>
  );
}
