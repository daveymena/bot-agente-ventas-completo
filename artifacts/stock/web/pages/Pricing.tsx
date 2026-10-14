import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Check, ChevronDown, Coins, CreditCard, Sparkles, Film, Image as ImageIcon, Music, Type as TypeIcon, Box } from "lucide-react";
import type { CreditPackDto, PlanDto } from "@shared/types";
import { api } from "@/lib/api";
import { useAuth } from "@/store/auth";
import { toast } from "@/store/ui";
import { money, num } from "@/lib/format";
import { Button, PageLoader, ErrorBox, Dialog, Radio } from "@/components/ui";
import { cn } from "@/lib/utils";

const FAQ = [
  ["¿Qué pasa con los créditos que no uso?", "Los créditos de suscripción se acumulan hasta 12 meses mientras tu plan esté activo. Los paquetes de créditos duran 1 año desde la compra."],
  ["¿Puedo cancelar cuando quiera?", "Sí. Las suscripciones mensuales se cancelan en cualquier momento; las anuales facturadas mensualmente tienen una permanencia de 12 meses con descuento."],
  ["¿Cómo pago?", "Con Mercado Pago (tarjeta, PSE, efectivo) cuando está configurado, o por transferencia bancaria: creás el pedido, transferís con la referencia y el equipo lo confirma en minutos."],
  ["¿Qué cubre la indemnización?", "Las licencias estándar y ampliada incluyen protección legal frente a reclamaciones de terceros por el uso del recurso conforme a la licencia."],
  ["¿Suscripción o paquete de créditos?", "Si licenciás todos los meses, la suscripción sale más barata por recurso y renueva créditos. Si es algo puntual, un paquete de créditos es lo más flexible."],
];

