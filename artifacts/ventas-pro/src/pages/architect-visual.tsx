import { useState, useRef, useEffect } from "react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Bot, Send, User, Sparkles, Check, Eye, Loader2, Building2, Target, MessageSquare } from "lucide-react";
import { toast } from "sonner";

interface Message {
  role: "user" | "assistant";
  content: string;
  agentPreview?: AgentPreview;
  simulation?: Simulation[];
  businessProfile?: BusinessProfile;
}

interface BusinessProfile {
  type: string;
  industry: string;
  products: string[];
  targetAudience: string;
  goals: string[];
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

interface Simulation {
  role: "client" | "agent";
  text: string;
}

export default function ArchitectVisual() {
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: "¡Hola! Soy tu Arquitecta Visual. Cuéntame sobre tu negocio o el tipo de agente que necesitas y diseñaré una propuesta profesional con vista previa interactiva." }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [currentAgent, setCurrentAgent] = useState<AgentPreview | null>(null);
  const [currentSimulation, setCurrentSimulation] = useState<Simulation[] | null>(null);
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
      const res = await fetch("/api/code-agent/visual-architect", {
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
        content: data.reply || "Propuesta generada.",
        agentPreview: data.agentPreview,
        simulation: data.simulation,
        businessProfile: data.businessProfile,
      };
      setMessages(prev => [...prev, newMsg]);

      if (data.agentPreview) setCurrentAgent(data.agentPreview);
      if (data.simulation) setCurrentSimulation(data.simulation);

      if (data.configApplied) {
        toast.success("Configuración aplicada al agente exitosamente");
      }
    } catch (err: any) {
      toast.error(err.message || "Error al comunicar con el arquitecto visual");
      setMessages(prev => [...prev, { role: "assistant", content: `Error: ${err.message}` }]);
    } finally {
      setLoading(false);
    }
  };

  const handleApplyPreview = async () => {
    if (!currentAgent) return;
    try {
      const res = await fetch("/api/code-agent/apply-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preview: currentAgent }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Error al aplicar preview");
      toast.success("Preview aplicado al agente real");
    } catch (err: any) {
      toast.error(err.message || "Error al aplicar preview");
    }
  };

  return (
    <Layout>
      <div className="flex flex-col gap-6 animate-enter h-[calc(100vh-10rem)]">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Arquitecto Visual
          </h1>
          <p className="text-muted-foreground mt-1">Diseña agentes IA con vista previa interactiva y simulaciones.</p>
        </div>

        <div className="flex gap-6 flex-1 min-h-0">
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

                      {msg.agentPreview && (
                        <AgentPreviewCard preview={msg.agentPreview} onApply={handleApplyPreview} />
                      )}
                      {msg.simulation && msg.simulation.length > 0 && (
                        <SimulationCard simulation={msg.simulation} />
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
                  placeholder="Describe tu negocio o el agente que necesitas..."
                  disabled={loading}
                  className="flex-1"
                />
                <Button type="submit" disabled={loading || !input.trim()}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </form>
            </div>
          </div>

          {currentAgent && (
            <div className="w-96 shrink-0 space-y-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Eye className="h-5 w-5 text-primary" /> Vista previa
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <p className="text-2xl font-bold">{currentAgent.name}</p>
                    <p className="text-sm text-muted-foreground">{currentAgent.role}</p>
                    <Badge variant="outline" className="mt-1">{currentAgent.tone}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{currentAgent.personality}</p>

                  {currentAgent.sampleResponses && (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Respuestas de ejemplo</p>
                      {currentAgent.sampleResponses.map((r, i) => (
                        <div key={i} className="text-xs p-2 bg-muted/30 rounded-lg italic">"{r}"</div>
                      ))}
                    </div>
                  )}

                  <Button className="w-full" onClick={handleApplyPreview}>
                    <Check className="h-4 w-4 mr-2" /> Aplicar este agente
                  </Button>
                </CardContent>
              </Card>

              {currentSimulation && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <MessageSquare className="h-5 w-5 text-primary" /> Simulación
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {currentSimulation.map((s, i) => (
                      <div key={i} className={`p-2 rounded-lg text-xs ${
                        s.role === "agent" ? "bg-primary/5 border border-primary/10 ml-4" : "bg-muted/30 mr-4"
                      }`}>
                        <span className="font-semibold">{s.role === "agent" ? "🤖 Agente" : "👤 Cliente"}:</span>
                        <p className="mt-0.5">{s.text}</p>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}

function AgentPreviewCard({ preview, onApply }: { preview: AgentPreview; onApply: () => void }) {
  return (
    <Card className="mt-3 border-primary/20">
      <CardContent className="pt-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-bold text-lg">{preview.name}</p>
            <p className="text-sm text-muted-foreground">{preview.role}</p>
          </div>
          <Badge>{preview.tone}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">{preview.personality}</p>

        {preview.objectionHandling && Object.keys(preview.objectionHandling).length > 0 && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase mb-1">Manejo de objeciones</p>
            <div className="space-y-1">
              {Object.entries(preview.objectionHandling).map(([key, val]) => (
                <div key={key} className="text-xs flex gap-2">
                  <span className="font-medium shrink-0">{key}:</span>
                  <span className="text-muted-foreground">{val}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {preview.closingStrategies && preview.closingStrategies.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase mb-1">Estrategias de cierre</p>
            <div className="flex flex-wrap gap-1">
              {preview.closingStrategies.map((s, i) => (
                <Badge key={i} variant="secondary" className="text-[10px]">{s}</Badge>
              ))}
            </div>
          </div>
        )}

        <Button size="sm" className="w-full" onClick={onApply}>
          <Check className="h-3 w-3 mr-1" /> Aplicar
        </Button>
      </CardContent>
    </Card>
  );
}

function SimulationCard({ simulation }: { simulation: Simulation[] }) {
  return (
    <Card className="mt-2">
      <CardContent className="pt-3 space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase flex items-center gap-1">
          <MessageSquare className="h-3 w-3" /> Simulación
        </p>
        {simulation.map((s, i) => (
          <div key={i} className={`p-2 rounded-lg text-xs ${
            s.role === "agent" ? "bg-primary/5 border border-primary/10 ml-4" : "bg-muted/30 mr-4"
          }`}>
            <span className="font-semibold">{s.role === "agent" ? "🤖" : "👤"}</span> {s.text}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
