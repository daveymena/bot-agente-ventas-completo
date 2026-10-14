import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, FolderPlus, Lock, Globe } from "lucide-react";
import { api } from "@/lib/api";
import { useUi, toast } from "@/store/ui";
import { useAuth } from "@/store/auth";
import { Button, Dialog, Input, Switch, Spinner } from "@/components/ui";
import { cn } from "@/lib/utils";

/** "Guardar en biblioteca": elegir colección propia o crear una nueva (equivalente a Mis bibliotecas de Adobe). */
export function SaveDialog() {
  const { user } = useAuth();
  const { saveDialog, closeSave } = useUi();
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const open = saveDialog.open && !!user;
  const mine = useQuery({ queryKey: ["collections", "mine"], queryFn: api.myCollections, enabled: open });
  const asset = useQuery({ queryKey: ["asset", saveDialog.assetId], queryFn: () => api.asset(saveDialog.assetId!), enabled: open && !!saveDialog.assetId });
  const inSet = new Set(asset.data?.savedInCollections || []);

  const toggle = useMutation({
    mutationFn: async (cid: number) => inSet.has(cid) ? api.removeFromCollection(cid, saveDialog.assetId!) : api.addToCollection(cid, saveDialog.assetId!),
    onSuccess: (_d, cid) => {
      qc.invalidateQueries({ queryKey: ["collections"] }); qc.invalidateQueries({ queryKey: ["asset", saveDialog.assetId] });
      toast({ kind: "success", title: inSet.has(cid) ? "Quitado de la biblioteca" : "Guardado en tu biblioteca" });
    },
    onError: (e: any) => toast({ kind: "error", title: e.message }),
  });
  const create = useMutation({
    mutationFn: () => api.createCollection({ title: title.trim(), isPublic, assetId: saveDialog.assetId! }),
    onSuccess: () => { setTitle(""); setCreating(false); qc.invalidateQueries({ queryKey: ["collections"] }); qc.invalidateQueries({ queryKey: ["asset", saveDialog.assetId] }); toast({ kind: "success", title: "Biblioteca creada y recurso guardado" }); },
    onError: (e: any) => toast({ kind: "error", title: e.message }),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && closeSave()} title="Guardar en una biblioteca" description="Organizá tus recursos en bibliotecas públicas o privadas." size="sm">
      {asset.data && (
        <div className="mb-4 flex items-center gap-3 rounded-xl bg-slate-50 p-2">
          <img src={asset.data.thumbUrl} alt="" className="h-12 w-16 rounded-lg object-cover" />
          <p className="line-clamp-2 text-xs font-medium text-ink">{asset.data.title}</p>
        </div>
      )}
      {mine.isLoading ? <div className="flex justify-center py-6"><Spinner /></div> : (
        <ul className="max-h-64 space-y-1 overflow-y-auto">
          {mine.data?.map((c) => (
            <li key={c.id}>
              <button onClick={() => toggle.mutate(c.id)} disabled={toggle.isPending} className={cn("flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-slate-50", inSet.has(c.id) && "bg-brand-50")}>
                <div className="h-10 w-10 shrink-0 overflow-hidden rounded-md bg-slate-200">{c.coverUrl && <img src={c.coverUrl} alt="" className="h-full w-full object-cover" />}</div>
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-ink">{c.title}</p><p className="flex items-center gap-1 text-xs text-mute">{c.isPublic ? <Globe className="h-3 w-3" /> : <Lock className="h-3 w-3" />}{c.count} recursos</p></div>
                {inSet.has(c.id) && <Check className="h-4 w-4 text-brand-600" />}
              </button>
            </li>
          ))}
          {mine.data?.length === 0 && !creating && <li className="px-2 py-4 text-center text-sm text-mute">Todavía no tenés bibliotecas.</li>}
        </ul>
      )}
      {creating ? (
        <form className="mt-3 space-y-3 rounded-xl border border-line p-3" onSubmit={(e) => { e.preventDefault(); if (title.trim().length >= 2) create.mutate(); }}>
          <Input autoFocus placeholder="Nombre de la biblioteca" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} />
          <Switch checked={isPublic} onCheckedChange={setIsPublic} label="Pública (cualquiera con el enlace puede verla)" />
          <div className="flex justify-end gap-2"><Button type="button" variant="ghost" size="sm" onClick={() => setCreating(false)}>Cancelar</Button><Button type="submit" size="sm" loading={create.isPending}>Crear y guardar</Button></div>
        </form>
      ) : (
        <Button variant="secondary" className="mt-3 w-full" icon={<FolderPlus className="h-4 w-4" />} onClick={() => setCreating(true)}>Nueva biblioteca</Button>
      )}
    </Dialog>
  );
}
