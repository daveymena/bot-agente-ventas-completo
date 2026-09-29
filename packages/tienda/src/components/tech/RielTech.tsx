import { Link } from 'react-router-dom';
import { ArrowRight, ChevronRight, Eye } from 'lucide-react';
import { useMoneda } from '../../lib/moneda';
import { leerVistos } from '../../lib/vistos';
import { iconoDeCategoria } from './IconoCategoria';
import { TituloTech, type CategoriaVista } from './SeccionesTech';
import type { Product } from '../../store/useStore';

/**
 * Marcas reales del catálogo.
 *
 * No hay campo "marca": se busca en el nombre del producto, pero SOLO contra
 * una lista de marcas conocidas. La versión anterior tomaba la primera
 * palabra ("Portátil", "Excel", "Diseño") y la mostraba como marca — esas no
 * son marcas, son el tipo de producto, y la sección mentía. Con lista
 * cerrada, lo que sale es porque de verdad se vende. Si no hay marcas, la
 * sección no se dibuja.
 */
const MARCAS_CONOCIDAS = [
  'lenovo', 'hp', 'asus', 'epson', 'pantum', 'compumax', 'samsung', 'apple',
  'canon', 'jbl', 'sony', 'dell', 'acer', 'msi', 'gigabyte', 'logitech',
  'kingston', 'sandisk', 'xiaomi', 'huawei', 'nokia', 'motorola', 'lg',
  'brother', 'kyocera', 'ricoh', 'xerox', 'lexmark', 'nike', 'adidas',
];

export interface MarcaVista {
  nombre: string;
  count: number;
  imagen: string;
}

export function marcasDelCatalogo(productos: Product[]): MarcaVista[] {
  const mapa = new Map<string, MarcaVista>();
  for (const p of productos) {
    const nombre = String(p.name || '').toLowerCase();
    for (const marca of MARCAS_CONOCIDAS) {
      if (!nombre.includes(marca)) continue;
      const actual = mapa.get(marca);
      if (actual) {
        actual.count++;
        if (!actual.imagen && p.image) actual.imagen = p.image;
      } else {
        mapa.set(marca, { nombre: marca.toUpperCase(), count: 1, imagen: p.image || '' });
      }
      break;
    }
  }
  return [...mapa.values()].sort((a, b) => b.count - a.count).slice(0, 10);
}

/* ── Categorías destacadas (grilla con foto) ─────────────────────────────── */
export function CatsTop({
  categorias, onCategoria,
}: {
  categorias: CategoriaVista[];
  onCategoria: (key: string) => void;
}) {
  if (!categorias.length) return null;
  return (
    <section>
      <TituloTech eyebrow="Populares" titulo="Categorías destacadas" bajada="Lo más buscado de la tienda." />
      <div className="grid grid-cols-2 gap-3">
        {categorias.slice(0, 6).map((c) => {
          const Icono = iconoDeCategoria(c.name);
          return (
            <button
              key={c.key}
              onClick={() => onCategoria(c.key)}
              className="group overflow-hidden rounded-2xl border border-violet-100 bg-white text-left"
            >
              <span className="block h-20 overflow-hidden bg-violet-50 sm:h-24">
                {c.image ? (
                  <img src={c.image} alt={c.name} loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                ) : (
                  <span className="flex h-full w-full items-center justify-center">
                    <Icono className="h-8 w-8 text-[var(--tech-violeta)]" />
                  </span>
                )}
              </span>
              <span className="block px-3 py-2">
                <span className="block truncate text-[12px] font-bold text-[var(--tech-tinta)]">{c.name}</span>
                <span className="mt-0.5 flex items-center gap-1 text-[11px] font-semibold text-[var(--tech-violeta)]">
                  Explorar <ChevronRight className="h-3 w-3" />
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

/* ── Oferta especial (producto real destacado) ───────────────────────────── */
export function OfertaEspecial({
  producto, slug,
}: {
  producto?: Product;
  slug: string;
}) {
  const { formatear } = useMoneda();
  if (!producto) return null;
  return (
    <section className="relative overflow-hidden rounded-2xl p-5 text-white sm:p-6"
      style={{ background: 'linear-gradient(130deg,#3b1d7a 0%,#6d28e9 60%,#9333ea 100%)' }}>
      <div aria-hidden className="absolute inset-0"
        style={{ background: 'radial-gradient(300px 200px at 90% 10%, rgba(240,171,252,0.4), transparent 60%)' }} />
      <div className="relative z-10 max-w-[62%]">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-fuchsia-200">Oferta especial</p>
        <p className="mt-1 line-clamp-2 text-lg font-black leading-tight">{producto.name}</p>
        <p className="mt-1 text-sm font-bold text-fuchsia-100">{formatear(producto.price)}</p>
        <div className="mt-3 flex items-center gap-3">
          <Link
            to={`/tienda/${slug}/producto/${producto.id}`}
            className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-[13px] font-bold text-[var(--tech-tinta)] transition-transform hover:scale-105"
          >
            Comprar ahora <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
      {producto.image && (
        <img src={producto.image} alt="" aria-hidden loading="lazy"
          className="pointer-events-none absolute -bottom-4 -right-4 h-36 w-36 rounded-2xl bg-white/10 object-contain p-2 sm:h-44 sm:w-44" />
      )}
    </section>
  );
}

/* ── Vistos recientemente (historial real del visitante) ─────────────────── */
export function VistosRecientes({
  productos, slug,
}: {
  productos: Product[];
  slug: string;
}) {
  const { formatear } = useMoneda();
  const ids = leerVistos();
  if (!ids.length) return null;
  const porId = new Map(productos.map((p) => [String(p.id), p]));
  const vistos = ids.map((id) => porId.get(id)).filter((p): p is Product => !!p).slice(0, 4);
  if (!vistos.length) return null;
  return (
    <section>
      <TituloTech eyebrow="Seguí donde ibas" titulo="Vistos recientemente" />
      <div className="grid grid-cols-2 gap-3">
        {vistos.map((p) => (
          <Link key={p.id} to={`/tienda/${slug}/producto/${p.id}`}
            className="group overflow-hidden rounded-2xl border border-violet-100 bg-white">
            <span className="block h-24 overflow-hidden bg-violet-50/50">
              {p.image ? (
                <img src={p.image} alt={p.name} loading="lazy" className="h-full w-full object-contain p-2 transition-transform duration-500 group-hover:scale-105" />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-[var(--tech-gris)]">
                  <Eye className="h-6 w-6" />
                </span>
              )}
            </span>
            <span className="block px-3 py-2">
              <span className="block truncate text-[12px] font-bold text-[var(--tech-tinta)]">{p.name}</span>
              <span className="text-[12px] font-black text-[var(--tech-violeta)]">{formatear(p.price)}</span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

/* ── Top marcas (reales, del catálogo) ───────────────────────────────────── */
export function MarcasTop({ marcas }: { marcas: MarcaVista[] }) {
  if (!marcas.length) return null;
  return (
    <section>
      <TituloTech eyebrow="Originales" titulo="Top marcas" bajada="Las marcas que vendemos." />
      <div className="grid grid-cols-2 gap-2.5">
        {marcas.slice(0, 8).map((m) => (
          <div key={m.nombre}
            className="flex items-center justify-center rounded-xl border border-violet-100 bg-white px-3 py-3.5"
            title={`${m.nombre} · ${m.count} ${m.count === 1 ? 'producto' : 'productos'}`}>
            <span className="truncate text-[13px] font-black uppercase tracking-wide text-[var(--tech-tinta)]">{m.nombre}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
