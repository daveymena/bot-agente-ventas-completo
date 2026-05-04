import { useState, useRef, useEffect } from "react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { 
  Wand2, 
  Send, 
  Sparkles, 
  CheckCircle2, 
  Cpu, 
  MessageSquarePlus,
  RefreshCcw,
  User,
  Zap
} from "lucide-react";
import { toast } from "sonner";

interface Message {
  role: "user" | "assistant";
  content: string;
  isConfigApplied?: boolean;
}

export default function AgentArchitect() {
  const [messages, setMessages] = useState<Message[]>([
    { 
      role: "assistant", 
      content: "👋 ¡Hola! Soy tu Arquitecto de Agentes. Mi trabajo es dar vida a tus ideas.\n\n¿Qué tipo de vendedor necesitas hoy? Cuéntame su personalidad y objetivos, y yo configuraré su cerebro y reglas de venta por ti." 
    }
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      const scrollContainer = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    }
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput("");
    setMessages(prev => [...prev, { role: "user", content: userMessage }]);
    setIsLoading(true);

    try {
      const response = await fetch("/api/code-agent/architect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          prompt: userMessage,
          history: messages.map(m => ({ role: m.role, content: m.content }))
        })
      });

      const data = await response.json();
      
      if (response.ok) {
        setMessages(prev => [...prev, { 
          role: "assistant", 
          content: data.reply,
          isConfigApplied: data.configApplied 
        }]);
        if (data.configApplied) {
          toast.success("¡Agente actualizado con éxito! 🚀");
        }
      } else {
        toast.error(data.error || "Error al diseñar el agente");
      }
    } catch (error) {
      toast.error("Error de conexión con el Arquitecto");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Layout>
      <div className="max-w-6xl mx-auto flex flex-col gap-6 h-[calc(100vh-140px)] animate-enter">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-xl shadow-primary/20 rotate-3">
              <Wand2 className="h-8 w-8 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-black tracking-tight text-foreground flex items-center gap-2">
                Arquitecto de Agentes
              </h1>
              <p className="text-muted-foreground text-sm font-medium">Entrena y diseña tu fuerza de ventas con IA</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="outline" className="px-3 py-1 border-primary/20 bg-primary/5 text-primary font-bold gap-2">
              <div className="w-2 h-2 rounded-full bg-primary animate-pulse" /> Kimi 2.6 Ultra
            </Badge>
          </div>
        </div>

        <div className="grid lg:grid-cols-4 gap-6 flex-1 overflow-hidden">
          {/* Main Chat Interface */}
          <Card className="lg:col-span-3 flex flex-col glass-panel border-none shadow-2xl overflow-hidden relative">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary via-accent to-primary opacity-50" />
            
            <ScrollArea className="flex-1 p-6" ref={scrollRef}>
              <div className="space-y-8 pb-4">
                {messages.map((m, i) => (
                  <div key={i} className={`flex gap-4 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-lg ${
                      m.role === 'assistant' 
                        ? 'bg-gradient-to-br from-primary to-primary/80 text-white' 
                        : 'bg-muted border border-border'
                    }`}>
                      {m.role === 'assistant' ? <Sparkles className="h-6 w-6" /> : <User className="h-6 w-6" />}
                    </div>
                    <div className={`flex flex-col gap-3 max-w-[85%] ${m.role === 'user' ? 'items-end' : ''}`}>
                      <div className={`p-5 rounded-3xl text-sm leading-relaxed whitespace-pre-wrap shadow-sm ${
                        m.role === 'assistant' 
                          ? 'bg-card border border-border/50 text-foreground' 
                          : 'bg-primary text-white font-medium shadow-xl shadow-primary/10'
                      }`}>
                        {m.content}
                      </div>
                      {m.isConfigApplied && (
                        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-emerald-500 bg-emerald-500/10 px-4 py-1.5 rounded-full self-start border border-emerald-500/20">
                          <CheckCircle2 className="h-3.5 w-3.5" /> Cambios Aplicados en Vivo
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {isLoading && (
                  <div className="flex gap-4 animate-pulse">
                    <div className="w-12 h-12 rounded-2xl bg-muted/50 border flex items-center justify-center">
                      <RefreshCcw className="h-6 w-6 text-muted-foreground animate-spin" />
                    </div>
                    <div className="bg-muted/30 h-16 w-64 rounded-3xl" />
                  </div>
                )}
              </div>
            </ScrollArea>

            <div className="p-6 bg-muted/5 border-t border-border/30">
              <div className="relative group">
                <Input 
                  placeholder="Dime qué personalidad y reglas quieres para tu bot..."
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                  className="pr-16 h-16 rounded-2xl bg-background border-border/50 focus:border-primary focus:ring-4 focus:ring-primary/5 transition-all text-base shadow-lg"
                  disabled={isLoading}
                />
                <Button 
                  size="icon" 
                  onClick={handleSend}
                  disabled={isLoading || !input.trim()}
                  className="absolute right-2.5 top-2.5 h-11 w-11 rounded-xl shadow-xl shadow-primary/20 hover:scale-105 transition-transform"
                >
                  <Send className="h-5 w-5" />
                </Button>
              </div>
              <p className="text-[10px] text-center text-muted-foreground mt-4 font-medium uppercase tracking-tighter">
                Diseñado por el motor de arquitectura estratégica de Sofía SaaS
              </p>
            </div>
          </Card>

          {/* Sidebar / Quick Actions */}
          <div className="hidden lg:flex flex-col gap-4">
            <Card className="glass-panel border-none shadow-lg overflow-hidden">
              <div className="p-4 bg-primary/5 border-b border-primary/10">
                <h3 className="text-xs font-black uppercase tracking-widest text-primary flex items-center gap-2">
                  <Zap className="h-3.5 w-3.5" /> Plantillas Rápidas
                </h3>
              </div>
              <CardContent className="p-3 space-y-2">
                <button 
                  onClick={() => setInput("Crea un vendedor de elite, directo y persuasivo para packs digitales.")}
                  className="w-full text-left p-3 rounded-xl text-xs font-medium hover:bg-primary/10 hover:text-primary transition-all flex items-start gap-2 group bg-muted/30"
                >
                  <MessageSquarePlus className="h-3.5 w-3.5 shrink-0 text-muted-foreground group-hover:text-primary" />
                  Vendedor de Élite
                </button>
                <button 
                  onClick={() => setInput("Diseña un agente muy amigable, con emojis, que actúe como un amigo experto.")}
                  className="w-full text-left p-3 rounded-xl text-xs font-medium hover:bg-primary/10 hover:text-primary transition-all flex items-start gap-2 group bg-muted/30"
                >
                  <MessageSquarePlus className="h-3.5 w-3.5 shrink-0 text-muted-foreground group-hover:text-primary" />
                  Asistente Amistoso
                </button>
                <button 
                  onClick={() => setInput("Crea un bot formal y serio especializado en consultoría premium.")}
                  className="w-full text-left p-3 rounded-xl text-xs font-medium hover:bg-primary/10 hover:text-primary transition-all flex items-start gap-2 group bg-muted/30"
                >
                  <MessageSquarePlus className="h-3.5 w-3.5 shrink-0 text-muted-foreground group-hover:text-primary" />
                  Consultor Formal
                </button>
              </CardContent>
            </Card>

            <div className="flex-1 bg-muted/20 rounded-3xl border border-dashed border-border p-6 flex flex-col items-center justify-center text-center gap-4">
              <div className="w-16 h-16 rounded-full bg-background flex items-center justify-center shadow-inner">
                <Cpu className="h-8 w-8 text-muted-foreground/30" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-bold">Sin Código</p>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  No necesitas programar. Solo cuéntale tus metas al Arquitecto.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
