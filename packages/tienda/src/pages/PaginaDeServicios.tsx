/**
 * PÁGINA DE UN NEGOCIO DE SERVICIOS (abogados, médicos, contadores, asesores).
 *
 * 09-10-2026, el dueño: "para servicios y abogacía, que no venden productos
 * físicos, no necesitan tiendas así como estas sino otro tipo de páginas".
 * Un servicio no se compra con carrito: se consulta. Por eso esta página no
 * tiene carrito, favoritos, ofertas ni "Mi pedido", y su cierre es pedir una
 * consulta.
 *
 * Regla de siempre: NADA inventado. Credenciales, dirección y horario salen
 * del perfil del negocio; si no están cargados, la sección no aparece. No hay
 * testimonios ni "casos ganados": en abogacía prometer resultados no se hace.
 */
import { useMemo, useState } from 'react';
import { MessageCircle, MapPin, Clock, ShieldCheck, CalendarCheck, Phone } from 'lucide-react';

export interface ServicioPublico {
  id: number;
  name: string;
  description: string;
  price: string;
  image: string | null;
}

export interface NegocioPublico {
  name: string;
  logo?: string | null;
  colors?: { primary?: string } | null;
  whatsappPhone?: string | null;
  socialLinks?: Record<string, string>;
  perfil?: {
    descripcion?: string;
    cobertura?: string;
    horario?: string;
    agenda?: string;
    direccion?: string;
    modalidad?: string;
    credenciales?: string[];
  };
}

const formatearPrecio = (v: string) => {
  const n = Number(v);
  return n > 0 ? `Desde ${n.toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })}` : 'Valor según tu caso';
};

