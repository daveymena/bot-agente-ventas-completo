import { useState, useRef, useEffect } from "react";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Beaker, Send, Loader2, AlertCircle, CheckCircle2, Clock, TrendingUp, ZapOff, BarChart3, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { useSession } from "@/App";
import { format } from "date-fns";
import { es } from "date-fns/locale";

interface ChatMessage {
  role: "user" | "agent";
  content: string;
  timestamp: Date;
}

interface SimulationResult {
  versionId?: number;
  exitosos?: number;
  total?: number;
  tasa?: number;
  problemasTotal?: number;
}

export default function AgentLabPage() {
  const { tenant } = useSession();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [agentId, setAgentId] = useState<string>("");
  const [productoId, setProductoId] = useState<string>("");
  const [recentSimulations, setRecentSimulations] = useState<any[]>([]);
  const [pendingVersions, setPendingVersions] = useState<any[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = async () => {
    if (!input.trim()) return;

    const userMessage: ChatMessage = {
      role: "user",
      content: input,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      // Llama al endpoint del chat de Agent Lab
      // Este endpoint debe estar restringido a las herramientas agentlab_*
      const response = await fetch("/api/agent-lab/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: input,
          agentId: agentId || undefined,
          productoId: productoId || undefined,
          sessionId: tenant?.id,
        }),
      });

      if (!response.ok) {
        throw new Error(`Error: ${response.statusText}`);
      }

      const data = await response.json();
      const agentMessage: ChatMessage = {
        role: "agent",
        content: data.reply || "Sin respuesta del agente.",
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, agentMessage]);

      // Si hay resultados de simulación, actualizar panel
      if (data.data?.simulaciones) {
        setRecentSimulations((prev) => [
          { timestamp: new Date(), ...data.data },
          ...prev.slice(0, 9),
        ]);
      }

      // Si se creó una versión candidata
      if (data.data?.versionId) {
        setPendingVersions((prev) => [
          { id: data.data.versionId, timestamp: new Date(), cambios: data.data.cambios },
          ...prev,
        ]);
      }
    } catch (error: any) {
      const errorMessage: ChatMessage = {
        role: "agent",
        content: `❌ Error: ${error?.message || "No se pudo conectar con el agente."}`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
      toast.error("Error en simulación");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Layout>
      <div className="space-y-6 pb-6">
        {/* Encabezado premium */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-xl p-6 text-white shadow-lg">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-white/20 rounded-lg backdrop-blur-sm">
                <Beaker className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-3xl font-bold">Agent Lab</h1>
                <p className="text-blue-100 mt-1">Plataforma de entrenamiento profesional para agentes comerciales</p>
              </div>
            </div>
            <Badge className="bg-white/20 text-white border-white/30">Fase 1</Badge>
          </div>
          <div className="grid grid-cols-3 gap-4 mt-6 pt-6 border-t border-white/20">
            <div className="text-center">
              <p className="text-2xl font-bold">14</p>
              <p className="text-blue-100 text-sm">Arquetipos</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold">∞</p>
              <p className="text-blue-100 text-sm">Conversaciones</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold">Real</p>
              <p className="text-blue-100 text-sm">LLM Integrado</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Chat principal */}
          <div className="lg:col-span-2">
            <Card className="h-full flex flex-col border-blue-200 shadow-md">
              <CardHeader className="border-b border-blue-100 bg-gradient-to-r from-blue-50 to-transparent">
                <div className="flex items-center gap-2">
                  <Beaker className="w-5 h-5 text-blue-600" />
                  <div>
                    <CardTitle>Simulador interactivo</CardTitle>
                    <CardDescription>Entrena tu agente contra 14 arquetipos de clientes reales</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col gap-4 p-4">
                {/* Configuración rápida */}
                <div className="bg-gradient-to-r from-blue-50 to-blue-50/50 border border-blue-100 rounded-lg p-3 space-y-3">
                  <p className="text-xs font-semibold text-gray-700">Contexto</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-gray-600">ID Agente</label>
                      <Input
                        type="number"
                        placeholder="Ej: 1"
                        value={agentId}
                        onChange={(e) => setAgentId(e.target.value)}
                        className="mt-1 h-8 bg-white"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-600">ID Producto</label>
                      <Input
                        type="number"
                        placeholder="Ej: 1"
                        value={productoId}
                        onChange={(e) => setProductoId(e.target.value)}
                        className="mt-1 h-8 bg-white"
                      />
                    </div>
                  </div>
                </div>

                {/* Área de chat */}
                <ScrollArea className="flex-1 border border-blue-100 rounded-lg p-4 bg-white">
                  <div className="space-y-3">
                    {messages.length === 0 ? (
                      <div className="text-center py-12 text-gray-500">
                        <Beaker className="w-12 h-12 text-blue-300 mx-auto mb-3" />
                        <p className="font-medium">Sin conversaciones aún</p>
                        <p className="text-sm mt-2 text-gray-400">Prueba: "Simula 5 clientes desconfiados"</p>
                      </div>
                    ) : (
                      messages.map((msg, idx) => (
                        <div key={idx} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                          <div
                            className={`max-w-sm px-4 py-3 rounded-lg ${
                              msg.role === "user"
                                ? "bg-blue-600 text-white rounded-br-sm shadow-sm"
                                : "bg-gray-50 border border-gray-200 rounded-bl-sm"
                            }`}
                          >
                            <p className="text-sm leading-relaxed">{msg.content}</p>
                            <p className={`text-xs mt-2 ${msg.role === "user" ? "text-blue-100" : "text-gray-500"}`}>
                              {format(msg.timestamp, "HH:mm", { locale: es })}
                            </p>
                          </div>
                        </div>
                      ))
                    )}
                    {isLoading && (
                      <div className="flex gap-2 items-center text-sm text-gray-600">
                        <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                        <span>Procesando simulación...</span>
                      </div>
                    )}
                    <div ref={messagesEndRef} />
                  </div>
                </ScrollArea>

                {/* Input area */}
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <Textarea
                      placeholder="Simula clientes, propone mejoras, compara versiones..."
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && e.ctrlKey) {
                          handleSendMessage();
                        }
                      }}
                      className="flex-1 min-h-10 resize-none"
                    />
                    <Button
                      onClick={handleSendMessage}
                      disabled={isLoading || !input.trim()}
                      size="sm"
                      className="self-end h-10"
                    >
                      <Send className="w-4 h-4" />
                    </Button>
                  </div>
                  <p className="text-xs text-gray-500 px-1">💡 Ctrl+Enter para enviar rápidamente</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Panel lateral */}
          <div className="space-y-4">
            {/* Simulaciones recientes */}
            <Card className="border-green-100 shadow-sm">
              <CardHeader className="border-b border-green-100 bg-gradient-to-r from-green-50 to-transparent pb-3">
                <div className="flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-green-600" />
                  <CardTitle className="text-sm">Simulaciones recientes</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="pt-3 space-y-2">
                {recentSimulations.length === 0 ? (
                  <p className="text-xs text-gray-500 py-4 text-center">Sin simulaciones aún</p>
                ) : (
                  recentSimulations.slice(0, 4).map((sim, idx) => (
                    <div key={idx} className="border border-green-100 rounded-lg p-3 bg-gradient-to-r from-green-50/30 to-transparent hover:border-green-200 transition">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-semibold text-sm text-gray-800">{sim.simulaciones} conv.</p>
                          <p className="text-xs text-gray-600 mt-1">
                            <span className="inline-flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3 text-green-600" /> {sim.compras} compras
                            </span>
                          </p>
                        </div>
                        <Badge variant="outline" className="text-xs text-orange-700 border-orange-300 bg-orange-50">
                          {sim.problemasTotal} ⚠️
                        </Badge>
                      </div>
                      <p className="text-xs text-gray-400 mt-2">
                        {sim.timestamp ? format(new Date(sim.timestamp), "HH:mm", { locale: es }) : "—"}
                      </p>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            {/* Versiones candidatas */}
            <Card className="border-amber-100 shadow-sm">
              <CardHeader className="border-b border-amber-100 bg-gradient-to-r from-amber-50 to-transparent pb-3">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-amber-600" />
                  <CardTitle className="text-sm">Versiones candidatas</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="pt-3 space-y-2">
                {pendingVersions.length === 0 ? (
                  <p className="text-xs text-gray-500 py-4 text-center">Sin versiones pendientes</p>
                ) : (
                  pendingVersions.slice(0, 4).map((v, idx) => (
                    <div key={idx} className="border border-amber-200 rounded-lg p-3 bg-gradient-to-r from-amber-50 to-transparent hover:border-amber-300 transition">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge className="bg-amber-600 text-white text-xs">v#{v.id}</Badge>
                        <span className="text-xs text-gray-500 ml-auto">Pendiente</span>
                      </div>
                      <p className="text-xs text-amber-900 mb-3 leading-snug line-clamp-2">{v.cambios || "Cambios del agente"}</p>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" className="text-xs h-7 flex-1">
                          Comparar
                        </Button>
                        <Button size="sm" className="text-xs h-7 flex-1 bg-amber-600 hover:bg-amber-700">
                          Aplicar
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            {/* Guía rápida */}
            <Card className="border-blue-100 bg-gradient-to-br from-blue-50 to-blue-50/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-blue-900 flex items-center gap-2">
                  <ZapOff className="w-4 h-4" /> Flujo recomendado
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-blue-800 space-y-2">
                <div className="space-y-1 text-xs">
                  <p className="flex items-center gap-2"><span className="font-bold">1.</span> Simula clientes</p>
                  <p className="flex items-center gap-2 ml-6"><ArrowRight className="w-3 h-3" /> Por arquetipo</p>
                  <p className="flex items-center gap-2"><span className="font-bold">2.</span> Propone mejora</p>
                  <p className="flex items-center gap-2 ml-6"><ArrowRight className="w-3 h-3" /> De hallazgos</p>
                  <p className="flex items-center gap-2"><span className="font-bold">3.</span> Compara</p>
                  <p className="flex items-center gap-2 ml-6"><ArrowRight className="w-3 h-3" /> Versiones</p>
                  <p className="flex items-center gap-2"><span className="font-bold">4.</span> Aplica</p>
                  <p className="flex items-center gap-2 ml-6"><ArrowRight className="w-3 h-3" /> A producción</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </Layout>
  );
}
