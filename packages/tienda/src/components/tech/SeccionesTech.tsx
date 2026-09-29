import {
  ArrowRight, ChevronRight, CreditCard, Truck, Headphones,
  Zap, BadgeCheck, ChevronLeft,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import ProductCard from '../ProductCard';
import { iconoDeCategoria } from './IconoCategoria';
import type { Product } from '../../store/useStore';

export interface CategoriaVista {
  key: string;
  name: string;
  type: string;
  count: number;
  image: string;
}

/* ── Encabezado de sección (título + "Ver todo") ─────────────────────────── */
export function TituloTech({
  eyebrow, titulo, bajada, accion,
}: {
  eyebrow: string;
  titulo: string;
  bajada?: string;
  accion?: ReactNode;
}) {
  return (
    <div className="mb-5 flex items-end justify-between gap-4">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--tech-violeta)]">{eyebrow}</p>
        <h2 className="mt-1 text-xl font-black text-[var(--tech-tinta)] sm:text-2xl">{titulo}</h2>
        {bajada && <p className="mt-1 text-[13px] text-[var(--tech-gris)]">{bajada}</p>}
      </div>
      {accion}
    </div>
  );
}

const verTodo = 'hidden shrink-0 items-center gap-1 text-[13px] font-bold text-[var(--tech-tinta)] hover:text-[var(--tech-violeta)] sm:inline-flex';

/* ── HERO: columna de categorías + banner ────────────────────────────────── */
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
  return (
    <div className="grid gap-4 lg:grid-cols-[250px_1fr]">
      {/* Columna de categorías (en móvil: chips horizontales) */}
      {categorias.length > 0 && (
        <>
          <nav aria-label="Categorías" className="hidden rounded-2xl border border-violet-100 bg-white p-2 lg:block">
            {categorias.slice(0, 8).map((c) => {
              const Icono = iconoDeCategoria(c.name);
              return (
                <button
                  key={c.key}
                  onClick={() => onCategoria(c.key)}
                  className="group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13px] font-semibold text-[var(--tech-tinta)] transition-colors hover:bg-violet-50 hover:text-[var(--tech-violeta)]"
                >
                  <Icono className="h-[18px] w-[18px] shrink-0 text-[var(--tech-gris)] transition-colors group-hover:text-[var(--tech-violeta)]" />
                  <span className="min-w-0 flex-1 truncate">{c.name}</span>
                  <span className="shrink-0 text-[11px] font-bold text-[var(--tech-gris)]">{c.count}</span>
                </button>
              );
            })}
          </nav>
          <div className="flex gap-2 overflow-x-auto pb-1 lg:hidden">
            {categorias.slice(0, 8).map((c) => {
              const Icono = iconoDeCategoria(c.name);
              return (
                <button
                  key={c.key}
                  onClick={() => onCategoria(c.key)}
                  className="flex shrink-0 items-center gap-2 rounded-full border border-violet-100 bg-white px-4 py-2 text-[13px] font-semibold text-[var(--tech-tinta)]"
                >
                  <Icono className="h-4 w-4 text-[var(--tech-violeta)]" />
                  {c.name}
                </button>
              );
            })}
          </div>
        </>
      )}

      {/* Banner principal */}
      <section className="relative overflow-hidden rounded-2xl bg-[var(--tech-marino)] text-white">
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(600px 320px at 85% 10%, rgba(124,58,237,0.55), transparent 60%), radial-gradient(500px 300px at 10% 90%, rgba(217,70,239,0.35), transparent 60%), linear-gradient(120deg, #171431 0%, #241d55 55%, #3b1d7a 100%)',
          }}
        />
        <div className="relative z-10 grid items-center gap-6 p-6 sm:p-10 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-violet-300">Nueva colección</p>
            <h1 className="mt-3 text-3xl font-black leading-[1.05] sm:text-5xl">
              Mejorá tu vida tech <span className="text-transparent" style={{ backgroundImage: 'linear-gradient(90deg,#c4b5fd,#f0abfc)', WebkitBackgroundClip: 'text', backgroundClip: 'text' }}>todos los días</span>
            </h1>
            <p className="mt-4 max-w-md text-sm leading-relaxed text-white/70 sm:text-[15px]">
              Equipos originales con garantía, al mejor precio y con asesoría por WhatsApp en {storeName}.
            </p>
            <button
              onClick={onVerCatalogo}
              className="mt-6 inline-flex items-center gap-2 rounded-full bg-[var(--tech-violeta)] px-7 py-3 text-sm font-bold text-white shadow-lg shadow-violet-900/40 transition-colors hover:bg-[var(--tech-violeta-hover)]"
            >
              Comprar ahora <ArrowRight className="h-4 w-4" />
            </button>
          </div>
          <div className="relative mx-auto w-full max-w-[320px]">
            {productoHero?.image ? (
              <img
                src={productoHero.image}
                alt={productoHero.name}
                loading="eager"
                className="aspect-square w-full rounded-2xl bg-white/5 object-contain p-6"
              />
            ) : (
              <div className="flex aspect-square w-full items-center justify-center rounded-2xl bg-white/5">
                <Zap className="h-16 w-16 text-violet-300/60" />
              </div>
            )}
            <div className="absolute -right-2 -top-2 flex h-20 w-20 rotate-12 flex-col items-center justify-center rounded-full bg-[var(--tech-violeta)] text-center shadow-xl shadow-violet-900/50 sm:-right-4">
              <span className="px-2 text-[10px] font-black leading-tight text-white">{sello}</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

