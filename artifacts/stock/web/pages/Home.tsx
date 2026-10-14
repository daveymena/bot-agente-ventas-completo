import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, ChevronDown, Film, Music, Palette, Shapes, Sparkles, Wand2, Clapperboard, Type } from "lucide-react";
import type { AssetSummary } from "@shared/types";
import { api } from "@/lib/api";
import { useAuth } from "@/store/auth";
import { SearchBar } from "@/components/search/SearchBar";
import { JustifiedGrid, GridSkeleton } from "@/components/assets/JustifiedGrid";
import { AssetCard } from "@/components/assets/AssetCard";
import { Button, ErrorBox } from "@/components/ui";
import { cn } from "@/lib/utils";
import { assetPath } from "@/lib/format";

const RAIL_TABS = [
  { id: "videos", label: "Vídeos" }, { id: "featured", label: "Fotos" }, { id: "templates", label: "Plantillas" }, { id: "vectors", label: "Vectores" }, { id: "audio", label: "Audio" }, { id: "free", label: "Gratis" }, { id: "recent", label: "Novedades" },
] as const;

const FAQ = [
  ["¿Qué es VentasPro Stock?", "Es un catálogo de fotos, vectores, ilustraciones, vídeos, audio y plantillas con licencia comercial, pensado para negocios de habla hispana. Buscás, licenciás con créditos y descargás el archivo en alta resolución con un certificado de licencia."],
  ["¿Cómo funcionan los créditos?", "Cada recurso tiene un precio en créditos: imágenes, vectores, audio y plantillas cuestan 1 crédito; los vídeos HD 8 y los 4K 30. Comprás paquetes de créditos (válidos un año) o una suscripción mensual que te renueva créditos cada mes."],
  ["¿Puedo probar antes de comprar?", "Sí. Al registrarte recibís créditos de bienvenida, además hay una colección de recursos gratis y podés descargar previsualizaciones con marca de agua para tus bocetos."],
  ["¿Qué diferencia hay entre la licencia estándar y la ampliada?", "La estándar cubre usos comerciales habituales (web, redes, anuncios, impresión hasta 500.000 copias). La ampliada añade productos para la venta (merchandising, plantillas, impresiones ilimitadas)."],
  ["¿Cómo vendo mi contenido?", "Creá una cuenta de colaborador, subí tus archivos con título y palabras clave (podés autoetiquetar con IA), y cuando el equipo editorial los apruebe empiezan a generar regalías del 33 % al 35 % por licencia."],
];

