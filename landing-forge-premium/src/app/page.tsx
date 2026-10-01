import Link from 'next/link';

export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col items-center justify-center gap-8 px-6 py-16 text-center">
      <span className="panel-chip">Landing Forge Premium</span>

      <h1 className="font-display text-4xl leading-[1.05] font-bold tracking-tight text-balance sm:text-6xl">
        Landings de agencia para tus anuncios de{' '}
        <span className="bg-gradient-to-r from-brand-400 to-mint-400 bg-clip-text text-transparent">
          Meta Ads Colombia
        </span>
      </h1>

      <p className="max-w-xl text-base leading-relaxed text-ink-300">
        Motor de plantillas premium conectado al catálogo real de VentasProIA. Cuatro plantillas,
        cuatro temas, copy en español de Colombia y formulario de pago contra entrega listo para
        exportar en un solo archivo HTML.
      </p>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <Link href="/premium" className="panel-btn-primary px-6 py-3">
          Abrir el generador
        </Link>
        <Link href="/premium/demo" className="panel-btn-ghost px-6 py-3">
          Ver las 4 plantillas × 4 temas
        </Link>
      </div>

      <dl className="mt-6 grid w-full grid-cols-2 gap-3 text-left sm:grid-cols-4">
        {[
          ['4', 'plantillas'],
          ['4', 'temas premium'],
          ['133', 'productos del catálogo'],
          ['1', 'archivo HTML por landing'],
        ].map(([value, label]) => (
          <div key={label} className="panel-card p-4">
            <dt className="font-display text-2xl font-bold text-brand-400">{value}</dt>
            <dd className="mt-0.5 text-xs text-ink-300">{label}</dd>
          </div>
        ))}
      </dl>
    </main>
  );
}
