import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Sparkles, Wand2, Download, Upload, Palette, Sun, Clapperboard, Type, AlertTriangle, Coins } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/store/auth";
import { toast } from "@/store/ui";
import { assetPath, dateTime } from "@/lib/format";
import { Button, Empty, PageLoader, Select, Textarea } from "@/components/ui";
import { cn, downloadUrl } from "@/lib/utils";

const IDEAS = ["Oficina moderna con luz natural, equipo diverso trabajando, estilo fotográfico", "Taza de café sobre mesa de madera, fondo desenfocado, luz de mañana", "Ilustración plana de ciudad latinoamericana al atardecer, colores cálidos", "Fondo abstracto con degradado índigo y violeta, formas suaves", "Plato de comida colombiana presentado en restaurante, fotografía gastronómica", "Montañas andinas con niebla, panorámica, estilo cinematográfico"];
const TOOLS = [{ i: Palette, t: "Cambiar color", d: "Describí la paleta en el prompt: «tonos pastel», «monocromo azul»…" }, { i: Sun, t: "Cambiar estado de ánimo", d: "«luz dorada de atardecer», «ambiente nocturno de neón», «minimalista y limpio»." }, { i: Clapperboard, t: "Estilo", d: "«fotografía de producto», «ilustración vectorial», «render 3D», «acuarela»." }, { i: Type, t: "Escribe para editar", d: "Iterá: generá, ajustá el texto y volvé a generar hasta que quede perfecto." }];

