import { useState, useRef, useEffect, memo } from "react";
import { Layout } from "@/components/layout";
import { useCajaQueCrece } from "@/hooks/use-caja-que-crece";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Bot, Send, User, Loader2, Sparkles, Check, X, Wrench, MessageSquare, Paperclip, RotateCcw, History, Trash2, Copy, Square, Mic, Volume2, VolumeX, Pause, Play, Globe } from "lucide-react";
import { ScraperPanel } from "@/components/scraper-panel";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { HelpTourButton } from "@/components/HelpTourButton";
import { useAutoTour } from "@/hooks/use-auto-tour";
import { getHelpGuide } from "@/data/help-guides";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const HELP_GUIDE = getHelpGuide("code-agent")!;

/**
 * Una respuesta de Atlas en Markdown, que se procesa UNA vez por texto.
 *
 * Lo que se escribe en la caja vive en el estado de esta pantalla, así que
 * cada letra la vuelve a dibujar entera; y cada respuesta del historial
 * volvía a pasar por ReactMarkdown + remarkGfm (tablas, listas, código).
 * Medido el 24-09-2026 en un celular simulado (CPU ×4, 40 turnos de
 * historial): 281 ms por letra en mediana, hasta 886 ms — "tarda mucho para
 * escribir lo que uno teclea". Con memo, si el texto no cambió no se vuelve
 * a procesar.
 */
const PLUGINS_MARKDOWN = [remarkGfm];
const MarkdownDeAtlas = memo(function MarkdownDeAtlas({ texto }: { texto: string }) {
  return <ReactMarkdown remarkPlugins={PLUGINS_MARKDOWN}>{texto}</ReactMarkdown>;
});

type Mode = "operator" | "agent";

interface ActionEntry {
  tool: string;
  ok: boolean;
  summary: string;
}

interface Message {
  role: "user" | "assistant";
  content: string;
  /**
   * Cuándo se dijo, en milisegundos.
   *
   * Pedido del admin: "que se vea la hora y la fecha de cada mensaje, como
   * los chats reales". Sin esto una conversación con Atlas es un bloque sin
   * tiempo -- y como un pedido de anuncio puede tardar minutos, no había
   * forma de saber si lo que estás leyendo es de hace un rato o de recién.
   */
  at?: number;
  configApplied?: boolean;
  advancedFeaturesEnabled?: boolean;
  actions?: ActionEntry[];
}

/**
 * La hora de un mensaje, como la escribe un chat de verdad.
 *
 * Hoy es solo la hora; ayer, "Ayer 14:32"; más atrás, la fecha con el día.
 * Un timestamp completo en cada renglón es ruido: lo que uno quiere saber de
 * un mensaje de hace diez minutos es la hora, y de uno de la semana pasada,
 * el día.
 */
function cuandoSeDijo(at?: number): string {
  if (!at) return "";
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return "";
  const hora = d.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
  const hoy = new Date();
  const mismoDia = (a: Date, b: Date) =>
    a.getDate() === b.getDate() && a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
  if (mismoDia(d, hoy)) return hora;
  const ayer = new Date(hoy);
  ayer.setDate(hoy.getDate() - 1);
  if (mismoDia(d, ayer)) return `Ayer ${hora}`;
  const fecha = d.toLocaleDateString("es-CO", { day: "2-digit", month: "short" });
  const conAno = d.getFullYear() === hoy.getFullYear() ? fecha : `${fecha} ${d.getFullYear()}`;
  return `${conAno}, ${hora}`;
}

/** El texto completo para el tooltip: ahí sí va la fecha y hora exactas. */
function cuandoExacto(at?: number): string {
  if (!at) return "";
  const d = new Date(at);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("es-CO", { dateStyle: "full", timeStyle: "medium" });
}

const GREETING: Record<Mode, string> = {
  // El saludo ya no es una lista de capacidades ("puedo crear productos,
  // categorías…"): eso obliga al cliente a saber qué pedir. Atlas guía: se
  // ofrece una meta y él lleva los pasos (ver lib/ruta-guiada.ts en el server).
  operator:
    "Soy Atlas. Yo te guío: elegí qué querés lograr y te llevo paso a paso, vos solo confirmás.",
  agent:
    "Modo diseño de agente. Analizo tu negocio y configuro el ADN de tu agente de ventas.",
};

const METAS_DE_INICIO = [
  { texto: "🚀 Vender un producto nuevo", mensaje: "Quiero vender un producto nuevo" },
  { texto: "📈 Vender más de lo que ya tengo", mensaje: "Ayúdame a vender más de un producto que ya tengo" },
  { texto: "🧭 No sé por dónde empezar", mensaje: "No sé por dónde empezar" },
  // Copia de lib/ruta-guiada.ts (METAS_DE_INICIO). El experto entra por acá
  // y Atlas deja de explicarle y de preguntarle de más.
  { texto: "⚡ Ya sé pautar: solo ejecutá", mensaje: "Ya sé pautar, quiero vender un producto nuevo: solo ejecutá" },
];

/**
 * Una fila del chat (pregunta del admin o respuesta de Atlas).
 *
 * Memorizada: lo que se escribe en la caja vive en el estado de la pantalla,
 * y sin esto cada letra volvía a dibujar TODO el historial. Medido el
 * 24-09-2026 (celular simulado, CPU ×4, 40 turnos): 281 ms por letra antes,
 * 150 ms con solo el Markdown memorizado. Los mensajes no cambian mientras se
 * escribe, así que la fila no se vuelve a dibujar.
 */
