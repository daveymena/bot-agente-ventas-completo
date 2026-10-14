import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FolderPlus, Globe, Lock, Pencil, Trash2, Share2 } from "lucide-react";
import type { CollectionDto } from "@shared/types";
import { api } from "@/lib/api";
import { useAuth } from "@/store/auth";
import { toast } from "@/store/ui";
import { Button, Confirm, Dialog, Empty, ErrorBox, Field, Input, PageLoader, Switch, Textarea } from "@/components/ui";
import { JustifiedGrid } from "@/components/assets/JustifiedGrid";
import { cn, copyText } from "@/lib/utils";

function CollectionCard({ c, mine }: { c: CollectionDto; mine?: boolean }) {
  const imgs = (c.previews.length ? c.previews : c.coverUrl ? [c.coverUrl] : []).slice(0, 4);
  return (
    <Link to={`/bibliotecas/${c.slug}`} className="group card overflow-hidden">
      <div className="grid aspect-[4/3] grid-cols-2 grid-rows-2 gap-0.5 bg-slate-100">
        {imgs.length ? imgs.map((p, i) => <img key={i} src={p} alt="" className={cn("h-full w-full object-cover transition-transform duration-500 group-hover:scale-105", imgs.length === 1 && "col-span-2 row-span-2", imgs.length === 2 && "row-span-2", imgs.length === 3 && i === 0 && "row-span-2")} />) : <div className="col-span-2 row-span-2 grid place-items-center text-xs text-mute">Vacía</div>}
      </div>
      <div className="p-3"><div className="flex items-center justify-between gap-2"><p className="truncate text-sm font-semibold">{c.title}</p>{mine && (c.isPublic ? <Globe className="h-3.5 w-3.5 text-mute" /> : <Lock className="h-3.5 w-3.5 text-mute" />)}</div><p className="text-xs text-mute">{c.count} recursos</p></div>
    </Link>
  );
}

export default function CollectionsPage() {
  const { user, requireAuth } = useAuth();
  const qc = useQueryClient();
  const curated = useQuery({ queryKey: ["collections", "curated"], queryFn: api.collections });
  const mine = useQuery({ queryKey: ["collections", "mine"], queryFn: api.myCollections, enabled: !!user });
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState(""); const [desc, setDesc] = useState(""); const [pub, setPub] = useState(false);
  const create = useMutation({ mutationFn: () => api.createCollection({ title, description: desc, isPublic: pub }), onSuccess: () => { setCreating(false); setTitle(""); setDesc(""); qc.invalidateQueries({ queryKey: ["collections"] }); toast({ kind: "success", title: "Biblioteca creada" }); }, onError: (e: any) => toast({ kind: "error", title: e.message }) });

  return (
    <div className="container-x py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-2xl font-bold tracking-tight">Mis bibliotecas</h1><p className="text-sm text-mute">Guardá recursos para proyectos, compartilos con tu equipo o descubrí colecciones curadas.</p></div>
        <Button icon={<FolderPlus className="h-4 w-4" />} onClick={() => requireAuth(() => setCreating(true))}>Nueva biblioteca</Button>
      </div>

      <section className="mt-6">
        <h2 className="text-base font-bold">Tus bibliotecas</h2>
        {!user ? <Empty className="mt-3" title="Iniciá sesión para ver tus bibliotecas" body="Guardá cualquier recurso con el icono de marcador y organizalo en bibliotecas públicas o privadas." action={<Button onClick={() => requireAuth()}>Iniciar sesión</Button>} />
          : mine.isLoading ? <PageLoader /> : mine.data?.length ? <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">{mine.data.map((c) => <CollectionCard key={c.id} c={c} mine />)}</div>
          : <Empty className="mt-3" title="Todavía no guardaste nada" body="Pasá el mouse por cualquier recurso y tocá el marcador para guardarlo." action={<Link to="/buscar"><Button variant="secondary">Explorar catálogo</Button></Link>} />}
      </section>

      <section className="mt-10">
        <h2 className="text-base font-bold">Colecciones seleccionadas</h2>
        {curated.isLoading ? <PageLoader /> : curated.error ? <ErrorBox error={curated.error} /> : <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">{curated.data?.map((c) => <CollectionCard key={c.id} c={c} />)}</div>}
      </section>

      <Dialog open={creating} onOpenChange={setCreating} title="Nueva biblioteca" size="sm">
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (title.trim().length >= 2) create.mutate(); }}>
          <Field label="Nombre"><Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Campaña primavera" maxLength={80} required /></Field>
          <Field label="Descripción (opcional)"><Textarea value={desc} onChange={(e) => setDesc(e.target.value)} maxLength={400} /></Field>
          <Switch checked={pub} onCheckedChange={setPub} label="Pública: cualquiera con el enlace puede verla" />
          <div className="flex justify-end gap-2 pt-2"><Button type="button" variant="secondary" onClick={() => setCreating(false)}>Cancelar</Button><Button type="submit" loading={create.isPending}>Crear</Button></div>
        </form>
      </Dialog>
    </div>
  );
}