export default function AiStudioPage() {
  const [sp] = useSearchParams();
  const { user, requireAuth, setUser, brand } = useAuth();
  const qc = useQueryClient();
  const status = useQuery({ queryKey: ["ai-status"], queryFn: api.aiStatus, staleTime: 300_000 });
  const gens = useQuery({ queryKey: ["ai-generations"], queryFn: api.aiGenerations, enabled: !!user });
  const [prompt, setPrompt] = useState(sp.get("prompt") || "");
  const [size, setSize] = useState("1024x1024");
  const gen = useMutation({
    mutationFn: () => api.aiGenerate(prompt.trim(), size),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["ai-generations"] }); api.me().then((u) => u && setUser(u)); toast({ kind: "success", title: "Imagen generada" }); },
    onError: (e: any) => toast({ kind: "error", title: e.message }),
  });
  const publish = useMutation({ mutationFn: (id: number) => api.aiPublish(id), onSuccess: () => { qc.invalidateQueries({ queryKey: ["ai-generations"] }); toast({ kind: "success", title: "Enviado a revisión", description: "Aparecerá en el catálogo marcado como generado con IA." }); }, onError: (e: any) => toast({ kind: "error", title: e.message }) });
  useEffect(() => { document.title = `IA Studio · ${brand?.name || "Stock"}`; }, [brand?.name]);
  useEffect(() => { if (status.data?.sizes?.length && !status.data.sizes.includes(size)) setSize(status.data.sizes[0]); }, [status.data]);
  const enabled = !!status.data?.enabled;

  return (
    <div>
      <section className="bg-gradient-to-br from-violet-700 via-brand-700 to-ink text-white">
        <div className="container-x py-12">
          <p className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-violet-200"><Sparkles className="h-4 w-4" />IA Studio</p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">Generá la imagen exacta que necesitás</h1>
          <p className="mt-2 max-w-2xl text-white/80">Describí la escena, elegí el formato y obtené una imagen lista para licenciar. Los colaboradores pueden publicar sus generaciones en el catálogo.</p>
          <form className="mt-6 max-w-3xl rounded-2xl bg-white p-3 text-ink shadow-pop" onSubmit={(e) => { e.preventDefault(); if (prompt.trim().length < 3) return; requireAuth(() => gen.mutate()); }}>
            <Textarea rows={3} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Ej.: fotografía de una panadería artesanal en Cali, pan recién horneado, luz cálida de la mañana" className="border-0 bg-transparent px-2 text-base shadow-none focus:ring-0" maxLength={1000} />
            <div className="flex flex-wrap items-center gap-2 border-t border-line px-2 pt-2">
              <Select className="w-44 py-1.5 text-xs" value={size} onChange={(e) => setSize(e.target.value)}>{(status.data?.sizes?.length ? status.data.sizes : ["1024x1024", "1792x1024", "1024x1792"]).map((s) => <option key={s} value={s}>{s === "1024x1024" ? "Cuadrado 1:1" : s === "1792x1024" || s === "1536x1024" ? "Horizontal 16:9" : s === "1024x1792" || s === "1024x1536" ? "Vertical 9:16" : s}</option>)}</Select>
              <span className="flex items-center gap-1 text-xs text-mute"><Coins className="h-3.5 w-3.5 text-amber-500" />1 crédito por generación{user && ` · tenés ${user.credits}`}</span>
              <div className="flex-1" />
              <Button type="submit" loading={gen.isPending} disabled={!enabled && !!status.data} icon={<Wand2 className="h-4 w-4" />}>Generar</Button>
            </div>
          </form>
          {status.data && !enabled && <p className="mt-3 flex max-w-3xl items-center gap-2 rounded-xl bg-amber-400/20 p-3 text-sm text-amber-100"><AlertTriangle className="h-4 w-4 shrink-0" />IA Studio no está activo: configurá <code className="rounded bg-black/30 px-1">STOCK_OPENAI_API_KEY</code> en el servidor para habilitar generación, etiquetado automático y búsqueda visual semántica.</p>}
          <div className="mt-4 flex flex-wrap gap-1.5">{IDEAS.map((i) => <button key={i} onClick={() => setPrompt(i)} className="rounded-full bg-white/10 px-3 py-1 text-xs text-white/90 ring-1 ring-white/20 hover:bg-white/20">{i.slice(0, 48)}…</button>)}</div>
        </div>
      </section>

      <section className="container-x py-10">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{TOOLS.map((t) => <div key={t.t} className="card p-4"><t.i className="h-5 w-5 text-brand-600" /><p className="mt-2 text-sm font-semibold">{t.t}</p><p className="mt-1 text-xs text-mute">{t.d}</p></div>)}</div>
      </section>

      <section className="container-x pb-14">
        <h2 className="text-xl font-bold tracking-tight">Tus generaciones</h2>
        {!user ? <Empty className="mt-3" title="Iniciá sesión para generar" body="Cada cuenta nueva recibe créditos de bienvenida para probar." action={<Button onClick={() => requireAuth()}>Iniciar sesión</Button>} /> : gens.isLoading ? <PageLoader /> : !gens.data?.length ? <Empty className="mt-3" icon={<Sparkles className="h-6 w-6" />} title="Todavía no generaste imágenes" body="Escribí un prompt arriba y presioná Generar." /> : (
          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
            {gens.data.map((g) => (
              <div key={g.id} className="card overflow-hidden">
                <div className="aspect-square bg-slate-100">{g.asset ? <img src={g.asset.previewUrl} alt={g.prompt} className="h-full w-full object-cover" /> : <div className={cn("grid h-full place-items-center p-4 text-center text-xs", g.status === "failed" ? "text-red-600" : "text-mute")}>{g.status === "failed" ? g.error || "Falló la generación" : "Procesando…"}</div>}</div>
                <div className="p-3"><p className="line-clamp-2 text-xs text-ink-soft" title={g.prompt}>{g.prompt}</p><p className="mt-1 text-[11px] text-mute">{g.size} · {dateTime(g.createdAt)}</p>
                  {g.asset && <div className="mt-2 flex flex-wrap gap-1.5">
                    <Link to={assetPath(g.asset)} className="btn-secondary btn-sm">Ver ficha</Link>
                    <Button size="sm" variant="ghost" icon={<Download className="h-4 w-4" />} onClick={() => downloadUrl(g.asset!.previewUrl)}>Preview</Button>
                    {user.role !== "user" && g.asset.status === "draft" && <Button size="sm" variant="ghost" icon={<Upload className="h-4 w-4" />} loading={publish.isPending && publish.variables === g.id} onClick={() => publish.mutate(g.id)}>Publicar</Button>}
                    {g.asset.status === "pending" && <span className="badge bg-amber-100 text-amber-800">En revisión</span>}{g.asset.status === "approved" && <span className="badge bg-emerald-100 text-emerald-800">Publicado</span>}
                  </div>}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
