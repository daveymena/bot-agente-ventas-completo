import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, NavLink, Navigate, Outlet } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BarChart3, Coins, Download, Eye, Images, Upload, Wallet, Pencil, Trash2, Send, Clock, CheckCircle2, XCircle, FileEdit } from "lucide-react";
import type { AssetDetail, AssetStatus } from "@shared/types";
import { api } from "@/lib/api";
import { useAuth } from "@/store/auth";
import { toast } from "@/store/ui";
import { assetPath, dateShort, dateTime, money, num, typeLabel } from "@/lib/format";
import { Button, Confirm, Dialog, Empty, ErrorBox, Field, Input, PageLoader, Pagination, Select, Stat, Tabs, Textarea, Checkbox, useDebounced } from "@/components/ui";
import { cn } from "@/lib/utils";

export const STATUS_META: Record<AssetStatus, { label: string; cls: string; icon: ReactNode }> = {
  draft: { label: "Borrador", cls: "bg-slate-100 text-slate-700", icon: <FileEdit className="h-3.5 w-3.5" /> },
  pending: { label: "En revisión", cls: "bg-amber-100 text-amber-800", icon: <Clock className="h-3.5 w-3.5" /> },
  approved: { label: "Publicado", cls: "bg-emerald-100 text-emerald-800", icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
  rejected: { label: "Rechazado", cls: "bg-red-100 text-red-800", icon: <XCircle className="h-3.5 w-3.5" /> },
  disabled: { label: "Desactivado", cls: "bg-slate-200 text-slate-700", icon: <XCircle className="h-3.5 w-3.5" /> },
};
export function StatusBadge({ s }: { s: AssetStatus }) { const m = STATUS_META[s]; return <span className={cn("badge inline-flex items-center gap-1", m.cls)}>{m.icon}{m.label}</span>; }

export function ContributorLayout() {
  const { user, loading } = useAuth();
  if (loading) return <PageLoader />;
  if (!user) return <Navigate to="/colaborar" replace />;
  if (user.role === "user") return <Navigate to="/colaborar" replace />;
  const items: [string, string, ReactNode, boolean][] = [["/colaborador", "Panel", <BarChart3 className="h-4 w-4" />, true], ["/colaborador/subir", "Subir", <Upload className="h-4 w-4" />, false], ["/colaborador/recursos", "Mis recursos", <Images className="h-4 w-4" />, false], ["/colaborador/ganancias", "Ganancias", <Wallet className="h-4 w-4" />, false]];
  return (
    <div className="container-x py-8">
      <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wider text-brand-700">Colaborador</p><h1 className="text-2xl font-bold tracking-tight">{user.contributor?.displayName || user.name}</h1></div><Link to="/colaborador/subir" className="btn-primary"><Upload className="h-4 w-4" />Subir recursos</Link></div>
      <nav className="mt-5 flex gap-1 overflow-x-auto border-b border-line scrollbar-none">{items.map(([to, l, i, end]) => <NavLink key={to} to={to} end={end} className={({ isActive }) => cn("flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium", isActive ? "border-ink text-ink" : "border-transparent text-mute hover:text-ink")}>{i}{l}</NavLink>)}</nav>
      <div className="mt-6"><Outlet /></div>
    </div>
  );
}

function Spark({ data, k, color = "#4f46e5" }: { data: { day: string; [x: string]: number | string }[]; k: string; color?: string }) {
  const vals = data.map((d) => Number(d[k]) || 0); const max = Math.max(1, ...vals); const w = 300, h = 60;
  const pts = vals.map((v, i) => `${(i / Math.max(1, vals.length - 1)) * w},${h - (v / max) * (h - 4) - 2}`).join(" ");
  return <svg viewBox={`0 0 ${w} ${h}`} className="h-16 w-full" preserveAspectRatio="none"><polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" /><polyline points={`0,${h} ${pts} ${w},${h}`} fill={color} opacity="0.08" /></svg>;
}

export function ContributorDashboard() {
  const q = useQuery({ queryKey: ["contributor-stats"], queryFn: api.contributorStats });
  useEffect(() => { document.title = "Panel de colaborador"; }, []);
  if (q.isLoading) return <PageLoader />;
  if (q.error || !q.data) return <ErrorBox error={q.error} retry={() => q.refetch()} />;
  const t = q.data.totals;
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Recursos publicados" value={num(t.approved)} sub={`${t.pending} en revisión · ${t.rejected} rechazados`} />
        <Stat label="Vistas totales" value={num(t.views)} sub={<span className="flex items-center gap-1"><Eye className="h-3 w-3" />en catálogo</span>} />
        <Stat label="Licencias" value={num(t.licenses)} sub={<span className="flex items-center gap-1"><Download className="h-3 w-3" />{num(t.downloads)} descargas</span>} />
        <Stat label="Ganancias disponibles" value={money(t.availableCents)} sub={<Link to="/colaborador/ganancias" className="font-semibold text-brand-700 hover:underline">Solicitar retiro</Link>} />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {[{ k: "views", l: "Vistas por día", c: "#4f46e5" }, { k: "licenses", l: "Licencias por día", c: "#059669" }, { k: "earningsCents", l: "Ganancias por día", c: "#d97706" }].map((s) => <div key={s.k} className="card p-4"><p className="text-xs font-semibold text-mute">{s.l}</p><Spark data={q.data!.byDay} k={s.k} color={s.c} /><p className="text-[10px] text-mute">{q.data!.byDay[0]?.day} → {q.data!.byDay.at(-1)?.day}</p></div>)}
      </div>
      <section>
        <h2 className="text-base font-bold">Tus recursos con más tracción</h2>
        {q.data.topAssets.length === 0 ? <Empty className="mt-3" title="Todavía no hay datos" body="Subí tus primeros recursos para ver vistas y licencias acá." action={<Link to="/colaborador/subir"><Button>Subir ahora</Button></Link>} /> : (
          <ul className="mt-3 divide-y divide-line rounded-2xl border border-line">{q.data.topAssets.map((a) => <li key={a.id} className="flex items-center gap-3 p-3"><img src={a.thumbUrl} className="h-12 w-16 rounded-lg object-cover" alt="" /><div className="min-w-0 flex-1"><Link to={assetPath(a)} className="line-clamp-1 text-sm font-semibold hover:underline">{a.title}</Link><p className="text-xs text-mute">{typeLabel(a.type)}</p></div><span className="text-xs text-mute"><Eye className="mr-1 inline h-3.5 w-3.5" />{num(a.views)}</span><span className="text-xs font-semibold"><Download className="mr-1 inline h-3.5 w-3.5" />{num(a.licenses)}</span></li>)}</ul>
        )}
      </section>
    </div>
  );
}

