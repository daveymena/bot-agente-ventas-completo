import { useCallback, useEffect, useState } from "react";
import { ExternalLink, Figma, Loader2, RefreshCw, Unplug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SecretInput } from "@/components/ui/secret-input";

export type FigmaContext = { fileKey: string; nodeId?: string; name: string } | null;
type FileData = { fileKey: string; name: string; url: string; lastModified: string; pages: { id: string; name: string; frames: { id: string; name: string; type: string }[] }[] };
type NodeData = { fileKey: string; url: string; preview?: string; previewError?: string; node: { id: string; name: string; width?: number; height?: number; colors: string[]; texts: { id: string; text: string; font?: string; size?: number }[]; truncated: boolean; layout: { mode: string } } };
async function api(url: string, body?: unknown, method?: string) {
  const r = await fetch(`/api/figma${url}`, { credentials: "include", method: method || (body ? "POST" : "GET"), headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const data = await r.json().catch(() => ({})); if (!r.ok) throw new Error(data.error || "No se pudo consultar Figma"); return data;
}
export function FigmaWorkspace({ onContexto }: { onContexto: (c: FigmaContext) => void }) {
  const [status, setStatus] = useState<{ configured?: boolean; connected?: boolean; references?: { fileKey: string; name: string }[] }>({});
  const [source, setSource] = useState(""); const [token, setToken] = useState(""); const [configure, setConfigure] = useState(false);
  const [file, setFile] = useState<FileData | null>(null); const [node, setNode] = useState<NodeData | null>(null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const reload = useCallback(async () => { const s = await api("/estado"); setStatus(s); }, []);
  useEffect(() => () => onContexto(null), [onContexto]);
  useEffect(() => { reload().catch((e) => setError(e.message)); }, [reload]);
  const perform = async (fn: () => Promise<void>) => { setBusy(true); setError(""); try { await fn(); } catch (e: any) { setError(e.message); } finally { setBusy(false); } };
  const openFile = (input = source) => perform(async () => {
    const f = await api(`/archivo?source=${encodeURIComponent(input)}`); setFile(f); setNode(null); onContexto({ fileKey: f.fileKey, name: f.name }); await reload();
  });
  const openNode = (id: string) => perform(async () => {
    if (!file) return; const n = await api(`/nodo?source=${file.fileKey}&nodeId=${encodeURIComponent(id)}`); setNode(n); onContexto({ fileKey: file.fileKey, nodeId: n.node.id, name: n.node.name });
  });
  return <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><div className="mb-2 flex items-center gap-2 text-sm font-medium text-violet-600"><Figma className="h-5 w-5" />Referencias de diseño</div><h1 className="text-2xl font-semibold tracking-tight">Tu diseño, conectado con Atlas</h1><p className="mt-2 max-w-2xl text-sm text-muted-foreground">Abre tus frames de Figma para consultar su composición, colores y tipografías mientras diseñas en Studio.</p></div>
      <span className={`rounded-full border px-3 py-1 text-xs ${status.connected ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "text-muted-foreground"}`}>{status.connected ? "Acceso verificado" : status.configured ? "Revisar conexión" : "Sin conectar"}</span>
    </div>
    {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
    <section className="space-y-4 rounded-2xl border bg-background p-4 sm:p-5" aria-label="Conexión de Figma">
      <form className="flex flex-col gap-3 sm:flex-row" onSubmit={(e) => { e.preventDefault(); if (status.connected && !configure) void openFile(); }}>
        <div className="min-w-0 flex-1"><label htmlFor="figma-source" className="mb-1.5 block text-sm font-medium">Enlace del archivo</label><Input id="figma-source" value={source} onChange={(e) => setSource(e.target.value)} placeholder="https://www.figma.com/design/…" /></div>
        {status.connected && !configure && <Button className="self-end max-sm:w-full" disabled={busy || !source.trim()} type="submit">{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Abrir archivo</Button>}
      </form>
      {(!status.connected || configure) ? <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void perform(async () => { const d = await api("/conectar", { token, source }); setToken(""); setConfigure(false); setStatus(d.status); setFile(d.file); setNode(null); onContexto({ fileKey: d.file.fileKey, name: d.file.name }); }); }}>
        <div className="max-w-xl"><label htmlFor="figma-token" className="mb-1.5 block text-sm font-medium">Token personal de Figma</label><SecretInput id="figma-token" value={token} onChange={setToken} guardado={status.configured} /></div>
        <p className="max-w-2xl text-xs leading-relaxed text-muted-foreground">Créalo en Figma → Settings → Security, con permiso <code>file_content:read</code> y acceso al archivo. La conexión de ChatGPT es independiente. El token se guarda cifrado y nunca se devuelve al navegador. Al vencer, reemplázalo aquí.</p>
        <div className="flex flex-wrap gap-2"><Button type="submit" disabled={busy || !token.trim() || !source.trim()}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Verificar y conectar</Button>{configure && <Button variant="ghost" type="button" onClick={() => { setToken(""); setConfigure(false); }}>Cancelar</Button>}<a className="inline-flex min-h-10 items-center gap-1 px-2 text-sm text-violet-700 underline dark:text-violet-300" href="https://developers.figma.com/docs/rest-api/personal-access-tokens/" target="_blank" rel="noopener noreferrer">Cómo crear el token<ExternalLink className="h-3 w-3" /></a></div>
      </form> : <div className="flex flex-wrap gap-2"><Button size="sm" variant="ghost" disabled={busy} onClick={() => setConfigure(true)}><RefreshCw className="mr-2 h-4 w-4" />Cambiar token</Button><Button size="sm" variant="ghost" disabled={busy} onClick={() => void perform(async () => { await api("/desconectar", undefined, "DELETE"); setFile(null); setNode(null); onContexto(null); await reload(); })}><Unplug className="mr-2 h-4 w-4" />Desconectar</Button></div>}
    </section>
    {!!status.references?.length && <div className="flex flex-wrap items-center gap-2"><span className="text-xs text-muted-foreground">Recientes</span>{status.references.map((r) => <Button variant="outline" size="sm" className="max-w-full truncate" key={r.fileKey} disabled={busy || !status.connected} onClick={() => { setSource(r.fileKey); void openFile(r.fileKey); }}>{r.name}</Button>)}</div>}
    {file ? <div className="grid items-start gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
      <section className="min-w-0 rounded-2xl border p-4"><h2 className="break-words font-semibold">{file.name}</h2><a href={file.url} target="_blank" rel="noopener noreferrer" className="my-2 inline-flex min-h-10 items-center gap-1 text-sm text-violet-700 dark:text-violet-300">Abrir en Figma<ExternalLink className="h-3 w-3" /></a><div className="max-h-[50vh] space-y-4 overflow-y-auto">{file.pages.map((p) => <div key={p.id}><h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{p.name}</h3>{p.frames.length ? p.frames.map((f) => <button key={f.id} disabled={busy} onClick={() => void openNode(f.id)} className={`mb-1 block min-h-11 w-full break-words rounded-lg px-3 py-2 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 ${node?.node.id === f.id ? "bg-violet-100 text-violet-900 dark:bg-violet-950 dark:text-violet-100" : "hover:bg-muted"}`}>{f.name}</button>) : <p className="text-xs text-muted-foreground">Sin frames de primer nivel. Abre el archivo en Figma para revisar su estructura.</p>}</div>)}</div></section>
      <section className="min-w-0 space-y-4 rounded-2xl border p-4 sm:p-5" aria-busy={busy}>{busy && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Consultando Figma…</div>}{node ? <>
        <div className="flex flex-wrap justify-between gap-2"><div><h2 className="break-words text-lg font-semibold">{node.node.name}</h2><p className="text-xs text-muted-foreground">{Math.round(node.node.width || 0)} × {Math.round(node.node.height || 0)} · Layout {node.node.layout.mode}</p></div><Button asChild size="sm" variant="outline"><a href={node.url} target="_blank" rel="noopener noreferrer">Editar en Figma<ExternalLink className="ml-2 h-3 w-3" /></a></Button></div>
        {node.preview ? <div className="grid min-h-40 place-items-center overflow-hidden rounded-xl bg-muted/50 p-3"><img src={node.preview} alt={`Vista previa de ${node.node.name}`} referrerPolicy="no-referrer" className="max-h-[65vh] max-w-full object-contain" /></div> : <p className="rounded-xl bg-muted p-4 text-sm text-muted-foreground">{node.previewError || "La vista previa no está disponible. Puedes revisar el frame en Figma."}</p>}
        {!!node.node.colors.length && <div><h3 className="mb-2 text-sm font-medium">Paleta del frame</h3><div className="flex flex-wrap gap-2">{node.node.colors.map((c) => <span key={c} className="flex items-center gap-2 rounded-lg border px-2 py-1 text-xs"><span className="h-5 w-5 rounded border" style={{ backgroundColor: c }} />{c}</span>)}</div></div>}
        {!!node.node.texts.length && <div><h3 className="mb-2 text-sm font-medium">Texto y tipografía</h3><div className="max-h-64 space-y-2 overflow-y-auto">{node.node.texts.map((t) => <div key={t.id} className="rounded-xl bg-muted/50 p-3"><p className="whitespace-pre-wrap break-words text-sm">{t.text}</p><p className="mt-1 text-xs text-muted-foreground">{t.font || "Fuente sin especificar"}{t.size ? ` · ${t.size}px` : ""}</p></div>)}</div></div>}
        <p className="text-xs text-muted-foreground">Atlas puede consultar este frame al abrir el chat. Es una referencia visual: los precios y las características siempre se validan con tu catálogo. Lectura hasta 6 niveles{node.node.truncated ? ", limitada a 1.000 elementos" : ""}.</p>
      </> : <div className="py-16 text-center"><Figma className="mx-auto mb-3 h-8 w-8 text-muted-foreground" /><p className="text-sm text-muted-foreground">Selecciona un frame para ver su diseño y trabajar con Atlas.</p></div>}</section>
    </div> : <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">Conecta un archivo para consultar tus diseños en Studio.</div>}
    <p className="max-w-3xl text-xs leading-relaxed text-muted-foreground">Esta integración consulta archivos y frames. Para modificar las capas originales, usa Figma. Los cambios en las landings y creativos de tu negocio se realizan en los editores de VentasPro.</p>
  </div>;
}
