import { useState, useRef, useEffect } from "react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Bot, Send, User, Loader2, Sparkles, Check, Cpu } from "lucide-react";
import { toast } from "sonner";

interface Message {
  role: "user" | "assistant";
  content: string;
  configApplied?: boolean;
  advancedFeaturesEnabled?: boolean;
}

export default function CodeAgent() {
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: "Soy tu Arquitecta IA. Puedo analizar tu negocio y configurar agentes de ventas inteligentes. ¿Qué necesitas?" }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSubmit = async () => {
    if (!input.trim() || loading) return;
    const userMsg = input.trim();
    setInput("");
    setMessages(prev => [...prev, { role: "user", content: userMsg }]);
    setLoading(true);

    try {
      const history = messages.map(m => ({ role: m.role, content: m.content }));
      const res = await fetch("/api/code-agent/architect", {
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
        content: data.reply || "Configuración generada.",
        configApplied: data.configApplied,
        advancedFeaturesEnabled: data.advancedFeaturesEnabled,
      };
      setMessages(prev => [...prev, newMsg]);

      if (data.configApplied) {
        toast.success(data.advancedFeaturesEnabled
          ? "Agente configurado con características avanzadas"
          : "Agente configurado exitosamente"
        );
      }
    } catch (err: any) {
      toast.error(err.message || "Error al comunicar con el arquitecto IA");
      setMessages(prev => [...prev, { role: "assistant", content: `Error: ${err.message}` }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout>
      <div className="flex flex-col gap-6 animate-enter h-[calc(100vh-10rem)]">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-br from-foreground to-foreground/70 bg-clip-text text-transparent">
              Arquitecto IA
            </h1>
            <p className="text-muted-foreground mt-1">Configura agentes de ventas inteligentes con lenguaje natural.</p>
          </div>
          <Badge variant="outline" className="text-xs gap-1">
            <Cpu className="h-3 w-3" /> Kimi K2.6
          </Badge>
        </div>

        <div className="flex flex-1 min-h-0 gap-6">
          <div className="flex-1 flex flex-col border rounded-2xl bg-background/60 backdrop-blur-sm overflow-hidden">
            <ScrollArea className="flex-1 p-4">
              <div className="space-y-4">
                {messages.map((msg, i) => (
                  <div key={i} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : ""}`}>
                    {msg.role === "assistant" && (
                      <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-1">
                        <Bot className="h-5 w-5 text-primary" />
                      </div>
                    )}
                    <div className={`max-w-[80%] ${msg.role === "user" ? "order-1" : ""}`}>
                      <div className={`rounded-2xl px-4 py-3 ${
                        msg.role === "user"
                          ? "bg-primary text-primary-foreground rounded-br-md"
                          : "bg-muted/50 rounded-bl-md border"
                      }`}>
                        <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                      </div>
                      {msg.configApplied && (
                        <div className="mt-2 flex gap-2">
                          <Badge className="bg-green-500/10 text-green-600 border-green-500/20">
                            <Check className="h-3 w-3 mr-1" /> Configuración aplicada
                          </Badge>
                          {msg.advancedFeaturesEnabled && (
                            <Badge className="bg-purple-500/10 text-purple-600 border-purple-500/20">
                              <Sparkles className="h-3 w-3 mr-1" /> Características avanzadas
                            </Badge>
                          )}
                        </div>
                      )}
                    </div>
                    {msg.role === "user" && (
                      <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center shrink-0 mt-1">
                        <User className="h-5 w-5 text-primary-foreground" />
                      </div>
                    )}
                  </div>
                ))}
                {loading && (
                  <div className="flex gap-3">
                    <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <Bot className="h-5 w-5 text-primary" />
                    </div>
                    <div className="bg-muted/50 rounded-2xl rounded-bl-md border px-4 py-3">
                      <div className="flex gap-2">
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

            <div className="p-4 border-t bg-background/80">
              <form onSubmit={e => { e.preventDefault(); handleSubmit(); }} className="flex gap-2">
                <Input
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  placeholder="Ej: Crea un agente para vender cursos de programación..."
                  disabled={loading}
                  className="flex-1"
                />
                <Button type="submit" disabled={loading || !input.trim()}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </form>
            </div>
          </div>

          <div className="w-72 shrink-0 space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" /> Sugerencias
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {[
                  "Crea un agente para mi negocio",
                  "Mejora el agente actual con objeciones",
                  "Configura estrategias de cierre",
                  "Agrega reglas de negocio",
                  "Analiza mis productos y sugiere mejoras",
                ].map((suggestion, i) => (
                  <button
                    key={i}
                    onClick={() => { setInput(suggestion); }}
                    className="w-full text-left p-2 rounded-lg hover:bg-muted/50 text-xs text-muted-foreground hover:text-foreground transition-colors border border-transparent hover:border-border"
                    disabled={loading}
                  >
                    {suggestion}
                  </button>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </Layout>
  );
}