export function CollectionDetailPage() {
  const { slug } = useParams();
  const { user } = useAuth();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["collection", slug], queryFn: () => api.collection(slug!), enabled: !!slug });
  const [editing, setEditing] = useState(false);
  const [del, setDel] = useState(false);
  const [title, setTitle] = useState(""); const [desc, setDesc] = useState(""); const [pub, setPub] = useState(false);
  const c = q.data?.collection;
  const owner = !!c && !!user && (c.ownerId === user.id || user.role === "admin");
  const save = useMutation({ mutationFn: () => api.updateCollection(c!.id, { title, description: desc, isPublic: pub }), onSuccess: () => { setEditing(false); qc.invalidateQueries({ queryKey: ["collection", slug] }); qc.invalidateQueries({ queryKey: ["collections"] }); toast({ kind: "success", title: "Biblioteca actualizada" }); }, onError: (e: any) => toast({ kind: "error", title: e.message }) });
  const remove = useMutation({ mutationFn: () => api.deleteCollection(c!.id), onSuccess: () => { toast({ kind: "success", title: "Biblioteca eliminada" }); window.location.href = "/bibliotecas"; }, onError: (e: any) => toast({ kind: "error", title: e.message }) });
  const removeItem = useMutation({ mutationFn: (assetId: number) => api.removeFromCollection(c!.id, assetId), onSuccess: () => { qc.invalidateQueries({ queryKey: ["collection", slug] }); } });

  if (q.isLoading) return <PageLoader />;
  if (q.error || !c) return <div className="container-x py-10"><ErrorBox error={q.error || new Error("No encontrada")} /></div>;
  return (
    <div className="container-x py-8">
      <nav className="mb-3 text-xs text-mute"><Link to="/bibliotecas" className="hover:underline">Bibliotecas</Link> / {c.title}</nav>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><div className="flex items-center gap-2"><h1 className="text-2xl font-bold tracking-tight">{c.title}</h1>{c.isCurated ? <span className="badge bg-brand-100 text-brand-800">Curada</span> : c.isPublic ? <Globe className="h-4 w-4 text-mute" /> : <Lock className="h-4 w-4 text-mute" />}</div>{c.description && <p className="mt-1 max-w-2xl text-sm text-mute">{c.description}</p>}<p className="mt-1 text-xs text-mute">{c.count} recursos</p></div>
        <div className="flex gap-1.5">
          {c.isPublic && <Button variant="secondary" size="sm" icon={<Share2 className="h-4 w-4" />} onClick={async () => { await copyText(window.location.href); toast({ kind: "success", title: "Enlace copiado" }); }}>Compartir</Button>}
          {owner && !c.isCurated && <><Button variant="secondary" size="sm" icon={<Pencil className="h-4 w-4" />} onClick={() => { setTitle(c.title); setDesc(c.description || ""); setPub(c.isPublic); setEditing(true); }}>Editar</Button><Button variant="ghost" size="sm" icon={<Trash2 className="h-4 w-4" />} onClick={() => setDel(true)}>Eliminar</Button></>}
        </div>
      </div>
      <div className="mt-6">
        {q.data!.items.length ? <JustifiedGrid items={q.data!.items} /> : <Empty title="Esta biblioteca está vacía" body="Guardá recursos desde el catálogo con el icono de marcador." action={<Link to="/buscar"><Button variant="secondary">Explorar</Button></Link>} />}
        {owner && !c.isCurated && q.data!.items.length > 0 && (
          <details className="mt-6 rounded-xl border border-line p-3 text-sm"><summary className="cursor-pointer font-semibold">Quitar recursos de esta biblioteca</summary>
            <ul className="mt-2 grid gap-1 sm:grid-cols-2">{q.data!.items.map((a) => <li key={a.id} className="flex items-center gap-2 rounded-lg p-1 hover:bg-slate-50"><img src={a.thumbUrl} className="h-9 w-12 rounded object-cover" alt="" /><span className="flex-1 truncate text-xs">{a.title}</span><button onClick={() => removeItem.mutate(a.id)} className="text-xs font-semibold text-red-600 hover:underline">Quitar</button></li>)}</ul>
          </details>
        )}
      </div>
      <Dialog open={editing} onOpenChange={setEditing} title="Editar biblioteca" size="sm">
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
          <Field label="Nombre"><Input value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={80} /></Field>
          <Field label="Descripción"><Textarea value={desc} onChange={(e) => setDesc(e.target.value)} maxLength={400} /></Field>
          <Switch checked={pub} onCheckedChange={setPub} label="Pública" />
          <div className="flex justify-end gap-2 pt-2"><Button type="button" variant="secondary" onClick={() => setEditing(false)}>Cancelar</Button><Button type="submit" loading={save.isPending}>Guardar</Button></div>
        </form>
      </Dialog>
      <Confirm open={del} onOpenChange={setDel} title="¿Eliminar esta biblioteca?" body="Los recursos no se borran del catálogo, solo la lista." confirmLabel="Eliminar" danger onConfirm={() => remove.mutate()} loading={remove.isPending} />
    </div>
  );
}
