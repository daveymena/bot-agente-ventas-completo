import { useEffect, useState, type ReactNode } from "react";
import { Link, NavLink, Navigate, Outlet } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Coins, Download, FileText, KeyRound, Receipt, ShieldCheck, User as UserIcon, Upload, Sparkles } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/store/auth";
import { toast } from "@/store/ui";
import { credits as fmtCredits, dateShort, dateTime, money, num, REASON_LABEL, typeLabel } from "@/lib/format";
import { assetPath } from "@/lib/format";
import { Button, Empty, ErrorBox, Field, Input, PageLoader, Select, Stat, Tabs } from "@/components/ui";
import { cn, downloadUrl } from "@/lib/utils";

export function AccountLayout() {
  const { user, loading } = useAuth();
  if (loading) return <PageLoader />;
  if (!user) return <Navigate to="/?login=1" replace />;
  const items: [string, string, ReactNode][] = [["/cuenta/licencias", "Licencias y descargas", <Download className="h-4 w-4" />], ["/cuenta/creditos", "Créditos y pedidos", <Coins className="h-4 w-4" />], ["/cuenta/perfil", "Perfil y seguridad", <UserIcon className="h-4 w-4" />]];
  return (
    <div className="container-x py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-2xl font-bold tracking-tight">Hola, {user.name.split(" ")[0]}</h1><p className="text-sm text-mute">{user.email} · {user.role === "admin" ? "Administrador" : user.role === "contributor" ? "Colaborador" : "Cliente"}</p></div>
        <div className="flex items-center gap-2 text-sm"><span className="flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1.5 font-semibold text-amber-800"><Coins className="h-4 w-4" />{num(user.credits)} créditos</span>{user.subscription?.status === "active" && <span className="rounded-full bg-brand-50 px-3 py-1.5 font-semibold text-brand-800">{user.subscription.planName}</span>}<Link to="/precios" className="btn-secondary btn-sm">Comprar créditos</Link></div>
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-[220px_1fr]">
        <nav className="flex gap-1 overflow-x-auto lg:flex-col scrollbar-none">
          {items.map(([to, l, i]) => <NavLink key={to} to={to} className={({ isActive }) => cn("flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium", isActive ? "bg-ink text-white" : "text-ink-soft hover:bg-slate-100")}>{i}{l}</NavLink>)}
          {user.role === "user" && <Link to="/colaborar" className="mt-2 flex shrink-0 items-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm font-medium text-ink-soft hover:border-brand-400 hover:text-brand-700"><Upload className="h-4 w-4" />Vender mi contenido</Link>}
        </nav>
        <div className="min-w-0"><Outlet /></div>
      </div>
    </div>
  );
}

