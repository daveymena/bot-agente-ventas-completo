import { useMemo, useState } from "react";
import { ExternalLink, Globe, MoreHorizontal, ThumbsUp, MessageCircle, Share2 } from "lucide-react";

/** Mismo contrato que api-server/src/lib/vista-previa-anuncio.ts */
export interface VistaPreviaAnuncio {
  formato: "feed" | "historia" | "landing";
  titulo: string;
  copy: string;
  cta: string;
  imagenUrl: string | null;
  paginaUrl: string | null;
  html: string | null;
  pagina: string;
}

/** Segunda barrera en el navegador: nada que ejecute código ni cargue otra página. */
function sanearEnCliente(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, "")
    .replace(/<\/?(script|iframe|object|embed|meta|base)\b[^>]*>/gi, "")
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/(href|src|action|formaction)\s*=\s*(["'])\s*javascript:[\s\S]*?\2/gi, '$1="#"');
}

function inicial(nombre: string): string {
  return (nombre.trim()[0] || "V").toUpperCase();
}

/** Tarjeta de feed con el aspecto del anuncio tal como se va a publicar. */
export function TarjetaFeed({ v }: { v: VistaPreviaAnuncio }) {
  return (
    <article className="mx-auto w-full max-w-[420px] overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-sm dark:border-white/10 dark:bg-slate-900 dark:text-slate-100">
      <header className="flex items-center gap-3 px-4 pt-3.5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-sm font-semibold text-white">{inicial(v.pagina)}</div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{v.pagina}</p>
          <p className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">Patrocinado · <Globe className="h-3 w-3" /></p>
        </div>
        <MoreHorizontal className="h-5 w-5 text-slate-400" />
      </header>

      {v.copy && <p className="whitespace-pre-line px-4 pb-3 pt-2.5 text-[15px] leading-relaxed">{v.copy}</p>}

      {v.imagenUrl ? (
        <img src={v.imagenUrl} alt={v.titulo || "Imagen del anuncio"} className="aspect-[4/5] w-full object-cover" loading="lazy" />
      ) : (
        <div className="flex aspect-[4/5] w-full items-center justify-center bg-gradient-to-br from-indigo-600 to-indigo-900 p-8 text-center text-white">
          <p className="text-2xl font-bold leading-tight tracking-tight">{v.titulo || "Tu anuncio"}</p>
        </div>
      )}

      <footer className="flex items-center gap-3 border-t border-slate-200 bg-slate-50 px-4 py-3 dark:border-white/10 dark:bg-slate-800/60">
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">{v.paginaUrl ? new URL(v.paginaUrl, "https://x.local").host : "tu-tienda"}</p>
          <p className="truncate text-sm font-semibold">{v.titulo || v.pagina}</p>
        </div>
        <span className="shrink-0 rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white">{v.cta}</span>
      </footer>

      <div className="flex items-center justify-around border-t border-slate-200 py-2 text-xs text-slate-500 dark:border-white/10 dark:text-slate-400">
        <span className="flex items-center gap-1.5"><ThumbsUp className="h-4 w-4" /> Me gusta</span>
        <span className="flex items-center gap-1.5"><MessageCircle className="h-4 w-4" /> Comentar</span>
        <span className="flex items-center gap-1.5"><Share2 className="h-4 w-4" /> Compartir</span>
      </div>
    </article>
  );
}

/** Página de destino renderizada sin scripts y sin acceso al panel. */
export function PaginaDeDestino({ html, titulo }: { html: string; titulo: string }) {
  const seguro = useMemo(() => sanearEnCliente(html), [html]);
  return (
    <div className="mx-auto w-full max-w-[420px] overflow-hidden rounded-[28px] border-[10px] border-slate-900 bg-white shadow-lg">
      <iframe
        title={`Página de destino: ${titulo}`}
        srcDoc={seguro}
        sandbox=""
        className="h-[640px] w-full bg-white"
        loading="lazy"
      />
    </div>
  );
}

/**
 * Vista previa dentro del chat de Atlas: el anuncio como se verá en el feed y,
 * si existe, la página de destino. Nada se publica desde aquí.
 */
export function VistaPreviaAnuncioEnChat({ v }: { v: VistaPreviaAnuncio }) {
  const [verPagina, setVerPagina] = useState(false);
  return (
    <section aria-label="Vista previa del anuncio" className="mt-3 rounded-2xl border border-indigo-100 bg-indigo-50/40 p-4 dark:border-white/10 dark:bg-white/[0.03]">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700 dark:text-indigo-300">Así se verá el anuncio</p>
        {v.html && (
          <button
            type="button"
            onClick={() => setVerPagina((x) => !x)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-white px-2.5 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-50 dark:border-white/10 dark:bg-transparent dark:text-indigo-300"
          >
            {verPagina ? "Ver anuncio" : "Ver página de destino"}
          </button>
        )}
      </div>

      {verPagina && v.html ? <PaginaDeDestino html={v.html} titulo={v.titulo} /> : <TarjetaFeed v={v} />}

      {v.paginaUrl && (
        <a href={v.paginaUrl} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-indigo-700 hover:underline dark:text-indigo-300">
          <ExternalLink className="h-3.5 w-3.5" /> Abrir página de destino
        </a>
      )}
    </section>
  );
}