export function MyAssetsPage() {
  const qc = useQueryClient();
  const [status, setStatus] = useState<"all" | AssetStatus>("all");
  const [q, setQ] = useState(""); const dq = useDebounced(q, 300); const [page, setPage] = useState(1);
  const list = useQuery({ queryKey: ["my-assets", status, dq, page], queryFn: () => api.myAssets({ status: status === "all" ? undefined : status, q: dq || undefined, page }) });
  const [edit, setEdit] = useState<AssetDetail | null>(null);
  const [del, setDel] = useState<AssetDetail | null>(null);
  const cats = useQuery({ queryKey: ["categories"], queryFn: api.categories, staleTime: 300_000 });
  const inval = () => { qc.invalidateQueries({ queryKey: ["my-assets"] }); qc.invalidateQueries({ queryKey: ["contributor-stats"] }); };
  const remove = useMutation({ mutationFn: (id: number) => api.deleteMyAsset(id), onSuccess: (r) => { setDel(null); inval(); toast({ kind: "success", title: r.deleted ? "Recurso eliminado" : "Recurso retirado del catálogo" }); }, onError: (e: any) => toast({ kind: "error", title: e.message }) });
  const submit = useMutation({ mutationFn: (id: number) => api.updateMyAsset(id, { submit: true }), onSuccess: () => { inval(); toast({ kind: "success", title: "Enviado a revisión" }); }, onError: (e: any) => toast({ kind: "error", title: e.message }) });
  useEffect(() => { document.title = "Mis recursos"; }, []);
  const tabs = useMemo(() => [{ id: "all" as const, label: "Todos" }, { id: "approved" as const, label: "Publicados" }, { id: "pending" as const, label: "En revisión" }, { id: "rejected" as const, label: "Rechazados" }, { id: "draft" as const, label: "Borradores" }], []);
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3"><Tabs value={status} onChange={(v) => { setStatus(v); setPage(1); }} items={tabs} /><Input className="w-64" placeholder="Buscar en mis recursos…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} /></div>
      {list.isLoading ? <PageLoader /> : list.error ? <ErrorBox error={list.error} /> : !list.data?.items.length ? <Empty className="mt-4" title="Nada por acá" body={status === "all" ? "Subí tu primer recurso para empezar a vender." : "No hay recursos con este estado."} action={<Link to="/colaborador/subir"><Button>Subir recursos</Button></Link>} /> : (
        <>
          <ul className="mt-4 divide-y divide-line rounded-2xl border border-line">
            {list.data.items.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-3 p-3 sm:flex-nowrap">
                <img src={a.thumbUrl} alt="" className="h-16 w-24 shrink-0 rounded-lg object-cover ring-1 ring-line" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><StatusBadge s={a.status} />{a.isFree && <span className="badge bg-emerald-50 text-emerald-700">Gratis</span>}<span className="text-xs text-mute">{typeLabel(a.type)} · {dateShort(a.createdAt)}</span></div>
                  {a.status === "approved" ? <Link to={assetPath(a)} className="line-clamp-1 text-sm font-semibold hover:underline">{a.title}</Link> : <p className="line-clamp-1 text-sm font-semibold">{a.title}</p>}
                  {a.status === "rejected" && a.rejectionReason && <p className="text-xs text-red-700">Motivo: {a.rejectionReason}</p>}
                  <p className="text-xs text-mute">{a.keywords.length} palabras clave · {num(a.views)} vistas · {num(a.downloads)} descargas</p>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  {(a.status === "draft" || a.status === "rejected") && <Button size="sm" icon={<Send className="h-4 w-4" />} loading={submit.isPending && submit.variables === a.id} onClick={() => submit.mutate(a.id)}>Enviar a revisión</Button>}
                  <Button size="sm" variant="secondary" icon={<Pencil className="h-4 w-4" />} onClick={() => setEdit(a)}>Editar</Button>
                  <Button size="sm" variant="ghost" icon={<Trash2 className="h-4 w-4" />} onClick={() => setDel(a)} aria-label="Eliminar" />
                </div>
              </li>
            ))}
          </ul>
          <Pagination page={list.data.page} totalPages={Math.ceil(list.data.total / list.data.perPage)} onChange={setPage} />
        </>
      )}
      {edit && <EditAssetDialog asset={edit} categories={cats.data || []} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); inval(); }} />}
      <Confirm open={!!del} onOpenChange={(v) => !v && setDel(null)} title={`¿Eliminar «${del?.title}»?`} body="Si ya tiene licencias vendidas se retira del catálogo pero se conserva para los compradores." confirmLabel="Eliminar" danger loading={remove.isPending} onConfirm={() => { if (del) remove.mutate(del.id); }} />
    </div>
  );
}

