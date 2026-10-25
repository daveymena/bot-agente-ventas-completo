/**
 * Atlas dentro del Estudio.
 *
 * No es otro chat: es el MISMO Atlas (`/api/code-agent/operator-opencode`, con
 * sus herramientas reales: landing_editar, landing_tema, creativo_crear,
 * creativo_editar, list_products...) en una conversación propia del estudio
 * (sessionId `estudio`), para no mezclarla con la de la pantalla de Atlas.
 *
 * Lo que el dueño tiene abierto (qué landing, qué producto, qué creativo) se
 * le pasa como contexto en cada pedido: así "cambiale el color a verde" sabe
 * de qué landing se habla sin que el dueño dé ids.
 *
 * Las acciones que cambian algo siguen yendo por la confirmación de Atlas
 * ("¿lo hago?" → "sí"): acá hay botones para contestar con un toque.
 * Cuando un turno termina, el estudio recarga lo que tenga abierto.
 */
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Button } from "@/components/ui/button";
import { Loader2, Send, Square, Sparkles, X, RotateCcw } from "lucide-react";

export interface ContextoEstudio {
  espacio: "landings" | "disenos" | "creativos" | "marca";
  producto?: { id: number; nombre: string } | null;
  landing?: { id: number; nombre: string; publicada?: boolean } | null;
  creativo?: { id: string | null; nombre: string } | null;
}

type Msg = { role: "user" | "assistant"; content: string };

const SESION = "estudio";

const SUGERENCIAS: Record<ContextoEstudio["espacio"], string[]> = {
  landings: [
    "Revisá esta landing como experto y decime qué mejorarías",
    "Hacé el titular de la portada más potente",
    "Poné un tema más premium (color y letras)",
    "Agregá preguntas frecuentes con datos reales",
  ],
  disenos: [
    "¿Qué diseño le conviene a este producto y por qué?",
    "Creá una landing nueva para este producto",
  ],
  marca: [
    "Proponeme un kit de marca para mi negocio a partir de mis productos",
    "¿Qué tipografía va con mi marca y por qué?",
  ],
  creativos: [
    "Prepará un anuncio para Meta: revisá el producto, proponé el copy y decime qué creativo mostraría antes de publicarlo",
    "Creá 3 creativos 4:5 para este producto con ganchos distintos",
    "Proponé ganchos para mamás",
  ],
};

function contextoComoTexto(c: ContextoEstudio): string {
  const partes = [`El dueño está en el Estudio (${c.espacio}).`];
  if (c.producto) partes.push(`Producto abierto: [${c.producto.id}] ${c.producto.nombre}.`);
  if (c.landing) partes.push(`Landing abierta: [${c.landing.id}] ${c.landing.nombre}${c.landing.publicada ? " (publicada)" : " (borrador)"}.`);
  if (c.creativo?.id) partes.push(`Creativo abierto: [${c.creativo.id}] ${c.creativo.nombre}.`);
  partes.push(
    "Si pide cambios sin decir cuál, se refiere a lo que tiene abierto. Mirá antes de tocar: landing_ver / creativo_ver (y ver_imagen con el PNG). " +
    "Cambios exactos: landing_bloque (un bloque), landing_diseno (uno de los 22 diseños), landing_tema (color/letras), creativo_capa (una capa). " +
    "Pedidos abiertos: landing_editar, creativo_crear, creativo_editar. Marca: marca_kit_ver / marca_kit_cambiar. Lo que está abierto ya está guardado.",
  );
  return `[CONTEXTO DEL ESTUDIO] ${partes.join(" ")}`;
}

