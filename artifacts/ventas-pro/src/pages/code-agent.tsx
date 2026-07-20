import { useState, useRef, useEffect } from "react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Wand2, Send, Bot, User, Sparkles, Loader, AlertCircle } from "lucide-react";
import { toast } from "sonner";

interface Message {
  role: "user" | "assistant";
  content: string;
}

export default function CodeAgentPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: "¡Hola! Soy tu Arquitecta IA especializada en diseñar agentes de ventas. Cuéntame qué tipo de agente necesitas o cómo puedo ayudarte a mejorar tu agente actual.",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const userMsg = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMsg }]);
    setLoading(true);

    try {
      const history = messages.slice(1).map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const res = await fetch("/api/code-agent/architect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ prompt: userMsg, history }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Error del servidor");
      }

      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.reply || JSON.stringify(data, null, 2) },
      ]);
    } catch (err: any) {
      toast.error(err.message || "Error al conectar con el arquitecto IA");
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Lo siento, ocurrió un error. Por favor intenta de nuevo.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout>
      <div className="flex flex-col gap-6 h-[calc(100vh-8rem)]">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 border border-purple-500/20">
            <Wand2 className="h-6 w-6 text-purple-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Arquitecto IA</h1>
            <p className="text-sm text-muted-foreground">Diseña y optimiza tus agentes de venta con IA</p>
          </div>
        </div>

        <Card className="flex-1 flex flex-col overflow-hidden rounded-3xl border-0 shadow-lg glass-panel">
          <ScrollArea ref={scrollRef} className="flex-1 p-4 md:p-6">
            <div className="space-y-4 max-w-3xl mx-auto">
              {messages.map((msg, i) => (
                <div key={i} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  {msg.role === "assistant" && (
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shrink-0 mt-1">
                      <Bot className="h-4 w-4 text-white" />
                    </div>
                  )}
                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                      msg.role === "user"
                        ? "bg-primary/10 text-foreground rounded-tr-sm"
                        : "bg-muted/50 text-foreground rounded-tl-sm"
                    }`}
                  >
                    <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                  </div>
                  {msg.role === "user" && (
                    <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0 mt-1">
                      <User className="h-4 w-4 text-primary" />
                    </div>
                  )}
                </div>
              ))}
              {loading && (
                <div className="flex gap-3 justify-start">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shrink-0 mt-1">
                    <Bot className="h-4 w-4 text-white" />
                  </div>
                  <div className="max-w-[80%] rounded-2xl rounded-tl-sm px-4 py-3 bg-muted/50">
                    <Loader className="h-4 w-4 animate-spin text-muted-foreground" />
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>

          <div className="border-t border-white/10 p-4">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSend();
              }}
              className="flex gap-2 max-w-3xl mx-auto"
            >
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Describe el agente que necesitas..."
                className="flex-1 rounded-xl bg-background/50 border-white/10"
                disabled={loading}
              />
              <Button type="submit" disabled={loading || !input.trim()} className="rounded-xl">
                {loading ? <Loader className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </form>
          </div>
        </Card>
      </div>
    </Layout>
  );
}
