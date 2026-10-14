import { useEffect, useState, type ReactNode } from "react";
import { Link, NavLink, Navigate, Outlet } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BarChart3, Check, Coins, FolderHeart, Images, Receipt, Settings, ShieldAlert, Users, Wallet, X, Star, Trash2, Plus, Ban, Search as SearchIcon } from "lucide-react";
import type { AssetDetail, AssetStatus, CollectionDto } from "@shared/types";
import { api } from "@/lib/api";
import { useAuth } from "@/store/auth";
import { toast } from "@/store/ui";
import { assetPath, dateShort, dateTime, money, num, typeLabel } from "@/lib/format";
import { Button, Checkbox, Confirm, Dialog, Empty, ErrorBox, Field, Input, PageLoader, Pagination, Select, Stat, Tabs, Textarea, useDebounced } from "@/components/ui";
import { cn } from "@/lib/utils";
import { StatusBadge } from "@/pages/contributor/Contributor";

export function AdminLayout() {
  const { user, loading } = useAuth();
  const stats = useQuery({ queryKey: ["admin-stats"], queryFn: api.admin.stats, enabled: user?.role === "admin", refetchInterval: 60_000 });
  if (loading) return <PageLoader />;
  if (!user || user.role !== "admin") return <Navigate to="/" replace />;
  const s = stats.data;
  const items: [string, string, ReactNode, number?][] = [["/admin", "Resumen", <BarChart3 className="h-4 w-4" />], ["/admin/moderacion", "Moderación", <ShieldAlert className="h-4 w-4" />, s?.pendingAssets], ["/admin/recursos", "Recursos", <Images className="h-4 w-4" />], ["/admin/usuarios", "Usuarios", <Users className="h-4 w-4" />], ["/admin/pedidos", "Pedidos", <Receipt className="h-4 w-4" />, s?.pendingOrders], ["/admin/pagos", "Pagos a colaboradores", <Wallet className="h-4 w-4" />, s?.pendingPayouts], ["/admin/colecciones", "Colecciones", <FolderHeart className="h-4 w-4" />], ["/admin/ajustes", "Ajustes", <Settings className="h-4 w-4" />]];
  return (
    <div className="container-x py-8">
      <div className="flex items-end justify-between"><div><p className="text-xs font-semibold uppercase tracking-wider text-brand-700">Administración</p><h1 className="text-2xl font-bold tracking-tight">Panel de control</h1></div></div>
      <div className="mt-6 grid gap-6 lg:grid-cols-[230px_1fr]">
        <nav className="flex gap-1 overflow-x-auto lg:flex-col scrollbar-none">{items.map(([to, l, i, n]) => <NavLink key={to} to={to} end={to === "/admin"} className={({ isActive }) => cn("flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium", isActive ? "bg-ink text-white" : "text-ink-soft hover:bg-slate-100")}>{i}<span className="flex-1">{l}</span>{!!n && <span className="rounded-full bg-amber-400 px-1.5 text-[10px] font-bold text-ink">{n}</span>}</NavLink>)}</nav>
        <div className="min-w-0"><Outlet /></div>
      </div>
    </div>
  );
}

function Bars({ data, k, color }: { data: { day: string; [x: string]: number | string }[]; k: string; color: string }) {
  const vals = data.map((d) => Number(d[k]) || 0); const max = Math.max(1, ...vals);
  return <div className="flex h-16 items-end gap-[2px]">{vals.map((v, i) => <div key={i} title={`${data[i].day}: ${v}`} className="flex-1 rounded-t" style={{ height: `${Math.max(2, (v / max) * 100)}%`, background: color }} />)}</div>;
}