export default function Home() {
  const { brand } = useAuth();
  const q = useQuery({ queryKey: ["home"], queryFn: api.home, staleTime: 60_000 });
  const [rail, setRail] = useState<(typeof RAIL_TABS)[number]["id"]>("videos");
  const [faq, setFaq] = useState<number | null>(0);
  const d = q.data;
  const railItems: AssetSummary[] = d ? (d[rail] as AssetSummary[]) : [];

  return (
    <div>
      {/* Hero */}
      <section className="relative isolate overflow-hidden bg-ink text-white">
        {d?.hero && <img src={d.hero.cardUrl} alt="" className="absolute inset-0 -z-10 h-full w-full object-cover opacity-40" />}
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-ink/70 via-ink/60 to-ink" />
        <div className="container-x py-16 sm:py-24">
          <div className="mx-auto max-w-3xl text-center">
            <h1 className="text-3xl font-extrabold tracking-tight sm:text-5xl">Busca, licencia y crea: <span className="text-brand-300">{brand?.stats.assets ? `${brand.stats.assets.toLocaleString("es")}+` : "miles de"}</span> recursos para tu marca</h1>
            <p className="mx-auto mt-4 max-w-2xl text-base text-slate-300 sm:text-lg">{brand?.tagline}</p>
            <div className="mt-8"><SearchBar size="lg" /></div>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-xs text-slate-300">
              <span>Tendencias:</span>{(d?.trending || []).slice(0, 7).map((t) => <Link key={t} to={`/buscar?q=${encodeURIComponent(t)}`} className="rounded-full border border-white/20 px-2.5 py-1 hover:bg-white/10">{t}</Link>)}
            </div>
          </div>
          <div className="mt-10 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {[{ to: "/buscar?tab=images", icon: Palette, l: "Imágenes" }, { to: "/buscar?tab=video", icon: Film, l: "Vídeos" }, { to: "/buscar?tab=audio", icon: Music, l: "Audio" }, { to: "/buscar?tab=template", icon: Type, l: "Plantillas" }, { to: "/buscar?types=vector,illustration", icon: Shapes, l: "Vectores" }, { to: "/ia", icon: Sparkles, l: "Generar con IA" }].map((x) => (
              <Link key={x.to} to={x.to} className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/5 px-3.5 py-3 text-sm font-medium backdrop-blur hover:bg-white/10"><x.icon className="h-4 w-4 text-brand-300" />{x.l}</Link>
            ))}
          </div>
          {d?.hero && <p className="mt-6 text-right text-[11px] text-slate-400">Imagen: <Link to={assetPath(d.hero)} className="underline">{d.hero.title}</Link>{d.hero.contributor && ` · ${d.hero.contributor.name}`}</p>}
        </div>
      </section>

      {/* IA Studio */}
      <section className="container-x mt-12">
        <div className="grid items-center gap-6 rounded-3xl bg-gradient-to-br from-brand-50 via-white to-amber-50 p-6 ring-1 ring-brand-100 sm:p-10 lg:grid-cols-2">
          <div>
            <span className="badge bg-brand-600 text-white">IA Studio</span>
            <h2 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">¿No encontrás lo que buscás? Generalo.</h2>
            <p className="mt-2 text-sm text-ink-soft sm:text-base">Escribí una indicación y obtené imágenes originales listas para usar o para publicar en el catálogo. Además, autoetiquetado con IA para colaboradores y búsqueda visual por imagen.</p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Link to="/ia"><Button icon={<Wand2 className="h-4 w-4" />}>Generar imagen</Button></Link>
              <Link to="/buscar?visual=1"><Button variant="secondary">Buscar por imagen</Button></Link>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {["Cambiar color", "Cambiar estado de ánimo", "Variaciones de una foto", "Escribe para editar"].map((t, i) => (
              <div key={t} className={cn("rounded-2xl p-4 text-sm font-semibold text-white shadow-card", ["bg-brand-600", "bg-ink", "bg-amber-500", "bg-emerald-600"][i])}>
                <Sparkles className="mb-6 h-5 w-5 opacity-80" />{t}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Rail por tipo */}
      <section className="container-x mt-14">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div><h2 className="text-2xl font-bold tracking-tight">Lo más destacado</h2><p className="text-sm text-mute">Seleccionado por el equipo editorial y por las descargas de la semana.</p></div>
          <div className="flex items-center gap-1 overflow-x-auto scrollbar-none">{RAIL_TABS.map((t) => <button key={t.id} onClick={() => setRail(t.id)} className={cn("chip", rail === t.id && "chip-active")}>{t.label}</button>)}</div>
        </div>
        <div className="mt-5">
          {q.isLoading ? <GridSkeleton rows={2} /> : q.error ? <ErrorBox error={q.error} retry={() => q.refetch()} /> : railItems.length ? <JustifiedGrid items={railItems} /> : <p className="text-sm text-mute">Todavía no hay recursos de este tipo.</p>}
        </div>
        <div className="mt-2 text-right"><Link to={rail === "videos" ? "/buscar?tab=video" : rail === "audio" ? "/buscar?tab=audio" : rail === "templates" ? "/buscar?tab=template" : rail === "vectors" ? "/buscar?types=vector,illustration" : rail === "free" ? "/buscar?tab=free" : rail === "recent" ? "/buscar?sort=recent" : "/buscar?tab=images"} className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:underline">Ver todo <ArrowRight className="h-4 w-4" /></Link></div>
      </section>

      {/* Colecciones curadas */}
      {d && d.curated.length > 0 && (
        <section className="container-x mt-14">
          <div className="flex items-end justify-between"><div><h2 className="text-2xl font-bold tracking-tight">Colecciones seleccionadas</h2><p className="text-sm text-mute">Bibliotecas curadas para inspirarte más rápido.</p></div><Link to="/bibliotecas" className="text-sm font-semibold text-brand-700 hover:underline">Todas</Link></div>
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {d.curated.map((c) => (
              <Link key={c.id} to={`/bibliotecas/${c.slug}`} className="group relative aspect-[4/3] overflow-hidden rounded-2xl bg-slate-200">
                <div className="grid h-full grid-cols-3 grid-rows-2 gap-0.5">
                  {(c.previews.length ? c.previews : [c.coverUrl]).slice(0, 3).map((p, i) => <img key={i} src={p || ""} alt="" className={cn("h-full w-full object-cover transition-transform duration-500 group-hover:scale-105", i === 0 && "col-span-2 row-span-2")} />)}
                </div>
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
                <div className="absolute inset-x-3 bottom-3 text-white"><p className="font-bold">{c.title}</p><p className="text-xs text-white/80">{c.count} recursos</p></div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Categorías populares */}
      {d && (
        <section className="container-x mt-14">
          <h2 className="text-2xl font-bold tracking-tight">Explora categorías populares</h2>
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {d.categories.filter((c) => c.count > 0).slice(0, 12).map((c) => (
              <Link key={c.id} to={`/buscar?category=${c.slug}`} className="group relative aspect-square overflow-hidden rounded-2xl bg-slate-200">
                {c.coverUrl && <img src={c.coverUrl} alt="" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />}
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
                <div className="absolute inset-x-3 bottom-3 text-white"><p className="text-sm font-bold">{c.name}</p><p className="text-[11px] text-white/80">{c.count} recursos</p></div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Vídeo rail cards */}
      {d && d.videos.length > 0 && (
        <section className="container-x mt-14">
          <div className="flex items-end justify-between"><div><h2 className="text-2xl font-bold tracking-tight">Vídeo para tus campañas</h2><p className="text-sm text-mute">Footage HD y 4K, fondos animados y loops. Pasá el mouse para previsualizar.</p></div><Link to="/buscar?tab=video" className="text-sm font-semibold text-brand-700 hover:underline">Ver vídeos</Link></div>
          <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">{d.videos.slice(0, 4).map((v) => <AssetCard key={v.id} asset={v} showMeta />)}</div>
        </section>
      )}

      {/* Vender */}
      <section className="container-x mt-14">
        <div className="grid items-center gap-6 rounded-3xl bg-ink p-6 text-white sm:p-10 lg:grid-cols-[1.2fr_1fr]">
          <div>
            <span className="badge bg-white/15 text-white">Colaboradores</span>
            <h2 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">Convertí tus fotos, vídeos y diseños en ingresos</h2>
            <p className="mt-2 text-sm text-slate-300 sm:text-base">Subí tu contenido, etiquetalo con ayuda de la IA y ganá regalías del {Math.round((brand?.royalty.image || 0.33) * 100)} % en imágenes y {Math.round((brand?.royalty.video || 0.35) * 100)} % en vídeo y audio por cada licencia.</p>
            <Link to="/colaborar" className="mt-5 inline-block"><Button variant="primary" icon={<Clapperboard className="h-4 w-4" />}>Empezar a vender</Button></Link>
          </div>
          <ul className="grid gap-2 text-sm">
            {["Revisión editorial en menos de 72 h", "Panel con vistas, descargas y ganancias por día", "Pagos por Nequi, Bancolombia o PayPal", "Autoetiquetado y títulos sugeridos con IA"].map((t) => <li key={t} className="flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2.5"><span className="h-1.5 w-1.5 rounded-full bg-brand-400" />{t}</li>)}
          </ul>
        </div>
      </section>

      {/* FAQ */}
      <section className="container-x mt-14 max-w-3xl">
        <h2 className="text-2xl font-bold tracking-tight">Preguntas frecuentes</h2>
        <div className="mt-4 divide-y divide-line rounded-2xl border border-line">
          {FAQ.map(([qq, a], i) => (
            <div key={qq}>
              <button onClick={() => setFaq(faq === i ? null : i)} className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left font-semibold text-ink"><span>{qq}</span><ChevronDown className={cn("h-4 w-4 shrink-0 text-mute transition-transform", faq === i && "rotate-180")} /></button>
              {faq === i && <p className="px-5 pb-5 text-sm leading-relaxed text-ink-soft">{a}</p>}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