const resumen = (t: string, max = 170) => {
  const limpio = String(t || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return limpio.length > max ? `${limpio.slice(0, max).replace(/\s+\S*$/, '')}…` : limpio;
};

const PaginaDeServicios = ({ negocio, servicios }: { negocio: NegocioPublico; servicios: ServicioPublico[] }) => {
  const color = negocio.colors?.primary || '#1E3A8A';
  const perfil = negocio.perfil || {};
  const wa = negocio.whatsappPhone ? String(negocio.whatsappPhone).replace(/\D/g, '') : '';

  const [form, setForm] = useState({ nombre: '', celular: '', servicio: '', caso: '', horario: '' });
  const listo = form.nombre.trim() && form.celular.trim() && form.caso.trim();

  // La consulta llega por WhatsApp, donde el agente del negocio la califica
  // (qué pasó, urgencia, ciudad) y propone la cita.
  const mensaje = useMemo(() => [
    `Hola, quiero agendar una consulta.`,
    `Nombre: ${form.nombre.trim()}`,
    `Celular: ${form.celular.trim()}`,
    form.servicio ? `Servicio: ${form.servicio}` : '',
    `Mi caso: ${form.caso.trim()}`,
    form.horario.trim() ? `Horario que me sirve: ${form.horario.trim()}` : '',
  ].filter(Boolean).join('\n'), [form]);

  const pedirConsulta = (e: React.FormEvent) => {
    e.preventDefault();
    if (!listo || !wa) return;
    window.open(`https://wa.me/${wa}?text=${encodeURIComponent(mensaje)}`, '_blank', 'noopener,noreferrer');
  };

  const irAConsulta = (servicio?: string) => {
    if (servicio) setForm((f) => ({ ...f, servicio }));
    document.getElementById('consulta')?.scrollIntoView({ behavior: 'smooth' });
  };

  const credenciales = perfil.credenciales || [];
  const hayUbicacion = perfil.direccion || perfil.horario || perfil.cobertura || perfil.agenda;

  return (
    <div className="min-h-screen bg-white text-slate-800" style={{ ['--marca' as any]: color }}>
      {/* Encabezado: marca y una sola acción. Sin carrito. */}
      <header className="sticky top-0 z-30 border-b border-slate-100 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            {negocio.logo ? <img src={negocio.logo} alt={negocio.name} className="h-10 w-auto object-contain" /> : null}
            <span className="truncate text-lg font-bold text-slate-900">{negocio.name}</span>
          </div>
          <button onClick={() => irAConsulta()} className="shrink-0 rounded-full px-5 py-2.5 text-sm font-semibold text-white shadow-sm" style={{ background: color }}>
            Agendar consulta
          </button>
        </div>
      </header>

      {/* Héroe: quién es y qué hace, con la acción arriba. */}
      <section className="relative overflow-hidden" style={{ background: `linear-gradient(135deg, ${color} 0%, #0F172A 100%)` }}>
        <div className="mx-auto max-w-6xl px-4 py-16 text-white md:py-24">
          <h1 className="max-w-3xl text-3xl font-extrabold leading-tight md:text-5xl">{negocio.name}</h1>
          {perfil.descripcion ? <p className="mt-5 max-w-2xl text-lg text-white/85 md:text-xl">{perfil.descripcion}</p> : null}
          {perfil.modalidad ? <p className="mt-3 text-sm font-medium text-white/70">{perfil.modalidad}</p> : null}
          <div className="mt-8 flex flex-wrap gap-3">
            <button onClick={() => irAConsulta()} className="rounded-full bg-white px-6 py-3 font-semibold shadow" style={{ color }}>
              <CalendarCheck className="mr-2 inline h-5 w-5" />Agendar una consulta
            </button>
            {wa ? (
              <a href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer" className="rounded-full border border-white/40 px-6 py-3 font-semibold text-white hover:bg-white/10">
                <MessageCircle className="mr-2 inline h-5 w-5" />Escribir por WhatsApp
              </a>
            ) : null}
          </div>
        </div>
      </section>

      {/* Servicios / áreas de práctica: cada uno lleva a la consulta, no a un carrito. */}
      {servicios.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 py-16">
          <h2 className="text-2xl font-bold text-slate-900 md:text-3xl">¿En qué te podemos ayudar?</h2>
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {servicios.map((s) => (
              <article key={s.id} className="flex flex-col rounded-2xl border border-slate-200 p-6 transition hover:shadow-md">
                <h3 className="text-lg font-semibold text-slate-900">{s.name}</h3>
                {s.description ? <p className="mt-2 flex-1 text-sm leading-relaxed text-slate-600">{resumen(s.description)}</p> : <div className="flex-1" />}
                <p className="mt-4 text-sm font-semibold" style={{ color }}>{formatearPrecio(s.price)}</p>
                <button onClick={() => irAConsulta(s.name)} className="mt-4 rounded-full border px-4 py-2 text-sm font-semibold hover:bg-slate-50" style={{ borderColor: color, color }}>
                  Consultar por este servicio
                </button>
              </article>
            ))}
          </div>
        </section>
      )}

      {/* Credenciales: solo las que cargó el negocio. */}
      {credenciales.length > 0 && (
        <section className="bg-slate-50">
          <div className="mx-auto max-w-6xl px-4 py-16">
            <h2 className="text-2xl font-bold text-slate-900 md:text-3xl">Por qué confiar en nosotros</h2>
            <ul className="mt-8 grid gap-4 sm:grid-cols-2">
              {credenciales.map((c) => (
                <li key={c} className="flex items-start gap-3 rounded-xl bg-white p-5 shadow-sm">
                  <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" style={{ color }} />
                  <span className="text-slate-700">{c}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* Cómo trabajamos: el proceso, sin prometer resultados. */}
      <section className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="text-2xl font-bold text-slate-900 md:text-3xl">Cómo trabajamos</h2>
        <ol className="mt-8 grid gap-5 md:grid-cols-3">
          {[
            ['Cuéntanos tu caso', 'Nos escribes o llenas el formulario con lo que necesitas.'],
            ['Te orientamos', 'Revisamos tu situación y te explicamos las opciones y cómo seguir.'],
            ['Te acompañamos', 'Si decides avanzar, te acompañamos en cada paso del proceso.'],
          ].map(([t, d], i) => (
            <li key={t} className="rounded-2xl border border-slate-200 p-6">
              <span className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold text-white" style={{ background: color }}>{i + 1}</span>
              <h3 className="mt-4 font-semibold text-slate-900">{t}</h3>
              <p className="mt-1 text-sm text-slate-600">{d}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Pedir la consulta: sin envío, sin cédula, sin pago. */}
      <section id="consulta" className="bg-slate-50">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 md:grid-cols-2">
          <div>
            <h2 className="text-2xl font-bold text-slate-900 md:text-3xl">Agenda tu consulta</h2>
            <p className="mt-3 text-slate-600">Cuéntanos brevemente tu caso y te respondemos por WhatsApp para coordinar el día y la hora.</p>
            {perfil.agenda ? <p className="mt-3 text-sm text-slate-500">{perfil.agenda}</p> : null}
            <p className="mt-6 text-xs text-slate-400">Tus datos solo los ve el equipo de {negocio.name} y se usan para responder tu consulta.</p>
          </div>
          <form onSubmit={pedirConsulta} className="space-y-4 rounded-2xl bg-white p-6 shadow-sm">
            <input required value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} placeholder="Nombre y apellido" className="w-full rounded-lg border border-slate-200 px-4 py-3" />
            <input required value={form.celular} onChange={(e) => setForm({ ...form, celular: e.target.value })} placeholder="Celular" inputMode="tel" className="w-full rounded-lg border border-slate-200 px-4 py-3" />
            {servicios.length > 0 && (
              <select value={form.servicio} onChange={(e) => setForm({ ...form, servicio: e.target.value })} className="w-full rounded-lg border border-slate-200 px-4 py-3 text-slate-700">
                <option value="">¿Sobre qué es tu consulta? (opcional)</option>
                {servicios.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
              </select>
            )}
            <textarea required value={form.caso} onChange={(e) => setForm({ ...form, caso: e.target.value })} placeholder="Cuéntanos brevemente tu caso" rows={4} className="w-full rounded-lg border border-slate-200 px-4 py-3" />
            <input value={form.horario} onChange={(e) => setForm({ ...form, horario: e.target.value })} placeholder="¿Qué días u horas te sirven? (opcional)" className="w-full rounded-lg border border-slate-200 px-4 py-3" />
            {wa ? (
              <button type="submit" disabled={!listo} className="w-full rounded-full px-6 py-3 font-semibold text-white disabled:opacity-50" style={{ background: color }}>
                Enviar mi consulta por WhatsApp
              </button>
            ) : (
              <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">Este negocio todavía no tiene WhatsApp conectado para recibir consultas.</p>
            )}
          </form>
        </div>
      </section>

      {/* Dónde y cuándo: solo lo cargado. */}
      {hayUbicacion && (
        <section className="mx-auto max-w-6xl px-4 py-16">
          <h2 className="text-2xl font-bold text-slate-900 md:text-3xl">Dónde y cuándo atendemos</h2>
          <div className="mt-8 grid gap-5 md:grid-cols-2">
            {perfil.direccion ? (
              <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(perfil.direccion)}`} target="_blank" rel="noopener noreferrer" className="flex items-start gap-3 rounded-xl border border-slate-200 p-5 hover:bg-slate-50">
                <MapPin className="mt-0.5 h-5 w-5 shrink-0" style={{ color }} />
                <span><span className="block font-semibold text-slate-900">Dirección</span><span className="text-slate-600">{perfil.direccion}</span></span>
              </a>
            ) : null}
            {perfil.horario ? (
              <div className="flex items-start gap-3 rounded-xl border border-slate-200 p-5">
                <Clock className="mt-0.5 h-5 w-5 shrink-0" style={{ color }} />
                <span><span className="block font-semibold text-slate-900">Horario</span><span className="text-slate-600">{perfil.horario}</span></span>
              </div>
            ) : null}
            {perfil.cobertura ? (
              <div className="flex items-start gap-3 rounded-xl border border-slate-200 p-5">
                <MapPin className="mt-0.5 h-5 w-5 shrink-0" style={{ color }} />
                <span><span className="block font-semibold text-slate-900">Atendemos en</span><span className="text-slate-600">{perfil.cobertura}</span></span>
              </div>
            ) : null}
          </div>
        </section>
      )}

      <footer className="bg-slate-900 text-white/70">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-10 text-sm md:flex-row md:items-center md:justify-between">
          <span>&copy; {new Date().getFullYear()} {negocio.name}</span>
          {wa ? <a href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer" className="hover:text-white"><Phone className="mr-1 inline h-4 w-4" />+{wa}</a> : null}
        </div>
      </footer>

      {wa ? (
        <a href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer" aria-label="WhatsApp"
          className="fixed bottom-5 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-lg">
          <MessageCircle className="h-7 w-7" />
        </a>
      ) : null}
    </div>
  );
};

export default PaginaDeServicios;