export function AdminDashboard() {
  const q = useQuery({ queryKey: ["admin-stats"], queryFn: api.admin.stats });
  useEffect(() => { document.title = "Administración"; }, []);
  if (q.isLoading) return <PageLoader />;
  if (q.error || !q.data) return <ErrorBox error={q.error} />;
  const s = q.data;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Ingresos (pagados)" value={money(s.revenueCents)} sub={`${s.pendingOrders} pedidos pendientes`} />
        <Stat label="Licencias emitidas" value={num(s.licenses)} />
        <Stat label="Recursos" value={num(s.assets)} sub={<Link to="/admin/moderacion" className="font-semibold text-amber-700 hover:underline">{s.pendingAssets} en cola de revisión</Link>} />
        <Stat label="Usuarios" value={num(s.users)} sub={`${s.contributors} colaboradores · ${s.pendingPayouts} retiros pendientes`} />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {[{ k: "revenueCents", l: "Ingresos por día", c: "#4f46e5" }, { k: "licenses", l: "Licencias por día", c: "#059669" }, { k: "signups", l: "Registros por día", c: "#d97706" }].map((x) => <div key={x.k} className="card p-4"><p className="text-xs font-semibold text-mute">{x.l}</p><div className="mt-2"><Bars data={s.byDay} k={x.k} color={x.c} /></div><p className="mt-1 text-[10px] text-mute">Últimos {s.byDay.length} días</p></div>)}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Link to="/admin/moderacion" className="card flex items-center gap-3 p-4 hover:shadow-pop"><ShieldAlert className="h-6 w-6 text-amber-600" /><div><p className="text-sm font-semibold">Revisar envíos</p><p className="text-xs text-mute">{s.pendingAssets} esperando</p></div></Link>
        <Link to="/admin/pedidos" className="card flex items-center gap-3 p-4 hover:shadow-pop"><Receipt className="h-6 w-6 text-brand-600" /><div><p className="text-sm font-semibold">Confirmar transferencias</p><p className="text-xs text-mute">{s.pendingOrders} pedidos</p></div></Link>
        <Link to="/admin/pagos" className="card flex items-center gap-3 p-4 hover:shadow-pop"><Wallet className="h-6 w-6 text-emerald-600" /><div><p className="text-sm font-semibold">Pagar colaboradores</p><p className="text-xs text-mute">{s.pendingPayouts} solicitudes</p></div></Link>
      </div>
    </div>
  );
}

function AssetRow({ a, actions }: { a: AssetDetail; actions: ReactNode }) {
  return (
    <li className="flex flex-wrap items-start gap-3 p-3 sm:flex-nowrap">
      <a href={a.previewUrl.endsWith(".mp4") ? a.posterUrl || a.cardUrl : a.previewUrl} target="_blank" rel="noreferrer" className="shrink-0"><img src={a.cardUrl} alt="" className="h-24 w-36 rounded-lg object-cover ring-1 ring-line" /></a>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2"><StatusBadge s={a.status} /><span className="text-xs text-mute">#{a.id} · {typeLabel(a.type)} · {a.width}×{a.height}{a.durationSec ? ` · ${Math.round(a.durationSec)} s` : ""} · {a.fileFormat.toUpperCase()}</span>{a.isAiGenerated && <span className="badge bg-slate-900 text-white">IA</span>}{a.isEditorial && <span className="badge bg-slate-200">Editorial</span>}{a.hasPeople && <span className="badge bg-slate-100">{a.peopleCount || "?"} persona(s){a.modelRelease ? " · MR" : " · sin MR"}</span>}</div>
        <p className="mt-1 text-sm font-semibold">{a.status === "approved" ? <Link to={assetPath(a)} className="hover:underline">{a.title}</Link> : a.title}</p>
        {a.description && <p className="line-clamp-2 text-xs text-ink-soft">{a.description}</p>}
        <p className="mt-1 line-clamp-2 text-[11px] text-mute">{a.keywords.length} kw: {a.keywords.slice(0, 15).join(", ")}{a.keywords.length > 15 && "…"}</p>
        <p className="text-[11px] text-mute">Por {a.contributor?.name || "—"} · {a.category?.name || "Sin categoría"} · {dateTime(a.createdAt)}{a.rejectionReason && <span className="text-red-700"> · Rechazo: {a.rejectionReason}</span>}</p>
      </div>
      <div className="flex shrink-0 flex-wrap gap-1.5 sm:flex-col">{actions}</div>
    </li>
  );
}