export function LicensesPage() {
  const q = useQuery({ queryKey: ["licenses"], queryFn: api.licenses });
  const [filter, setFilter] = useState<"all" | "photo" | "video" | "audio" | "other">("all");
  useEffect(() => { document.title = "Mis licencias"; }, []);
  if (q.isLoading) return <PageLoader />;
  if (q.error) return <ErrorBox error={q.error} retry={() => q.refetch()} />;
  const all = q.data || [];
  const items = all.filter((l) => filter === "all" ? true : filter === "photo" ? ["photo", "illustration", "vector"].includes(l.asset.type) : filter === "other" ? ["template", "3d"].includes(l.asset.type) : l.asset.type === filter);
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-bold">Licencias y descargas</h2><Tabs value={filter} onChange={setFilter} items={[{ id: "all", label: "Todo", count: all.length }, { id: "photo", label: "Imágenes" }, { id: "video", label: "Vídeo" }, { id: "audio", label: "Audio" }, { id: "other", label: "Otros" }]} /></div>
      {items.length === 0 ? <Empty className="mt-4" icon={<FileText className="h-6 w-6" />} title="Todavía no licenciaste recursos" body="Cuando licencies una imagen, vídeo o audio, aparecerá acá con su certificado y el archivo original para volver a descargar cuando quieras." action={<Link to="/buscar"><Button>Explorar catálogo</Button></Link>} /> : (
        <ul className="mt-4 divide-y divide-line rounded-2xl border border-line">
          {items.map((l) => (
            <li key={l.id} className="flex flex-wrap items-center gap-3 p-3 sm:flex-nowrap">
              <Link to={assetPath(l.asset)} className="shrink-0"><img src={l.asset.thumbUrl} alt="" className="h-16 w-24 rounded-lg object-cover ring-1 ring-line" /></Link>
              <div className="min-w-0 flex-1">
                <Link to={assetPath(l.asset)} className="line-clamp-1 text-sm font-semibold hover:underline">{l.asset.title}</Link>
                <p className="text-xs text-mute">{typeLabel(l.asset.type)} · Licencia {l.type === "extended" ? "ampliada" : "estándar"} · {l.source === "free" ? "Gratis" : l.source === "subscription" ? "Suscripción" : fmtCredits(l.creditsSpent)} · {dateShort(l.createdAt)}</p>
                <p className="font-mono text-[11px] text-mute">{l.certificateNo} · {l.downloadsCount} descarga{l.downloadsCount === 1 ? "" : "s"}</p>
              </div>
              <div className="flex shrink-0 gap-1.5"><a href={`/api/licenses/${l.id}/certificate`} target="_blank" rel="noreferrer" className="btn-secondary btn-sm"><ShieldCheck className="h-4 w-4" /><span className="hidden sm:inline">Certificado</span></a><Button size="sm" icon={<Download className="h-4 w-4" />} onClick={() => downloadUrl(`/api/licenses/${l.id}/download`)}>Descargar</Button></div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function CreditsPage() {
  const { user, refresh } = useAuth();
  const qc = useQueryClient();
  const tx = useQuery({ queryKey: ["credit-tx"], queryFn: api.creditTransactions });
  const orders = useQuery({ queryKey: ["orders"], queryFn: api.orders });
  const cancel = useMutation({ mutationFn: (id: number) => api.cancelOrder(id), onSuccess: () => { qc.invalidateQueries({ queryKey: ["orders"] }); toast({ kind: "success", title: "Pedido cancelado" }); }, onError: (e: any) => toast({ kind: "error", title: e.message }) });
  useEffect(() => { document.title = "Créditos y pedidos"; refresh(); }, []);
  const sub = user?.subscription;
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-bold">Créditos y pedidos</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <Stat label="Créditos disponibles" value={num(user?.credits || 0)} sub={<Link to="/precios#creditos" className="font-semibold text-brand-700 hover:underline">Comprar paquete</Link>} />
          <Stat label="Suscripción" value={sub?.status === "active" ? sub.planName : "Sin plan"} sub={sub?.status === "active" ? `${sub.creditsLeft} créditos del mes · renueva ${dateShort(sub.periodEnd)}` : <Link to="/precios" className="font-semibold text-brand-700 hover:underline">Ver planes</Link>} />
          <Stat label="Vídeos del plan" value={sub?.status === "active" ? `${sub.videosLeft} restantes` : "—"} sub={sub?.status === "active" ? `Facturación ${sub.billing === "annual" ? "anual" : "mensual"}` : "Incluido en planes"} />
        </div>
      </div>
      <section>
        <h3 className="flex items-center gap-2 text-base font-bold"><Receipt className="h-4 w-4" />Pedidos</h3>
        {orders.isLoading ? <PageLoader /> : !orders.data?.length ? <p className="mt-2 text-sm text-mute">Aún no hiciste pedidos.</p> : (
          <table className="mt-2 w-full overflow-hidden rounded-xl border border-line text-sm"><thead className="bg-slate-50 text-left text-xs text-mute"><tr><th className="px-3 py-2">Pedido</th><th className="px-3 py-2">Detalle</th><th className="px-3 py-2">Importe</th><th className="px-3 py-2">Estado</th><th className="px-3 py-2" /></tr></thead>
            <tbody className="divide-y divide-line">{orders.data.map((o) => <tr key={o.id}><td className="px-3 py-2 font-mono text-xs">#{String(o.id).padStart(6, "0")}<br /><span className="text-mute">{dateShort(o.createdAt)}</span></td><td className="px-3 py-2">{o.description}</td><td className="px-3 py-2 font-semibold">{money(o.amountCents, o.currency)}</td><td className="px-3 py-2"><span className={cn("badge", o.status === "paid" ? "bg-emerald-100 text-emerald-800" : o.status === "pending" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-600")}>{o.status === "paid" ? "Pagado" : o.status === "pending" ? "Pendiente" : o.status === "cancelled" ? "Cancelado" : "Fallido"}</span></td><td className="px-3 py-2 text-right"><Link to={`/pedido/${o.id}`} className="text-xs font-semibold text-brand-700 hover:underline">Ver</Link>{o.status === "pending" && <button onClick={() => cancel.mutate(o.id)} className="ml-3 text-xs text-mute hover:underline">Cancelar</button>}</td></tr>)}</tbody></table>
        )}
      </section>
      <section>
        <h3 className="flex items-center gap-2 text-base font-bold"><Coins className="h-4 w-4" />Movimientos de créditos</h3>
        {tx.isLoading ? <PageLoader /> : !tx.data?.length ? <p className="mt-2 text-sm text-mute">Sin movimientos todavía.</p> : (
          <ul className="mt-2 divide-y divide-line rounded-xl border border-line text-sm">{tx.data.map((t) => <li key={t.id} className="flex items-center gap-3 px-3 py-2"><span className={cn("w-16 shrink-0 font-bold", t.delta > 0 ? "text-emerald-700" : "text-ink")}>{t.delta > 0 ? "+" : ""}{t.delta}</span><span className="min-w-0 flex-1 truncate">{REASON_LABEL[t.reason] || t.reason}{t.note ? <span className="text-mute"> · {t.note}</span> : null}</span><span className="text-xs text-mute">saldo {t.balanceAfter}</span><span className="hidden text-xs text-mute sm:block">{dateTime(t.createdAt)}</span></li>)}</ul>
        )}
      </section>
    </div>
  );
}

const COUNTRIES = ["CO", "MX", "AR", "CL", "PE", "EC", "ES", "US", "BR", "UY", "VE", "PA", "CR", "DO", "GT", "BO", "PY"];

export function ProfilePage() {
  const { user, setUser } = useAuth();
  const [name, setName] = useState(user?.name || ""); const [country, setCountry] = useState(user?.country || "");
  const [cur, setCur] = useState(""); const [next, setNext] = useState(""); const [next2, setNext2] = useState("");
  const sessions = useQuery({ queryKey: ["sessions"], queryFn: api.sessions });
  const save = useMutation({ mutationFn: () => api.updateMe({ name, country: country || null }), onSuccess: (u) => { setUser(u); toast({ kind: "success", title: "Perfil actualizado" }); }, onError: (e: any) => toast({ kind: "error", title: e.message }) });
  const pw = useMutation({ mutationFn: () => api.changePassword(cur, next), onSuccess: () => { setCur(""); setNext(""); setNext2(""); toast({ kind: "success", title: "Contraseña cambiada" }); }, onError: (e: any) => toast({ kind: "error", title: e.message }) });
  useEffect(() => { document.title = "Mi perfil"; }, []);
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <form className="card space-y-3 p-5" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
        <h2 className="text-base font-bold">Datos personales</h2>
        <Field label="Nombre"><Input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} /></Field>
        <Field label="Correo"><Input value={user?.email || ""} disabled /></Field>
        <Field label="País"><Select value={country} onChange={(e) => setCountry(e.target.value)}><option value="">—</option>{COUNTRIES.map((c) => <option key={c} value={c}>{new Intl.DisplayNames(["es"], { type: "region" }).of(c)}</option>)}</Select></Field>
        <div className="flex justify-end"><Button type="submit" loading={save.isPending}>Guardar</Button></div>
      </form>
      <form className="card space-y-3 p-5" onSubmit={(e) => { e.preventDefault(); if (next !== next2) return toast({ kind: "error", title: "Las contraseñas no coinciden" }); pw.mutate(); }}>
        <h2 className="flex items-center gap-2 text-base font-bold"><KeyRound className="h-4 w-4" />Contraseña</h2>
        <Field label="Contraseña actual"><Input type="password" value={cur} onChange={(e) => setCur(e.target.value)} required autoComplete="current-password" /></Field>
        <Field label="Nueva contraseña" hint="Mínimo 8 caracteres"><Input type="password" value={next} onChange={(e) => setNext(e.target.value)} required minLength={8} autoComplete="new-password" /></Field>
        <Field label="Repetir nueva contraseña"><Input type="password" value={next2} onChange={(e) => setNext2(e.target.value)} required minLength={8} autoComplete="new-password" /></Field>
        <div className="flex justify-end"><Button type="submit" variant="secondary" loading={pw.isPending}>Cambiar contraseña</Button></div>
      </form>
      <div className="card p-5 lg:col-span-2">
        <h2 className="text-base font-bold">Sesiones activas</h2>
        {sessions.isLoading ? <PageLoader /> : <ul className="mt-2 divide-y divide-line text-sm">{sessions.data?.map((s, i) => <li key={i} className="flex items-center gap-3 py-2"><span className={cn("h-2 w-2 rounded-full", s.current ? "bg-emerald-500" : "bg-slate-300")} /><span className="min-w-0 flex-1 truncate text-ink-soft">{s.userAgent || "Dispositivo desconocido"}</span><span className="text-xs text-mute">inició {dateTime(s.createdAt)}{s.current && " · esta sesión"}</span></li>)}</ul>}
      </div>
      {user?.role === "user" && <div className="rounded-2xl bg-gradient-to-r from-brand-600 to-violet-600 p-5 text-white lg:col-span-2"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="flex items-center gap-2 text-base font-bold"><Sparkles className="h-4 w-4" />Convertite en colaborador</p><p className="text-sm text-white/80">Subí tus fotos, vídeos, vectores o música y ganá regalías por cada licencia.</p></div><Link to="/colaborar" className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-brand-700">Empezar a vender</Link></div></div>}
    </div>
  );
}