const FilaDeMensaje = memo(function FilaDeMensaje({ msg, i }: { msg: Message; i: number }) {
  return (
    <div
      key={i}
      className={`group py-5 ${i > 0 ? "border-t border-border/50" : ""} ${msg.role === "user" ? "flex justify-end" : "flex gap-3 md:gap-4"}`}
    >
      {msg.role === "assistant" && (
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
          <Bot className="h-4 w-4 text-white" />
        </div>
      )}
      <div className={`min-w-0 ${msg.role === "user" ? "max-w-[85%]" : "flex-1"}`}>
        <div
          className={
            msg.role === "user"
              ? "rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-primary-foreground"
              : ""
          }
        >
          {/* break-words + overflow-wrap:anywhere: las respuestas traen URLs largas que sin esto no se pueden partir */}
          {msg.role === "user" ? (
            // El mensaje del admin NO pasa por `prose`. Antes usaba
            // el mismo wrapper que la respuesta del bot, y Typography
            // fija `color: var(--tw-prose-body)` (gris oscuro) sobre
            // este div -- eso le ganaba al text-primary-foreground que
            // hereda de la burbuja, así que quedaba texto casi negro
            // sobre el fondo morado: ilegible. Además lo que escribe
            // el admin es texto plano, no Markdown; con whitespace-
            // pre-wrap se ve tal cual lo tipeó, saltos de línea
            // incluidos.
            <div className="text-sm md:text-base leading-relaxed whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
              {msg.content}
            </div>
          ) : (
            <div className="text-[15px] md:text-base prose prose-sm md:prose-base dark:prose-invert max-w-none break-words [overflow-wrap:anywhere] prose-p:leading-7 prose-headings:font-semibold prose-headings:mt-5 prose-headings:mb-2 prose-li:my-0.5 prose-ul:my-2 prose-ol:my-2 prose-img:rounded-lg prose-img:shadow-sm prose-a:text-indigo-500 hover:prose-a:text-indigo-600 prose-a:break-all prose-pre:whitespace-pre-wrap prose-pre:break-words prose-pre:overflow-x-auto prose-pre:rounded-xl prose-code:break-words prose-table:block prose-table:overflow-x-auto">
              <MarkdownDeAtlas texto={msg.content} />
            </div>
          )}
        </div>

        {/* La hora del mensaje. Alineada al lado que corresponde:
            a la derecha lo que escribió el admin, a la izquierda
            lo que contestó Atlas -- igual que en WhatsApp. */}
        {msg.at && (
          <div
            title={cuandoExacto(msg.at)}
            className={`mt-1 text-[11px] text-muted-foreground/70 tabular-nums ${msg.role === "user" ? "text-right" : ""}`}
          >
            {cuandoSeDijo(msg.at)}
          </div>
        )}

        {/* Copiar la respuesta. Atlas devuelve copys de anuncios,
            descripciones y planes: cosas que el admin quiere
            llevarse a otro lado. Sin esto habia que seleccionar a
            mano un texto largo dentro de un area que scrollea, que
            en el celular es directamente imposible.
            Aparece al pasar el mouse en escritorio y siempre en
            celular, donde no hay hover. */}
        {msg.role === "assistant" && msg.content && (
          <button
            onClick={() => {
              navigator.clipboard.writeText(msg.content)
                .then(() => toast.success("Copiado"))
                .catch(() => toast.error("No se pudo copiar"));
            }}
            className="mt-2 inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:opacity-0 md:group-hover:opacity-100"
            title="Copiar respuesta"
          >
            <Copy className="h-3.5 w-3.5" /> Copiar
          </button>
        )}

        {msg.actions && msg.actions.length > 0 && (
          <div className="mt-2 rounded-xl border border-border bg-card/50 divide-y divide-border overflow-hidden shadow-xs">
            {msg.actions.map((a, k) => (
              <div key={k} className="flex items-start gap-2.5 px-3.5 py-2.5 text-xs md:text-sm">
                <span
                  className={`mt-0.5 shrink-0 h-5 w-5 rounded-lg flex items-center justify-center ${a.ok ? "bg-emerald-500/10 text-emerald-600" : "bg-red-500/10 text-red-600"}`}
                >
                  {a.ok ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                </span>
                <span className="font-mono text-[11px] text-muted-foreground shrink-0 bg-muted px-1.5 py-0.5 rounded">{a.tool}</span>
                <span className="text-foreground/90 min-w-0 break-words [overflow-wrap:anywhere]">{a.summary}</span>
              </div>
            ))}
          </div>
        )}

        {msg.configApplied && (
          <div className="mt-2 flex gap-2 flex-wrap">
            <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-xs px-3 py-1">
              <Check className="h-3 w-3 mr-1" /> Configuración aplicada
            </Badge>
            {msg.advancedFeaturesEnabled && (
              <Badge className="bg-primary/10 text-primary border-primary/20 text-xs px-3 py-1">
                <Sparkles className="h-3 w-3 mr-1" /> Avanzado
              </Badge>
            )}
          </div>
        )}
      </div>
      {msg.role === "user" && (
        <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center shrink-0 mt-1 shadow-sm">
          <User className="h-5 w-5 text-primary-foreground" />
        </div>
      )}
    </div>
  );
});

export default function CodeAgent() {
  useAutoTour(HELP_GUIDE);
  const [mode, setMode] = useState<Mode>("operator");
  // Diagnóstico de inicio: cómo está el negocio hoy y el siguiente paso, con
  // su botón. Lo arma el servidor (GET /api/code-agent/diagnostico); si no
  // llega, quedan las metas fijas.
  const [diagnostico, setDiagnostico] = useState<{ texto: string; metas: { texto: string; mensaje: string }[] } | null>(null);
  useEffect(() => {
    let vivo = true;
    fetch("/api/code-agent/diagnostico", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!vivo || !d || !d.texto) return;
        // El endpoint devuelve UN siguiente paso ({ texto, mensaje }); va primero entre los botones.
        const metas = d.siguiente?.mensaje ? [{ texto: String(d.siguiente.texto), mensaje: String(d.siguiente.mensaje) }] : [];
        setDiagnostico({ texto: d.texto, metas });
      })
      .catch(() => {});
    return () => { vivo = false; };
  }, []);
  const [messages, setMessages] = useState<Message[]>([{ role: "assistant", content: GREETING.operator, at: Date.now() }]);
  // ── Conversaciones separadas ──────────────────────────────────────────
  // El historial SIEMPRE se guardo por sessionId, pero esta pantalla usaba
  // una sola sesion fija ("default"): abrir una charla nueva significaba
  // BORRAR la anterior. Reportado: "a veces quiero continuar una charla y no
  // puedo porque ya cerre o limpie la actual".
  //
  // La sesion activa se guarda en localStorage y no en el estado nada mas:
  // si se recarga la pagina o se vuelve desde otra seccion, se sigue en la
  // misma charla en vez de saltar a otra.
  const [sessionId, setSessionId] = useState<string>(() => {
    try { return localStorage.getItem("atlas_sesion") || "default"; } catch { return "default"; }
  });
  const [sesiones, setSesiones] = useState<any[]>([]);
  const [panelSesiones, setPanelSesiones] = useState(false);

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  // Lo que Atlas está haciendo ahora mismo, en lenguaje llano (llega por SSE,
  // ver callAtlas). Sin esto el admin solo veía tres puntitos rebotando y no
  // podía distinguir "está trabajando" de "se colgó".
  const [progreso, setProgreso] = useState("");
  /**
   * Cuántos segundos lleva esperando el turno actual.
   *
   * Un pedido de anuncio tarda ~98 s (medido el 2026-08-30). Con solo tres
   * puntitos rebotando, el admin no puede distinguir "va por la mitad" de "se
   * colgó hace un minuto" -- y lo que hace es recargar la página, que corta el
   * turno justo antes de que llegue la respuesta.
   *
   * El número no acelera nada, pero convierte una espera muda en una espera
   * que se entiende.
   */
  const [segundos, setSegundos] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [panelScraper, setPanelScraper] = useState(false);
  const [restoring, setRestoring] = useState(true);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  /**
   * Cómo se para a Atlas.
   *
   * Reportado el 2026-09-03 con la captura: "no hay forma de detener a Atlas,
   * se queda trabajando y si uno quiere detenerlo no se puede porque no hay
   * cómo". Y era exacto: mientras el turno corría, el botón de enviar se
   * volvía un spinner DESHABILITADO. La única salida era recargar -- que no
   * para nada, solo deja de mirar.
   *
   * Hacen falta las dos cosas, y por eso son dos:
   *
   *  · `cortarRef` aborta el fetch de ESTA pantalla, para que el botón
   *    responda en el acto y no cuando termine el tramo.
   *  · `detenidoRef` frena el encadenado automático. Es lo que más importa:
   *    la página encadena hasta CUATRO continuaciones sola, así que sin esto
   *    abortar una sola llamada no servía de nada -- arrancaba la siguiente.
   *
   * Y además se le avisa al servidor (`/detener`), que es el único que puede
   * dejar de gastar el turno de verdad. Abortar acá cierra la conexión, no el
   * trabajo del otro lado.
   *
   * Es un ref y no estado a propósito: lo leen bucles que ya están corriendo,
   * y un `useState` les dejaría el valor viejo de su render.
   */
  const cortarRef = useRef<AbortController | null>(null);
  const detenidoRef = useRef(false);
  /**
   * Hablarle a Atlas por micrófono.
   *
   * `grabando` prende el botón en rojo; `transcribiendo` cubre el rato entre
   * que soltás y llega el texto, que con Whisper es un segundo o dos pero sin
   * indicador se lee como que no pasó nada.
   */
  const [grabando, setGrabando] = useState(false);
  const [transcribiendo, setTranscribiendo] = useState(false);
  const grabadorRef = useRef<MediaRecorder | null>(null);
  const pedazosRef = useRef<Blob[]>([]);
  const silencioFrameRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  /**
   * Que Atlas conteste HABLADO.
   *
   * Apagado por defecto y recordado en el navegador: una pantalla que se pone
   * a hablar sola la primera vez que la abrís, en una oficina o al lado de
   * alguien, es una sorpresa desagradable. Se prende una vez y queda.
   */
  const [vozActiva, setVozActiva] = useState<boolean>(() => {
    try { return localStorage.getItem("atlas_voz") === "1"; } catch { return false; }
  });
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const ttsAbortRef = useRef<AbortController | null>(null);
  const ttsGeneracionRef = useRef(0);
  const vozActivaRef = useRef(vozActiva);
  const [audioReproduciendo, setAudioReproduciendo] = useState(false);
  // La caja de escribir crece con lo que se escribe. Ver el hook: acá
  // había un comentario prometiéndolo y ni una línea que lo hiciera.
  const textareaRef = useCajaQueCrece(input);

  // El cronómetro corre solo mientras se espera, y se reinicia en cada turno.
  useEffect(() => {
    if (!loading) { setSegundos(0); return; }
    const desde = Date.now();
    const id = setInterval(() => setSegundos(Math.floor((Date.now() - desde) / 1000)), 1000);
    return () => clearInterval(id);
  }, [loading]);

  // El hilo vive en el servidor (architect_memory). Al montar la página lo
  // restauramos para que cambiar de sección no borre la conversación.
  //
  // ── Y si Atlas todavía está trabajando, se lo espera ────────────────────
  //
  // El admin lo describió así: *"si me salgo se pega, y también me pide que le
  // dé la información de nuevo"*.
  //
  // El servidor ya hacía su parte desde el 2026-08-30: cerrar la pestaña no
  // cancela el turno, sigue hasta el final y guarda la respuesta. Lo que
  // faltaba estaba de este lado: al volver se leía el historial UNA vez y se
  // paraba. Si el turno seguía corriendo, lo último guardado era el mensaje
  // del admin y nada más -- así que veía su propio pedido sin respuesta, sin
  // ningún indicio de que algo estaba pasando, y lo lógico era concluir que se
  // colgó y escribirlo de nuevo. Pagando el turno dos veces.
  //
  // Ahora, si lo último guardado es del admin, es que la respuesta está en
  // camino: se muestra el indicador de siempre y se relee el historial hasta
  // que aparezca. No hace falta ningún estado nuevo en el servidor -- la
  // respuesta se guarda igual, solo había que ir a buscarla.
  //
  // ── Y lo mismo tiene que valer SIN recargar la página ──────────────────
  //
  // Todo lo de arriba cuelga del MONTAJE de la pantalla, así que solo cubre
  // "cierro la pestaña y vuelvo a entrar". No cubría el caso del celular, que
  // es el que el admin vive todos los días: salirse a otra app **no desmonta
  // nada**. La página queda viva y lo único que se muere es el socket.
  //
  // Por eso estas dos piezas se sacaron acá afuera: las usa también
  // `recuperarDelCorte`, que es esta misma recuperación pero disparada por el
  // corte de conexión en vez de por el montaje.
  const leerHistorial = async () => {
    const res = await fetch(`/api/code-agent/history?sessionId=${encodeURIComponent(sessionId)}`, { credentials: "include" });
    if (!res.ok) throw new Error(`status ${res.status}`);
    return res.json();
  };

  const pintarHistorial = (history: any[]) =>
    setMessages([
      { role: "assistant", content: GREETING.operator, at: Date.now() },
      ...history.map((t: any) => ({ role: t.role, content: t.content, at: typeof t.at === "number" ? t.at : undefined })),
    ]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const data = await leerHistorial();
        if (cancelled || !Array.isArray(data.history) || data.history.length === 0) return;
        pintarHistorial(data.history);
        if (data.awaitingConfirmation) {
          toast.info("Tienes un plan pendiente de confirmar");
        }

        // ── Quedó a medio hacer: se sigue, no se espera a que lo pida ────
        //
        // El encadenado de continuaciones vive en ESTA página. Si el admin se
        // fue, murió con ella: el servidor terminó el tramo que estaba
        // corriendo, lo guardó como parcial, y ahí quedó. Al volver veía un
        // mensaje diciendo que seguía trabajando... y nadie seguía.
        //
        // Se retoma solo. Escribirlo a mano no solo es innecesario: arranca un
        // turno NUEVO y paga la vuelta entera otra vez.
        // Si el SERVIDOR ya está con el tramo siguiente (la app estaba cerrada
        // y él siguió solo, ver lib/continuacion-servidor.ts), no se arranca
        // otro: cortaría el que está corriendo. Se espera su resultado.
        if (data.hayAlgoPendiente && data.turnoEnCurso === true) {
          setLoading(true);
          setProgreso("Atlas siguió trabajando mientras no estabas. Esperando el resultado…");
          void recuperarDelCorte().finally(() => { setLoading(false); setProgreso(""); });
          return;
        }
        if (data.hayAlgoPendiente) {
          void seguirPendiente(data.history);
          return;
        }

        if (data.history[data.history.length - 1]?.role !== "user") return;

        // ── El último mensaje es del admin y NO hay turno corriendo ───────
        //
        // Pasa cuando el servidor se reinició (deploy) a mitad de un turno:
        // el pedido quedó guardado y nadie lo está atendiendo. Antes la
        // página se quedaba 10 minutos en "Retomando…" sin dejar escribir ni
        // detener (19-09-2026 18:07). Ahora se avisa y se suelta el campo.
        if (data.turnoEnCurso === false) {
          setMessages((prev) => [
            ...prev,
            { role: "assistant", content: "Ese último pedido se cortó (el servidor se reinició mientras lo atendía) y no llegué a responderlo. Escribímelo de nuevo y lo retomo.", at: Date.now() },
          ]);
          return;
        }

        // Se reusa `loading` a propósito: prende el mismo indicador de
        // "escribiendo" con su cronómetro y bloquea el campo de escribir, que
        // es lo correcto -- mandar otro pedido encima del que está corriendo
        // los cruza.
        setLoading(true);
        setProgreso("Retomando lo que Atlas estaba haciendo");
        detenidoRef.current = false;

        // Un turno pesado puede encadenar hasta 4 continuaciones de ~150s, así
        // que el techo son ~10 min. Pasado eso se suelta el campo en vez de
        // dejar al admin mirando un reloj para siempre: si de verdad se cayó,
        // tiene que poder volver a pedirlo.
        const CADA = 4000;
        const INTENTOS = 150;
        for (let i = 0; i < INTENTOS && !cancelled; i++) {
          await new Promise((r) => setTimeout(r, CADA));
          if (cancelled) return;
          // El botón de Detener también vale acá: antes solo ponía
          // "Deteniendo…" y esta espera seguía otros 10 minutos.
          if (detenidoRef.current) {
            setLoading(false);
            setProgreso("");
            return;
          }
          let ahora: any;
          try {
            ahora = await leerHistorial();
          } catch {
            continue; // un error de red suelto no cancela la espera
          }
          const h = Array.isArray(ahora?.history) ? ahora.history : [];
          if (h.length === 0) continue;
          if (h[h.length - 1]?.role === "assistant") {
            if (cancelled) return;
            pintarHistorial(h);
            setLoading(false);
            setProgreso("");
            return;
          }
          // El servidor ya no tiene turno en esta charla y no dejó respuesta:
          // se murió en el camino. No hay nada más que esperar.
          if (ahora?.turnoEnCurso === false) {
            if (cancelled) return;
            setLoading(false);
            setProgreso("");
            setMessages((prev) => [
              ...prev,
              { role: "assistant", content: "Ese pedido se cortó a mitad de camino y no llegué a responderlo. Escribímelo de nuevo y lo retomo.", at: Date.now() },
            ]);
            return;
          }
        }
        if (cancelled) return;
        setLoading(false);
        setProgreso("");
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: "Estuve un rato largo con esto y no llegué a terminarlo. ¿Lo intentamos de nuevo?",
            at: Date.now(),
          },
        ]);
      } catch {
        // sin historial: se queda el saludo
      } finally {
        if (!cancelled) setRestoring(false);
      }
    })();
    return () => { cancelled = true; };
  }, [sessionId]);

  const cargarSesiones = async () => {
    try {
      const r = await fetch("/api/code-agent/sessions", { credentials: "include" });
      if (!r.ok) return;
      const d = await r.json();
      setSesiones(Array.isArray(d.sesiones) ? d.sesiones : []);
    } catch { /* si no se pueden listar, el panel queda vacio */ }
  };

  const abrirSesion = (id: string) => {
    try { localStorage.setItem("atlas_sesion", id); } catch { /* modo privado */ }
    setSessionId(id);
    setPanelSesiones(false);
    setRestoring(true);
    setMessages([{ role: "assistant", content: GREETING[mode], at: Date.now() }]);
  };

  // Una charla NUEVA no borra la anterior: se abre otra sesion y la vieja
  // queda guardada. Ese era justamente el problema.
  const nuevaConversacion = () => {
    abrirSesion(`s-${Date.now()}`);
    toast.success("Conversación nueva. La anterior quedó guardada.");
  };

  const borrarSesion = async (id: string) => {
    try {
      await fetch(`/api/code-agent/history?sessionId=${encodeURIComponent(id)}`, { method: "DELETE", credentials: "include" });
      await cargarSesiones();
      if (id === sessionId) abrirSesion("default");
      toast.success("Conversación borrada");
    } catch {
      toast.error("No se pudo borrar");
    }
  };

  /**
   * Callar a Atlas ya mismo.
   *
   * Se usa en los dos momentos en que hablar de más molesta: cuando el admin
   * empieza a hablar (no puede haber dos voces encima) y cuando aprieta
   * Detener. Es una función y no una línea suelta porque el olvido de llamarla
   * en UNO de esos lugares es justo el defecto que se nota.
   */
  const callarAtlas = () => {
    ttsGeneracionRef.current++;
    ttsAbortRef.current?.abort();
    ttsAbortRef.current = null;
    const a = audioRef.current;
    audioRef.current = null;
    setAudioReproduciendo(false);
    if (a) try { a.pause(); a.src = ""; } catch { /* ya estaba cortado */ }
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    audioUrlRef.current = null;
  };

  /**
   * Dice en voz alta la respuesta de Atlas.
   *
   * El audio lo genera el SERVIDOR (voz de Microsoft, gratis, es-CO). Podría
   * usarse `speechSynthesis` del navegador sin pedirle nada a nadie, pero esa
   * voz suena a máquina y el pedido fue voz humana.
   *
   * Nunca molesta si falla: si el servicio no contesta, devuelve 204 y esto no
   * hace nada. La respuesta escrita ya está en pantalla, que es lo que importa.
   */
  const decirEnVozAlta = async (texto: string) => {
    if (!vozActivaRef.current || !texto.trim()) return;
    callarAtlas();
    const generacion = ttsGeneracionRef.current;
    const controller = new AbortController();
    ttsAbortRef.current = controller;
    try {
      const r = await fetch("/api/code-agent/voz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto }),
        credentials: "include",
        signal: controller.signal,
      });
      if (!r.ok || r.status === 204) return;
      const blob = await r.blob();
      // Si mientras se generaba el audio el admin empezó a hablar o apretó
      // Detener, ya no se reproduce: llegó tarde a una conversación que
      // siguió sin él.
      if (generacion !== ttsGeneracionRef.current || !vozActivaRef.current || grabadorRef.current) return;
      const url = URL.createObjectURL(blob);
      const a = new Audio(url);
      audioUrlRef.current = url;
      audioRef.current = a;
      // La URL del blob se libera al terminar: sin esto cada respuesta hablada
      // deja un objeto en memoria hasta que se recargue la página.
      a.onplay = () => setAudioReproduciendo(true);
      a.onpause = () => setAudioReproduciendo(false);
      a.onended = () => {
        URL.revokeObjectURL(url);
        if (audioUrlRef.current === url) audioUrlRef.current = null;
        if (audioRef.current === a) audioRef.current = null;
        setAudioReproduciendo(false);
      };
      await a.play().catch(() => { setAudioReproduciendo(false); });
    } catch {
      // Sin voz se sigue igual. No se le avisa al admin: no perdió nada.
    } finally {
      if (ttsAbortRef.current === controller) ttsAbortRef.current = null;
    }
  };

  const pausarOReanudarAtlas = () => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) void a.play().catch(() => {});
    else a.pause();
  };

  // Al apagar la voz, lo que esté sonando se calla en el acto. Dejar terminar
  // la frase después de apretar "silenciar" es no obedecer.
  useEffect(() => {
    vozActivaRef.current = vozActiva;
    try { localStorage.setItem("atlas_voz", vozActiva ? "1" : "0"); } catch { /* modo privado */ }
    if (!vozActiva) callarAtlas();
  }, [vozActiva]);

  /**
   * ── HABLARLE A ATLAS ──────────────────────────────────────────────────
   *
   * Se aprieta para empezar y se aprieta para terminar. NO es "mantener
   * apretado": en un celular, mantener el dedo sobre un botón mientras se
   * habla obliga a sostener el teléfono en una postura incómoda, y si el dedo
   * resbala se pierde lo dicho. Apretar dos veces es más perdonador.
   *
   * El texto NO se manda solo: cae en la caja de escribir para leerlo antes.
   * Whisper se equivoca con nombres de producto y con cifras, y acá una cifra
   * mal entendida es un presupuesto de anuncio equivocado. El pedido fue que
   * "entienda de forma correcta", y la forma de garantizarlo no es confiar en
   * la transcripción: es poder corregirla cuando todavía es gratis.
   */
  const empezarAGrabar = async () => {
    if (grabando || loading) return;
    // Que no se hablen encima: si Atlas está diciendo algo, se calla apenas el
    // admin abre el micrófono. Es lo que hace una persona cuando la
    // interrumpen, y sin esto el micrófono grabaría la propia voz de Atlas.
    callarAtlas();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          // Lo que hace la diferencia entre entender y no entender: el eco y
          // el ruido del ambiente son lo que le arruina la transcripción a
          // Whisper, mucho más que el acento.
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      // Chrome graba webm/opus, Safari mp4. Se deja elegir al navegador en vez
      // de imponer un formato: forzar uno que no soporta devuelve un grabador
      // mudo, sin error visible.
      const rec = new MediaRecorder(stream);
      pedazosRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size > 0) pedazosRef.current.push(e.data); };
      rec.onstop = async () => {
        if (silencioFrameRef.current !== null) cancelAnimationFrame(silencioFrameRef.current);
        silencioFrameRef.current = null;
        void audioContextRef.current?.close().catch(() => {});
        audioContextRef.current = null;
        // El micrófono se apaga SIEMPRE, aunque la transcripción falle: si no,
        // queda la luz del micro prendida y el navegador diciendo que la
        // página te está escuchando.
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(pedazosRef.current, { type: rec.mimeType || "audio/webm" });
        pedazosRef.current = [];
        await enviarAudio(blob);
      };
      rec.start();
      grabadorRef.current = rec;
      setGrabando(true);

      // Detección simple de voz: una pausa sostenida termina el turno sin
      // obligarte a buscar otro botón. El máximo evita dejar el micrófono
      // abierto si el navegador pierde una señal de silencio.
      try {
        const contexto = new AudioContext();
        const fuente = contexto.createMediaStreamSource(stream);
        const analizador = contexto.createAnalyser();
        analizador.fftSize = 512;
        fuente.connect(analizador);
        const datos = new Uint8Array(analizador.fftSize);
        const inicio = Date.now();
        let ultimoSonido = inicio;
        const revisar = () => {
          if (grabadorRef.current !== rec || rec.state !== "recording") return;
          analizador.getByteTimeDomainData(datos);
          let energia = 0;
          for (const muestra of datos) {
            const amplitud = (muestra - 128) / 128;
            energia += amplitud * amplitud;
          }
          if (Math.sqrt(energia / datos.length) > 0.025) ultimoSonido = Date.now();
          if ((Date.now() - ultimoSonido > 1_800 && Date.now() - inicio > 700) || Date.now() - inicio > 60_000) {
            pararDeGrabar();
            return;
          }
          silencioFrameRef.current = requestAnimationFrame(revisar);
        };
        audioContextRef.current = contexto;
        silencioFrameRef.current = requestAnimationFrame(revisar);
      } catch {
        // Si AudioContext no está disponible, sigue funcionando el botón manual.
      }
    } catch {
      // El navegador dice "NotAllowedError" y eso no le sirve a nadie: lo que
      // hay que decir es qué hacer.
      toast.error("No pude usar el micrófono. Dale permiso al sitio y probá de nuevo.");
    }
  };

  const pararDeGrabar = () => {
    const rec = grabadorRef.current;
    if (!rec) return;
    grabadorRef.current = null;
    setGrabando(false);
    if (silencioFrameRef.current !== null) cancelAnimationFrame(silencioFrameRef.current);
    silencioFrameRef.current = null;
    void audioContextRef.current?.close().catch(() => {});
    audioContextRef.current = null;
    try { rec.stop(); } catch { /* ya estaba parado */ }
  };

  /**
   * El audio se manda DERECHO al turno: el servidor lo transcribe adentro y
   * contesta.
   *
   * Antes esto llamaba a `/transcribir`, dejaba el texto en la caja y esperaba
   * que el admin apretara Enviar. Dos viajes y dos toques para una sola
   * intención, como él mismo señaló. Lo que se conserva de aquel diseño es lo
   * que de verdad importaba: que se VEA lo entendido -- llega por SSE apenas
   * está y antes de que Atlas trabaje, así que si escuchó mal se ve en el acto
   * y está el botón de Detener.
   */
  const enviarAudio = async (blob: Blob) => {
    setTranscribiendo(true);
    try {
      const dataUrl: string = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result as string);
        r.onerror = reject;
        r.readAsDataURL(blob);
      });
      await handleSubmit({ dataUrl, mime: blob.type || "audio/webm" });
    } catch {
      toast.error("No se pudo enviar el audio.");
    } finally {
      setTranscribiendo(false);
    }
  };

  // Si la pantalla se cierra en mitad de una grabación, el micrófono tiene que
  // apagarse igual. Sin esto queda escuchando después de salir de la sección.
  useEffect(() => {
    return () => {
      ttsGeneracionRef.current++;
      ttsAbortRef.current?.abort();
      const respuesta = audioRef.current;
      audioRef.current = null;
      try { respuesta?.pause(); } catch { /* noop */ }
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
      const rec = grabadorRef.current;
      grabadorRef.current = null;
      if (silencioFrameRef.current !== null) cancelAnimationFrame(silencioFrameRef.current);
      silencioFrameRef.current = null;
      void audioContextRef.current?.close().catch(() => {});
      audioContextRef.current = null;
      try { rec?.stop(); } catch { /* noop */ }
    };
  }, []);

  const resetConversation = async () => {
    try {
      await fetch(`/api/code-agent/history?sessionId=${encodeURIComponent(sessionId)}`, { method: "DELETE", credentials: "include" });
      setMessages([{ role: "assistant", content: GREETING[mode], at: Date.now() }]);
      toast.success("Conversación reiniciada");
    } catch {
      toast.error("No se pudo reiniciar");
    }
  };

  // Subir una imagen/archivo desde el chat (botón 📎) y dejar su URL lista para
  // que el Architect la use (ej: "asigna esta imagen al producto ...").
  // Subir archivos desde el chat (botón 📎): acepta VARIOS a la vez y cada
  // uno queda identificado de forma profesional (nombre · tipo · tamaño).
  // Una imagen y un documento NO se procesan igual: la imagen se guarda y se
  // le pasa la URL a un modelo con visión; el documento se lee, se archiva
  // una copia en el volumen y su texto entra en la conversación.
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const archivos = Array.from(e.target.files || []);
    if (!archivos.length) return;
    const kb = (n: number) => `${Math.max(1, Math.round(n / 1024))} KB`;
    setUploading(true);
    try {
      for (const file of archivos) {
        const esImagen = file.type.startsWith("image/");
        const limite = esImagen ? 8 : 15;
        if (file.size > limite * 1024 * 1024) {
          toast.error(`"${file.name}" supera ${limite}MB y se omitió`);
          continue;
        }
        const dataUrl: string = await new Promise((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(r.result as string);
          r.onerror = reject;
          r.readAsDataURL(file);
        });
        if (!esImagen) {
          const r = await fetch("/api/code-agent/upload-document", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ file: dataUrl, filename: file.name }),
            credentials: "include",
          });
          const d = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error(d.error || `No se pudo leer "${file.name}"`);
          const SALTO = String.fromCharCode(10);
          const ficha = `[Archivo: ${d.nombre || file.name} · ${d.tipo || "documento"} · ${kb(d.bytes || file.size)}${d.fileUrl ? ` · guardado en ${d.fileUrl}` : ""}]`;
          setInput((prev) =>
            (prev ? prev + SALTO + SALTO : "") +
            `${ficha}${d.recortado ? " — es largo, va la primera parte" : ""}:` +
            SALTO + SALTO + d.texto,
          );
          toast.success(d.resumen || `Archivo "${file.name}" leído`);
          continue;
        }
        const res = await fetch("/api/code-agent/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image: dataUrl, filename: file.name }),
          credentials: "include",
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Error al subir "${file.name}"`);
        const data = await res.json();
        const fichaImg = `[Imagen: ${data.nombre || file.name} · ${data.mime || file.type || "imagen"} · ${kb(data.bytes || file.size)}]`;
        setInput((prev) => (prev ? prev + "\n\n" : "") + `${fichaImg}\nUsa esta imagen:\n![Imagen subida](${data.url})`);
        toast.success(`Imagen "${file.name}" subida ✓ — dime a qué producto asignarla`);
      }
    } catch (err: any) {
      toast.error(err.message || "No se pudo subir el archivo");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const switchMode = (m: Mode) => {
    if (m === mode) return;
    setMode(m);
    setMessages([{ role: "assistant", content: GREETING[m], at: Date.now() }]);
  };

  // Quien usa esto no es programador: un pedido pesado (investigar + armar
  // una campaña, por ejemplo) puede necesitar más de un turno internamente
  // porque el proxy corta la conexión a los ~150s -- pero eso es un detalle
  // de infraestructura, no algo que el admin tenga que resolver escribiendo
  // "continuá" él mismo. Si el backend marca needsContinuation, se sigue
  // solo (silencioso, sin mensaje de usuario nuevo, el indicador de
  // "escribiendo" queda prendido todo el tiempo) hasta un tope razonable de
  // vueltas -- nunca se le muestra al admin nada que suene a error técnico.
  const MAX_AUTO_CONTINUATIONS = 4;
  // Sin la palabra "investigaste": el servidor la leía como pedido de
  // investigar y re-investigaba en cada vuelta (29-09-2026). El servidor
  // reconoce este texto por su comienzo ("Continuá con lo que ya tenías").
  const CONTINUAR = "Continuá con lo que ya tenías, sin repetir lo que ya hiciste.";

  /**
   * Se acabaron las continuaciones automáticas: recién ACÁ tiene sentido
   * pedirle al admin que lo pida él.
   *
   * El servidor decía "decime *continuá* y sigo desde donde iba" en CADA
   * tramo cortado -- mientras esta misma página ya lo estaba continuando
   * sola, hasta cuatro veces. El admin lo vio el 2026-09-03 y lo leyó como
   * que Atlas se había colgado. Y si le hacía caso, escribir "continuá"
   * arrancaba un turno nuevo y pagaba la vuelta otra vez.
   */
  const avisarQueHayQuePedirlo = (data: any) => {
    if (!data?.needsContinuation) return;
    setMessages((prev) => [
      ...prev,
      {
        role: "assistant",
        at: Date.now(),
        content: "Este pedido está llevando bastante más de lo normal. Si querés que siga, decime **continuá**.",
      },
    ]);
  };
  // El backend igual recorta a los últimos 30 turnos (defensa real contra
  // colgadas en hilos largos, ver code-agent.ts) -- este límite acá evita
  // mandar un payload gigante de entrada en primer lugar en conversaciones
  // de varios días como la que causó el cuelgue original (2026-08-10).
  const HISTORY_LIMIT = 30;

  /**
   * `audio` es el camino por voz: se manda el audio y el SERVIDOR lo
   * transcribe y contesta en el mismo turno. Antes se transcribia en una
   * llamada aparte, el texto caia en la caja y habia que apretar Enviar --
   * dos viajes y dos toques para una sola intencion.
   */
  const callAtlas = async (
    promptText: string,
    historyForCall: { role: string; content: string }[],
    audio?: { dataUrl: string; mime: string },
  ) => {
    const esOperador = mode === "operator";
    // Corte al motor nuevo (2026-08-12). Medido en vivo con el MISMO pedido
    // ("investigá la competencia y creá el anuncio"): la ruta vieja
    // `/operator` devolvió 502 a los 79s -- el "No pude terminar de responder"
    // que reportó el admin -- mientras `/operator-opencode` lo resolvió en
    // 27-47s con datos reales, repetidas veces. Además el motor nuevo trae los
    // candados que la vieja no tiene: investigación disparada por el servidor
    // (no por la promesa del modelo), aviso automático si afirma haber
    // investigado sin hacerlo, aviso si escribió algo y no lo guardó, y solo
    // las herramientas del pedido en vez de las 34 (que era lo que lo hacía
    // tardar 69s en algo tan simple como listar 3 productos).
    const endpoint = esOperador ? "/api/code-agent/operator-opencode" : "/api/code-agent/architect";
    // Un controlador por llamada: el encadenado hace varias seguidas, y
    // reusar el mismo dejaría abortada la segunda antes de empezar.
    const controlador = new AbortController();
    cortarRef.current = controlador;
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // Solo el operador emite progreso; el modo Agente responde de una.
      body: JSON.stringify({
        ...(audio ? { audio: audio.dataUrl, mimeAudio: audio.mime } : { prompt: promptText }),
        history: historyForCall,
        sessionId,
        ...(esOperador ? { stream: true } : {}),
      }),
      credentials: "include",
      signal: controlador.signal,
    });
    if (!res.ok) {
      await res.json().catch(() => null);
      throw new Error(`status ${res.status}`);
    }

    // Si el servidor no habla SSE (versión anterior desplegada, o el modo
    // Agente) se lee como JSON normal: el frontend nuevo sigue andando contra
    // un backend viejo, sin quedarse esperando un stream que no va a llegar.
    const tipo = res.headers.get("content-type") || "";
    if (!tipo.includes("text/event-stream") || !res.body) return res.json();

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let resultado: any = null;

    // Formato SSE: bloques separados por línea en blanco, con "event:" y
    // "data:". Se acumula en un buffer porque un bloque puede llegar partido
    // entre dos trozos de red.
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const bloques = buffer.split("\n\n");
      buffer = bloques.pop() || "";
      for (const bloque of bloques) {
        const evento = /^event:\s*(.+)$/m.exec(bloque)?.[1]?.trim();
        const datos = /^data:\s*(.+)$/m.exec(bloque)?.[1];
        if (!datos) continue;
        let payload: any;
        try { payload = JSON.parse(datos); } catch { continue; }
        if (evento === "progress" && payload?.texto) setProgreso(String(payload.texto));
        // Una parte del pedido que ya está terminada. Entra al chat como un
        // mensaje más, sin cerrar el turno: Atlas sigue con la parte siguiente
        // y el indicador queda prendido.
        //
        // Antes las partes se acumulaban y salían todas juntas al final, así
        // que un turno que se cortaba en la tercera entregaba CERO -- las dos
        // que ya estaban hechas se perdían con él. Ahora lo entregado queda
        // entregado.
        // Lo que el servidor ENTENDIO del audio. Entra al chat como el mensaje
        // del admin, apenas esta y antes de que Atlas se ponga a trabajar: si
        // escucho mal se ve en el acto, y esta el boton de Detener.
        else if (evento === "transcripcion" && payload?.texto) {
          setMessages((prev) => [
            ...prev,
            { role: "user", content: String(payload.texto), at: Date.now() },
          ]);
        }
        else if (evento === "avance" && payload?.reply) {
          setMessages((prev) => [
            ...prev,
            { role: "assistant", content: String(payload.reply), at: Date.now() },
          ]);
        }
        else if (evento === "result") resultado = payload;
        else if (evento === "error") throw new Error(payload?.error || "turno interrumpido");
      }
    }
    // Se cortó el stream sin resultado (se cayó la red a mitad de camino):
    // se trata como fallo para que salte el mensaje amable de reintentar, en
    // vez de mostrar una respuesta vacía como si hubiera terminado bien.
    if (!resultado) throw new Error("stream sin resultado");
    return resultado;
  };

  /**
   * Retoma un pedido que quedó cortado por tiempo.
   *
   * Es el mismo encadenado que hace `handleSubmit`, pero arrancando desde lo
   * que ya está guardado en vez de desde un mensaje nuevo del admin.
   */
  const seguirPendiente = async (historyGuardado: any[]) => {
    setLoading(true);
    setProgreso("Retomando tu pedido donde había quedado");
    detenidoRef.current = false;
    try {
      let history = historyGuardado.slice(-HISTORY_LIMIT).map((m: any) => ({ role: m.role, content: m.content }));
      let data: any = null;
      for (let round = 0; round < MAX_AUTO_CONTINUATIONS && !detenidoRef.current; round++) {
        data = await callAtlas(CONTINUAR, history);
        const parcial: Message = {
          role: "assistant",
          at: Date.now(),
          content: data?.reply || "Sigo trabajando en esto...",
          configApplied: data?.configApplied,
          advancedFeaturesEnabled: data?.advancedFeaturesEnabled,
          actions: Array.isArray(data?.actions) ? data.actions : undefined,
        };
        setMessages((prev) => [...prev, parcial]);
        if (!data?.needsContinuation) return;
        history = [...history, { role: "assistant", content: parcial.content }].slice(-HISTORY_LIMIT);
      }
      avisarQueHayQuePedirlo(data);
    } catch {
      // Igual que en handleSubmit: si lo paró el admin, no se le ofrece
      // reintentar algo que acaba de pedir que no siga.
      setMessages((prev) => [
        ...prev,
        loDetuveYo()
          ? { role: "assistant" as const, content: "⏹️ Listo, lo detuve. Lo que ya se había hecho queda como estaba.", at: Date.now() }
          : { role: "assistant" as const, content: "No pude retomar lo que estaba haciendo. ¿Lo intentamos de nuevo?", at: Date.now() },
      ]);
    } finally {
      setLoading(false);
      setProgreso("");
    }
  };

  /**
   * Se cortó la conexión. NO se cortó el trabajo.
   *
   * ⚠️ Esa distinción es todo el arreglo. El admin lo dijo así: *"cuando me
   * salgo de la app no sigue trabajando, se corta, y eso es grave: debe
   * trabajar en segundo plano y cuando yo vuelva debe haber terminado o
   * seguir trabajando, por eso es una app, no depende de si yo la tengo
   * abierta o no"*.
   *
   * Tenía razón en el síntoma, pero la causa no era la que parecía. El
   * servidor ya hacía su parte desde el 2026-08-30: el turno sobrevive a que
   * se caiga el socket, sigue hasta el final y guarda la respuesta. Lo que
   * fallaba era la VUELTA, y por un detalle muy concreto: la recuperación
   * existía, pero colgaba del montaje de la pantalla. O sea que solo servía
   * si el admin recargaba la página.
   *
   * Y en el celular, salirse a otra app no desmonta nada. La pantalla sigue
   * montada y solo se muere el socket: el fetch falla, ningún montaje dispara
   * la recuperación, y se le contestaba "se cortó la conexión, ¿lo intentamos
   * de nuevo?" -- pidiéndole repetir un trabajo que en el servidor seguía
   * corriendo. Pagando el turno dos veces, que es justo lo que el arreglo de
   * agosto quería evitar.
   *
   * Devuelve `true` si consiguió reengancharse. Solo si devuelve `false` --el
   * servidor no contesta en 10 min, o de verdad no quedó nada-- se le dice al
   * admin que algo salió mal.
   */
  const recuperarDelCorte = async (): Promise<boolean> => {
    setProgreso("Se cayó la conexión, pero Atlas sigue trabajando. Recuperando…");

    // El mismo techo que al montar: un turno pesado encadena hasta 4
    // continuaciones de ~150s, así que ~10 min.
    const CADA = 4000;
    const INTENTOS = 150;
    for (let i = 0; i < INTENTOS; i++) {
      if (detenidoRef.current) return false;

      let data: any;
      try {
        data = await leerHistorial();
      } catch {
        // Todavía sin red. Eso no es una respuesta: es no haber podido
        // preguntar, así que no cuenta como que no quedó nada.
        await new Promise((r) => setTimeout(r, CADA));
        continue;
      }
      const h = Array.isArray(data?.history) ? data.history : [];

      // Quedó a medio hacer: se sigue solo, igual que al montar. Se espera con
      // await --y no `void`-- porque el `finally` de quien llama apaga el
      // spinner: soltándolo, la pantalla se veía quieta mientras Atlas seguía.
      // El servidor sigue solo con el tramo siguiente: se muestra lo que hay
      // y se sigue esperando, sin arrancar otro turno encima.
      if (data?.hayAlgoPendiente && data?.turnoEnCurso === true) {
        pintarHistorial(h);
        await new Promise((r) => setTimeout(r, CADA));
        continue;
      }
      if (data?.hayAlgoPendiente) {
        pintarHistorial(h);
        await seguirPendiente(h);
        return true;
      }

      // La respuesta ya está guardada: terminó mientras el admin no estaba,
      // que es exactamente lo que pedía que pasara.
      if (h.length > 0 && h[h.length - 1]?.role === "assistant") {
        pintarHistorial(h);
        return true;
      }

      // El servidor ya NO tiene turno en esta charla y tampoco dejó respuesta:
      // el turno se murió en el camino (se cortó por cupo o por tiempo y no
      // quedó nada corriendo). Esperar 10 minutos no lo resucita: se avisa y
      // se suelta, igual que al montar. Sin esto la pantalla se quedaba en
      // "Recuperando…" hasta agotar los 150 intentos aunque no hubiera nada
      // que esperar (05-10-2026).
      if (data?.turnoEnCurso === false && h.length > 0 && h[h.length - 1]?.role !== "assistant") {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: "Ese pedido se cortó a mitad de camino y no llegué a responderlo. Escribímelo de nuevo y lo retomo.", at: Date.now() },
        ]);
        return true;
      }

      await new Promise((r) => setTimeout(r, CADA));
    }
    return false;
  };

  // En móviles, volver desde otra app no desmonta esta pantalla: el navegador
  // puede suspender el fetch/SSE mientras el backend sigue trabajando. Al
  // recuperar visibilidad reconciliamos contra la base para mostrar el
  // resultado o retomar el turno, sin pedirle al admin que repita el pedido.
  useEffect(() => {
    let consultando = false;
    const alVolver = async () => {
      if (document.visibilityState !== "visible" || consultando || detenidoRef.current) return;
      consultando = true;
      try {
        const data: any = await leerHistorial();
        const history = Array.isArray(data?.history) ? data.history : [];
        if (history.length === 0) return;
        if (data?.hayAlgoPendiente && data?.turnoEnCurso === true) {
          pintarHistorial(history);
          setLoading(true);
          setProgreso("Atlas siguió trabajando mientras no estabas. Esperando el resultado…");
          await recuperarDelCorte();
          setLoading(false);
          setProgreso("");
          return;
        }
        if (data?.hayAlgoPendiente) {
          pintarHistorial(history);
          setLoading(true);
          setProgreso("Retomando tu pedido donde había quedado");
          await seguirPendiente(history);
          return;
        }
        if (history[history.length - 1]?.role === "assistant") {
          pintarHistorial(history);
          setLoading(false);
          setProgreso("");
        } else if (history[history.length - 1]?.role === "user") {
          // Sin turno en el servidor no hay nada que esperar: se avisa y se
          // suelta en vez de entrar a "Recuperando…", que sin esto no salía
          // nunca porque no había nada corriendo que pudiera terminar.
          if (data?.turnoEnCurso === false) {
            setMessages((prev) => [
              ...prev,
              { role: "assistant", content: "Ese pedido se cortó a mitad de camino y no llegué a responderlo. Escribímelo de nuevo y lo retomo.", at: Date.now() },
            ]);
            setLoading(false);
            setProgreso("");
            return;
          }
          setLoading(true);
          setProgreso("Atlas siguió trabajando. Esperando el resultado…");
          await recuperarDelCorte();
        }
      } catch {
        // Un fallo de red al volver no invalida el turno; el próximo cambio de
        // visibilidad o la carga normal de la pantalla volverá a consultarlo.
      } finally {
        consultando = false;
      }
    };
    document.addEventListener("visibilitychange", alVolver);
    return () => document.removeEventListener("visibilitychange", alVolver);
  }, [sessionId]);

  /**
   * El botón de parar.
   *
   * Hace las tres cosas que hacen falta, en este orden: frena el encadenado
   * (para que no arranque la vuelta siguiente), le avisa al servidor (que es
   * el único que puede dejar de gastar el turno) y recién ahí aborta la
   * conexión de esta pantalla.
   *
   * El aviso al servidor NO se espera con await antes de abortar: si el
   * backend tarda en contestar, el admin seguiría mirando el spinner después
   * de haber apretado, que es justo lo que se está arreglando.
   */
  const detener = () => {
    if (!loading) return;
    // Parar es parar todo, también la voz.
    callarAtlas();
    detenidoRef.current = true;
    setProgreso("Deteniendo…");
    fetch("/api/code-agent/operator-opencode/detener", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId }),
      credentials: "include",
    }).catch(() => {
      // Que falle el aviso no cambia lo que ve el admin: la pantalla corta
      // igual. Solo significa que el servidor termina el tramo que tenía.
    });
    cortarRef.current?.abort();
  };

  /**
   * ¿El fallo que acaba de saltar es "lo detuvo el admin"?
   *
   * Un fetch abortado tira `AbortError`, y sin distinguirlo el catch mostraba
   * "No pude responder, ¿lo intentamos de nuevo?" -- un mensaje de error para
   * algo que salió exactamente como se pidió.
   */
  const loDetuveYo = () => detenidoRef.current;

  /**
   * `audio` es el pedido hablado: el servidor lo transcribe y contesta en el
   * mismo turno.
   *
   * El mensaje del admin NO se agrega acá cuando es audio: todavía no se sabe
   * qué dijo. Lo agrega el evento `transcripcion` con lo que el servidor
   * entendió de verdad, que es lo único honesto para mostrar en su nombre.
   */
  const handleSubmit = async (audio?: { dataUrl: string; mime: string }, textoDirecto?: string) => {
    const escrito = (textoDirecto ?? input).trim();
    if ((!audio && !escrito) || loading) return;
    const userMsg = audio ? "" : escrito;
    if (!audio) {
      setInput("");
      setMessages((prev) => [...prev, { role: "user", content: userMsg, at: Date.now() }]);
    }
    setLoading(true);
    setProgreso(audio ? "Escuchando lo que dijiste..." : "");
    // Cada pedido nuevo arranca sin la marca del anterior: si no, un turno
    // detenido dejaba a Atlas incapaz de encadenar nunca más en esta pantalla.
    detenidoRef.current = false;

    try {
      let history = messages.slice(-HISTORY_LIMIT).map((m) => ({ role: m.role, content: m.content }));
      let data = await callAtlas(userMsg, history, audio);

      for (let round = 0; round < MAX_AUTO_CONTINUATIONS && data?.needsContinuation && !detenidoRef.current; round++) {
        const partial: Message = {
          role: "assistant",
          at: Date.now(),
          content: data.reply || "Sigo trabajando en esto...",
          configApplied: data.configApplied,
          advancedFeaturesEnabled: data.advancedFeaturesEnabled,
          actions: Array.isArray(data.actions) ? data.actions : undefined,
        };
        setMessages((prev) => [...prev, partial]);
        history = [...history, { role: "user", content: userMsg }, { role: "assistant", content: partial.content }].slice(-HISTORY_LIMIT);
        data = await callAtlas(CONTINUAR, history);
      }

      const newMsg: Message = {
        role: "assistant",
        at: Date.now(),
        content: data?.reply || (mode === "operator" ? "Listo." : "Configuración generada."),
        configApplied: data?.configApplied,
        advancedFeaturesEnabled: data?.advancedFeaturesEnabled,
        actions: Array.isArray(data?.actions) ? data.actions : undefined,
      };
      setMessages((prev) => [...prev, newMsg]);
      void decirEnVozAlta(newMsg.content);

      // Si después de las cuatro vueltas SIGUE pidiendo continuar, ahí sí se
      // le dice al admin -- porque ahora sí depende de él.
      avisarQueHayQuePedirlo(data);

      if (mode === "operator" && data?.actionsCount > 0) {
        toast.success(`${data.actionsCount} acción(es) ejecutada(s)`);
      } else if (data?.configApplied) {
        toast.success("Agente configurado");
      }
    } catch (e: any) {
      // Un 401/403 NO es una caída de conexión: es que este usuario no tiene
      // acceso. Un cliente del SaaS lo vio como "Se cayó la conexión, pero
      // Atlas sigue trabajando. Recuperando…" (12-09-2026) cuando el servidor
      // le había contestado 403. Se dice lo que es y no se intenta recuperar.
      const sinAcceso = /status (401|403)/.test(String(e?.message || ""));
      if (sinAcceso) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            at: Date.now(),
            content: String(e?.message || "").includes("401")
              ? "Tu sesión venció. Volvé a iniciar sesión para seguir con Atlas."
              : "Tu usuario no tiene acceso a Atlas. Si creés que debería, avisale al administrador de la plataforma.",
          },
        ]);
      } else
      // Detenerlo no es un fallo. Abortar el fetch tira `AbortError` y caía
      // acá, así que apretar el botón contestaba "no pude responder,
      // ¿intentamos de nuevo?" -- un mensaje de error para algo que salió
      // exactamente como se pidió, y encima invitando a repetir el pedido.
      if (loDetuveYo()) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            at: Date.now(),
            content: "⏹️ Listo, lo detuve. Lo que ya se había hecho queda como estaba.",
          },
        ]);
      } else if (!(await recuperarDelCorte())) {
        // ── Solo se llega acá si NI SIQUIERA se pudo recuperar ─────────────
        //
        // Antes este era el camino normal de cualquier corte, y por eso el
        // admin veía "se cortó la conexión" cada vez que se salía de la app.
        // Ahora primero se va a buscar el trabajo al servidor, que sigue
        // corriendo; este mensaje quedó para lo que de verdad es un fallo.
        //
        // Nunca se muestra el mensaje técnico crudo (network error, status
        // HTTP, etc.) -- para un admin no programador eso no significa nada,
        // solo lo asusta. Un tono neutral y una acción concreta (reintentar).
        // ── El texto es DISTINTO del que manda el servidor, a propósito ────
        //
        // El backend contesta "No pude terminar de responder. ¿Podés
        // intentarlo de nuevo?" en su 502, y acá se mostraba EXACTAMENTE lo
        // mismo. Dos fallas de naturaleza opuesta --una es "el motor devolvió
        // error", la otra es "la respuesta nunca llegó a esta pantalla"-- se
        // veían idénticas, así que ante una captura del admin no había forma
        // de saber cuál de las dos pasó. Y se necesitan arreglos distintos.
        setMessages((prev) => [...prev, { role: "assistant", content: "Se cortó la conexión antes de que llegara la respuesta. ¿Lo intentamos de nuevo?", at: Date.now() }]);
      }
    } finally {
      setLoading(false);
      setProgreso("");
    }
  };

  // chatCompleto: Atlas es una pantalla de chat, no una tarjeta dentro de una
  // página. En móvil usa todo el alto disponible en vez de quedar encajonada
  // entre el padding de <main> y los 184px que reserva la barra inferior.
  return (
    <Layout chatCompleto>
      {/* Antes: h-[calc(100vh-12rem)] md:h-[calc(100vh-8rem)]. Medía contra
          100vh -- el viewport ENTERO -- y le restaba a mano un chrome que el
          Layout ya había descontado (header, padding de <main>, barra
          inferior en móvil). Esos 12rem/8rem eran una adivinanza fija: en
          cuanto la ventana era baja, la resta se comía casi todo y al área
          de mensajes le quedaban ~100px, cortando las respuestas a media
          frase.

          flex-1 hace que ocupe exactamente el espacio que <main> le da, sea
          el que sea -- el contenedor padre ya es flex-col con min-h-0. Y el
          min-h evita el otro extremo: en pantallas muy bajas el chat no se
          aplasta, mantiene un alto usable y es <main> el que scrollea. */}
      <div className="flex flex-col gap-2 md:gap-4 animate-enter flex-1 min-h-0 md:min-h-[24rem] h-full px-3 pt-3 md:px-0 md:pt-0">
        {/* En móvil el header va en UNA sola fila y sin subtítulo: ocupaba ~140px
            de los ~440px utiles de un celular, dejando el area de mensajes en
            ~300px. El subtitulo explica algo que ya se entiende al usarlo. */}
        <div className="flex flex-row items-center justify-between gap-2 sm:gap-3 flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0 w-full sm:w-auto">
            <div className="w-8 h-8 md:w-10 md:h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-md shadow-indigo-200 shrink-0">
              <Bot className="w-4 h-4 md:w-5 md:h-5 text-white" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h1 className="text-base md:text-2xl font-bold tracking-tight truncate">Atlas VentasPro</h1>
                <HelpTourButton guide={HELP_GUIDE} />
              </div>
              <p className="hidden md:block text-muted-foreground text-xs md:text-sm truncate">Tu asistente para operar la app con lenguaje natural</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {/* "Nueva" ya NO borra la charla actual: abre otra y la anterior
                queda guardada. El boton de historial es el que faltaba para
                poder volver a cualquiera. */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setPanelSesiones((v) => !v); if (!panelSesiones) cargarSesiones(); }}
              className="h-8 sm:h-9 text-xs px-2 sm:px-3"
              title="Conversaciones guardadas"
            >
              <History className="h-3.5 w-3.5 sm:mr-1.5" /> <span className="hidden sm:inline">Historial</span>
            </Button>
            <Button variant="outline" size="sm" onClick={nuevaConversacion} className="h-8 sm:h-9 text-xs px-2 sm:px-3">
              <RotateCcw className="h-3.5 w-3.5 sm:mr-1.5" /> <span className="hidden sm:inline">Nueva</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPanelScraper(true)}
              className="h-8 sm:h-9 text-xs px-2 sm:px-3"
              title="Extraer datos de una web y mandarlos a Atlas"
            >
              <Globe className="h-3.5 w-3.5 sm:mr-1.5" /> <span className="hidden sm:inline">Scraper</span>
            </Button>
            <div data-tour="code-agent-mode-toggle" className="inline-flex rounded-lg border border-border bg-secondary p-0.5">
              <button
                onClick={() => switchMode("operator")}
                className={`inline-flex items-center gap-1 rounded-md px-2 sm:px-3 py-1.5 text-[11px] sm:text-xs font-medium transition-colors whitespace-nowrap ${mode === "operator" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                <Wrench className="h-3 w-3 sm:h-3.5 sm:w-3.5" /> <span className="hidden sm:inline">Operador</span><span className="sm:hidden">Op.</span>
              </button>
              <button
                onClick={() => switchMode("agent")}
                className={`inline-flex items-center gap-1 rounded-md px-2 sm:px-3 py-1.5 text-[11px] sm:text-xs font-medium transition-colors whitespace-nowrap ${mode === "agent" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                <MessageSquare className="h-3 w-3 sm:h-3.5 sm:w-3.5" /> <span className="hidden sm:inline">Agente</span><span className="sm:hidden">Ag.</span>
              </button>
            </div>
          </div>
        </div>

        {/* Panel de conversaciones guardadas.
            Se despliega sobre el chat en vez de ocupar una columna fija: en un
            celular una columna lateral se come la mitad del ancho, y esto se
            usa para saltar a una charla y cerrarse, no para tenerlo abierto. */}
        {panelSesiones && (
          <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
              <p className="text-sm font-semibold">Conversaciones guardadas</p>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setPanelSesiones(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            {sesiones.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                Todavía no hay conversaciones guardadas.
              </p>
            ) : (
              <div className="max-h-64 overflow-y-auto divide-y divide-border">
                {sesiones.map((s) => (
                  <div
                    key={s.sessionId}
                    className={`flex items-center gap-2 px-4 py-2.5 hover:bg-muted/50 transition-colors ${s.sessionId === sessionId ? "bg-muted/60" : ""}`}
                  >
                    <button
                      onClick={() => abrirSesion(s.sessionId)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <p className="truncate text-sm font-medium">{s.titulo}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {s.mensajes} mensaje{s.mensajes === 1 ? "" : "s"}
                        {s.ultimoMensaje ? ` · ${new Date(s.ultimoMensaje).toLocaleString("es-CO", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}` : ""}
                        {s.sessionId === sessionId ? " · abierta" : ""}
                      </p>
                    </button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                      title="Borrar esta conversación"
                      onClick={() => borrarSesion(s.sessionId)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <ScraperPanel
          abierto={panelScraper}
          alCerrar={() => setPanelScraper(false)}
          alEnviarAAtlas={(texto) => setInput((prev) => (prev ? prev + "\n\n" : "") + texto)}
        />
        <div className="flex flex-1 min-h-0">
          <div className="flex-1 flex flex-col border border-border rounded-2xl bg-card overflow-hidden shadow-sm min-h-0">
            {/* El viewport interno de Radix es un `display:table` con
                min-width:100%, y una tabla NO respeta el ancho del padre:
                crece con su contenido. Por eso los mensajes largos --ids de
                Meta, enlaces, bloques de codigo-- empujaban el chat hacia el
                costado en vez de bajar de renglon. Forzarlo a `block` con
                min-w-0 lo devuelve al ancho real disponible. */}
            {/* Lectura tipo ChatGPT, no burbujas de mensajería.
                Pedido del admin: "a veces me cuesta usar el chat de Atlas por
                ser muy sencillo".

                Tres cambios que hacen la diferencia y no son estéticos:

                1. La RESPUESTA ocupa el ancho de una columna de lectura, sin
                   burbuja. Una burbuja al 88% con un informe adentro --que es
                   lo que Atlas devuelve: tablas, listas, planes-- obliga a
                   leer en zigzag. Sin burbuja y con una medida fija de línea
                   se lee de corrido.
                2. Solo el mensaje del ADMIN lleva burbuja, y va a la derecha:
                   es corto y así se distingue de un vistazo quién dijo qué.
                3. Cada turno se separa con una línea tenue en vez de aire
                   suelto: con respuestas largas, el aire solo no alcanza para
                   saber dónde termina una y empieza la otra. */}
            <ScrollArea className="flex-1 [&_[data-radix-scroll-area-viewport]>div]:!block [&_[data-radix-scroll-area-viewport]>div]:!min-w-0">
              <div className="mx-auto w-full max-w-3xl px-4 py-6 md:px-6">
                {messages.map((msg, i) => <FilaDeMensaje key={i} msg={msg} i={i} />)}
                {/* Metas de inicio: una charla nueva arranca con Atlas
                    proponiendo, no con una caja vacía. Un clic manda el
                    mensaje que abre la ruta guiada en el servidor. */}
                {mode === "operator" && messages.length === 1 && !loading && diagnostico?.texto && (
                  <div className="mb-3 whitespace-pre-line pl-11 text-sm text-muted-foreground md:pl-12">
                    {diagnostico.texto}
                  </div>
                )}
                {mode === "operator" && messages.length === 1 && !loading && (
                  <div className="mb-2 flex flex-wrap gap-2 pl-11 md:pl-12">
                    {[
                      ...(diagnostico?.metas ?? []),
                      ...METAS_DE_INICIO.filter((m) => !(diagnostico?.metas ?? []).some((d) => d.mensaje === m.mensaje)),
                    ].map((m) => (
                      <button
                        key={m.mensaje}
                        type="button"
                        onClick={() => handleSubmit(undefined, m.mensaje)}
                        className="rounded-full border border-border bg-background px-4 py-2 text-sm font-medium shadow-sm transition-colors hover:bg-accent"
                      >
                        {m.texto}
                      </button>
                    ))}
                  </div>
                )}
                {loading && (
                  <div className="flex gap-3 md:gap-4 border-t border-border/50 py-5">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shrink-0 mt-0.5">
                      <Bot className="h-4 w-4 text-white" />
                    </div>
                    <div className="min-w-0 flex-1 pt-1">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex gap-2 shrink-0">
                          <div className="w-2.5 h-2.5 rounded-full bg-indigo-500 animate-bounce" />
                          <div className="w-2.5 h-2.5 rounded-full bg-indigo-500 animate-bounce delay-100" />
                          <div className="w-2.5 h-2.5 rounded-full bg-indigo-500 animate-bounce delay-200" />
                        </div>
                        {/* El texto de progreso llega por SSE mientras Atlas
                            trabaja: sin él, un turno de 40s parecía colgado. */}
                        {progreso && (
                          <span className="text-sm text-muted-foreground break-words">{progreso}…</span>
                        )}
                        {/* Cuánto lleva. Un pedido de anuncio tarda ~98s: sin
                            este número, la espera se lee como una pantalla
                            colgada y el admin recarga justo antes del final. */}
                        {segundos > 2 && (
                          <span className="text-xs text-muted-foreground/70 tabular-nums shrink-0">
                            {segundos < 60
                              ? `${segundos}s`
                              : `${Math.floor(segundos / 60)}:${String(segundos % 60).padStart(2, "0")}`}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            </ScrollArea>

            <div className="px-3 pt-3 pb-4 md:p-4 border-t border-border bg-card/50">
              {/* La caja de escribir se alinea con la columna de lectura y
                  se apoya en un contenedor propio, como en ChatGPT: asi el ojo
                  no salta de ancho entre lo que lee y lo que escribe. */}
              {/* ── UNA SOLA CAPSULA, COMO WHATSAPP ─────────────────────
                  Pedido del admin con una captura de WhatsApp al lado: "me
                  gustaria que fuera asi, se ve mas profesional".

                  Antes eran CUATRO botones cuadrados sueltos al lado de la
                  caja (clip, microfono, altavoz, y el de enviar adentro). En un
                  celular eso es media pantalla de botones y ninguna jerarquia:
                  todos pesan lo mismo, y lo que de verdad importa --escribir--
                  queda apretado en lo que sobra.

                  Ahora es un solo recuadro redondeado con los accesorios
                  adentro, en gris y sin borde, y la accion principal a la
                  derecha en color. El campo manda; los iconos acompanan. */}
              <form
                onSubmit={(e) => { e.preventDefault(); handleSubmit(); }}
                className="mx-auto w-full max-w-3xl"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/*,.pdf,.docx,.xlsx,.xls,.csv,.pptx,.txt,.md"
                  className="hidden"
                  onChange={handleFileUpload}
                />
                {/* `items-end` y no `items-center`: cuando el texto crece a
                    varios renglones, los iconos tienen que quedarse abajo,
                    alineados con la ultima linea. Centrados, se van flotando al
                    medio de un bloque alto y se ve torcido. */}
                <div
                  data-tour="code-agent-input"
                  className="flex items-end gap-1 rounded-[26px] border border-border/70 bg-card px-2 py-1.5 shadow-sm transition-colors focus-within:border-primary/50"
                >
                  {mode === "operator" && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={loading || uploading}
                      onClick={() => fileInputRef.current?.click()}
                      title="Adjuntar imagen o documento (PDF, Word, Excel, PowerPoint)"
                      aria-label="Adjuntar archivo"
                      className="h-9 w-9 shrink-0 rounded-full text-muted-foreground hover:text-foreground"
                    >
                      {uploading ? <Loader2 className="h-[18px] w-[18px] animate-spin" /> : <Paperclip className="h-[18px] w-[18px]" />}
                    </Button>
                  )}
                  {/* Que Atlas conteste hablado. Apagado por defecto: una
                      pantalla que se pone a hablar sola la primera vez que la
                      abris, al lado de alguien, es una sorpresa desagradable.
                      Prendido se pinta del color de la marca: asi se ve que
                      esta encendido sin tener que leer nada. */}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setVozActiva((v) => !v)}
                    title={vozActiva ? "Atlas te esta contestando hablado. Toca para silenciarlo." : "Que Atlas te conteste hablado"}
                    aria-label={vozActiva ? "Silenciar a Atlas" : "Que Atlas hable"}
                    aria-pressed={vozActiva}
                    className={`h-9 w-9 shrink-0 rounded-full ${vozActiva ? "text-primary hover:text-primary" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    {vozActiva ? <Volume2 className="h-[18px] w-[18px]" /> : <VolumeX className="h-[18px] w-[18px]" />}
                  </Button>
                  {audioRef.current && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={pausarOReanudarAtlas}
                      title={audioReproduciendo ? "Pausar respuesta de Atlas" : "Continuar respuesta de Atlas"}
                      aria-label={audioReproduciendo ? "Pausar respuesta de Atlas" : "Continuar respuesta de Atlas"}
                      className="h-9 w-9 shrink-0 rounded-full text-primary hover:text-primary"
                    >
                      {audioReproduciendo ? <Pause className="h-[18px] w-[18px]" /> : <Play className="h-[18px] w-[18px]" />}
                    </Button>
                  )}

                  {/* El campo pierde su propio marco: el marco ahora es la
                      capsula. Dos bordes anidados es lo que hacia que se viera
                      "de formulario" en vez de "de chat". */}
                  <Textarea
                    ref={textareaRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        if (!loading && !restoring && input.trim()) handleSubmit();
                      }
                    }}
                    rows={1}
                    placeholder={grabando ? "Te escucho..." : mode === "operator" ? "Escribi o habla..." : "Ej: crea un agente de ventas..."}
                    disabled={loading}
                    className="min-h-[38px] max-h-44 flex-1 resize-none overflow-y-auto border-0 bg-transparent px-2 py-2 text-[15px] leading-relaxed shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
                  />

                  {/* ── LA ACCION PRINCIPAL: UNA SOLA, Y SIEMPRE EN EL MISMO
                      LUGAR ──────────────────────────────────────────────────
                      Igual que WhatsApp: con la caja vacia es el microfono, y
                      apenas escribis algo se vuelve el avion de enviar. Mismo
                      sitio y mismo tamano, asi que el pulgar no busca: cambia
                      lo que hace, no donde esta.

                      Y mientras Atlas trabaja, ese mismo boton es el de PARAR.
                      Antes ahi habia un spinner apagado, o sea el unico control
                      de la pantalla deshabilitado justo cuando hace falta. */}
                  {loading ? (
                    <Button
                      type="button"
                      onClick={detener}
                      size="icon"
                      variant="destructive"
                      title="Detener a Atlas"
                      aria-label="Detener a Atlas"
                      className="h-9 w-9 shrink-0 rounded-full"
                    >
                      <Square className="h-4 w-4 fill-current" />
                    </Button>
                  ) : input.trim() ? (
                    <Button
                      type="submit"
                      disabled={restoring}
                      size="icon"
                      title="Enviar"
                      aria-label="Enviar"
                      className="h-9 w-9 shrink-0 rounded-full"
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                  ) : mode === "operator" ? (
                    <Button
                      type="button"
                      variant={grabando ? "destructive" : "ghost"}
                      size="icon"
                      disabled={uploading || transcribiendo}
                      onClick={grabando ? pararDeGrabar : empezarAGrabar}
                      title={grabando ? "Toca para terminar de hablar" : "Hablarle a Atlas"}
                      aria-label={grabando ? "Terminar de hablar" : "Hablarle a Atlas"}
                      className={`h-9 w-9 shrink-0 rounded-full ${grabando ? "" : "text-muted-foreground hover:text-foreground"}`}
                    >
                      {transcribiendo
                        ? <Loader2 className="h-[18px] w-[18px] animate-spin" />
                        : <Mic className={`h-[18px] w-[18px] ${grabando ? "animate-pulse" : ""}`} />}
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled
                      title="Escribe una instrucción para diseñar el agente"
                      aria-label="Escribe una instrucción para diseñar el agente"
                      className="h-9 w-9 shrink-0 rounded-full text-muted-foreground"
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>

      <AlertDialog open={confirmingReset} onOpenChange={setConfirmingReset}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Empezar una conversación nueva?</AlertDialogTitle>
            <AlertDialogDescription>Se borrará el historial guardado de este chat con Atlas.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={resetConversation}>Sí, empezar de nuevo</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Layout>
  );
}