export function EditAssetDialog({ asset: a, categories, onClose, onSaved }: { asset: AssetDetail; categories: { slug: string; name: string }[]; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState(a.title); const [description, setDescription] = useState(a.description); const [keywords, setKeywords] = useState(a.keywords.join(", ")); const [categorySlug, setCategorySlug] = useState(a.category?.slug || "");
  const [isEditorial, setIsEditorial] = useState(a.isEditorial); const [isAiGenerated, setIsAi] = useState(a.isAiGenerated); const [hasPeople, setHasPeople] = useState(a.hasPeople); const [peopleCount, setPeopleCount] = useState(a.peopleCount); const [modelRelease, setModelRelease] = useState(a.modelRelease); const [isFree, setIsFree] = useState(a.isFree);
  const [resubmit, setResubmit] = useState(a.status === "rejected");
  const kwList = keywords.split(",").map((k) => k.trim()).filter(Boolean);
  const save = useMutation({
    mutationFn: () => api.updateMyAsset(a.id, { title, description, keywords: kwList, categorySlug: categorySlug || null, isEditorial, isAiGenerated, hasPeople, peopleCount: hasPeople ? peopleCount : 0, modelRelease, isFree, submit: resubmit }),
    onSuccess: () => { toast({ kind: "success", title: "Guardado" }); onSaved(); }, onError: (e: any) => toast({ kind: "error", title: e.message, description: e.details ? JSON.stringify(e.details).slice(0, 200) : undefined }),
  });
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()} title="Editar recurso" size="lg">
      <form className="grid gap-4 md:grid-cols-[200px_1fr]" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
        <div><img src={a.cardUrl} alt="" className="w-full rounded-xl ring-1 ring-line" /><p className="mt-2 text-xs text-mute">{typeLabel(a.type)} · {a.width}×{a.height}{a.durationSec ? ` · ${Math.round(a.durationSec)} s` : ""}</p><StatusBadge s={a.status} /></div>
        <div className="space-y-3">
          <Field label="Título"><Input value={title} onChange={(e) => setTitle(e.target.value)} minLength={4} maxLength={140} required /></Field>
          <Field label="Descripción"><Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} /></Field>
          <Field label={`Palabras clave (${kwList.length})`} hint="Separadas por coma. Mínimo 5, ideal 25-49; las primeras pesan más."><Textarea rows={3} value={keywords} onChange={(e) => setKeywords(e.target.value)} /></Field>
          <Field label="Categoría"><Select value={categorySlug} onChange={(e) => setCategorySlug(e.target.value)}><option value="">Sin categoría</option>{categories.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}</Select></Field>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <Checkbox checked={hasPeople} onChange={setHasPeople} label="Aparecen personas" />
            {hasPeople && <label className="flex items-center gap-2 text-sm">Cantidad<Input type="number" min={1} max={50} className="w-20 py-1" value={peopleCount || 1} onChange={(e) => setPeopleCount(Number(e.target.value))} /></label>}
            {hasPeople && <Checkbox checked={modelRelease} onChange={setModelRelease} label="Tengo autorización de modelo" />}
            <Checkbox checked={isEditorial} onChange={setIsEditorial} label="Solo uso editorial" />
            <Checkbox checked={isAiGenerated} onChange={setIsAi} label="Generado con IA" />
            <Checkbox checked={isFree} onChange={setIsFree} label="Ofrecer gratis" />
          </div>
          {(a.status === "rejected" || a.status === "draft") && <Checkbox checked={resubmit} onChange={setResubmit} label="Enviar a revisión al guardar" />}
          <div className="flex justify-end gap-2 pt-2"><Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button><Button type="submit" loading={save.isPending}>Guardar cambios</Button></div>
        </div>
      </form>
    </Dialog>
  );
}

