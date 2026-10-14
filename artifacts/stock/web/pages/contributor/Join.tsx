import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { Camera, Check, Coins, Globe, ShieldCheck, Upload, Wand2 } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/store/auth";
import { toast } from "@/store/ui";
import { money } from "@/lib/format";
import { Button, Checkbox, Field, Input, Textarea } from "@/components/ui";

export default function JoinPage() {
  const { user, brand, requireAuth, setUser } = useAuth();
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState(user?.name || ""); const [bio, setBio] = useState(""); const [website, setWebsite] = useState(""); const [terms, setTerms] = useState(false);
  const join = useMutation({ mutationFn: () => api.joinContributor({ displayName, bio, website, acceptTerms: true }), onSuccess: (u) => { setUser(u); toast({ kind: "success", title: "¡Bienvenido al programa de colaboradores!" }); navigate("/colaborador/subir"); }, onError: (e: any) => toast({ kind: "error", title: e.message }) });
  const already = user && user.role !== "user";
  const royalty = brand?.royalty || { image: 0.33, video: 0.35, audio: 0.35 };

  return (
    <div>
      <section className="bg-gradient-to-br from-ink via-slate-900 to-brand-900 text-white">
        <div className="container-x grid items-center gap-10 py-16 lg:grid-cols-2">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wider text-brand-300">Programa de colaboradores</p>
            <h1 className="mt-2 text-4xl font-extrabold tracking-tight sm:text-5xl">Vendé tus fotos, vídeos, vectores y música</h1>
            <p className="mt-4 max-w-lg text-lg text-slate-300">Subí tu contenido, nosotros lo revisamos, lo etiquetamos con IA y lo ponemos frente a miles de compradores. Vos cobrás regalías por cada licencia.</p>
            <div className="mt-6 flex flex-wrap gap-3">{already ? <Link to="/colaborador" className="btn-primary">Ir a mi panel</Link> : <a href="#unirme" className="btn-primary">Empezar ahora</a>}<Link to="/colaborador/recursos" className="btn-ghost text-white hover:bg-white/10">Ver requisitos</Link></div>
            <div className="mt-8 grid grid-cols-3 gap-4 text-center"><div><p className="text-2xl font-extrabold">{Math.round(royalty.image * 100)} %</p><p className="text-xs text-slate-400">regalía en imágenes</p></div><div><p className="text-2xl font-extrabold">{Math.round(royalty.video * 100)} %</p><p className="text-xs text-slate-400">en vídeo y audio</p></div><div><p className="text-2xl font-extrabold">{money(brand?.payoutMinimumCents || 0)}</p><p className="text-xs text-slate-400">mínimo de retiro</p></div></div>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            {[{ i: Upload, t: "Subida simple", d: "Arrastrá tus archivos; leemos metadatos, generamos previsualizaciones y marca de agua." }, { i: Wand2, t: "Etiquetado con IA", d: "Título, descripción y palabras clave sugeridas automáticamente para vender más." }, { i: ShieldCheck, t: "Revisión en 24-72 h", d: "Moderación humana con motivos claros si algo necesita corrección." }, { i: Coins, t: "Pagos claros", d: "Panel de ganancias, historial por licencia y retiros a Nequi, Bancolombia, PayPal o Payoneer." }].map((x) => <div key={x.t} className="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10"><x.i className="h-5 w-5 text-brand-300" /><p className="mt-2 font-semibold">{x.t}</p><p className="mt-1 text-xs text-slate-300">{x.d}</p></div>)}
          </div>
        </div>
      </section>

      <section className="container-x grid gap-8 py-14 lg:grid-cols-[1fr_420px]">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Qué aceptamos</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {[["Fotos", "JPG · mínimo 4 MP · sin marcas de agua ni bordes · sRGB"], ["Ilustraciones y vectores", "SVG o JPG + archivo fuente · formas limpias · sin texto con errores"], ["Vídeo", "MP4/MOV · HD o 4K · 5 a 60 s · sin audio con derechos"], ["Audio", "MP3/WAV · 44,1 kHz · loops y pistas completas"], ["Plantillas y 3D", "PSD/AI/PPTX/ZIP/GLB + imagen de portada JPG/PNG"], ["Contenido con personas", "Requiere autorización de modelo o marcarse como editorial"]].map(([t, d]) => <div key={t} className="rounded-xl border border-line p-4"><p className="font-semibold">{t}</p><p className="mt-1 text-xs text-mute">{d}</p></div>)}
          </div>
          <h2 className="mt-10 text-2xl font-bold tracking-tight">Cómo funciona</h2>
          <ol className="mt-4 space-y-3">{["Creá tu perfil de colaborador (1 minuto).", "Subí tus archivos y completá título, palabras clave y categoría (o dejá que la IA lo sugiera).", "Nuestro equipo revisa calidad, legalidad y metadatos.", "Tu recurso se publica y aparece en búsquedas, colecciones y recomendaciones.", "Cobrás regalías por cada licencia y retirás cuando superás el mínimo."].map((s, i) => <li key={s} className="flex gap-3 text-sm"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-ink text-xs font-bold text-white">{i + 1}</span>{s}</li>)}</ol>
        </div>
        <div id="unirme" className="card h-fit p-6 lg:sticky lg:top-24">
          {already ? (
            <div className="text-center"><Check className="mx-auto h-10 w-10 text-emerald-600" /><h3 className="mt-2 text-lg font-bold">Ya sos colaborador</h3><p className="text-sm text-mute">Entrá a tu panel para subir y gestionar recursos.</p><Link to="/colaborador" className="btn-primary mt-4 w-full">Ir al panel</Link></div>
          ) : !user ? (
            <div className="text-center"><Camera className="mx-auto h-10 w-10 text-brand-600" /><h3 className="mt-2 text-lg font-bold">Creá tu cuenta para empezar</h3><p className="text-sm text-mute">Es gratis y tardás menos de un minuto.</p><Button className="mt-4 w-full" onClick={() => requireAuth(undefined, "register")}>Registrarme</Button><button onClick={() => requireAuth()} className="mt-2 text-xs font-semibold text-brand-700 hover:underline">Ya tengo cuenta</button></div>
          ) : (
            <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (!terms) return toast({ kind: "error", title: "Aceptá el acuerdo de colaborador" }); join.mutate(); }}>
              <h3 className="text-lg font-bold">Perfil de colaborador</h3>
              <Field label="Nombre público" hint="Aparece en tus recursos"><Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} required minLength={2} maxLength={60} /></Field>
              <Field label="Biografía (opcional)"><Textarea value={bio} onChange={(e) => setBio(e.target.value)} maxLength={400} rows={3} placeholder="Fotógrafa de producto en Cali…" /></Field>
              <Field label="Sitio web o portafolio (opcional)"><div className="relative"><Globe className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-mute" /><Input className="pl-9" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://" /></div></Field>
              <Checkbox checked={terms} onChange={setTerms} label={<span className="text-xs">Acepto el <Link to="/licencias" className="underline">acuerdo de colaborador</Link>: soy titular de los derechos, el contenido no infringe derechos de terceros y autorizo a {brand?.name || "la plataforma"} a licenciarlo.</span>} />
              <Button type="submit" className="w-full" loading={join.isPending}>Unirme al programa</Button>
            </form>
          )}
        </div>
      </section>
    </div>
  );
}
