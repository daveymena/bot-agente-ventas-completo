import { useState } from "react";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sparkles, Bot, Send, Loader, RefreshCw } from "lucide-react";
import { toast } from "sonner";

const MODELS = [
  { id: "gpt-4o-mini", name: "GPT-4o Mini", provider: "GitHub" },
  { id: "claude-sonnet-4", name: "Claude Sonnet 4", provider: "GitHub" },
  { id: "deepseek-v4-flash-free", name: "DeepSeek V4 Flash", provider: "OpenCode" },
  { id: "llama-3.1-8b-instant", name: "Llama 3.1 8B", provider: "Groq" },
];

export default function ArenaPage() {
  const [prompt, setPrompt] = useState("");
  const [modelA, setModelA] = useState(MODELS[0].id);
  const [modelB, setModelB] = useState(MODELS[1].id);
  const [responseA, setResponseA] = useState("");
  const [responseB, setResponseB] = useState("");
  const [loading, setLoading] = useState(false);

  const handleCompare = async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    setResponseA("");
    setResponseB("");

    try {
      const res = await fetch("/api/arena/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          prompt: prompt.trim(),
          modelA,
          modelB,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setResponseA(data.responseA || "Sin respuesta");
        setResponseB(data.responseB || "Sin respuesta");
      } else {
        // Fallback: simulate both responses
        setResponseA(`[Simulado] Respuesta de ${MODELS.find((m) => m.id === modelA)?.name || modelA}\n\nEsta es una respuesta simulada. El endpoint de comparación no está disponible.`);
        setResponseB(`[Simulado] Respuesta de ${MODELS.find((m) => m.id === modelB)?.name || modelB}\n\nEsta es una respuesta simulada. El endpoint de comparación no está disponible.`);
        toast.info("Usando respuestas simuladas — el endpoint de comparación no está disponible");
      }
    } catch {
      setResponseA("Error al obtener respuesta del modelo A");
      setResponseB("Error al obtener respuesta del modelo B");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout>
      <div className="flex flex-col gap-6">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 border border-amber-500/20">
            <Sparkles className="h-6 w-6 text-amber-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">LM Arena</h1>
            <p className="text-sm text-muted-foreground">Compara modelos de IA lado a lado</p>
          </div>
        </div>

        <Card className="rounded-3xl border-0 shadow-lg glass-panel">
          <CardContent className="p-6 space-y-4">
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Ingresa tu prompt para comparar..."
              className="min-h-[120px] bg-background/50"
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">Modelo A</label>
                <Select value={modelA} onValueChange={setModelA}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MODELS.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.name} ({m.provider})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Modelo B</label>
                <Select value={modelB} onValueChange={setModelB}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MODELS.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.name} ({m.provider})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Button onClick={handleCompare} disabled={loading || !prompt.trim()} className="w-full gap-2">
              {loading ? <Loader className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {loading ? "Comparando..." : "Comparar Modelos"}
            </Button>
          </CardContent>
        </Card>

        {(responseA || responseB) && (
          <div className="grid gap-6 sm:grid-cols-2">
            <Card className="rounded-3xl border-0 shadow-lg glass-panel">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Bot className="h-4 w-4 text-blue-500" />
                  {MODELS.find((m) => m.id === modelA)?.name || modelA}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm whitespace-pre-wrap">{responseA}</p>
              </CardContent>
            </Card>
            <Card className="rounded-3xl border-0 shadow-lg glass-panel">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Bot className="h-4 w-4 text-purple-500" />
                  {MODELS.find((m) => m.id === modelB)?.name || modelB}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm whitespace-pre-wrap">{responseB}</p>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </Layout>
  );
}
