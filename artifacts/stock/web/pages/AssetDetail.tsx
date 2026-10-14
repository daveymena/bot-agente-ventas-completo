import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bookmark, BookmarkCheck, Check, Download, FileText, Info, Layers, ShieldCheck, Sparkles, Users, Coins, Clock, Maximize2, Share2, AlertTriangle } from "lucide-react";
import type { AssetDetail as AssetDetailT, LicenseType } from "@shared/types";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/store/auth";
import { useUi, toast } from "@/store/ui";
import { bytes, credits, dateShort, duration, megapixels, num, typeLabel } from "@/lib/format";
import { cn, copyText, downloadUrl } from "@/lib/utils";
import { Badge, Button, Dialog, ErrorBox, PageLoader, Radio, Tip } from "@/components/ui";
import { JustifiedGrid } from "@/components/assets/JustifiedGrid";
import { AudioStrip } from "@/components/assets/AudioPlayer";

export default function AssetDetailPage() {
  const { id } = useParams();
  const qc = useQueryClient();
  const { user, requireAuth, setUser, brand } = useAuth();
  const openSave = useUi((s) => s.openSave);
  const a = useQuery({ queryKey: ["asset", Number(id)], queryFn: () => api.asset(id!), enabled: !!id });
  const similar = useQuery({ queryKey: ["similar", Number(id)], queryFn: () => api.similar(id!), enabled: !!id });
  const series = useQuery({ queryKey: ["series", Number(id)], queryFn: () => api.series(id!), enabled: !!a.data?.seriesId });
  const more = useQuery({ queryKey: ["contributor-more", Number(id)], queryFn: () => api.contributorMore(id!), enabled: !!a.data?.contributor });
  const quote = useQuery({ queryKey: ["quote", Number(id), user?.id, user?.credits], queryFn: () => api.quote(Number(id)), enabled: !!id });
  const [type, setType] = useState<LicenseType>("standard");
  const [done, setDone] = useState<{ licenseId: number; certificateNo: string } | null>(null);
  const [lightbox, setLightbox] = useState(false);

  useEffect(() => { window.scrollTo({ top: 0 }); setDone(null); }, [id]);
  useEffect(() => { if (a.data) document.title = `${a.data.title} · ${typeLabel(a.data.type)} · ${brand?.name || "Stock"}`; }, [a.data, brand?.name]);

  const lic = useMutation({
    mutationFn: () => api.license(Number(id), type),
    onSuccess: (r) => { setUser(r.user); setDone({ licenseId: r.license.id, certificateNo: r.license.certificateNo }); qc.invalidateQueries({ queryKey: ["asset", Number(id)] }); qc.invalidateQueries({ queryKey: ["licenses"] }); qc.invalidateQueries({ queryKey: ["quote"] }); toast({ kind: "success", title: "Licencia emitida", description: `Certificado ${r.license.certificateNo}` }); },
    onError: (e: any) => { if (e instanceof ApiError && e.status === 402) toast({ kind: "error", title: "Créditos insuficientes", description: "Comprá un paquete o activá una suscripción." }); else toast({ kind: "error", title: e.message }); },
  });

  if (a.isLoading) return <PageLoader />;
  if (a.error || !a.data) return <div className="container-x py-10"><ErrorBox error={a.error || new Error("Recurso no encontrado")} /></div>;
  const d: AssetDetailT = a.data;
  const isVideo = d.type === "video", isAudio = d.type === "audio";
  const q = quote.data;
  const selected = q ? q[type] : null;
  const saved = (d.savedInCollections?.length || 0) > 0;
  const price = type === "extended" ? d.priceCredits.extended : d.priceCredits.standard;

  const onLicense = () => requireAuth(() => lic.mutate());
  const share = async () => { const ok = await copyText(window.location.href); toast({ kind: ok ? "success" : "info", title: ok ? "Enlace copiado" : window.location.href }); };

  return (
    <div className="container-x py-6">
      <nav className="mb-3 flex flex-wrap items-center gap-1.5 text-xs text-mute">
        <Link to="/" className="hover:underline">Inicio</Link><span>/</span>
        <Link to={`/buscar?tab=${isVideo ? "video" : isAudio ? "audio" : d.type === "template" ? "template" : "images"}`} className="hover:underline">{typeLabel(d.type)}s</Link>
        {d.category && <><span>/</span><Link to={`/buscar?category=${d.category.slug}`} className="hover:underline">{d.category.name}</Link></>}
      </nav>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
        {/* Previsualización */}
        <div>
          <div className={cn("relative overflow-hidden rounded-2xl bg-slate-100 ring-1 ring-line", isAudio ? "aspect-[16/7]" : "")}>
            {isVideo && d.previewUrl.endsWith(".mp4") ? (
              <video key={d.id} src={d.previewUrl} poster={d.posterUrl || d.cardUrl} controls playsInline className="mx-auto max-h-[72vh] w-full bg-black object-contain" />
            ) : isAudio ? (
              <>
                <img src={d.previewUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-black/10" />
                <div className="absolute inset-x-4 bottom-4"><AudioStrip src={d.previewUrl.includes("/stream") ? d.previewUrl : `/api/assets/${d.id}/stream`} waveform={d.waveform} durationSec={d.durationSec} title={d.title} /></div>
              </>
            ) : (
              <button onClick={() => setLightbox(true)} className="block w-full cursor-zoom-in" aria-label="Ampliar">
                <img src={d.previewUrl} alt={d.title} className="mx-auto max-h-[72vh] w-auto max-w-full object-contain" style={{ backgroundImage: d.blurData ? `url(${d.blurData})` : undefined, backgroundSize: "cover" }} />
                <span className="absolute bottom-3 right-3 rounded-md bg-black/60 p-1.5 text-white"><Maximize2 className="h-4 w-4" /></span>
              </button>
            )}
            <div className="pointer-events-none absolute left-3 top-3 flex gap-1.5">
              {d.isFree && <Badge tone="green">Gratis</Badge>}{d.isPremium && <Badge tone="amber">Premium</Badge>}{d.isAiGenerated && <Badge tone="dark"><Sparkles className="mr-1 h-3 w-3" />Generado con IA</Badge>}{d.isEditorial && <Badge tone="dark">Solo uso editorial</Badge>}
            </div>
          </div>
          <p className="mt-2 text-[11px] text-mute">Previsualización con marca de agua. El archivo original (sin marca, {d.fileFormat.toUpperCase()}{d.width ? ` ${d.width}×${d.height}` : ""}) se descarga al licenciar.</p>

          <div className="mt-5 flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{d.title}</h1>
              {d.contributor && <p className="mt-1 text-sm text-mute">Por <Link to={`/colaboradores/${d.contributor.id}`} className="font-semibold text-ink hover:underline">{d.contributor.name}</Link> · {typeLabel(d.type)} · ID {d.id}</p>}
            </div>
            <div className="flex gap-1.5">
              <Tip label="Buscar similares"><Link to={`/buscar?similar=${d.id}`} className="btn-secondary btn-sm"><Layers className="h-4 w-4" /><span className="hidden sm:inline">Similares</span></Link></Tip>
              <Tip label={saved ? "Guardado en tus bibliotecas" : "Guardar"}><button onClick={() => requireAuth(() => openSave(d.id))} className="btn-secondary btn-sm">{saved ? <BookmarkCheck className="h-4 w-4 text-brand-600" /> : <Bookmark className="h-4 w-4" />}<span className="hidden sm:inline">{saved ? "Guardado" : "Guardar"}</span></button></Tip>
              <Tip label="Copiar enlace"><button onClick={share} className="btn-secondary btn-sm"><Share2 className="h-4 w-4" /></button></Tip>
            </div>
          </div>
          {d.description && <p className="mt-3 max-w-3xl text-sm leading-relaxed text-ink-soft">{d.description}</p>}

          {/* Ficha técnica */}
          <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-2 rounded-2xl border border-line p-4 text-sm sm:grid-cols-3 lg:grid-cols-4">
            {[
              ["Tipo", typeLabel(d.type)], ["Formato", d.fileFormat.toUpperCase()], ...(d.width ? [["Dimensiones", `${num(d.width)} × ${num(d.height)} px`]] : []), ...(d.width && !isVideo ? [["Resolución", megapixels(d.width, d.height)]] : []),
              ...(isVideo ? [["Calidad", d.resolutionLabel || "—"], ["Duración", duration(d.durationSec)], ["Fotogramas", d.fps ? `${d.fps} fps` : "—"]] : []), ...(isAudio ? [["Duración", duration(d.durationSec)]] : []),
              ["Peso", bytes(d.fileSizeBytes)], ["Publicado", dateShort(d.createdAt)], ["Categoría", d.category?.name || "—"], ["Personas", d.hasPeople ? `${d.peopleCount || "Sí"}${d.modelRelease ? " · con autorización" : ""}` : "No"],
            ].map(([k, v]) => <div key={k}><dt className="text-[11px] font-semibold uppercase tracking-wide text-mute">{k}</dt><dd className="font-medium text-ink">{v}</dd></div>)}
          </dl>

          {/* Palabras clave */}
          {d.keywords.length > 0 && (
            <div className="mt-5"><h3 className="text-sm font-semibold">Palabras clave</h3><div className="mt-2 flex flex-wrap gap-1.5">{d.keywords.map((k) => <Link key={k} to={`/buscar?q=${encodeURIComponent(k)}`} className="chip text-xs">{k}</Link>)}</div></div>
          )}
        </div>

        {/* Caja de licencia */}
        <aside className="lg:sticky lg:top-20 lg:self-start">
          <div className="card p-5">
            {done ? (
              <div className="text-center">
                <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-emerald-100 text-emerald-700"><Check className="h-6 w-6" /></div>
                <h2 className="mt-3 text-lg font-bold">¡Licencia lista!</h2>
                <p className="mt-1 text-sm text-mute">Certificado <span className="font-mono font-semibold text-ink">{done.certificateNo}</span></p>
                <Button className="mt-4 w-full" icon={<Download className="h-4 w-4" />} onClick={() => downloadUrl(`/api/licenses/${done.licenseId}/download`)}>Descargar archivo original</Button>
                <a href={`/api/licenses/${done.licenseId}/certificate`} target="_blank" rel="noreferrer" className="btn-secondary mt-2 w-full"><FileText className="h-4 w-4" />Ver certificado</a>
                <Link to="/cuenta/licencias" className="mt-3 block text-xs font-semibold text-brand-700 hover:underline">Ir a mis licencias</Link>
              </div>
            ) : d.licensedByMe ? (
              <div>
                <div className="flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800"><ShieldCheck className="h-5 w-5" />Ya tenés licencia {d.licensedByMe === "extended" ? "ampliada" : "estándar"} de este recurso.</div>
                <Link to="/cuenta/licencias" className="btn-primary mt-3 w-full"><Download className="h-4 w-4" />Descargar desde mis licencias</Link>
                {d.licensedByMe === "standard" && d.priceCredits.extended > 0 && <button onClick={() => { setType("extended"); onLicense(); }} className="mt-2 w-full text-xs font-semibold text-brand-700 hover:underline">Ampliar a licencia ampliada ({credits(d.priceCredits.extended)})</button>}
              </div>
            ) : (
              <>
                <div className="flex items-baseline justify-between"><h2 className="text-base font-bold">Licenciar este recurso</h2>{user && <span className="flex items-center gap-1 text-xs text-mute"><Coins className="h-3.5 w-3.5 text-amber-500" />{user.credits} disponibles</span>}</div>
                <div className="mt-3 space-y-2">
                  {(["standard", "extended"] as const).map((t) => {
                    const p = t === "extended" ? d.priceCredits.extended : d.priceCredits.standard;
                    const qq = q?.[t];
                    return (
                      <label key={t} className={cn("flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition", type === t ? "border-ink bg-slate-50 ring-1 ring-ink" : "border-line hover:border-slate-400")}>
                        <input type="radio" className="mt-1 accent-brand-600" checked={type === t} onChange={() => setType(t)} />
                        <div className="flex-1">
                          <div className="flex items-center justify-between"><span className="text-sm font-semibold">{t === "standard" ? "Licencia estándar" : "Licencia ampliada"}</span><span className="text-sm font-bold">{p === 0 ? "Gratis" : qq?.coveredBySubscription ? "Incluido en tu plan" : credits(p)}</span></div>
                          <p className="mt-0.5 text-xs text-mute">{t === "standard" ? "Web, redes, anuncios, impresión hasta 500.000 copias." : "Todo lo anterior + productos para la venta e impresiones ilimitadas."}</p>
                        </div>
                      </label>
                    );
                  })}
                </div>
                {d.isEditorial && <p className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 p-2.5 text-xs text-amber-800"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />Uso editorial: no se permite en publicidad ni promoción comercial.</p>}
                <Button className="mt-4 w-full" size="lg" loading={lic.isPending} onClick={onLicense} icon={<Download className="h-4 w-4" />}>
                  {!user ? "Iniciar sesión para licenciar" : price === 0 ? "Descargar gratis" : selected?.coveredBySubscription ? "Descargar con mi plan" : selected && !selected.canAfford ? "Comprar créditos y descargar" : `Licenciar por ${credits(price)}`}
                </Button>
                {user && selected && !selected.canAfford && price > 0 && !selected.coveredBySubscription && (
                  <p className="mt-2 text-center text-xs text-mute">Te faltan {price - (q?.credits || 0)} créditos. <Link to="/precios" className="font-semibold text-brand-700 hover:underline">Ver paquetes y planes</Link></p>
                )}
                <button onClick={() => requireAuth(() => { downloadUrl(`/api/assets/${d.id}/comp`); toast({ kind: "success", title: "Descargando previsualización" }); })} className="mt-3 flex w-full items-center justify-center gap-1.5 text-xs font-semibold text-ink-soft hover:text-ink"><Download className="h-3.5 w-3.5" />Descargar previsualización con marca de agua</button>
                <ul className="mt-4 space-y-1.5 border-t border-line pt-4 text-xs text-ink-soft">
                  {["Licencia perpetua, mundial y multiusos", "Certificado de licencia descargable", "Indemnización legal incluida", "Sin atribución obligatoria"].map((t) => <li key={t} className="flex items-center gap-2"><Check className="h-3.5 w-3.5 text-emerald-600" />{t}</li>)}
                </ul>
                <Link to="/licencias" className="mt-3 flex items-center gap-1 text-xs text-brand-700 hover:underline"><Info className="h-3.5 w-3.5" />Comparar licencias</Link>
              </>
            )}
          </div>
          {d.contributor && (
            <div className="card mt-3 flex items-center gap-3 p-4">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-brand-100 text-sm font-bold text-brand-700">{d.contributor.name.slice(0, 1)}</span>
              <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{d.contributor.name}</p><p className="text-xs text-mute">Colaborador verificado</p></div>
              <Link to={`/colaboradores/${d.contributor.id}`} className="btn-secondary btn-sm">Ver portafolio</Link>
            </div>
          )}
          <div className="mt-3 flex items-center gap-4 px-1 text-[11px] text-mute"><span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" />{num(d.views)} vistas</span><span className="flex items-center gap-1"><Download className="h-3.5 w-3.5" />{num(d.downloads)} descargas</span><span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{dateShort(d.createdAt)}</span></div>
        </aside>
      </div>

      {/* Serie */}
      {series.data && series.data.length > 0 && (
        <section className="mt-12"><div className="mb-3 flex items-end justify-between"><h2 className="text-lg font-bold">De la misma serie</h2><Link to={`/buscar?series=${d.seriesId}`} className="text-sm font-semibold text-brand-700 hover:underline">Ver serie</Link></div><JustifiedGrid items={series.data} targetHeight={200} /></section>
      )}
      {/* Similares */}
      {similar.data && similar.data.length > 0 && (
        <section className="mt-12"><div className="mb-3 flex items-end justify-between"><h2 className="text-lg font-bold">Recursos similares</h2><Link to={`/buscar?similar=${d.id}`} className="text-sm font-semibold text-brand-700 hover:underline">Ver más</Link></div><JustifiedGrid items={similar.data.slice(0, 12)} targetHeight={220} /></section>
      )}
      {/* Más del colaborador */}
      {more.data && more.data.length > 0 && (
        <section className="mt-12"><div className="mb-3 flex items-end justify-between"><h2 className="text-lg font-bold">Más de {d.contributor?.name}</h2><Link to={`/colaboradores/${d.contributor?.id}`} className="text-sm font-semibold text-brand-700 hover:underline">Portafolio</Link></div><JustifiedGrid items={more.data.slice(0, 10)} targetHeight={200} /></section>
      )}

      <Dialog open={lightbox} onOpenChange={setLightbox} size="full" hideClose={false} title={d.title}>
        <img src={d.previewUrl} alt={d.title} className="mx-auto max-h-[80vh] w-auto max-w-full rounded-lg" />
      </Dialog>
    </div>
  );
}