/* ── Tira de confianza ───────────────────────────────────────────────────── */
export function BarraConfianza({ hayFisicos }: { hayFisicos: boolean }) {
  const items = [
    { Icono: BadgeCheck, titulo: 'Productos originales', bajada: 'Garantía real' },
    { Icono: CreditCard, titulo: hayFisicos ? 'Pago contra entrega' : 'Pago seguro', bajada: hayFisicos ? 'Pagás al recibir' : 'Múltiples medios' },
    { Icono: Truck, titulo: hayFisicos ? 'Envío a todo el país' : 'Entrega inmediata', bajada: hayFisicos ? 'Coordinado por WhatsApp' : 'Directo a tu correo' },
    { Icono: Headphones, titulo: 'Soporte directo', bajada: 'Te asesoramos por WhatsApp' },
  ];
  return (
    <section className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
      {items.map(({ Icono, titulo, bajada }) => (
        <div key={titulo} className="flex items-center gap-3 rounded-2xl border border-violet-100 bg-white px-4 py-3.5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-violet-100">
            <Icono className="h-5 w-5 text-[var(--tech-violeta)]" />
          </span>
          <span className="leading-tight">
            <span className="block text-[13px] font-bold text-[var(--tech-tinta)]">{titulo}</span>
            <span className="block text-[11px] text-[var(--tech-gris)]">{bajada}</span>
          </span>
        </div>
      ))}
    </section>
  );
}

