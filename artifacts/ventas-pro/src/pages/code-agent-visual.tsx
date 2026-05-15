import { useState, useRef, useEffect } from "react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Wand2, 
  Send, 
  Sparkles, 
  CheckCircle2, 
  Eye,
  MessageSquare,
  Settings,
  Lightbulb,
  Play,
  User,
  Bot,
  Zap,
  TrendingUp,
  Target,
  Shield
} from "lucide-react";
import { toast } from "sonner";

interface Message {
  role: "user" | "assistant";
  content: string;
  isConfigApplied?: boolean;
}

interface AgentPreview {
  name: string;
  role: string;
  tone: string;
  personality: string;
  sampleResponses: string[];
  objectionHandling: Record<string, string>;
  closingStrategies: string[];
  businessRules: Record<string, string>;
}

interface BusinessProfile {
  type: string;
  industry: string;
  products: string[];
  targetAudience: string;
  goals: string[];
}

export default function AgentArchitectVisual() {
  const [messages, setMessages] = useState<Message[]>([
    { 
      role: "assistant", 
      content: "👋 ¡Hola! Soy tu **Arquitecta Visual de Agentes**.\n\n🎯 Puedo ayudarte de 3 formas:\n\n1️⃣ **Analizar tu negocio** y sugerirte el agente perfecto\n2️⃣ **Diseñar un agente** según tus instrucciones\n3️⃣ **Mostrarte en vivo** cómo se vería y respondería\n\n¿Quieres que te haga una propuesta basada en tu negocio, o ya sabes qué tipo de agente necesitas?" 
    }
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [agentPreview, setAgentPreview] = useState<AgentPreview | null>(null);
  const [businessProfile, setBusinessProfile] = useState<BusinessProfile | null>(null);
  const [simulationMessages, setSimulationMessages] = useState<Array<{role: string, text: string}>>([]);
  const [activeTab, setActiveTab] = useState("chat");
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
      const response = await fetch("/api/code-agent/visual-architect", {
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

        // Si hay preview del agente, mostrarlo
        if (data.agentPreview) {
          setAgentPreview(data.agentPreview);
          setActiveTab("preview");
          toast.success("✨ Vista previa generada");
        }

        // Si hay perfil de negocio, mostrarlo
        if (data.businessProfile) {
          setBusinessProfile(data.businessProfile);
        }

        // Si hay simulación, mostrarla
        if (data.simulation) {
          setSimulationMessages(data.simulation);
        }

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

  const handleQuickProposal = async (businessType: string) => {
    setInput(`Analiza mi negocio de ${businessType} y proponme el agente ideal con ejemplos visuales`);
    setTimeout(() => handleSend(), 100);
  };

  const handleApplyConfig = async () => {
    if (!agentPreview) return;

    try {
      const response = await fetch("/api/code-agent/apply-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preview: agentPreview })
      });

      if (response.ok) {
        toast.success("🎉 Configuración aplicada al agente en vivo");
        setMessages(prev => [...prev, {
          role: "assistant",
          content: "✅ **Configuración aplicada exitosamente**\n\nTu agente ya está funcionando con la nueva configuración. Puedes probarlo en la sección de Conversaciones.",
          isConfigApplied: true
        }]);
      } else {
        toast.error("Error aplicando la configuración");
      }
    } catch (error) {
      toast.error("Error de conexión");
    }
  };

  return (
    <Layout>
      <div className="max-w-7xl mx-auto flex flex-col gap-6 flex-1 min-h-0 w-full animate-enter">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shadow-xl shadow-purple-500/20 rotate-3">
              <Eye className="h-8 w-8 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-black tracking-tight text-foreground flex items-center gap-2">
                Arquitecto Visual de Agentes
              </h1>
              <p className="text-muted-foreground text-sm font-medium">Diseña, visualiza y prueba tu agente en tiempo real</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="outline" className="px-3 py-1 border-purple-500/20 bg-purple-500/5 text-purple-600 font-bold gap-2">
              <div className="w-2 h-2 rounded-full bg-purple-500 animate-pulse" /> Vista Previa en Vivo
            </Badge>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="grid w-full grid-cols-4 mb-4">
            <TabsTrigger value="chat" className="gap-2">
              <MessageSquare className="h-4 w-4" />
              Chat
            </TabsTrigger>
            <TabsTrigger value="preview" className="gap-2" disabled={!agentPreview}>
              <Eye className="h-4 w-4" />
              Vista Previa
            </TabsTrigger>
            <TabsTrigger value="simulation" className="gap-2" disabled={!agentPreview}>
              <Play className="h-4 w-4" />
              Simulación
            </TabsTrigger>
            <TabsTrigger value="config" className="gap-2" disabled={!agentPreview}>
              <Settings className="h-4 w-4" />
              Configuración
            </TabsTrigger>
          </TabsList>

          {/* TAB 1: CHAT */}
          <TabsContent value="chat" className="flex-1 overflow-hidden mt-0">
            <div className="grid lg:grid-cols-4 gap-6 h-full">
              <Card className="lg:col-span-3 flex flex-col glass-panel border-none shadow-2xl overflow-hidden">
                <ScrollArea className="flex-1 p-6" ref={scrollRef}>
                  <div className="space-y-8 pb-4">
                    {messages.map((m, i) => (
                      <div key={i} className={`flex gap-4 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-lg ${
                          m.role === 'assistant' 
                            ? 'bg-gradient-to-br from-purple-500 to-pink-500 text-white' 
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
                              <CheckCircle2 className="h-3.5 w-3.5" /> Aplicado en Vivo
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                    {isLoading && (
                      <div className="flex gap-4 animate-pulse">
                        <div className="w-12 h-12 rounded-2xl bg-muted/50 border flex items-center justify-center">
                          <Sparkles className="h-6 w-6 text-muted-foreground animate-spin" />
                        </div>
                        <div className="bg-muted/30 h-16 w-64 rounded-3xl" />
                      </div>
                    )}
                  </div>
                </ScrollArea>

                <div className="p-6 bg-muted/5 border-t border-border/30">
                  <div className="relative group">
                    <Input 
                      placeholder="Describe tu negocio o el agente que necesitas..."
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                      className="pr-16 h-16 rounded-2xl bg-background border-border/50 focus:border-purple-500 focus:ring-4 focus:ring-purple-500/5 transition-all text-base shadow-lg"
                      disabled={isLoading}
                    />
                    <Button 
                      size="icon" 
                      onClick={handleSend}
                      disabled={isLoading || !input.trim()}
                      className="absolute right-2.5 top-2.5 h-11 w-11 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 shadow-xl shadow-purple-500/20 hover:scale-105 transition-transform"
                    >
                      <Send className="h-5 w-5" />
                    </Button>
                  </div>
                </div>
              </Card>

              {/* Sidebar con propuestas rápidas */}
              <div className="hidden lg:flex flex-col gap-4">
                <Card className="glass-panel border-none shadow-lg">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Lightbulb className="h-4 w-4 text-yellow-500" />
                      Propuestas Rápidas
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full justify-start text-xs"
                      onClick={() => handleQuickProposal("cursos digitales")}
                    >
                      <TrendingUp className="h-3 w-3 mr-2" />
                      Cursos Digitales
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full justify-start text-xs"
                      onClick={() => handleQuickProposal("ecommerce")}
                    >
                      <Target className="h-3 w-3 mr-2" />
                      E-commerce
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full justify-start text-xs"
                      onClick={() => handleQuickProposal("servicios profesionales")}
                    >
                      <Shield className="h-3 w-3 mr-2" />
                      Servicios Pro
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full justify-start text-xs"
                      onClick={() => handleQuickProposal("consultoría")}
                    >
                      <Zap className="h-3 w-3 mr-2" />
                      Consultoría
                    </Button>
                  </CardContent>
                </Card>

                <div className="flex-1 bg-gradient-to-br from-purple-500/10 to-pink-500/10 rounded-3xl border border-dashed border-purple-500/30 p-6 flex flex-col items-center justify-center text-center gap-4">
                  <Eye className="h-12 w-12 text-purple-500" />
                  <div className="space-y-1">
                    <p className="text-sm font-bold">Vista Previa en Vivo</p>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      Ve cómo se vería tu agente antes de aplicarlo
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* TAB 2: VISTA PREVIA */}
          <TabsContent value="preview" className="flex-1 overflow-hidden mt-0">
            {agentPreview && (
              <div className="grid lg:grid-cols-2 gap-6 h-full">
                <Card className="glass-panel border-none shadow-xl">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Bot className="h-5 w-5 text-purple-500" />
                      Perfil del Agente
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div>
                      <p className="text-sm font-semibold text-muted-foreground mb-1">Nombre</p>
                      <p className="text-2xl font-bold">{agentPreview.name}</p>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-muted-foreground mb-1">Rol</p>
                      <p className="text-lg">{agentPreview.role}</p>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-muted-foreground mb-1">Tono</p>
                      <Badge variant="secondary">{agentPreview.tone}</Badge>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-muted-foreground mb-2">Personalidad</p>
                      <p className="text-sm leading-relaxed">{agentPreview.personality}</p>
                    </div>

                    <div className="pt-4 border-t">
                      <Button 
                        onClick={handleApplyConfig}
                        className="w-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
                        size="lg"
                      >
                        <CheckCircle2 className="mr-2 h-5 w-5" />
                        Aplicar Esta Configuración
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                <Card className="glass-panel border-none shadow-xl">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <MessageSquare className="h-5 w-5 text-purple-500" />
                      Ejemplos de Respuestas
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-[400px]">
                      <div className="space-y-4">
                        {agentPreview.sampleResponses.map((response, i) => (
                          <div key={i} className="p-4 bg-muted/50 rounded-xl border border-border/50">
                            <p className="text-sm leading-relaxed">{response}</p>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>

          {/* TAB 3: SIMULACIÓN */}
          <TabsContent value="simulation" className="flex-1 overflow-hidden mt-0">
            <Card className="glass-panel border-none shadow-xl h-full flex flex-col">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Play className="h-5 w-5 text-purple-500" />
                  Simulación de Conversación
                </CardTitle>
              </CardHeader>
              <CardContent className="flex-1 overflow-hidden">
                <ScrollArea className="h-full">
                  <div className="space-y-4 max-w-3xl mx-auto">
                    {simulationMessages.map((msg, i) => (
                      <div key={i} className={`flex gap-3 ${msg.role === 'client' ? 'flex-row-reverse' : ''}`}>
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                          msg.role === 'client' 
                            ? 'bg-blue-500 text-white' 
                            : 'bg-gradient-to-br from-purple-500 to-pink-500 text-white'
                        }`}>
                          {msg.role === 'client' ? <User className="h-5 w-5" /> : <Bot className="h-5 w-5" />}
                        </div>
                        <div className={`p-4 rounded-2xl max-w-[80%] ${
                          msg.role === 'client'
                            ? 'bg-blue-500 text-white'
                            : 'bg-card border border-border'
                        }`}>
                          <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB 4: CONFIGURACIÓN DETALLADA */}
          <TabsContent value="config" className="flex-1 overflow-hidden mt-0">
            {agentPreview && (
              <div className="grid lg:grid-cols-2 gap-6 h-full overflow-auto">
                <Card className="glass-panel border-none shadow-xl">
                  <CardHeader>
                    <CardTitle className="text-sm">Manejo de Objeciones</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {Object.entries(agentPreview.objectionHandling).map(([key, value]) => (
                      <div key={key} className="p-3 bg-muted/30 rounded-lg">
                        <p className="text-xs font-semibold text-purple-600 mb-1 uppercase">{key}</p>
                        <p className="text-sm">{value}</p>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                <Card className="glass-panel border-none shadow-xl">
                  <CardHeader>
                    <CardTitle className="text-sm">Estrategias de Cierre</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {agentPreview.closingStrategies.map((strategy, i) => (
                      <div key={i} className="p-3 bg-muted/30 rounded-lg flex items-start gap-2">
                        <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                        <p className="text-sm">{strategy}</p>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                <Card className="glass-panel border-none shadow-xl lg:col-span-2">
                  <CardHeader>
                    <CardTitle className="text-sm">Reglas de Negocio</CardTitle>
                  </CardHeader>
                  <CardContent className="grid md:grid-cols-2 gap-3">
                    {Object.entries(agentPreview.businessRules).map(([key, value]) => (
                      <div key={key} className="p-3 bg-muted/30 rounded-lg">
                        <p className="text-xs font-semibold text-muted-foreground mb-1 uppercase">{key}</p>
                        <p className="text-sm">{value}</p>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
