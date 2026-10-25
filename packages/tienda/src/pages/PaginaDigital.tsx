import { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, BookOpen, Layers, Search } from 'lucide-react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import ProductCard from '../components/ProductCard';
import type { NegocioPublico, ServicioPublico } from './PaginaDeServicios';
import { tipoDeOferta } from '../lib/experiencia-de-compra';

/** Portada editorial de contenido digital; no hereda banners de despacho. */
export default function PaginaDigital({ negocio, productos }: {
  negocio: NegocioPublico;
  productos: Array<ServicioPublico & { category?: string; kind?: string; linea?: string }>;
}) {
  const { slug = '' } = useParams();
  const [parametros] = useSearchParams();
  const [busqueda, setBusqueda] = useState('');
  const [categoria, setCategoria] = useState('');
  useEffect(() => {
    setBusqueda(parametros.get('q') || '');
    setCategoria((parametros.get('cat') || '').split('__')[0]);
  }, [parametros]);
  const digitales = useMemo(() => productos.filter(p => tipoDeOferta(p) === 'digital'), [productos]);
  const categorias = Array.from(new Set(digitales.map(p => p.category).filter((c): c is string => Boolean(c))));
  const normalizar = (v: string) => v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const visibles = digitales.filter(p => (!categoria || p.category === categoria) && normalizar(`${p.name} ${p.category || ''}`).includes(normalizar(busqueda)));
  const destacado = digitales.find(p => p.image);

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 pb-28 sm:px-6 lg:px-8">
      <section className="relative grid overflow-hidden rounded-[2rem] bg-slate-950 text-white md:grid-cols-[1.2fr_1fr]">
        <div className="relative z-10 px-6 py-12 sm:px-10 sm:py-16 lg:px-14">
          <span className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/20 px-3 py-2 text-xs font-medium text-white/80"><Layers className="h-4 w-4" /> Colección digital · {digitales.length} recursos</span>
          <h1 className="max-w-xl text-4xl font-semibold leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl">{negocio.name}</h1>
          <p className="mt-6 max-w-lg text-base leading-relaxed text-slate-300">{negocio.perfil?.descripcion || 'Explora el contenido, conoce lo que incluye cada recurso y elige el que necesitas para tu próximo proyecto.'}</p>
          <a href="#coleccion-digital" className="mt-8 inline-flex min-h-12 items-center gap-3 rounded-full bg-white px-6 text-sm font-semibold text-slate-950">Explorar la colección <ArrowUpRight className="h-4 w-4" /></a>
        </div>
        {destacado ? (
          <Link to={`/tienda/${slug}/producto/${destacado.id}`} className="relative flex min-h-64 items-center justify-center bg-white/5 p-8 sm:p-12">
            <div className="w-full max-w-sm rounded-2xl border border-white/15 bg-white/10 p-5 shadow-2xl">
              <img src={destacado.image!} alt={destacado.name} className="aspect-[4/3] w-full rounded-xl bg-white object-contain" />
              <p className="mt-5 text-xs uppercase tracking-widest text-slate-400">Explora este recurso</p>
              <p className="mt-2 text-xl font-medium leading-snug">{destacado.name}</p>
            </div>
          </Link>
        ) : <div className="hidden items-center justify-center text-white/15 md:flex"><BookOpen className="h-40 w-40" strokeWidth={0.6} /></div>}
      </section>

      <section id="coleccion-digital" className="scroll-mt-32 pt-12">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div><p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Elige tu próximo paso</p><h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">La colección</h2></div>
          <label className="flex min-h-12 items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 sm:w-80"><Search className="h-4 w-4 shrink-0 text-slate-400" /><input aria-label="Buscar en la colección digital" value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="¿Qué quieres encontrar?" className="min-w-0 w-full bg-transparent py-3 text-sm outline-none" /></label>
        </div>
        {categorias.length > 0 && <div className="my-6 flex gap-2 overflow-x-auto pb-2" aria-label="Categorías digitales">
          {['', ...categorias].map(c => <button key={c} onClick={() => setCategoria(c)} aria-pressed={categoria === c} className={`min-h-11 shrink-0 rounded-full border px-4 text-sm font-medium ${categoria === c ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-600'}`}>{c || 'Todo el contenido'}</button>)}
        </div>}
        <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
          {visibles.map(p => <ProductCard key={p.id} slug={slug} mostrarTipo={false} product={{ id: String(p.id), name: p.name, description: p.description || '', price: Number(p.price), image: p.image || '', category: p.category || 'Digital', type: 'digital', stock: 1 }} />)}
        </div>
        {visibles.length === 0 && <p role="status" className="py-16 text-center text-slate-500">{digitales.length ? 'No encontramos contenido con esos filtros.' : 'La colección digital se está preparando.'}</p>}
        <p className="mt-10 rounded-2xl border border-slate-200 p-5 text-sm leading-relaxed text-slate-600">Antes de comprar, revisa el contenido incluido, los requisitos y las condiciones de acceso en la ficha. La entrega se realiza según lo indicado para cada producto.</p>
      </section>
    </main>
  );
}