export function ModerationPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const list = useQuery({ queryKey: ["admin-assets", "pending", page], queryFn: () => api.admin.assets({ status: "pending", page }) });
  const reasons = useQuery({ queryKey: ["rejection-reasons"], queryFn: api.admin.rejectionReasons, staleTime: Infinity });
  const [rejecting, setRejecting] = useState<AssetDetail | null>(null); const [reason, setReason] = useState("");
  const inval = () => { qc.invalidateQueries({ queryKey: ["admin-assets"] }); qc.invalidateQueries({ queryKey: ["admin-stats"] }); };
  const approve = useMutation({ mutationFn: ({ id, featured }: { id: number; featured?: boolean }) => api.admin.approve(id, { featured }), onSuccess: () => { inval(); toast({ kind: "success", title: "Publicado" }); }, onError: (e: any) => toast({ kind: "error", title: e.message }) });
  const reject = useMutation({ mutationFn: () => api.admin.reject(rejecting!.id, reason), onSuccess: () => { setRejecting(null); setReason(""); inval(); toast({ kind: "success", title: "Rechazado y notificado" }); }, onError: (e: any) => toast({ kind: "error", title: e.message }) });
  useEffect(() => { document.title = "Moderación"; }, []);
  return (
    <div>
      <div className="flex items-center justify-between"><h2 className="text-lg font-bold">Cola de revisión</h2><span className="text-sm text-mute">{list.data?.total ?? 0} pendientes</span></div>
      {list.isLoading ? <PageLoader /> : list.error ? <ErrorBox error={list.error} /> : !list.data?.items.length ? <Empty className="mt-4" icon={<Check className="h-6 w-6" />} title="Todo revisado" body="No hay envíos pendientes." /> : (
        <>
          <ul className="mt-3 divide-y divide-line rounded-2xl border border-line">{list.data.items.map((a) => <AssetRow key={a.id} a={a} actions={<><Button size="sm" icon={<Check className="h-4 w-4" />} loading={approve.isPending && approve.variables?.id === a.id} onClick={() => approve.mutate({ id: a.id })}>Aprobar</Button><Button size="sm" variant="secondary" icon={<Star className="h-4 w-4" />} onClick={() => approve.mutate({ id: a.id, featured: true })}>Aprobar y destacar</Button><Button size="sm" variant="danger" icon={<X className="h-4 w-4" />} onClick={() => { setRejecting(a); setReason(reasons.data?.[0]?.id || ""); }}>Rechazar</Button></>} />)}</ul>
          <Pagination page={list.data.page} totalPages={Math.ceil(list.data.total / list.data.perPage)} onChange={setPage} />
        </>
      )}
      <Dialog open={!!rejecting} onOpenChange={(v) => !v && setRejecting(null)} title="Motivo del rechazo" size="sm">
        <div className="space-y-3">
          <p className="text-sm text-mute">El colaborador recibe el motivo y puede corregir y reenviar.</p>
          <div className="space-y-1.5">{reasons.data?.map((r) => <label key={r.id} className={cn("flex cursor-pointer items-start gap-2 rounded-lg border p-2 text-sm", reason === r.id ? "border-ink bg-slate-50" : "border-line")}><input type="radio" className="mt-1" checked={reason === r.id} onChange={() => setReason(r.id)} /><span><b>{r.id.replace(/_/g, " ")}</b><br /><span className="text-xs text-mute">{r.label}</span></span></label>)}</div>
          <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setRejecting(null)}>Cancelar</Button><Button variant="danger" loading={reject.isPending} onClick={() => reject.mutate()}>Rechazar</Button></div>
        </div>
      </Dialog>
    </div>
  );
}

export function AdminAssetsPage() {
  const qc = useQueryClient();
  const [status, setStatus] = useState<AssetStatus>("approved"); const [q, setQ] = useState(""); const dq = useDebounced(q, 300); const [page, setPage] = useState(1);
  const list = useQuery({ queryKey: ["admin-assets", status, dq, page], queryFn: () => api.admin.assets({ status, q: dq || undefined, page }) });
  const cats = useQuery({ queryKey: ["categories"], queryFn: api.categories, staleTime: 300_000 });
  const [edit, setEdit] = useState<AssetDetail | null>(null); const [del, setDel] = useState<AssetDetail | null>(null);
  const inval = () => { qc.invalidateQueries({ queryKey: ["admin-assets"] }); qc.invalidateQueries({ queryKey: ["admin-stats"] }); qc.invalidateQueries({ queryKey: ["home"] }); };
  const patch = useMutation({ mutationFn: ({ id, data }: { id: number; data: Record<string, any> }) => api.admin.patchAsset(id, data), onSuccess: () => { inval(); setEdit(null); toast({ kind: "success", title: "Actualizado" }); }, onError: (e: any) => toast({ kind: "error", title: e.message }) });
  const remove = useMutation({ mutationFn: (id: number) => api.admin.deleteAsset(id), onSuccess: () => { inval(); setDel(null); toast({ kind: "success", title: "Eliminado" }); }, onError: (e: any) => toast({ kind: "error", title: e.message }) });
  useEffect(() => { document.title = "Recursos"; }, []);
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3"><Tabs value={status} onChange={(v) => { setStatus(v); setPage(1); }} items={[{ id: "approved", label: "Publicados" }, { id: "pending", label: "Pendientes" }, { id: "rejected", label: "Rechazados" }, { id: "disabled", label: "Desactivados" }, { id: "draft", label: "Borradores" }]} /><div className="relative"><SearchIcon className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-mute" /><Input className="w-64 pl-9" placeholder="Título o ID…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} /></div></div>
      {list.isLoading ? <PageLoader /> : !list.data?.items.length ? <Empty className="mt-4" title="Sin recursos" /> : (
        <>
          <ul className="mt-3 divide-y divide-line rounded-2xl border border-line">{list.data.items.map((a) => <AssetRow key={a.id} a={a} actions={<><Button size="sm" variant="secondary" onClick={() => setEdit(a)}>Editar</Button>{a.status === "approved" ? <Button size="sm" variant="ghost" icon={<Ban className="h-4 w-4" />} onClick={() => patch.mutate({ id: a.id, data: { status: "disabled" } })}>Desactivar</Button> : <Button size="sm" variant="ghost" icon={<Check className="h-4 w-4" />} onClick={() => patch.mutate({ id: a.id, data: { status: "approved" } })}>Publicar</Button>}<Button size="sm" variant="ghost" icon={<Trash2 className="h-4 w-4" />} onClick={() => setDel(a)}>Eliminar</Button></>} />)}</ul>
          <Pagination page={list.data.page} totalPages={Math.ceil(list.data.total / list.data.perPage)} onChange={setPage} />
        </>
      )}
      {edit && <AdminAssetDialog a={edit} categories={cats.data || []} onClose={() => setEdit(null)} loading={patch.isPending} onSave={(data) => patch.mutate({ id: edit.id, data })} />}
      <Confirm open={!!del} onOpenChange={(v) => !v && setDel(null)} title={`¿Eliminar «${del?.title}»?`} body="Se borran archivos y previsualizaciones. Si tiene licencias vendidas, solo se desactiva." confirmLabel="Eliminar" danger loading={remove.isPending} onConfirm={() => { if (del) remove.mutate(del.id); }} />
    </div>
  );
}

