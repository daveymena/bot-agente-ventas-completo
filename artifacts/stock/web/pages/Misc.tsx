import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Check, X, ArrowLeft, Download, Eye, Images } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/store/auth";
import { Button, ErrorBox, PageLoader } from "@/components/ui";
import { JustifiedGrid } from "@/components/assets/JustifiedGrid";
import { dateShort, num } from "@/lib/format";

export function LicensesInfoPage() {
  const q = useQuery({ queryKey: ["license-text"], queryFn: api.licenseText, staleTime: Infinity });
  const rows: [string, boolean, boolean][] = [
    ["Web, redes sociales y publicidad digital", true, true], ["Impresión hasta 500.000 copias", true, true], ["Impresión ilimitada", false, true], ["Productos para la venta (merchandising, plantillas, libros digitales)", false, true],
    ["Uso en vídeo, presentaciones y apps", true, true], ["Uso perpetuo y mundial", true, true], ["Indemnización legal", true, true], ["Múltiples proyectos y clientes", true, true], ["Reventa o redistribución del archivo", false, false],
  ];
  return (
    <div className="container-x max-w-4xl py-10">
      <h1 className="text-3xl font-extrabold tracking-tight">Licencias</h1>
      <p className="mt-2 text-ink-soft">Todos los recursos se licencian, no se venden. Elegí la licencia según el uso que les vas a dar.</p>
      {q.isLoading ? <PageLoader /> : q.data && (
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {(["standard", "extended"] as const).map((t) => <div key={t} className="card p-5"><h2 className="text-lg font-bold">{q.data![t].name}</h2><p className="mt-1 text-sm text-mute">{q.data![t].short}</p><ul className="mt-3 space-y-1.5 text-sm text-ink-soft">{q.data![t].bullets.map((b) => <li key={b} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />{b}</li>)}</ul></div>)}
        </div>
      )}
      <table className="mt-8 w-full overflow-hidden rounded-2xl border border-line text-sm">
        <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-mute"><tr><th className="px-4 py-3">Uso</th><th className="px-4 py-3 text-center">Estándar</th><th className="px-4 py-3 text-center">Ampliada</th></tr></thead>
        <tbody className="divide-y divide-line">{rows.map(([u, s, e]) => <tr key={u}><td className="px-4 py-3">{u}</td><td className="px-4 py-3 text-center">{s ? <Check className="mx-auto h-4 w-4 text-emerald-600" /> : <X className="mx-auto h-4 w-4 text-slate-300" />}</td><td className="px-4 py-3 text-center">{e ? <Check className="mx-auto h-4 w-4 text-emerald-600" /> : <X className="mx-auto h-4 w-4 text-slate-300" />}</td></tr>)}</tbody>
      </table>
      <p className="mt-4 text-xs text-mute">Los recursos marcados como «Editorial» solo pueden usarse en contextos informativos. El contenido generado con IA se indica siempre en la ficha del recurso.</p>
      <div className="mt-6"><Link to="/precios"><Button>Ver planes y créditos</Button></Link></div>
    </div>
  );
}

export function ContributorPublicPage() {
  const { id } = useParams();
  const q = useQuery({ queryKey: ["contributor", id], queryFn: () => api.contributor(id!), enabled: !!id });
  const items = useQuery({ queryKey: ["search", `contributor=${id}`], queryFn: () => api.search({ contributor: Number(id), perPage: 60 }), enabled: !!id });
  if (q.isLoading) return <PageLoader />;
  if (q.error || !q.data) return <div className="container-x py-10"><ErrorBox error={q.error} /></div>;
  const c = q.data;
  return (
    <div className="container-x py-8">
      <Link to="/buscar" className="mb-4 inline-flex items-center gap-1 text-xs text-mute hover:text-ink"><ArrowLeft className="h-3.5 w-3.5" />Volver al catálogo</Link>
      <div className="flex flex-wrap items-center gap-5">
        <span className="grid h-20 w-20 place-items-center rounded-full bg-brand-100 text-2xl font-bold text-brand-700">{c.name.slice(0, 1)}</span>
        <div className="min-w-0 flex-1"><h1 className="text-2xl font-bold tracking-tight">{c.name}</h1>{c.bio && <p className="mt-1 max-w-xl text-sm text-ink-soft">{c.bio}</p>}<p className="mt-1 text-xs text-mute">Colaborador desde {dateShort(c.since)}{c.website && <> · <a href={c.website} target="_blank" rel="noreferrer" className="underline">{c.website.replace(/^https?:\/\//, "")}</a></>}</p></div>
        <div className="flex gap-6 text-center text-sm"><div><p className="text-xl font-bold">{num(c.stats.assets)}</p><p className="flex items-center gap-1 text-xs text-mute"><Images className="h-3 w-3" />recursos</p></div><div><p className="text-xl font-bold">{num(c.stats.downloads)}</p><p className="flex items-center gap-1 text-xs text-mute"><Download className="h-3 w-3" />descargas</p></div><div><p className="text-xl font-bold">{num(c.stats.views)}</p><p className="flex items-center gap-1 text-xs text-mute"><Eye className="h-3 w-3" />vistas</p></div></div>
      </div>
      <div className="mt-8">{items.isLoading ? <PageLoader /> : items.data?.items.length ? <JustifiedGrid items={items.data.items} /> : <p className="text-sm text-mute">Este colaborador aún no tiene recursos publicados.</p>}</div>
      {items.data && items.data.total > 60 && <div className="mt-4 text-center"><Link to={`/buscar?contributor=${id}`}><Button variant="secondary">Ver los {num(items.data.total)} recursos</Button></Link></div>}
    </div>
  );
}

export function NotFoundPage() {
  const { brand } = useAuth();
  return (
    <div className="container-x py-24 text-center">
      <p className="text-6xl font-extrabold text-slate-200">404</p>
      <h1 className="mt-2 text-xl font-bold">Esta página no existe</h1>
      <p className="mt-1 text-sm text-mute">Quizás el recurso fue retirado o el enlace está mal escrito.</p>
      <Link to="/" className="mt-5 inline-block"><Button>Ir al inicio de {brand?.name || "Stock"}</Button></Link>
    </div>
  );
}
