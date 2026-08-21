import { useState, useRef, useEffect } from "react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Bot, Send, User, Loader2, Sparkles, Check, X, Wrench, MessageSquare, Paperclip, RotateCcw, History, Trash2 } from "lucide-react";
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

type Mode = "operator" | "agent";

interface ActionEntry {
  tool: string;
  ok: boolean;
  summary: string;
}

interface Message {
  role: "user" | "assistant";
  content: string;
  configApplied?: boolean;
  advancedFeaturesEnabled?: boolean;
  actions?: ActionEntry[];
}

const GREETING: Record<Mode, string> = {
  operator:
    "Soy Atlas, tu asistente VentasPro. Puedo crear y editar productos, categorías, el agente, la configuración y la tienda. Dime qué necesitas y lo hago.",
  agent:
    "Modo diseño de agente. Analizo tu negocio y configuro el ADN de tu agente de ventas.",
};

export default function CodeAgent() {
  useAutoTour(HELP_GUIDE);
  const [mode, setMode] = useState<Mode>("operator");
  const [messages, setMessages] = useState<Message[]>([{ role: "assistant", content: GREETING.operator }]);
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
  const [uploading, setUploading] = useState(false);
  const [restoring, setRestoring] = useState(true);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // El hilo vive en el servidor (architect_memory). Al montar la página lo
  // restauramos para que cambiar de sección no borre la conversación.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/code-agent/history?sessionId=${encodeURIComponent(sessionId)}`, { credentials: "include" });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled || !Array.isArray(data.history) || data.history.length === 0) return;
        setMessages([
          { role: "assistant", content: GREETING.operator },
          ...data.history.map((t: any) => ({ role: t.role, content: t.content })),
        ]);
        if (data.awaitingConfirmation) {
          toast.info("Tienes un plan pendiente de confirmar");
        }
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
    setMessages([{ role: "assistant", content: GREETING[mode] }]);
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

  const resetConversation = async () => {
    try {
      await fetch(`/api/code-agent/history?sessionId=${encodeURIComponent(sessionId)}`, { method: "DELETE", credentials: "include" });
      setMessages([{ role: "assistant", content: GREETING[mode] }]);
      toast.success("Conversación reiniciada");
    } catch {
      toast.error("No se pudo reiniciar");
    }
  };

  // Subir una imagen/archivo desde el chat (botón 📎) y dejar su URL lista para
  // que el Architect la use (ej: "asigna esta imagen al producto ...").
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) { toast.error("La imagen supera 8MB"); return; }
    setUploading(true);
    try {
      const dataUrl: string = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result as string);
        r.onerror = reject;
        r.readAsDataURL(file);
      });
      const res = await fetch("/api/code-agent/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: dataUrl, filename: file.name }),
        credentials: "include",
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Error al subir");
      const data = await res.json();
      setInput((prev) => (prev ? prev + "\n\n" : "") + `Usa esta imagen:\n![Imagen subida](${data.url})`);
      toast.success("Imagen subida ✓ — dime a qué producto asignarla");
    } catch (err: any) {
      toast.error(err.message || "No se pudo subir la imagen");
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
    setMessages([{ role: "assistant", content: GREETING[m] }]);
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
  // El backend igual recorta a los últimos 30 turnos (defensa real contra
  // colgadas en hilos largos, ver code-agent.ts) -- este límite acá evita
  // mandar un payload gigante de entrada en primer lugar en conversaciones
  // de varios días como la que causó el cuelgue original (2026-08-10).
  const HISTORY_LIMIT = 30;

  const callAtlas = async (promptText: string, historyForCall: { role: string; content: string }[]) => {
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
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // Solo el operador emite progreso; el modo Agente responde de una.
      body: JSON.stringify({ prompt: promptText, history: historyForCall, sessionId, ...(esOperador ? { stream: true } : {}) }),
      credentials: "include",
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

  const handleSubmit = async () => {
    if (!input.trim() || loading) return;
    const userMsg = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMsg }]);
    setLoading(true);
    setProgreso("");

    try {
      let history = messages.slice(-HISTORY_LIMIT).map((m) => ({ role: m.role, content: m.content }));
      let data = await callAtlas(userMsg, history);

      for (let round = 0; round < MAX_AUTO_CONTINUATIONS && data?.needsContinuation; round++) {
        const partial: Message = {
          role: "assistant",
          content: data.reply || "Sigo trabajando en esto...",
          configApplied: data.configApplied,
          advancedFeaturesEnabled: data.advancedFeaturesEnabled,
          actions: Array.isArray(data.actions) ? data.actions : undefined,
        };
        setMessages((prev) => [...prev, partial]);
        history = [...history, { role: "user", content: userMsg }, { role: "assistant", content: partial.content }].slice(-HISTORY_LIMIT);
        data = await callAtlas("Continuá con lo que ya tenías, sin repetir lo que ya investigaste o hiciste.", history);
      }

      const newMsg: Message = {
        role: "assistant",
        content: data?.reply || (mode === "operator" ? "Listo." : "Configuración generada."),
        configApplied: data?.configApplied,
        advancedFeaturesEnabled: data?.advancedFeaturesEnabled,
        actions: Array.isArray(data?.actions) ? data.actions : undefined,
      };
      setMessages((prev) => [...prev, newMsg]);

      if (mode === "operator" && data?.actionsCount > 0) {
        toast.success(`${data.actionsCount} acción(es) ejecutada(s)`);
      } else if (data?.configApplied) {
        toast.success("Agente configurado");
      }
    } catch {
      // Nunca se muestra el mensaje técnico crudo (network error, status
      // HTTP, etc.) -- para un admin no programador eso no significa nada,
      // solo lo asusta. Un tono neutral y una acción concreta (reintentar).
      setMessages((prev) => [...prev, { role: "assistant", content: "No pude terminar de responder. ¿Podés intentarlo de nuevo?" }]);
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
                {messages.map((msg, i) => (
                  <div
                    key={i}
                    className={`py-5 ${i > 0 ? "border-t border-border/50" : ""} ${msg.role === "user" ? "flex justify-end" : "flex gap-3 md:gap-4"}`}
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
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {msg.content}
                            </ReactMarkdown>
                          </div>
                        )}
                      </div>

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
                ))}
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
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            </ScrollArea>

            <div className="p-3 md:p-4 border-t border-border bg-card/50">
              {/* La caja de escribir se alinea con la columna de lectura y
                  se apoya en un contenedor propio, como en ChatGPT: asi el ojo
                  no salta de ancho entre lo que lee y lo que escribe. */}
              <form onSubmit={(e) => { e.preventDefault(); handleSubmit(); }} className="mx-auto flex w-full max-w-3xl gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleFileUpload}
                />
                {mode === "operator" && (
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    disabled={loading || uploading}
                    onClick={() => fileInputRef.current?.click()}
                    title="Adjuntar imagen"
                    className="h-11 w-11 rounded-xl shrink-0"
                  >
                    {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
                  </Button>
                )}
                <div className="flex-1 relative" data-tour="code-agent-input">
                  {/* Campo que CRECE con lo que se escribe.
                      Antes era un <Input> de una sola linea: al escribir un
                      pedido largo --que es lo normal con Atlas, no la
                      excepcion-- el texto se corria hacia el costado y no se
                      veia lo tipeado, asi que no habia forma de releerlo antes
                      de mandarlo. Crece hasta ~6 renglones y despues scrollea
                      solo, para no comerse el area de mensajes.
                      Enter manda; Shift+Enter hace salto de linea. */}
                  <Textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        if (!loading && !restoring && input.trim()) handleSubmit();
                      }
                    }}
                    rows={1}
                    placeholder={mode === "operator" ? "Ej: analiza el sistema, crea un producto, configura la tienda..." : "Ej: crea un agente para vender cursos de programación..."}
                    disabled={loading}
                    className="flex-1 min-h-[52px] max-h-44 resize-none overflow-y-auto rounded-2xl border-border/70 bg-card pr-12 py-3.5 px-4 text-[15px] leading-relaxed shadow-sm focus-visible:ring-1"
                  />
                  <Button
                    type="submit"
                    disabled={loading || restoring || !input.trim()}
                    size="icon"
                    className="absolute right-2 bottom-2 h-9 w-9 rounded-xl"
                  >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
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