function AdminAssetDialog({ a, categories, onClose, onSave, loading }: { a: AssetDetail; categories: { slug: string; name: string }[]; onClose: () => void; onSave: (d: Record<string, any>) => void; loading: boolean }) {
  const [featured, setFeatured] = useState(false); const [isPremium, setIsPremium] = useState(a.isPremium); const [isFree, setIsFree] = useState(a.isFree); const [status, setStatus] = useState<AssetStatus>(a.status); const [categorySlug, setCategorySlug] = useState(a.category?.slug || "");
  const [ps, setPs] = useState<string>(String(a.priceCredits.standard)); const [pe, setPe] = useState<string>(String(a.priceCredits.extended));
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()} title={`Editar #${a.id}`} size="md">
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); onSave({ featured, isPremium, isFree, status: status === "draft" ? undefined : status, categorySlug: categorySlug || null, priceCreditsStandard: ps === "" ? null : Number(ps), priceCreditsExtended: pe === "" ? null : Number(pe) }); }}>
        <div className="flex gap-3"><img src={a.cardUrl} alt="" className="h-20 w-28 rounded-lg object-cover" /><div className="text-sm"><p className="font-semibold">{a.title}</p><p className="text-xs text-mute">{typeLabel(a.type)} · {a.contributor?.name}</p></div></div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Estado"><Select value={status} onChange={(e) => setStatus(e.target.value as AssetStatus)}><option value="approved">Publicado</option><option value="pending">Pendiente</option><option value="rejected">Rechazado</option><option value="disabled">Desactivado</option></Select></Field>
          <Field label="Categoría"><Select value={categorySlug} onChange={(e) => setCategorySlug(e.target.value)}><option value="">Sin categoría</option>{categories.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}</Select></Field>
          <Field label="Precio estándar (créditos)" hint="Vacío = automático"><Input type="number" min={0} value={ps} onChange={(e) => setPs(e.target.value)} /></Field>
          <Field label="Precio ampliada (créditos)" hint="Vacío = automático"><Input type="number" min={0} value={pe} onChange={(e) => setPe(e.target.value)} /></Field>
        </div>
        <div className="grid grid-cols-3 gap-2"><Checkbox checked={featured} onChange={setFeatured} label="Destacar en portada" /><Checkbox checked={isPremium} onChange={setIsPremium} label="Premium" /><Checkbox checked={isFree} onChange={setIsFree} label="Gratis" /></div>
        <div className="flex justify-end gap-2 pt-2"><Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button><Button type="submit" loading={loading}>Guardar</Button></div>
      </form>
    </Dialog>
  );
}