export default function PricingPage() {
  const { user, requireAuth, brand } = useAuth();
  const navigate = useNavigate();
  const q = useQuery({ queryKey: ["catalog"], queryFn: api.catalog, staleTime: 5 * 60_000 });
  const [billing, setBilling] = useState<"annual" | "monthly">("annual");
  const [sel, setSel] = useState<{ kind: "pack" | "subscription"; ref: number; label: string; amount: number } | null>(null);
  const [provider, setProvider] = useState<"manual" | "mercadopago">("manual");
  const [faq, setFaq] = useState<number | null>(0);
  const create = useMutation({
    mutationFn: () => api.createOrder({ kind: sel!.kind, referenceId: sel!.ref, billing: sel!.kind === "subscription" ? billing : undefined, provider }),
    onSuccess: (o) => { setSel(null); if (o.instructions?.checkoutUrl) window.location.href = o.instructions.checkoutUrl; else navigate(`/pedido/${o.id}`); },
    onError: (e: any) => toast({ kind: "error", title: e.message }),
  });
  const mp = !!q.data?.providers?.mercadopago;
  const pick = (s: NonNullable<typeof sel>) => requireAuth(() => { setProvider(mp ? "mercadopago" : "manual"); setSel(s); });

  if (q.isLoading) return <PageLoader />;
  if (q.error || !q.data) return <div className="container-x py-10"><ErrorBox error={q.error} /></div>;
  const plans: PlanDto[] = q.data.plans; const packs: CreditPackDto[] = q.data.packs;

  return (
    <div>
      <section className="bg-ink text-white">
        <div className="container-x py-14 text-center">
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Planes y precios</h1>
          <p className="mx-auto mt-3 max-w-2xl text-slate-300">Elegí una suscripción con créditos mensuales o comprá paquetes de créditos cuando los necesites. Todas las licencias son comerciales y perpetuas.</p>
          <div className="mx-auto mt-6 inline-flex rounded-full bg-white/10 p-1 text-sm font-semibold">
            <button onClick={() => setBilling("annual")} className={cn("rounded-full px-4 py-1.5", billing === "annual" ? "bg-white text-ink" : "text-slate-200")}>Anual, facturado mensualmente <span className="ml-1 rounded-full bg-emerald-500/20 px-1.5 text-[10px] text-emerald-300">ahorrá hasta 25 %</span></button>
            <button onClick={() => setBilling("monthly")} className={cn("rounded-full px-4 py-1.5", billing === "monthly" ? "bg-white text-ink" : "text-slate-200")}>Mensual</button>
          </div>
        </div>
      </section>

      <section className="container-x -mt-6">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {plans.map((p) => {
            const price = billing === "annual" ? p.priceAnnualMonthlyCents : p.priceMonthlyCents;
            const popular = p.badge === "El más popular";
            const active = user?.subscription?.planId === p.id && user.subscription.status === "active";
            return (
              <div key={p.id} className={cn("card relative flex flex-col p-5", popular && "ring-2 ring-brand-600")}>
                {p.badge && <span className={cn("absolute -top-3 left-5 badge", popular ? "bg-brand-600 text-white" : "bg-ink text-white")}>{p.badge}</span>}
                <h3 className="text-base font-bold">{p.name}</h3>
                <p className="mt-3 text-3xl font-extrabold tracking-tight">{money(price)}<span className="text-sm font-medium text-mute">/mes</span></p>
                <p className="text-xs text-mute">{billing === "annual" ? "Compromiso anual" : "Sin permanencia"} · {p.creditsPerMonth} créditos al mes{p.videosPerMonth ? ` · hasta ${p.videosPerMonth} vídeo${p.videosPerMonth > 1 ? "s" : ""}` : ""}</p>
                <ul className="mt-4 flex-1 space-y-2 text-sm text-ink-soft">{p.features.map((f) => <li key={f} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />{f}</li>)}</ul>
                <Button className="mt-5 w-full" variant={popular ? "primary" : "secondary"} disabled={active} onClick={() => pick({ kind: "subscription", ref: p.id, label: `${p.name} (${billing === "annual" ? "anual" : "mensual"})`, amount: price })}>{active ? "Plan activo" : "Elegir plan"}</Button>
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-center text-xs text-mute">Precios en {brand?.currency || "COP"}, impuestos incluidos. Los créditos no usados se acumulan hasta 12 meses.</p>
      </section>

      <section className="container-x mt-14">
        <h2 className="text-2xl font-bold tracking-tight">¿Cuántos créditos necesito?</h2>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {[{ i: ImageIcon, l: "Fotos e ilustraciones", c: "1 crédito" }, { i: TypeIcon, l: "Vectores y plantillas", c: "1 crédito" }, { i: Music, l: "Música y efectos", c: "1 crédito" }, { i: Film, l: "Vídeo HD", c: "8 créditos" }, { i: Film, l: "Vídeo 4K", c: "30 créditos" }, { i: Box, l: "Premium y 3D", c: "2 – 50 créditos" }].map((x) => (
            <div key={x.l} className="card p-4"><x.i className="h-5 w-5 text-brand-600" /><p className="mt-2 text-sm font-semibold">{x.l}</p><p className="text-xs text-mute">{x.c}</p></div>
          ))}
        </div>
        <p className="mt-2 text-xs text-mute">Licencia ampliada: 8× el precio estándar en imágenes y 2× en vídeo. Los recursos marcados como gratis cuestan 0 créditos.</p>
      </section>

      <section id="creditos" className="container-x mt-14">
        <div className="flex items-end justify-between"><div><h2 className="text-2xl font-bold tracking-tight">Paquetes de créditos</h2><p className="text-sm text-mute">Sin suscripción. Válidos durante 1 año.</p></div></div>
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-5">
          {packs.map((p) => (
            <button key={p.id} onClick={() => pick({ kind: "pack", ref: p.id, label: `Paquete de ${p.credits} créditos`, amount: p.priceCents })} className={cn("card p-5 text-left transition hover:-translate-y-0.5 hover:shadow-pop", p.label === "Más vendido" && "ring-2 ring-ink")}>
              {p.label && <span className={cn("badge", p.label === "Más vendido" ? "bg-ink text-white" : "bg-slate-100 text-slate-700")}>{p.label}</span>}
              <p className="mt-2 flex items-center gap-1.5 text-2xl font-extrabold"><Coins className="h-5 w-5 text-amber-500" />{p.credits}</p>
              <p className="text-xs text-mute">créditos</p>
              <p className="mt-3 text-lg font-bold">{money(p.priceCents)}</p>
              <p className="text-[11px] text-mute">{money(Math.round(p.priceCents / p.credits))} por crédito</p>
            </button>
          ))}
        </div>
      </section>

      <section className="container-x mt-14 grid gap-4 md:grid-cols-2">
        <div className="card p-6"><h3 className="flex items-center gap-2 text-base font-bold"><CreditCard className="h-5 w-5 text-brand-600" />Suscripciones</h3><ul className="mt-3 space-y-2 text-sm text-ink-soft">{["Créditos nuevos cada mes y acumulables", "El menor precio por recurso", "Incluye IA Studio en los planes marcados", "Ideal para agencias y equipos de contenido"].map((t) => <li key={t} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 text-emerald-600" />{t}</li>)}</ul></div>
        <div className="card p-6"><h3 className="flex items-center gap-2 text-base font-bold"><Coins className="h-5 w-5 text-amber-500" />Paquetes de créditos</h3><ul className="mt-3 space-y-2 text-sm text-ink-soft">{["Pagás una vez, sin renovación", "Válidos durante 12 meses", "Sirven para cualquier tipo de recurso y licencia", "Perfectos para proyectos puntuales"].map((t) => <li key={t} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 text-emerald-600" />{t}</li>)}</ul></div>
      </section>

      <section className="container-x mt-14 max-w-3xl">
        <h2 className="text-2xl font-bold tracking-tight">Preguntas frecuentes</h2>
        <div className="mt-4 divide-y divide-line rounded-2xl border border-line">{FAQ.map(([qq, a], i) => <div key={qq}><button onClick={() => setFaq(faq === i ? null : i)} className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left font-semibold"><span>{qq}</span><ChevronDown className={cn("h-4 w-4 text-mute transition-transform", faq === i && "rotate-180")} /></button>{faq === i && <p className="px-5 pb-5 text-sm text-ink-soft">{a}</p>}</div>)}</div>
        <p className="mt-6 text-sm text-mute">¿Querés vender tu contenido? <Link to="/colaborar" className="font-semibold text-brand-700 hover:underline">Conocé el programa de colaboradores</Link>.</p>
      </section>

      <Dialog open={!!sel} onOpenChange={(v) => !v && setSel(null)} title="Confirmar pedido" size="sm">
        {sel && (
          <div className="space-y-4">
            <div className="rounded-xl bg-slate-50 p-3"><p className="text-sm font-semibold">{sel.label}</p><p className="text-2xl font-extrabold">{money(sel.amount)}{sel.kind === "subscription" && <span className="text-sm font-medium text-mute">/mes</span>}</p></div>
            <div>
              <p className="label">Método de pago</p>
              <div className="space-y-2">
                {mp && <Radio name="prov" checked={provider === "mercadopago"} onChange={() => setProvider("mercadopago")} label={<span><b>Mercado Pago</b> · tarjeta, PSE, efectivo</span>} />}
                <Radio name="prov" checked={provider === "manual"} onChange={() => setProvider("manual")} label={<span><b>Transferencia bancaria</b> · te damos los datos y confirmamos en minutos</span>} />
              </div>
            </div>
            <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setSel(null)}>Cancelar</Button><Button loading={create.isPending} onClick={() => create.mutate()} icon={<Sparkles className="h-4 w-4" />}>Continuar</Button></div>
          </div>
        )}
      </Dialog>
    </div>
  );
}

export function OrderPage() {
  const { user } = useAuth();
  const id = window.location.pathname.split("/").pop();
  const q = useQuery({ queryKey: ["order", id], queryFn: () => api.order(id!), enabled: !!user, refetchInterval: (data) => (data?.status === "pending" ? 8000 : false) });
  const o = q.data;
  if (!user) return <div className="container-x py-10 text-sm text-mute">Iniciá sesión para ver tu pedido.</div>;
  if (q.isLoading) return <PageLoader />;
  if (q.error || !o) return <div className="container-x py-10"><ErrorBox error={q.error} /></div>;
  return (
    <div className="container-x max-w-2xl py-10">
      <h1 className="text-2xl font-bold tracking-tight">Pedido #{String(o.id).padStart(6, "0")}</h1>
      <div className="card mt-4 p-5">
        <div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{o.description}</p><p className="text-xs text-mute">{new Date(o.createdAt).toLocaleString("es")}</p></div><span className={cn("badge", o.status === "paid" ? "bg-emerald-100 text-emerald-800" : o.status === "pending" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-700")}>{o.status === "paid" ? "Pagado" : o.status === "pending" ? "Pendiente de pago" : o.status === "cancelled" ? "Cancelado" : "Fallido"}</span></div>
        <p className="mt-3 text-3xl font-extrabold">{money(o.amountCents, o.currency)}</p>
        {o.status === "pending" && o.provider === "manual" && o.instructions && (
          <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm">
            <p className="font-semibold">Pagá por transferencia</p>
            <dl className="mt-2 grid grid-cols-[120px_1fr] gap-y-1 text-sm"><dt className="text-mute">Banco</dt><dd className="font-medium">{o.instructions.bank || "Consultá con soporte"}</dd><dt className="text-mute">Cuenta</dt><dd className="font-medium">{o.instructions.account || "—"}</dd><dt className="text-mute">Titular</dt><dd className="font-medium">{o.instructions.holder || "—"}</dd><dt className="text-mute">Referencia</dt><dd className="font-mono font-bold">{o.instructions.reference}</dd><dt className="text-mute">Valor</dt><dd className="font-bold">{money(o.amountCents, o.currency)}</dd></dl>
            <p className="mt-3 text-xs text-mute">Incluí la referencia en la descripción de la transferencia. Esta página se actualiza sola cuando el equipo confirme el pago; también podés enviar el comprobante a soporte.</p>
          </div>
        )}
        {o.status === "pending" && o.instructions?.checkoutUrl && <a href={o.instructions.checkoutUrl} className="btn-primary mt-4 w-full">Pagar con Mercado Pago</a>}
        {o.status === "paid" && <p className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">Pago confirmado. {o.kind === "pack" ? "Los créditos ya están en tu cuenta." : "Tu suscripción está activa."} <Link to="/buscar" className="font-semibold underline">Explorar catálogo</Link></p>}
      </div>
      <div className="mt-3 flex gap-3 text-sm"><Link to="/cuenta/creditos" className="font-semibold text-brand-700 hover:underline">Ver mis créditos y pedidos</Link><span className="text-mute">·</span><Link to="/precios" className="text-mute hover:underline">Volver a precios</Link></div>
      <p className="mt-6 text-xs text-mute">Tenés {num(user.credits)} créditos disponibles.</p>
    </div>
  );
}