const METHODS = [["nequi", "Nequi"], ["bancolombia", "Bancolombia"], ["transferencia", "Transferencia bancaria"], ["paypal", "PayPal"], ["payoneer", "Payoneer"]];

export function EarningsPage() {
  const { user, setUser, brand } = useAuth();
  const qc = useQueryClient();
  const stats = useQuery({ queryKey: ["contributor-stats"], queryFn: api.contributorStats });
  const earnings = useQuery({ queryKey: ["earnings"], queryFn: api.earnings });
  const payouts = useQuery({ queryKey: ["payouts"], queryFn: api.payouts });
  const [method, setMethod] = useState(user?.contributor?.payoutMethod || "nequi"); const [account, setAccount] = useState(user?.contributor?.payoutAccount || "");
  const req = useMutation({ mutationFn: () => api.requestPayout(method, account), onSuccess: (r) => { setUser(r.user); qc.invalidateQueries({ queryKey: ["payouts"] }); qc.invalidateQueries({ queryKey: ["contributor-stats"] }); toast({ kind: "success", title: "Retiro solicitado", description: "Lo procesamos en 3-5 días hábiles." }); }, onError: (e: any) => toast({ kind: "error", title: e.message }) });
  useEffect(() => { document.title = "Ganancias"; }, []);
  const t = stats.data?.totals;
  const min = brand?.payoutMinimumCents || 0;
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Ganado en total" value={money(t?.earningsCents || 0)} />
        <Stat label="Ya retirado" value={money(t?.paidCents || 0)} />
        <Stat label="Disponible" value={money(t?.availableCents || 0)} sub={`Mínimo de retiro ${money(min)}`} />
        <Stat label="Regalías" value={`${Math.round((brand?.royalty.image || 0.33) * 100)} % / ${Math.round((brand?.royalty.video || 0.35) * 100)} %`} sub="imágenes / vídeo y audio" />
      </div>
      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        <form className="card h-fit space-y-3 p-5" onSubmit={(e) => { e.preventDefault(); req.mutate(); }}>
          <h2 className="flex items-center gap-2 text-base font-bold"><Coins className="h-4 w-4" />Solicitar retiro</h2>
          <Field label="Método"><Select value={method} onChange={(e) => setMethod(e.target.value)}>{METHODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>
          <Field label="Cuenta / correo / número"><Input value={account} onChange={(e) => setAccount(e.target.value)} required minLength={3} placeholder={method === "nequi" ? "300 000 0000" : method === "paypal" ? "correo@ejemplo.com" : "Número de cuenta"} /></Field>
          <p className="text-xs text-mute">Se retira todo el saldo disponible ({money(t?.availableCents || 0)}).</p>
          <Button type="submit" className="w-full" loading={req.isPending} disabled={(t?.availableCents || 0) < min}>{(t?.availableCents || 0) < min ? `Necesitás ${money(min)} para retirar` : `Retirar ${money(t?.availableCents || 0)}`}</Button>
        </form>
        <div>
          <h2 className="text-base font-bold">Historial de retiros</h2>
          {payouts.isLoading ? <PageLoader /> : !payouts.data?.length ? <p className="mt-2 text-sm text-mute">Sin retiros todavía.</p> : <ul className="mt-2 divide-y divide-line rounded-xl border border-line text-sm">{payouts.data.map((p) => <li key={p.id} className="flex items-center gap-3 px-3 py-2"><span className="font-semibold">{money(p.amountCents)}</span><span className="min-w-0 flex-1 truncate text-mute">{p.method} · {p.account}</span><span className={cn("badge", p.status === "paid" ? "bg-emerald-100 text-emerald-800" : p.status === "pending" ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-800")}>{p.status === "paid" ? "Pagado" : p.status === "pending" ? "Pendiente" : "Rechazado"}</span><span className="hidden text-xs text-mute sm:block">{dateTime(p.requestedAt)}</span></li>)}</ul>}
        </div>
      </div>
      <section>
        <h2 className="text-base font-bold">Ganancias por licencia</h2>
        {earnings.isLoading ? <PageLoader /> : !earnings.data?.length ? <p className="mt-2 text-sm text-mute">Cuando alguien licencie tus recursos aparecerá acá.</p> : (
          <table className="mt-2 w-full overflow-hidden rounded-xl border border-line text-sm"><thead className="bg-slate-50 text-left text-xs text-mute"><tr><th className="px-3 py-2">Recurso</th><th className="px-3 py-2">Licencia</th><th className="px-3 py-2">Regalía</th><th className="px-3 py-2">Importe</th><th className="px-3 py-2">Fecha</th></tr></thead><tbody className="divide-y divide-line">{earnings.data.map((e) => <tr key={e.id}><td className="max-w-[260px] truncate px-3 py-2">{e.title}</td><td className="px-3 py-2">{e.licenseType === "extended" ? "Ampliada" : "Estándar"}</td><td className="px-3 py-2">{Math.round(e.rate * 100)} %</td><td className="px-3 py-2 font-semibold">{money(e.amountCents)}</td><td className="px-3 py-2 text-xs text-mute">{dateTime(e.createdAt)}</td></tr>)}</tbody></table>
        )}
      </section>
    </div>
  );
}
