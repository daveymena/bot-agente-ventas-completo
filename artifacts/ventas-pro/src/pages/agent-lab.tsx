import { useState, useRef, useEffect } from "react";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Beaker, Send, Loader2, AlertCircle, CheckCircle2, Clock } from "lucide-react";
import { toast } from "sonner";
import { useSession } from "@/App";

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
        {/* Encabezado */}
        <div className="flex items-center gap-3 mb-6">
          <Beaker className="w-8 h-8 text-blue-600" />
          <div>
            <h1 className="text-3xl font-bold">Agent Lab</h1>
            <p className="text-gray-600">Entrena, prueba y mejora tu agente de ventas antes de producción</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Chat principal */}
          <div className="lg:col-span-2">
            <Card className="h-full flex flex-col">
              <CardHeader>
                <CardTitle>Chat de entrenamiento</CardTitle>
                <CardDescription>Simula clientes, evalúa respuestas, propone mejoras</CardDescription>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col gap-4">
                {/* Configuración rápida */}
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <label className="text-xs font-medium text-gray-600">ID Agente</label>
                    <Input
                      type="number"
                      placeholder="1"
                      value={agentId}
                      onChange={(e) => setAgentId(e.target.value)}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600">ID Producto</label>
                    <Input
                      type="number"
                      placeholder="1"
                      value={productoId}
                      onChange={(e) => setProductoId(e.target.value)}
                      className="mt-1"
                    />
                  </div>
                </div>

                {/* Área de chat */}
                <ScrollArea className="flex-1 border rounded-lg p-4 bg-gray-50">
                  <div className="space-y-4">
                    {messages.length === 0 ? (
                      <div className="text-center py-8 text-gray-500">
                        <p>💬 Inicia una conversación</p>
                        <p className="text-sm mt-2">Prueba: "Simula 3 clientes difíciles para el agente 1"</p>
                      </div>
                    ) : (
                      messages.map((msg, idx) => (
                        <div key={idx} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                          <div
                            className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                              msg.role === "user"
                                ? "bg-blue-600 text-white rounded-br-none"
                                : "bg-white border border-gray-200 rounded-bl-none"
                            }`}
                          >
                            <p className="text-sm">{msg.content}</p>
                            <p className={`text-xs mt-1 ${msg.role === "user" ? "text-blue-100" : "text-gray-500"}`}>
                              {msg.timestamp.toLocaleTimeString()}
                            </p>
                          </div>
                        </div>
                      ))
                    )}
                    {isLoading && (
                      <div className="flex gap-2">
                        <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                        <p className="text-sm text-gray-500">Procesando...</p>
                      </div>
                    )}
                    <div ref={messagesEndRef} />
                  </div>
                </ScrollArea>

                {/* Input */}
                <div className="flex gap-2">
                  <Textarea
                    placeholder="Escribe un comando: 'simula 5 clientes', 'propone mejora', 'compara versiones'..."
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && e.ctrlKey) {
                        handleSendMessage();
                      }
                    }}
                    className="flex-1 min-h-12"
                  />
                  <Button
                    onClick={handleSendMessage}
                    disabled={isLoading || !input.trim()}
                    className="self-end"
                  >
                    <Send className="w-4 h-4" />
                  </Button>
                </div>
                <p className="text-xs text-gray-500">Ctrl+Enter para enviar</p>
              </CardContent>
            </Card>
          </div>

          {/* Panel lateral */}
          <div className="space-y-4">
            {/* Simulaciones recientes */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Simulaciones recientes</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {recentSimulations.length === 0 ? (
                  <p className="text-sm text-gray-500">Aún no hay simulaciones</p>
                ) : (
                  recentSimulations.slice(0, 5).map((sim, idx) => (
                    <div key={idx} className="text-sm border rounded p-2 bg-gray-50">
                      <p className="font-medium">{sim.simulaciones} conversaciones</p>
                      <p className="text-xs text-gray-600">
                        ✅ {sim.compras} compras • ⚠️ {sim.problemasTotal} problemas
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        {sim.timestamp ? new Date(sim.timestamp).toLocaleTimeString() : "—"}
                      </p>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            {/* Versiones candidatas */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Versiones candidatas</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {pendingVersions.length === 0 ? (
                  <p className="text-sm text-gray-500">Sin versiones pendientes</p>
                ) : (
                  pendingVersions.slice(0, 5).map((v, idx) => (
                    <div key={idx} className="text-sm border rounded p-2 bg-blue-50 border-blue-200">
                      <div className="flex items-center gap-2">
                        <Clock className="w-3 h-3 text-blue-600" />
                        <p className="font-medium text-blue-900">v#{v.id}</p>
                      </div>
                      <p className="text-xs text-blue-700 mt-1 line-clamp-2">{v.cambios}</p>
                      <div className="flex gap-1 mt-2">
                        <Button size="sm" variant="outline" className="text-xs h-6">
                          Comparar
                        </Button>
                        <Button size="sm" variant="default" className="text-xs h-6">
                          Aplicar
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            {/* Tips */}
            <Card className="bg-blue-50 border-blue-200">
              <CardHeader>
                <CardTitle className="text-sm text-blue-900">💡 Tips</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-blue-800 space-y-2">
                <p>• Usa "simula 5 clientes desconfiados"</p>
                <p>• Luego "propone mejora"</p>
                <p>• Revisa con "compara versiones"</p>
                <p>• Aplica con "aplicar versión"</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </Layout>
  );
}