/* ── Círculos de categorías ──────────────────────────────────────────────── */
export function CirculosCategorias({
  categorias, onCategoria,
}: {
  categorias: CategoriaVista[];
  onCategoria: (key: string) => void;
}) {
  if (!categorias.length) return null;
  // Lo genérico ("General", "Otros") al final: son filtros reales, pero como
  // vidriera no dicen nada y tapan a las categorías con identidad.
  const esGenerica = (n: string) => /^(general|otros|varios|sin categor[ií]a|default)$/i.test(String(n || '').trim());
  const ordenadas = [...categorias].sort((a, b) => Number(esGenerica(a.name)) - Number(esGenerica(b.name)));
  return (
    <section className="mt-8">
      <TituloTech eyebrow="Explorá" titulo="Comprá por categoría" />
      <div className="grid grid-cols-4 gap-3 sm:grid-cols-6 lg:grid-cols-8">
        {ordenadas.slice(0, 8).map((c) => {
          const Icono = iconoDeCategoria(c.name);
          return (
            <button key={c.key} onClick={() => onCategoria(c.key)} className="group flex flex-col items-center gap-2">
              <span className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-violet-50 ring-1 ring-violet-100 transition-all group-hover:ring-2 group-hover:ring-[var(--tech-violeta)] sm:h-20 sm:w-20">
                {c.image ? (
                  <img src={c.image} alt={c.name} loading="lazy" className="h-full w-full object-cover" />
                ) : (
                  <Icono className="h-7 w-7 text-[var(--tech-violeta)]" />
                )}
              </span>
              <span className="max-w-full truncate text-center text-[11px] font-bold leading-tight text-[var(--tech-tinta)] sm:text-xs">
                {c.name}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

/* ── Grilla de productos con título (ofertas / destacados) ───────────────── */
export function GrillaProductos({
  eyebrow, titulo, bajada, productos, slug, mostrarTipo, verTodoHref,
}: {
  eyebrow: string;
  titulo: string;
  bajada?: string;
  productos: Product[];
  slug: string;
  mostrarTipo: boolean;
  verTodoHref?: string;
}) {
  if (!productos.length) return null;
  return (
    <section className="mt-8">
      <TituloTech
        eyebrow={eyebrow}
        titulo={titulo}
        bajada={bajada}
        accion={
          verTodoHref ? (
            <a href={verTodoHref} className={verTodo}>
              Ver todo <ChevronRight className="h-4 w-4" />
            </a>
          ) : undefined
        }
      />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-5 lg:grid-cols-4">
        {productos.slice(0, 4).map((p) => (
          <ProductCard key={p.id} product={p} slug={slug} mostrarTipo={mostrarTipo} />
        ))}
      </div>
    </section>
  );
}

/* ── Dos banners promocionales ───────────────────────────────────────────── */
export function PromosDobles({
  promos, onCategoria,
}: {
  promos: Array<{ key: string; titulo: string; bajada: string; imagen: string; oscuro?: boolean }>;
  onCategoria: (key: string) => void;
}) {
  if (promos.length < 2) return null;
  return (
    <section className="mt-8 grid gap-4 md:grid-cols-2">
      {promos.slice(0, 2).map((p) => (
        <button
          key={p.key}
          onClick={() => onCategoria(p.key)}
          className="group relative overflow-hidden rounded-2xl text-left"
          style={{ background: p.oscuro
            ? 'linear-gradient(115deg,#0f2e23 0%,#14532d 55%,#166534 100%)'
            : 'linear-gradient(115deg,#2e1a5e 0%,#4c1d95 55%,#6d28e9 100%)' }}
        >
          <div className="relative z-10 max-w-[60%] p-6 sm:p-8">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/60">{p.bajada}</p>
            <p className="mt-2 text-xl font-black leading-tight text-white sm:text-2xl">{p.titulo}</p>
            <span className="mt-4 inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-[13px] font-bold text-[var(--tech-tinta)] transition-transform group-hover:scale-105">
              Comprar ahora <ArrowRight className="h-4 w-4" />
            </span>
          </div>
          {p.imagen && (
            <img
              src={p.imagen}
              alt={p.titulo}
              loading="lazy"
              className="absolute bottom-0 right-0 h-full w-[45%] object-contain object-bottom p-3 transition-transform duration-500 group-hover:scale-105"
            />
          )}
        </button>
      ))}
    </section>
  );
}

/* ── Carrusel simple para destacados anchos ──────────────────────────────── */
export function CarruselProductos({
  eyebrow, titulo, productos, slug, mostrarTipo,
}: {
  eyebrow: string;
  titulo: string;
  productos: Product[];
  slug: string;
  mostrarTipo: boolean;
}) {
  const [i, setI] = useState(0);
  if (productos.length <= 4) {
    return <GrillaProductos eyebrow={eyebrow} titulo={titulo} productos={productos} slug={slug} mostrarTipo={mostrarTipo} />;
  }
  const paso = (d: number) => setI((v) => (v + d + productos.length) % productos.length);
  const visibles = [0, 1, 2, 3].map((k) => productos[(i + k) % productos.length]);
  return (
    <section className="mt-8">
      <TituloTech
        eyebrow={eyebrow}
        titulo={titulo}
        accion={
          <span className="hidden gap-2 sm:flex">
            <button onClick={() => paso(-1)} aria-label="Anterior" className="flex h-9 w-9 items-center justify-center rounded-full border border-violet-200 text-[var(--tech-tinta)] hover:border-[var(--tech-violeta)] hover:text-[var(--tech-violeta)]">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button onClick={() => paso(1)} aria-label="Siguiente" className="flex h-9 w-9 items-center justify-center rounded-full border border-violet-200 text-[var(--tech-tinta)] hover:border-[var(--tech-violeta)] hover:text-[var(--tech-violeta)]">
              <ChevronRight className="h-4 w-4" />
            </button>
          </span>
        }
      />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-5">
        {visibles.map((p) => (
          <ProductCard key={p.id} product={p} slug={slug} mostrarTipo={mostrarTipo} />
        ))}
      </div>
    </section>
  );
}
