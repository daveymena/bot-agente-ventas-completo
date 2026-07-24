import { useState, useRef, useEffect } from "react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Bot, Send, User, Loader2, Sparkles, Check, X, Wrench, MessageSquare } from "lucide-react";
import { toast } from "sonner";

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
    "Soy tu Arquitecto IA con poderes de operador. Puedo crear y editar productos, categorías, el agente, la configuración y la tienda — como si fuera el programador de tu app. Dime qué necesitas y lo hago.",
  agent:
    "Modo diseño de agente. Analizo tu negocio y configuro el ADN de tu agente de ventas (personalidad, objeciones, cierres). ¿Qué necesitas?",
};

const SUGGESTIONS: Record<Mode, string[]> = {
  operator: [
    "Analiza el sistema y dime qué falta",
    "Crea la tienda para mi negocio",
    "Crea una categoría 'Cursos IA'",
    "Sube el precio del producto 5 a 30000",
    "Desactiva los productos sin imagen",
  ],
  agent: [
    "Crea un agente para mi negocio",
    "Mejora el agente actual con objeciones",
    "Configura estrategias de cierre",
    "Agrega reglas de negocio",
  ],
};

export default function CodeAgent() {
  const [mode, setMode] = useState<Mode>("operator");
  const [messages, setMessages] = useState<Message[]>([{ role: "assistant", content: GREETING.operator }]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

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
      toast.error(err.message || "Error al comunicar con el Arquitecto IA");
      setMessages((prev) => [...prev, { role: "assistant", content: `Error: ${err.message}` }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout>
      <div className="flex flex-col gap-6 animate-enter lg:h-[calc(100vh-8rem)]">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Arquitecto IA</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Opera tu aplicación con lenguaje natural: crea y edita datos, o diseña tu agente de ventas.
            </p>
          </div>
          <div className="inline-flex rounded-lg border border-border bg-secondary p-1">
            <button
              onClick={() => switchMode("operator")}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${mode === "operator" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              <Wrench className="h-4 w-4" /> Operador
            </button>
            <button
              onClick={() => switchMode("agent")}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${mode === "agent" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              <MessageSquare className="h-4 w-4" /> Diseñar agente
            </button>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row flex-1 min-h-0 gap-6">
          <div className="flex-1 flex flex-col border border-border rounded-xl bg-card overflow-hidden shadow-xs h-[55vh] lg:h-auto min-h-0">
            <ScrollArea className="flex-1 p-4">
              <div className="space-y-4">
                {messages.map((msg, i) => (
                  <div key={i} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : ""}`}>
                    {msg.role === "assistant" && (
                      <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-1">
                        <Bot className="h-5 w-5 text-primary" />
                      </div>
                    )}
                    <div className={`max-w-[80%] ${msg.role === "user" ? "order-1" : ""}`}>
                      <div
                        className={`rounded-xl px-4 py-3 ${
                          msg.role === "user"
                            ? "bg-primary text-primary-foreground rounded-br-sm"
                            : "bg-muted rounded-bl-sm border border-border"
                        }`}
                      >
                        <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                      </div>

                      {msg.actions && msg.actions.length > 0 && (
                        <div className="mt-2 rounded-lg border border-border bg-card divide-y divide-border overflow-hidden">
                          {msg.actions.map((a, k) => (
                            <div key={k} className="flex items-start gap-2 px-3 py-2 text-xs">
                              <span
                                className={`mt-0.5 shrink-0 h-4 w-4 rounded flex items-center justify-center ${a.ok ? "bg-emerald-500/10 text-emerald-600" : "bg-red-500/10 text-red-600"}`}
                              >
                                {a.ok ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                              </span>
                              <span className="font-mono text-[11px] text-muted-foreground shrink-0">{a.tool}</span>
                              <span className="text-foreground/90">{a.summary}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {msg.configApplied && (
                        <div className="mt-2 flex gap-2 flex-wrap">
                          <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                            <Check className="h-3 w-3 mr-1" /> Configuración aplicada
                          </Badge>
                          {msg.advancedFeaturesEnabled && (
                            <Badge className="bg-primary/10 text-primary border-primary/20">
                              <Sparkles className="h-3 w-3 mr-1" /> Avanzado
                            </Badge>
                          )}
                        </div>
                      )}
                    </div>
                    {msg.role === "user" && (
                      <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center shrink-0 mt-1">
                        <User className="h-5 w-5 text-primary-foreground" />
                      </div>
                    )}
                  </div>
                ))}
                {loading && (
                  <div className="flex gap-3">
                    <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <Bot className="h-5 w-5 text-primary" />
                    </div>
                    <div className="bg-muted rounded-xl rounded-bl-sm border border-border px-4 py-3">
                      <div className="flex gap-1.5">
                        <div className="w-2 h-2 rounded-full bg-primary animate-bounce" />
                        <div className="w-2 h-2 rounded-full bg-primary animate-bounce delay-100" />
                        <div className="w-2 h-2 rounded-full bg-primary animate-bounce delay-200" />
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            </ScrollArea>

            <div className="p-4 border-t border-border bg-card">
              <form onSubmit={(e) => { e.preventDefault(); handleSubmit(); }} className="flex gap-2">
                <Input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={mode === "operator" ? "Ej: crea una categoría 'Cursos IA' y muéstrame los productos…" : "Ej: crea un agente para vender cursos de programación…"}
                  disabled={loading}
                  className="flex-1"
                />
                <Button type="submit" disabled={loading || !input.trim()}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </form>
            </div>
          </div>

          <div className="w-full lg:w-72 shrink-0 space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" /> Sugerencias
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {SUGGESTIONS[mode].map((suggestion, i) => (
                  <button
                    key={i}
                    onClick={() => setInput(suggestion)}
                    className="w-full text-left p-2 rounded-lg hover:bg-muted text-xs text-muted-foreground hover:text-foreground transition-colors border border-transparent hover:border-border"
                    disabled={loading}
                  >
                    {suggestion}
                  </button>
                ))}
              </CardContent>
            </Card>

            {mode === "operator" && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Wrench className="h-4 w-4 text-primary" /> Qué puede hacer
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-xs text-muted-foreground space-y-1.5">
                  <p>· Crear / editar / eliminar productos</p>
                  <p>· Crear categorías</p>
                  <p>· Configurar el agente de ventas</p>
                  <p>· Cambiar settings del negocio</p>
                  <p>· Crear la tienda pública</p>
                  <p>· Diagnóstico del sistema</p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