export function AdminUsersPage() {
  const qc = useQueryClient();
  const [q, setQ] = useState(""); const dq = useDebounced(q, 300); const [role, setRole] = useState("all"); const [page, setPage] = useState(1);
  const list = useQuery({ queryKey: ["admin-users", dq, role, page], queryFn: () => api.admin.users({ q: dq || undefined, role: role === "all" ? undefined : role, page }) });
  const [credit, setCredit] = useState<{ id: number; name: string } | null>(null); const [delta, setDelta] = useState("10"); const [note, setNote] = useState("");
  const patch = useMutation({ mutationFn: ({ id, data }: { id: number; data: Parameters<typeof api.admin.patchUser>[1] }) => api.admin.patchUser(id, data), onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-users"] }); setCredit(null); toast({ kind: "success", title: "Usuario actualizado" }); }, onError: (e: any) => toast({ kind: "error", title: e.message }) });
  useEffect(() => { document.title = "Usuarios"; }, []);
  return (
    <div>
      <div className="flex flex-wrap items-center gap-3"><h2 className="flex-1 text-lg font-bold">Usuarios {list.data && <span className="text-sm font-normal text-mute">({num(list.data.total)})</span>}</h2><Select className="w-40" value={role} onChange={(e) => { setRole(e.target.value); setPage(1); }}><option value="all">Todos los roles</option><option value="user">Clientes</option><option value="contributor">Colaboradores</option><option value="admin">Administradores</option></Select><Input className="w-64" placeholder="Correo o nombre…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} /></div>
      {list.isLoading ? <PageLoader /> : (
        <>
          <table className="mt-3 w-full overflow-hidden rounded-xl border border-line text-sm"><thead className="bg-slate-50 text-left text-xs text-mute"><tr><th className="px-3 py-2">Usuario</th><th className="px-3 py-2">Rol</th><th className="px-3 py-2">Créditos</th><th className="px-3 py-2">Actividad</th><th className="px-3 py-2">Estado</th><th className="px-3 py-2" /></tr></thead>
            <tbody className="divide-y divide-line">{list.data?.items.map((u) => <tr key={u.id} className={cn(u.status === "blocked" && "opacity-60")}><td className="px-3 py-2"><p className="font-semibold">{u.name}</p><p className="text-xs text-mute">{u.email} · desde {dateShort(u.createdAt)}</p></td><td className="px-3 py-2"><Select className="w-36 py-1 text-xs" value={u.role} onChange={(e) => patch.mutate({ id: u.id, data: { role: e.target.value } })}><option value="user">Cliente</option><option value="contributor">Colaborador</option><option value="admin">Admin</option></Select></td><td className="px-3 py-2"><span className="font-semibold">{u.credits}</span>{u.subscription?.status === "active" && <span className="ml-1 badge bg-brand-50 text-brand-800">{u.subscription.planName}</span>}</td><td className="px-3 py-2 text-xs text-mute">{u.licenseCount} licencias · {u.assetCount} recursos{u.lastLoginAt && <><br />último acceso {dateShort(u.lastLoginAt)}</>}</td><td className="px-3 py-2"><span className={cn("badge", u.status === "active" ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800")}>{u.status === "active" ? "Activo" : "Bloqueado"}</span></td><td className="px-3 py-2 text-right"><button onClick={() => { setCredit({ id: u.id, name: u.name }); setDelta("10"); setNote(""); }} className="text-xs font-semibold text-brand-700 hover:underline">Créditos</button><button onClick={() => patch.mutate({ id: u.id, data: { status: u.status === "active" ? "blocked" : "active" } })} className="ml-3 text-xs text-mute hover:underline">{u.status === "active" ? "Bloquear" : "Reactivar"}</button></td></tr>)}</tbody></table>
          <Pagination page={page} totalPages={Math.ceil((list.data?.total || 0) / 40)} onChange={setPage} />
        </>
      )}
      <Dialog open={!!credit} onOpenChange={(v) => !v && setCredit(null)} title={`Ajustar créditos · ${credit?.name}`} size="sm">
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); credit && patch.mutate({ id: credit.id, data: { creditsDelta: Number(delta), note } }); }}>
          <Field label="Cantidad (negativo para restar)"><Input type="number" value={delta} onChange={(e) => setDelta(e.target.value)} required /></Field>
          <Field label="Nota"><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Compensación, promo, corrección…" maxLength={200} /></Field>
          <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setCredit(null)}>Cancelar</Button><Button type="submit" loading={patch.isPending} icon={<Coins className="h-4 w-4" />}>Aplicar</Button></div>
        </form>
      </Dialog>
    </div>
  );
}

export function AdminOrdersPage() {
  const qc = useQueryClient();
  const [status, setStatus] = useState<"pending" | "paid" | "cancelled" | "all">("pending");
  const list = useQuery({ queryKey: ["admin-orders", status], queryFn: () => api.admin.orders(status) });
  const inval = () => { qc.invalidateQueries({ queryKey: ["admin-orders"] }); qc.invalidateQueries({ queryKey: ["admin-stats"] }); };
  const paid = useMutation({ mutationFn: (id: number) => api.admin.markPaid(id), onSuccess: () => { inval(); toast({ kind: "success", title: "Pago confirmado", description: "Créditos/suscripción acreditados." }); }, onError: (e: any) => toast({ kind: "error", title: e.message }) });
  const cancel = useMutation({ mutationFn: (id: number) => api.admin.cancelOrder(id), onSuccess: () => { inval(); toast({ kind: "success", title: "Pedido cancelado" }); }, onError: (e: any) => toast({ kind: "error", title: e.message }) });
  useEffect(() => { document.title = "Pedidos"; }, []);
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-bold">Pedidos</h2><Tabs value={status} onChange={setStatus} items={[{ id: "pending", label: "Pendientes" }, { id: "paid", label: "Pagados" }, { id: "cancelled", label: "Cancelados" }, { id: "all", label: "Todos" }]} /></div>
      {list.isLoading ? <PageLoader /> : !list.data?.length ? <Empty className="mt-4" title="Sin pedidos" /> : (
        <table className="mt-3 w-full overflow-hidden rounded-xl border border-line text-sm"><thead className="bg-slate-50 text-left text-xs text-mute"><tr><th className="px-3 py-2">Pedido</th><th className="px-3 py-2">Cliente</th><th className="px-3 py-2">Detalle</th><th className="px-3 py-2">Importe</th><th className="px-3 py-2">Pago</th><th className="px-3 py-2" /></tr></thead>
          <tbody className="divide-y divide-line">{list.data.map((o) => <tr key={o.id}><td className="px-3 py-2 font-mono text-xs">#{String(o.id).padStart(6, "0")}<br /><span className="text-mute">{dateTime(o.createdAt)}</span></td><td className="px-3 py-2"><p className="font-semibold">{o.user.name}</p><p className="text-xs text-mute">{o.user.email}</p></td><td className="px-3 py-2">{o.description}</td><td className="px-3 py-2 font-semibold">{money(o.amountCents, o.currency)}</td><td className="px-3 py-2 text-xs">{o.provider === "manual" ? "Transferencia" : "Mercado Pago"}<br /><span className="font-mono text-mute">{o.instructions?.reference || o.providerRef || ""}</span><br /><span className={cn("badge", o.status === "paid" ? "bg-emerald-100 text-emerald-800" : o.status === "pending" ? "bg-amber-100 text-amber-800" : "bg-slate-100")}>{o.status}</span></td><td className="px-3 py-2 text-right">{o.status === "pending" && <><Button size="sm" loading={paid.isPending && paid.variables === o.id} onClick={() => paid.mutate(o.id)}>Marcar pagado</Button><button onClick={() => cancel.mutate(o.id)} className="ml-2 text-xs text-mute hover:underline">Cancelar</button></>}</td></tr>)}</tbody></table>
      )}
    </div>
  );
}

export function AdminPayoutsPage() {
  const qc = useQueryClient();
  const [status, setStatus] = useState<"pending" | "paid" | "rejected" | "all">("pending");
  const list = useQuery({ queryKey: ["admin-payouts", status], queryFn: () => api.admin.payouts(status) });
  const resolve = useMutation({ mutationFn: ({ id, s, note }: { id: number; s: "paid" | "rejected"; note?: string }) => api.admin.resolvePayout(id, s, note), onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-payouts"] }); qc.invalidateQueries({ queryKey: ["admin-stats"] }); toast({ kind: "success", title: "Retiro resuelto" }); }, onError: (e: any) => toast({ kind: "error", title: e.message }) });
  useEffect(() => { document.title = "Pagos a colaboradores"; }, []);
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-bold">Retiros de colaboradores</h2><Tabs value={status} onChange={setStatus} items={[{ id: "pending", label: "Pendientes" }, { id: "paid", label: "Pagados" }, { id: "rejected", label: "Rechazados" }, { id: "all", label: "Todos" }]} /></div>
      {list.isLoading ? <PageLoader /> : !list.data?.length ? <Empty className="mt-4" title="Sin solicitudes" /> : (
        <ul className="mt-3 divide-y divide-line rounded-xl border border-line text-sm">{list.data.map((p) => <li key={p.id} className="flex flex-wrap items-center gap-3 px-3 py-2"><div className="min-w-0 flex-1"><p className="font-semibold">{p.contributor.name} <span className="font-normal text-mute">· {p.contributor.email}</span></p><p className="text-xs text-mute">{p.method} · <span className="font-mono">{p.account}</span> · solicitado {dateTime(p.requestedAt)}{p.note && ` · ${p.note}`}</p></div><span className="text-base font-bold">{money(p.amountCents)}</span><span className={cn("badge", p.status === "paid" ? "bg-emerald-100 text-emerald-800" : p.status === "pending" ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-800")}>{p.status}</span>{p.status === "pending" && <div className="flex gap-1.5"><Button size="sm" onClick={() => resolve.mutate({ id: p.id, s: "paid" })}>Marcar pagado</Button><Button size="sm" variant="ghost" onClick={() => { const note = window.prompt("Motivo del rechazo (se devuelve el saldo):") || undefined; resolve.mutate({ id: p.id, s: "rejected", note }); }}>Rechazar</Button></div>}</li>)}</ul>
      )}
    </div>
  );
}

export function AdminCollectionsPage() {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["admin-collections"], queryFn: api.admin.collections });
  const [open, setOpen] = useState(false); const [title, setTitle] = useState(""); const [slug, setSlug] = useState(""); const [desc, setDesc] = useState("");
  const [sel, setSel] = useState<CollectionDto | null>(null); const [assetId, setAssetId] = useState("");
  const inval = () => { qc.invalidateQueries({ queryKey: ["admin-collections"] }); qc.invalidateQueries({ queryKey: ["collections"] }); qc.invalidateQueries({ queryKey: ["home"] }); };
  const create = useMutation({ mutationFn: () => api.admin.createCollection({ slug: slug || title.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""), title, description: desc, isPublic: true }), onSuccess: () => { setOpen(false); setTitle(""); setSlug(""); setDesc(""); inval(); toast({ kind: "success", title: "Colección creada" }); }, onError: (e: any) => toast({ kind: "error", title: e.message }) });
  const add = useMutation({ mutationFn: () => api.admin.addToCollection(sel!.id, Number(assetId)), onSuccess: () => { setAssetId(""); inval(); toast({ kind: "success", title: "Agregado" }); }, onError: (e: any) => toast({ kind: "error", title: e.message }) });
  const remove = useMutation({ mutationFn: (id: number) => api.admin.deleteCollection(id), onSuccess: () => { inval(); toast({ kind: "success", title: "Colección eliminada" }); }, onError: (e: any) => toast({ kind: "error", title: e.message }) });
  const detail = useQuery({ queryKey: ["collection", sel?.slug], queryFn: () => api.collection(sel!.slug), enabled: !!sel });
  const removeItem = useMutation({ mutationFn: (aid: number) => api.admin.removeFromCollection(sel!.id, aid), onSuccess: () => { inval(); qc.invalidateQueries({ queryKey: ["collection", sel?.slug] }); } });
  useEffect(() => { document.title = "Colecciones"; }, []);
  return (
    <div>
      <div className="flex items-center justify-between"><h2 className="text-lg font-bold">Colecciones curadas</h2><Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setOpen(true)}>Nueva colección</Button></div>
      <p className="mt-1 text-xs text-mute">Aparecen en la portada y en /bibliotecas. Para agregar recursos usá el ID que ves en la ficha o en la lista de recursos.</p>
      {list.isLoading ? <PageLoader /> : (
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{list.data?.map((c) => <div key={c.id} className="card p-3"><div className="grid aspect-[4/3] grid-cols-2 gap-0.5 overflow-hidden rounded-lg bg-slate-100">{c.previews.slice(0, 4).map((p, i) => <img key={i} src={p} alt="" className="h-full w-full object-cover" />)}</div><p className="mt-2 text-sm font-semibold">{c.title}</p><p className="text-xs text-mute">/{c.slug} · {c.count} recursos</p><div className="mt-2 flex gap-1.5"><Button size="sm" variant="secondary" onClick={() => setSel(c)}>Gestionar</Button><Link to={`/bibliotecas/${c.slug}`} className="btn-ghost btn-sm">Ver</Link><Button size="sm" variant="ghost" icon={<Trash2 className="h-4 w-4" />} onClick={() => { if (confirm(`¿Eliminar «${c.title}»?`)) remove.mutate(c.id); }} /></div></div>)}</div>
      )}
      <Dialog open={open} onOpenChange={setOpen} title="Nueva colección curada" size="sm">
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
          <Field label="Título"><Input value={title} onChange={(e) => setTitle(e.target.value)} required minLength={2} /></Field>
          <Field label="Slug (opcional)"><Input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="se genera del título" /></Field>
          <Field label="Descripción"><Textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={2} /></Field>
          <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancelar</Button><Button type="submit" loading={create.isPending}>Crear</Button></div>
        </form>
      </Dialog>
      <Dialog open={!!sel} onOpenChange={(v) => !v && setSel(null)} title={sel ? `Gestionar «${sel.title}»` : ""} size="lg">
        {sel && (
          <div className="space-y-3">
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (assetId) add.mutate(); }}><Input type="number" min={1} placeholder="ID del recurso" value={assetId} onChange={(e) => setAssetId(e.target.value)} className="w-48" /><Button type="submit" loading={add.isPending} icon={<Plus className="h-4 w-4" />}>Agregar</Button></form>
            {detail.isLoading ? <PageLoader /> : <ul className="grid max-h-[50vh] grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">{detail.data?.items.map((a) => <li key={a.id} className="relative overflow-hidden rounded-lg ring-1 ring-line"><img src={a.cardUrl} alt="" className="aspect-[4/3] w-full object-cover" /><p className="truncate px-2 py-1 text-[11px]">#{a.id} {a.title}</p><button onClick={() => removeItem.mutate(a.id)} className="absolute right-1 top-1 rounded-md bg-white/90 p-1 text-red-600 shadow"><X className="h-3.5 w-3.5" /></button></li>)}</ul>}
          </div>
        )}
      </Dialog>
    </div>
  );
}

export function AdminSettingsPage() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin-settings"], queryFn: api.admin.settings });
  const cats = useQuery({ queryKey: ["categories"], queryFn: api.categories });
  const [form, setForm] = useState<Record<string, any> | null>(null);
  useEffect(() => { if (q.data && !form) setForm({ ...q.data, footer_topics: Array.isArray(q.data.footer_topics) ? q.data.footer_topics.join(", ") : q.data.footer_topics || "" }); }, [q.data]);
  const save = useMutation({ mutationFn: () => api.admin.saveSettings({ ...form, footer_topics: String(form!.footer_topics || "").split(",").map((s: string) => s.trim()).filter(Boolean) }), onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-settings"] }); qc.invalidateQueries({ queryKey: ["home"] }); qc.invalidateQueries({ queryKey: ["meta"] }); toast({ kind: "success", title: "Ajustes guardados" }); }, onError: (e: any) => toast({ kind: "error", title: e.message }) });
  const [catName, setCatName] = useState("");
  const addCat = useMutation({ mutationFn: () => api.admin.createCategory({ slug: catName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""), name: catName }), onSuccess: () => { setCatName(""); qc.invalidateQueries({ queryKey: ["categories"] }); toast({ kind: "success", title: "Categoría creada" }); }, onError: (e: any) => toast({ kind: "error", title: e.message }) });
  const delCat = useMutation({ mutationFn: (id: number) => api.admin.deleteCategory(id), onSuccess: () => qc.invalidateQueries({ queryKey: ["categories"] }), onError: (e: any) => toast({ kind: "error", title: e.message }) });
  useEffect(() => { document.title = "Ajustes"; }, []);
  if (!form) return <PageLoader />;
  const f = (k: string) => ({ value: form[k] ?? "", onChange: (e: any) => setForm({ ...form, [k]: e.target.value }) });
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <form className="card space-y-3 p-5" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
        <h2 className="text-base font-bold">Portada</h2>
        <Field label="Título del hero"><Input {...f("home_hero_title")} /></Field>
        <Field label="Subtítulo del hero"><Textarea rows={2} {...f("home_hero_subtitle")} /></Field>
        <Field label="Banner de bienvenida" hint="Vacío para ocultarlo"><Input {...f("free_trial_banner")} /></Field>
        <Field label="Temas del pie de página" hint="Separados por coma"><Textarea rows={3} {...f("footer_topics")} /></Field>
        <div className="flex justify-end"><Button type="submit" loading={save.isPending}>Guardar</Button></div>
      </form>
      <div className="card p-5">
        <h2 className="text-base font-bold">Categorías</h2>
        <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (catName.trim()) addCat.mutate(); }}><Input value={catName} onChange={(e) => setCatName(e.target.value)} placeholder="Nueva categoría" /><Button type="submit" loading={addCat.isPending} icon={<Plus className="h-4 w-4" />}>Agregar</Button></form>
        <ul className="mt-3 divide-y divide-line text-sm">{cats.data?.map((c) => <li key={c.id} className="flex items-center gap-2 py-1.5"><span className="flex-1">{c.name} <span className="text-xs text-mute">/{c.slug} · {c.count}</span></span><button onClick={() => { if (confirm(`¿Eliminar «${c.name}»? Los recursos quedan sin categoría.`)) delCat.mutate(c.id); }} className="text-mute hover:text-red-600"><Trash2 className="h-4 w-4" /></button></li>)}</ul>
      </div>
    </div>
  );
}
