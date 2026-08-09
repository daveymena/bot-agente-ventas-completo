import { useState, useRef, useEffect } from "react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Bot, Send, User, Loader2, Sparkles, Check, X, Wrench, MessageSquare, Paperclip, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { HelpTourButton } from "@/components/HelpTourButton";
import { useAutoTour } from "@/hooks/use-auto-tour";
import { getHelpGuide } from "@/data/help-guides";

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
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [restoring, setRestoring] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // El hilo vive en el servidor (architect_memory). Al montar la página lo
  // restauramos para que cambiar de sección no borre la conversación.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/code-agent/history?sessionId=default", { credentials: "include" });
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
  }, []);

  const resetConversation = async () => {
    if (!confirm("¿Empezar una conversación nueva? Se borrará el historial guardado.")) return;
    try {
      await fetch("/api/code-agent/history?sessionId=default", { method: "DELETE", credentials: "include" });
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

  const handleSubmit = async () => {
    if (!input.trim() || loading) return;
    const userMsg = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMsg }]);
    setLoading(true);

    try {
      const history = messages.map((m) => ({ role: m.role, content: m.content }));
      const endpoint = mode === "operator" ? "/api/code-agent/operator" : "/api/code-agent/architect";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: userMsg, history }),
        credentials: "include",
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Error del servidor" }));
        throw new Error(err.error || `Error ${res.status}`);
      }

      const data = await res.json();
      const newMsg: Message = {
        role: "assistant",
        content: data.reply || (mode === "operator" ? "Listo." : "Configuración generada."),
        configApplied: data.configApplied,
        advancedFeaturesEnabled: data.advancedFeaturesEnabled,
        actions: Array.isArray(data.actions) ? data.actions : undefined,
      };
      setMessages((prev) => [...prev, newMsg]);

      if (mode === "operator" && data.actionsCount > 0) {
        toast.success(`${data.actionsCount} acción(es) ejecutada(s)`);
      } else if (data.configApplied) {
        toast.success("Agente configurado");
      }
    } catch (err: any) {
      toast.error(err.message || "Error al comunicar con Atlas");
      setMessages((prev) => [...prev, { role: "assistant", content: `Error: ${err.message}` }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout>
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
      <div className="flex flex-col gap-4 animate-enter flex-1 min-h-[24rem]">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-3 flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0 w-full sm:w-auto">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-md shadow-indigo-200 shrink-0">
              <Bot className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h1 className="text-xl md:text-2xl font-bold tracking-tight truncate">Atlas VentasPro</h1>
                <HelpTourButton guide={HELP_GUIDE} />
              </div>
              <p className="text-muted-foreground text-xs md:text-sm truncate">Tu asistente para operar la app con lenguaje natural</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
            <Button variant="outline" size="sm" onClick={resetConversation} className="h-8 sm:h-9 text-xs px-2 sm:px-3">
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

        <div className="flex flex-1 min-h-0">
          <div className="flex-1 flex flex-col border border-border rounded-2xl bg-card overflow-hidden shadow-sm min-h-0">
            <ScrollArea className="flex-1 p-4 md:p-6">
              <div className="space-y-4">
                {messages.map((msg, i) => (
                  <div key={i} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : ""}`}>
                    {msg.role === "assistant" && (
                      <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shrink-0 mt-1 shadow-sm">
                        <Bot className="h-5 w-5 text-white" />
                      </div>
                    )}
                    <div className={`min-w-0 ${msg.role === "user" ? "max-w-[85%] md:max-w-[70%]" : "max-w-[90%] md:max-w-[80%]"} ${msg.role === "user" ? "order-1" : ""}`}>
                      <div
                        className={`rounded-2xl px-4 py-3 md:px-5 md:py-3.5 ${
                          msg.role === "user"
                            ? "bg-primary text-primary-foreground rounded-br-md"
                            : "bg-muted/50 rounded-bl-md border border-border"
                        }`}
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
                          <div className="text-sm md:text-base prose prose-sm md:prose-base dark:prose-invert prose-p:leading-relaxed max-w-none break-words [overflow-wrap:anywhere] prose-img:rounded-lg prose-img:shadow-sm prose-a:text-indigo-500 hover:prose-a:text-indigo-600 prose-a:break-all">
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
                  <div className="flex gap-3">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shrink-0">
                      <Bot className="h-5 w-5 text-white" />
                    </div>
                    <div className="bg-muted/50 rounded-2xl rounded-bl-md border border-border px-5 py-4">
                      <div className="flex gap-2">
                        <div className="w-2.5 h-2.5 rounded-full bg-indigo-500 animate-bounce" />
                        <div className="w-2.5 h-2.5 rounded-full bg-indigo-500 animate-bounce delay-100" />
                        <div className="w-2.5 h-2.5 rounded-full bg-indigo-500 animate-bounce delay-200" />
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            </ScrollArea>

            <div className="p-3 md:p-4 border-t border-border bg-card/50">
              <form onSubmit={(e) => { e.preventDefault(); handleSubmit(); }} className="flex gap-2">
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
                  <Input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder={mode === "operator" ? "Ej: analiza el sistema, crea un producto, configura la tienda..." : "Ej: crea un agente para vender cursos de programación..."}
                    disabled={loading}
                    className="flex-1 h-11 rounded-xl pr-12 text-sm"
                  />
                  <Button
                    type="submit"
                    disabled={loading || restoring || !input.trim()}
                    size="icon"
                    className="absolute right-1 top-1 h-9 w-9 rounded-lg"
                  >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
