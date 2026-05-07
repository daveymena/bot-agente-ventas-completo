import { useState, useRef, useEffect, useCallback } from "react";
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
  Zap,
  Brain,
  Layers,
  Store,
  ShoppingBag,
  Stethoscope,
  GraduationCap,
  Building2,
  Utensils,
  Dumbbell,
  Gem,
  ChevronRight,
  Bot
} from "lucide-react";
import { toast } from "sonner";

interface Message {
  role: "user" | "assistant";
  content: string;
  isConfigApplied?: boolean;
}

interface CurrentAgent {
  id: number;
  name: string;
  role: string;
  tone: string;
  stagesCount: number;
}

const TEMPLATES = [
  { icon: ShoppingBag, label: "Tienda Online / Dropshipping", prompt: "Crea un agente experto para mi tienda de dropshipping. Debe identificar el producto de interés, resolver dudas sobre envíos y garantías, y cerrar la venta con urgencia (stock limitado). Tono amigable pero persuasivo." },
  { icon: Gem, label: "Cursos y Servicios Digitales", prompt: "Diseña un agente para vender cursos digitales y membresías premium. Debe destacar la transformación que ofrece el curso, manejar objeciones de precio con testimonios, y generar urgencia de cupos limitados." },
  { icon: Building2, label: "Inmobiliaria / Arriendos", prompt: "Crea un agente para una inmobiliaria. Debe calificar si el cliente quiere arrendar o comprar, detectar el presupuesto y zona deseada, y agendar visitas de manera natural." },
  { icon: Stethoscope, label: "Clínica / Salud / Estética", prompt: "Diseña un agente para clínica de estética. Debe ser cálido y profesional, entender la preocupación del cliente, informar sobre procedimientos sin ser invasivo, y agendar citas." },
  { icon: GraduationCap, label: "Academia / Clases Particulares", prompt: "Crea un agente para academia de idiomas o clases particulares. Debe detectar el nivel del estudiante, resolver dudas sobre metodología, y inscribir al cliente en el proceso de prueba gratuita." },
  { icon: Utensils, label: "Restaurante / Delivery", prompt: "Diseña un agente para restaurante con domicilios. Debe tomar pedidos de forma eficiente, sugerir complementos (bebidas, postres), confirmar dirección y tiempo de entrega." },
  { icon: Dumbbell, label: "Gimnasio / Bienestar", prompt: "Crea un agente para gimnasio o centro de bienestar. Debe entender el objetivo del cliente (bajar peso, ganar músculo, etc.), presentar los planes y beneficios, y convertir en membresía." },
  { icon: Store, label: "Retail / Productos Físicos", prompt: "Diseña un agente vendedor de productos físicos (electrónica, moda, hogar). Debe destacar características clave, comparar opciones, resolver dudas técnicas y facilitar el proceso de pago." },
];

const IMPROVE_PROMPTS = [
  "Analiza mi negocio actual con los productos que tengo registrados y mejora el agente para que sea más efectivo vendiendo exactamente esos productos.",
  "Hazme el agente más persuasivo. Quiero que use más técnicas de urgencia, prueba social y manejo de objeciones.",
  "Quiero que mi agente sea más cálido y construya más confianza antes de intentar vender. Mejora el tono y las etapas.",
  "Agrega al agente instrucciones específicas para manejar clientes que dicen 'está muy caro' o 'lo veo después'.",
];