export function AtlasDock({ contexto, leerContexto, onTurnoTerminado, onCerrar, antesDeEnviar }: { contexto: ContextoEstudio; leerContexto?: () => ContextoEstudio; onTurnoTerminado: () => void; onCerrar?: () => void; antesDeEnviar?: () => Promise<void> }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [texto, setTexto] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [progreso, setProgreso] = useState("");
  const [esperaSi, setEsperaSi] = useState(false);
  const corte = useRef<AbortController | null>(null);
  const fin = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`/api/code-agent/history?sessionId=${SESION}`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!Array.isArray(d?.history)) return;
        // El contexto que se le manda a Atlas no se muestra: es del sistema.
        setMsgs(d.history.slice(-40).map((m: any) => ({ role: m.role, content: String(m.content || "").replace(/^\[CONTEXTO DEL ESTUDIO\][^\n]*\n+/, "") })));
        setEsperaSi(!!d.awaitingConfirmation);
      })
      .catch(() => {});
  }, []);
  useEffect(() => { fin.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, progreso]);

  const enviar = async (pedido: string) => {
    const limpio = pedido.trim();
    if (!limpio || ocupado) return;
    setTexto("");
    setEsperaSi(false);
    const historial = msgs.slice(-20).map((m) => ({ role: m.role, content: m.content }));
    setMsgs((m) => [...m, { role: "user", content: limpio }]);
    setOcupado(true);
    // Lo que el dueño tiene sin guardar se guarda ANTES: Atlas lee de la base,
    // y al terminar el estudio recarga desde la base (sin esto, se pisaban).
    if (antesDeEnviar) {
      setProgreso("Guardando lo que tenés abierto…");
      await antesDeEnviar().catch(() => {});
      // Un creativo recién guardado recibe su id en el render siguiente: se
      // espera un momento y se lee el contexto FRESCO (si no, Atlas no sabía cuál era).
      await new Promise((r) => setTimeout(r, 80));
    }
    const ctxAhora = leerContexto?.() ?? contexto;
    setProgreso("Atlas está pensando…");
    const ctl = new AbortController();
    corte.current = ctl;
    try {
      const r = await fetch("/api/code-agent/operator-opencode", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: `${contextoComoTexto(ctxAhora)}\n\n${limpio}`, history: historial, sessionId: SESION, stream: true }),
        signal: ctl.signal,
      });
      if (!r.ok) throw new Error(`Atlas respondió ${r.status}`);
      let resultado: any = null;
      if ((r.headers.get("content-type") || "").includes("text/event-stream") && r.body) {
        const lector = r.body.getReader();
        const dec = new TextDecoder();
        let buf = "";
        while (true) {
          const { done, value } = await lector.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const bloques = buf.split("\n\n");
          buf = bloques.pop() || "";
          for (const b of bloques) {
            const ev = /^event:\s*(.+)$/m.exec(b)?.[1]?.trim();
            const dat = /^data:\s*(.+)$/m.exec(b)?.[1];
            if (!dat) continue;
            let p: any; try { p = JSON.parse(dat); } catch { continue; }
            if (ev === "progress" && p?.texto) setProgreso(String(p.texto));
            else if (ev === "avance" && p?.reply) setMsgs((m) => [...m, { role: "assistant", content: String(p.reply) }]);
            else if (ev === "result") resultado = p;
            else if (ev === "error") throw new Error(p?.error || "turno interrumpido");
          }
        }
      } else resultado = await r.json();
      if (resultado?.reply) setMsgs((m) => [...m, { role: "assistant", content: String(resultado.reply) }]);
      setEsperaSi(resultado?.status === "awaiting_confirmation" || !!resultado?.awaitingConfirmation || /¿(lo hago|confirm|apruebo|avanzo|procedo|te parece)/i.test(String(resultado?.reply || "")));
      if (resultado?.needsContinuation) setMsgs((m) => [...m, { role: "assistant", content: "Todavía estoy en eso. Decime **continuá** y sigo." }]);
      onTurnoTerminado();
    } catch (e: any) {
      if (e?.name === "AbortError") setMsgs((m) => [...m, { role: "assistant", content: "⏹️ Detenido. Lo que ya se hizo queda como está." }]);
      else setMsgs((m) => [...m, { role: "assistant", content: "La aplicación dejó de recibir la respuesta. Atlas sigue protegido por el servidor; al volver a abrir este panel se sincroniza el resultado antes de repetir el pedido." }]);
    } finally {
      setOcupado(false);
      setProgreso("");
    }
  };

  const detener = () => {
    corte.current?.abort();
    void fetch("/api/code-agent/operator-opencode/detener", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: SESION }) }).catch(() => {});
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex h-14 shrink-0 items-center gap-2 border-b px-3">
        <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-violet-600 to-indigo-600 grid place-items-center"><Sparkles className="h-4 w-4 text-white" /></div>
        <div className="leading-tight min-w-0">
          <p className="text-sm font-bold">Atlas</p>
          <p className="text-[10px] text-muted-foreground truncate">{contexto.landing ? `Viendo: ${contexto.landing.nombre}` : contexto.producto ? `Producto: ${contexto.producto.nombre}` : "Tu director creativo"}</p>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <button onClick={() => setMsgs([])} title="Limpiar la vista (la conversación queda guardada)" aria-label="Limpiar" className="h-7 w-7 grid place-items-center rounded hover:bg-muted text-muted-foreground"><RotateCcw className="h-3.5 w-3.5" /></button>
          {onCerrar && <button onClick={onCerrar} aria-label="Cerrar Atlas" className="h-7 w-7 grid place-items-center rounded hover:bg-muted"><X className="h-4 w-4" /></button>}
        </div>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto bg-muted/20 px-3 py-4">
        {msgs.length === 0 && (
          <div className="space-y-4 rounded-2xl border bg-background p-4 shadow-sm">
            <p className="text-sm text-muted-foreground">Pedime lo que quieras sobre tus landings y creativos. Uso tus productos reales y aplico los cambios; lo que cambia algo te lo confirmo antes.</p>
            <div className="space-y-2">
              {SUGERENCIAS[contexto.espacio].map((s) => (
                <button key={s} onClick={() => void enviar(s)} disabled={ocupado} className="w-full text-left text-xs rounded-lg border px-3 py-2 hover:border-violet-500 hover:bg-violet-50/60 dark:hover:bg-violet-950/30">{s}</button>
              ))}
            </div>
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : ""}`}>
            <div className={`max-w-[92%] rounded-2xl px-3 py-2 text-[13px] leading-relaxed ${m.role === "user" ? "bg-violet-600 text-white rounded-br-sm" : "bg-muted rounded-bl-sm"}`}>
              {m.role === "assistant" ? (
                <div className="prose prose-sm dark:prose-invert max-w-none prose-p:my-1 prose-ul:my-1 prose-li:my-0 [&_a]:text-violet-600 [&_a]:underline">
                  <ReactMarkdown components={{
                    a: ({ href, children }) => <a href={href} target="_blank" rel="noreferrer">{children}</a>,
                    img: ({ src, alt }) => <img src={src} alt={alt || "Vista previa del creativo"} loading="lazy" className="my-2 max-h-72 w-auto rounded-xl border bg-white object-contain" />,
                  }}>{m.content}</ReactMarkdown>
                </div>
              ) : m.content}
            </div>
          </div>
        ))}
        {ocupado && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin text-violet-600" />{progreso || "Trabajando…"}</div>
        )}
        <div ref={fin} />
      </div>

      <div className="shrink-0 space-y-2 border-t bg-background p-3">
        {esperaSi && !ocupado && (
          <div className="flex gap-1.5">
            <Button size="sm" className="h-8 flex-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs" onClick={() => void enviar("Sí, hacelo")}>Sí, hacelo</Button>
            <Button size="sm" variant="outline" className="h-8 flex-1 text-xs" onClick={() => void enviar("No, dejalo así")}>No</Button>
          </div>
        )}
        <form className="flex gap-1.5 items-end" onSubmit={(e) => { e.preventDefault(); void enviar(texto); }}>
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void enviar(texto); } }}
            rows={2}
            placeholder="Pedile a Atlas: 'hacé 3 creativos para historias', 'mejorá la portada'…"
            className="flex-1 resize-none rounded-xl border bg-background px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-violet-500/40"
          />
          {ocupado ? (
            <Button type="button" size="sm" variant="outline" className="h-10 w-10 p-0 shrink-0" onClick={detener} title="Detener" aria-label="Detener"><Square className="h-4 w-4" /></Button>
          ) : (
            <Button type="submit" size="sm" className="h-10 w-10 p-0 shrink-0 bg-violet-600 hover:bg-violet-700 text-white" disabled={!texto.trim()} aria-label="Enviar"><Send className="h-4 w-4" /></Button>
          )}
        </form>
      </div>
    </div>
  );
}