export default function AgentArchitect() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: "👋 ¡Hola! Soy el *Arquitecto de Agentes IA* de VentasPro.\n\nMi misión es diseñar el agente de ventas perfecto para tu negocio — sin código, sin complicaciones.\n\nPuedo:\n• 🆕 Crear un agente desde cero según tu tipo de negocio\n• 🔄 Mejorar tu agente actual basándome en tus productos\n• 🎯 Optimizar etapas, tono y estrategia de cierre\n\n¿Con qué empezamos? Usa las plantillas del panel derecho o cuéntame directamente sobre tu negocio."
    }
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [currentAgent, setCurrentAgent] = useState<CurrentAgent | null>(null);
  const [productCount, setProductCount] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  const fetchCurrentAgent = useCallback(async () => {
    const res = await fetch("/api/code-agent/current");
    if (res.ok) {
      const data = await res.json();
      setCurrentAgent(data.agent);
      setProductCount(data.productCount || 0);
    }
  }, []);

  useEffect(() => { fetchCurrentAgent(); }, [fetchCurrentAgent]);

  useEffect(() => {
    if (scrollRef.current) {
      const el = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (el) el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  const handleSend = async (overrideInput?: string) => {
    const userMessage = (overrideInput ?? input).trim();
    if (!userMessage || isLoading) return;
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
          fetchCurrentAgent();
        }
      } else {
        toast.error(data.error || "Error al diseñar el agente");
        setMessages(prev => [...prev, { role: "assistant", content: `❌ Error: ${data.error || "No se pudo generar el agente. Verifica la configuración del token de GitHub en Ajustes."}` }]);
      }
    } catch {
      toast.error("Error de conexión con el Arquitecto");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Layout>
      <div className="max-w-6xl mx-auto flex flex-col gap-6 h-[calc(100vh-140px)]">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-primary to-orange-400 flex items-center justify-center shadow-xl shadow-primary/20 rotate-3">
              <Wand2 className="h-8 w-8 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-black tracking-tight">Arquitecto de Agentes</h1>
              <p className="text-muted-foreground text-sm font-medium">Diseña y perfecciona tu fuerza de ventas con IA</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="px-3 py-1 border-green-500/30 bg-green-500/10 text-green-400 font-bold gap-2">
              <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" /> GPT-4o-mini
            </Badge>
          </div>
        </div>

        <div className="grid lg:grid-cols-4 gap-6 flex-1 overflow-hidden">
          {/* Chat */}
          <Card className="lg:col-span-3 flex flex-col bg-card/50 border-white/10 overflow-hidden relative">
            <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-primary via-orange-400 to-primary" />

            <ScrollArea className="flex-1 p-6" ref={scrollRef}>
              <div className="space-y-6 pb-4">
                {messages.map((m, i) => (
                  <div key={i} className={`flex gap-4 ${m.role === "user" ? "flex-row-reverse" : ""}`}>
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-lg ${
                      m.role === "assistant"
                        ? "bg-gradient-to-br from-primary to-orange-400 text-white"
                        : "bg-muted border border-white/10"
                    }`}>
                      {m.role === "assistant" ? <Sparkles className="h-5 w-5" /> : <User className="h-5 w-5" />}
                    </div>
                    <div className={`flex flex-col gap-2 max-w-[85%] ${m.role === "user" ? "items-end" : ""}`}>
                      <div className={`p-4 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                        m.role === "assistant"
                          ? "bg-card border border-white/10 text-foreground"
                          : "bg-primary text-white font-medium shadow-xl shadow-primary/10"
                      }`}>
                        {m.content}
                      </div>
                      {m.isConfigApplied && (
                        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-emerald-400 bg-emerald-500/10 px-3 py-1.5 rounded-full self-start border border-emerald-500/20">
                          <CheckCircle2 className="h-3.5 w-3.5" /> Agente actualizado en vivo
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {isLoading && (
                  <div className="flex gap-4 animate-pulse">
                    <div className="w-10 h-10 rounded-xl bg-muted/50 border border-white/10 flex items-center justify-center">
                      <RefreshCcw className="h-5 w-5 text-muted-foreground animate-spin" />
                    </div>
                    <div className="flex flex-col gap-2 flex-1">
                      <div className="bg-muted/30 h-4 w-3/4 rounded-lg" />
                      <div className="bg-muted/20 h-4 w-1/2 rounded-lg" />
                      <div className="bg-muted/10 h-4 w-2/3 rounded-lg" />
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>

            <div className="p-4 bg-muted/5 border-t border-white/10">
              <div className="relative">
                <Input
                  placeholder="Ej: Quiero un agente de ventas para mi tienda de ropa..."
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
                  className="pr-14 h-14 rounded-2xl bg-background/50 border-white/10 focus:border-primary text-sm shadow-lg"
                  disabled={isLoading}
                />
                <Button
                  size="icon"
                  onClick={() => handleSend()}
                  disabled={isLoading || !input.trim()}
                  className="absolute right-2.5 top-2.5 h-9 w-9 rounded-xl"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-[10px] text-center text-muted-foreground mt-3 uppercase tracking-wider">
                Los cambios se aplican automáticamente al agente activo
              </p>
            </div>
          </Card>

          {/* Sidebar */}
          <div className="hidden lg:flex flex-col gap-4 overflow-y-auto">
            {/* Current Agent Card */}
            <Card className="bg-card/50 border-white/10 overflow-hidden">
              <div className="p-4 bg-primary/5 border-b border-primary/10 flex items-center gap-2">
                <Bot className="h-3.5 w-3.5 text-primary" />
                <h3 className="text-xs font-black uppercase tracking-widest text-primary">Agente Actual</h3>
              </div>
              <CardContent className="p-4">
                {currentAgent ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
                        <Sparkles className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <p className="font-bold text-sm">{currentAgent.name}</p>
                        <p className="text-[11px] text-muted-foreground">{currentAgent.role}</p>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-muted-foreground">Tono</span>
                        <span className="text-foreground font-medium truncate max-w-28">{currentAgent.tone}</span>
                      </div>
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-muted-foreground">Etapas</span>
                        <Badge className="text-[10px] bg-green-500/10 text-green-400 border-green-500/20">{currentAgent.stagesCount} configuradas</Badge>
                      </div>
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-muted-foreground">Productos</span>
                        <span className="text-foreground font-medium">{productCount} activos</span>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full text-[11px] border-white/10 gap-1 h-8"
                      onClick={() => handleSend("Analiza mi configuración actual y el catálogo de productos que tengo, y dime qué mejoras puedes hacer al agente para aumentar las ventas.")}
                    >
                      <Brain className="h-3 w-3" />Analizar y mejorar
                    </Button>
                  </div>
                ) : (
                  <div className="text-center py-4 space-y-2">
                    <Cpu className="h-8 w-8 text-muted-foreground/20 mx-auto" />
                    <p className="text-xs text-muted-foreground">Sin agente configurado</p>
                    <p className="text-[11px] text-muted-foreground/60">Usa las plantillas para crear uno</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Quick improve prompts */}
            {currentAgent && (
              <Card className="bg-card/50 border-white/10 overflow-hidden">
                <div className="p-4 bg-orange-500/5 border-b border-orange-500/10 flex items-center gap-2">
                  <Zap className="h-3.5 w-3.5 text-orange-400" />
                  <h3 className="text-xs font-black uppercase tracking-widest text-orange-400">Mejoras Rápidas</h3>
                </div>
                <CardContent className="p-3 space-y-1.5">
                  {IMPROVE_PROMPTS.map((prompt, i) => (
                    <button
                      key={i}
                      onClick={() => handleSend(prompt)}
                      disabled={isLoading}
                      className="w-full text-left p-2.5 rounded-xl text-[11px] font-medium hover:bg-primary/10 hover:text-primary transition-all flex items-start gap-2 group bg-muted/20 disabled:opacity-50"
                    >
                      <ChevronRight className="h-3 w-3 mt-0.5 text-muted-foreground group-hover:text-primary shrink-0" />
                      {prompt.slice(0, 60)}...
                    </button>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Business Templates */}
            <Card className="bg-card/50 border-white/10 overflow-hidden">
              <div className="p-4 bg-blue-500/5 border-b border-blue-500/10 flex items-center gap-2">
                <Layers className="h-3.5 w-3.5 text-blue-400" />
                <h3 className="text-xs font-black uppercase tracking-widest text-blue-400">Por Industria</h3>
              </div>
              <CardContent className="p-3 space-y-1.5 max-h-72 overflow-y-auto">
                {TEMPLATES.map((t, i) => (
                  <button
                    key={i}
                    onClick={() => handleSend(t.prompt)}
                    disabled={isLoading}
                    className="w-full text-left p-2.5 rounded-xl text-[11px] font-medium hover:bg-primary/10 hover:text-primary transition-all flex items-center gap-2 group bg-muted/20 disabled:opacity-50"
                  >
                    <t.icon className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary shrink-0" />
                    {t.label}
                  </button>
                ))}
              </CardContent>
            </Card>

            {/* Helper tip */}
            <div className="p-4 rounded-2xl bg-muted/10 border border-dashed border-white/10 text-center space-y-2">
              <MessageSquarePlus className="h-6 w-6 text-muted-foreground/30 mx-auto" />
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Cuéntame tu negocio en detalle y crearé un agente <strong>experto en tu industria</strong> con estrategia de ventas lista para usar.
              </p>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
