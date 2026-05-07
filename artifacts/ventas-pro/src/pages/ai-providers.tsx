import { useState, useEffect, useCallback } from "react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Brain, CheckCircle2, XCircle, Loader2, Zap, Save, TestTube2,
  Eye, EyeOff, RefreshCw, Star, Shuffle, AlertTriangle, ChevronUp, ChevronDown
} from "lucide-react";

const PROVIDER_META: Record<string, {
  name: string; emoji: string; color: string; description: string;
  freeNote?: string; docsUrl: string;
  models: Array<{ id: string; label: string; note?: string }>;
}> = {
  github: {
    name: "GitHub Models", emoji: "🐙", color: "bg-gray-500/10 border-gray-500/20 text-gray-300",
    description: "Acceso gratuito a GPT-4o, Claude y Llama via GitHub. Configura el GITHUB_TOKEN en .env.",
    freeNote: "Gratis con GitHub", docsUrl: "https://github.com/marketplace/models",
    models: [
      { id: "gpt-4o-mini", label: "GPT-4o Mini", note: "Rápido y económico" },
      { id: "gpt-4o", label: "GPT-4o", note: "Más capaz" },
      { id: "Meta-Llama-3.1-70B-Instruct", label: "Llama 3.1 70B" },
      { id: "Mistral-large-2407", label: "Mistral Large" },
    ],
  },
  openai: {
    name: "OpenAI", emoji: "⚡", color: "bg-green-500/10 border-green-500/20 text-green-300",
    description: "GPT-4o y GPT-4o-mini directo desde OpenAI. El más completo del mercado.",
    docsUrl: "https://platform.openai.com/api-keys",
    models: [
      { id: "gpt-4o-mini", label: "GPT-4o Mini", note: "Económico y rápido" },
      { id: "gpt-4o", label: "GPT-4o", note: "Mejor calidad" },
      { id: "gpt-4-turbo", label: "GPT-4 Turbo" },
      { id: "gpt-3.5-turbo", label: "GPT-3.5 Turbo", note: "El más barato" },
    ],
  },
  anthropic: {
    name: "Anthropic Claude", emoji: "🧠", color: "bg-orange-500/10 border-orange-500/20 text-orange-300",
    description: "Claude 3.5 y Claude Haiku — excelente para redacción, análisis y conversaciones largas.",
    docsUrl: "https://console.anthropic.com/",
    models: [
      { id: "claude-3-5-haiku-20241022", label: "Claude 3.5 Haiku", note: "Rápido y económico" },
      { id: "claude-3-5-sonnet-20241022", label: "Claude 3.5 Sonnet", note: "Balance calidad/precio" },
      { id: "claude-opus-4-5", label: "Claude Opus 4.5", note: "Máxima calidad" },
    ],
  },
  gemini: {
    name: "Google Gemini", emoji: "💎", color: "bg-blue-500/10 border-blue-500/20 text-blue-300",
    description: "Gemini 1.5 Flash y Pro de Google. Muy rápido, contexto masivo de 1M tokens.",
    docsUrl: "https://aistudio.google.com/app/apikey",
    models: [
      { id: "gemini-1.5-flash", label: "Gemini 1.5 Flash", note: "Ultrarrápido, gratis" },
      { id: "gemini-1.5-pro", label: "Gemini 1.5 Pro", note: "1M tokens contexto" },
      { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash", note: "Más reciente" },
    ],
  },
  groq: {
    name: "Groq", emoji: "🚀", color: "bg-yellow-500/10 border-yellow-500/20 text-yellow-300",
    description: "El más rápido del mercado — Llama 3 y Mixtral a 500+ tokens/segundo. Tiene tier gratis.",
    freeNote: "Tier gratis disponible", docsUrl: "https://console.groq.com/keys",
    models: [
      { id: "llama-3.1-8b-instant", label: "Llama 3.1 8B Instant", note: "El más rápido" },
      { id: "llama-3.3-70b-versatile", label: "Llama 3.3 70B Versatile", note: "Más capaz" },
      { id: "mixtral-8x7b-32768", label: "Mixtral 8x7B" },
      { id: "gemma2-9b-it", label: "Gemma 2 9B" },
    ],
  },
  mistral: {
    name: "Mistral AI", emoji: "🌪️", color: "bg-purple-500/10 border-purple-500/20 text-purple-300",
    description: "Modelos europeos eficientes. Mistral Small es perfecto para ventas por su tono natural.",
    docsUrl: "https://console.mistral.ai/api-keys/",
    models: [
      { id: "mistral-small-latest", label: "Mistral Small", note: "Precio/calidad ideal" },
      { id: "mistral-large-latest", label: "Mistral Large" },
      { id: "open-mixtral-8x7b", label: "Mixtral 8x7B", note: "Open source" },
    ],
  },
  deepseek: {
    name: "DeepSeek", emoji: "🔮", color: "bg-cyan-500/10 border-cyan-500/20 text-cyan-300",
    description: "El más económico del mercado — DeepSeek V3 tiene calidad de GPT-4 a 1/10 del precio.",
    freeNote: "Extremadamente barato", docsUrl: "https://platform.deepseek.com/api_keys",
    models: [
      { id: "deepseek-chat", label: "DeepSeek V3 Chat", note: "El más barato" },
      { id: "deepseek-reasoner", label: "DeepSeek R1 Reasoner", note: "Razonamiento profundo" },
    ],
  },
  openrouter: {
    name: "OpenRouter", emoji: "🔀", color: "bg-pink-500/10 border-pink-500/20 text-pink-300",
    description: "Acceso a 100+ modelos en una sola API. Ideal para probar y comparar proveedores.",
    docsUrl: "https://openrouter.ai/keys",
    models: [
      { id: "openai/gpt-4o-mini", label: "OpenAI GPT-4o Mini" },
      { id: "anthropic/claude-3.5-sonnet", label: "Claude 3.5 Sonnet" },
      { id: "meta-llama/llama-3.1-8b-instruct:free", label: "Llama 3.1 8B (Gratis)" },
      { id: "google/gemini-flash-1.5", label: "Gemini Flash 1.5" },
      { id: "mistralai/mistral-7b-instruct:free", label: "Mistral 7B (Gratis)" },
    ],
  },
  nvidia: {
    name: "NVIDIA NIM", emoji: "🎮", color: "bg-green-600/10 border-green-600/20 text-green-400",
    description: "Modelos optimizados en GPU de NVIDIA — Llama 3 y Mistral a alta velocidad.",
    docsUrl: "https://build.nvidia.com/",
    models: [
      { id: "meta/llama-3.3-70b-instruct", label: "Llama 3.3 70B" },
      { id: "mistralai/mixtral-8x22b-instruct-v0.1", label: "Mixtral 8x22B" },
    ],
  },
  ollama_local: {
    name: "Ollama (Local)", emoji: "🏠", color: "bg-slate-500/10 border-slate-500/20 text-slate-300",
    description: "Corre modelos 100% locales en tu servidor. Privacidad total, sin costo por token.",
    docsUrl: "https://ollama.ai/",
    models: [
      { id: "hermes3:8b", label: "Hermes 3 8B" },
      { id: "llama3.1", label: "Llama 3.1 8B" },
      { id: "mistral", label: "Mistral 7B" },
      { id: "deepseek-r1:7b", label: "DeepSeek R1 7B" },
      { id: "qwen2.5:7b", label: "Qwen 2.5 7B" },
    ],
  },
};

const ORDER = ["github", "openai", "anthropic", "gemini", "groq", "mistral", "deepseek", "openrouter", "nvidia", "ollama_local"];

interface ProviderStatus {
  id: string; model: string; enabled: boolean; configured: boolean;
  keySource: "db" | "env" | "none"; apiKeyMasked: string; url: string;
}

interface TestResult { ok: boolean; latency?: number; model?: string; error?: string; reply?: string; }

export default function AIProvidersPage() {
  const { toast } = useToast();
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [primaryProvider, setPrimaryProvider] = useState("github");
  const [fallbacks, setFallbacks] = useState<string[]>(["groq", "deepseek"]);
  const [loading, setLoading] = useState(true);
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({});
  const [models, setModels] = useState<Record<string, string>>({});
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [showKey, setShowKey] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [testing, setTesting] = useState<Record<string, boolean>>({});
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({});
  const [savingChain, setSavingChain] = useState(false);

  const fetchProviders = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/ai-providers");
    if (res.ok) {
      const data = await res.json();
      setProviders(data.providers);
      setPrimaryProvider(data.primaryProvider);
      setFallbacks(data.fallbacks || []);
      const initModels: Record<string, string> = {};
      const initUrls: Record<string, string> = {};
      data.providers.forEach((p: ProviderStatus) => {
        initModels[p.id] = p.model;
        initUrls[p.id] = p.url || "";
      });
      setModels(initModels);
      setUrls(initUrls);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchProviders(); }, [fetchProviders]);

  async function handleSave(id: string) {
    setSaving(prev => ({ ...prev, [id]: true }));
    const res = await fetch("/api/ai-providers/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        providerId: id,
        apiKey: apiKeys[id] || undefined,
        model: models[id] || undefined,
        url: urls[id] || undefined,
        enabled: true,
      }),
    });
    setSaving(prev => ({ ...prev, [id]: false }));
    if (res.ok) {
      toast({ title: `${PROVIDER_META[id]?.name} guardado` });
      fetchProviders();
      setApiKeys(prev => ({ ...prev, [id]: "" }));
    } else {
      toast({ title: "Error al guardar", variant: "destructive" });
    }
  }

  async function handleTest(id: string) {
    setTesting(prev => ({ ...prev, [id]: true }));
    setTestResults(prev => ({ ...prev, [id]: undefined as any }));
    const res = await fetch("/api/ai-providers/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        providerId: id,
        apiKey: apiKeys[id] || undefined,
        model: models[id] || undefined,
        url: urls[id] || undefined,
      }),
    });
    const data = await res.json();
    setTesting(prev => ({ ...prev, [id]: false }));
    setTestResults(prev => ({ ...prev, [id]: data }));
  }

  async function saveChain() {
    setSavingChain(true);
    await fetch("/api/ai-providers/set-primary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ primaryProvider, fallbacks }),
    });
    setSavingChain(false);
    toast({ title: "Cadena de proveedores actualizada" });
    fetchProviders();
  }

  function moveFallback(idx: number, dir: -1 | 1) {
    const newList = [...fallbacks];
    const target = idx + dir;
    if (target < 0 || target >= newList.length) return;
    [newList[idx], newList[target]] = [newList[target]!, newList[idx]!];
    setFallbacks(newList);
  }

  const configuredProviders = providers.filter(p => p.configured).map(p => p.id);

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-primary flex items-center justify-center">
                <Brain className="h-5 w-5 text-white" />
              </div>
              Motores de IA
            </h1>
            <p className="text-muted-foreground mt-1">Configura múltiples proveedores y define cuál usa tu agente y en qué orden de prioridad</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge className="bg-violet-500/10 text-violet-400 border-violet-500/20">
              {configuredProviders.length}/{ORDER.length} configurados
            </Badge>
            <Button size="sm" variant="outline" className="border-white/10 gap-2" onClick={fetchProviders}>
              <RefreshCw className="h-3.5 w-3.5" />Actualizar
            </Button>
          </div>
        </div>

        {/* Priority Chain */}
        <Card className="bg-card/50 border-white/10">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Shuffle className="h-4 w-4 text-primary" />
              Cadena de Prioridad de IA
            </CardTitle>
            <p className="text-xs text-muted-foreground">El agente usará el proveedor principal. Si falla, pasará automáticamente al siguiente en la cadena.</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wider">Proveedor Principal</label>
                <Select value={primaryProvider} onValueChange={setPrimaryProvider}>
                  <SelectTrigger className="border-white/10 bg-background/50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {configuredProviders.map(id => (
                      <SelectItem key={id} value={id}>
                        {PROVIDER_META[id]?.emoji} {PROVIDER_META[id]?.name || id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wider">Fallbacks (en orden)</label>
                <div className="space-y-1.5">
                  {fallbacks.map((id, i) => (
                    <div key={id} className="flex items-center gap-2">
                      <span className="text-[11px] text-muted-foreground w-4">{i + 1}.</span>
                      <Select value={id} onValueChange={v => {
                        const n = [...fallbacks];
                        n[i] = v;
                        setFallbacks(n);
                      }}>
                        <SelectTrigger className="flex-1 h-8 border-white/10 bg-background/50 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {configuredProviders.filter(p => p !== primaryProvider).map(pid => (
                            <SelectItem key={pid} value={pid}>
                              {PROVIDER_META[pid]?.emoji} {PROVIDER_META[pid]?.name || pid}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <button onClick={() => moveFallback(i, -1)} disabled={i === 0} className="text-muted-foreground hover:text-white disabled:opacity-30">
                        <ChevronUp className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => moveFallback(i, 1)} disabled={i === fallbacks.length - 1} className="text-muted-foreground hover:text-white disabled:opacity-30">
                        <ChevronDown className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                  <Button size="sm" variant="ghost" className="text-xs text-muted-foreground h-7"
                    onClick={() => setFallbacks(prev => [...prev, configuredProviders.find(p => !prev.includes(p) && p !== primaryProvider) || "groq"])}>
                    + Agregar fallback
                  </Button>
                </div>
              </div>
            </div>
            <Button onClick={saveChain} disabled={savingChain} size="sm" className="gap-2">
              {savingChain ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Guardar cadena de prioridad
            </Button>
          </CardContent>
        </Card>

        {/* Provider Cards */}
        <div className="grid gap-4">
          {ORDER.map(id => {
            const meta = PROVIDER_META[id];
            if (!meta) return null;
            const status = providers.find(p => p.id === id);
            const testResult = testResults[id];
            const isTesting = testing[id] || false;
            const isSaving = saving[id] || false;
            const isKeyShown = showKey[id] || false;

            return (
              <Card key={id} className={`bg-card/50 border-white/10 transition-all ${status?.configured ? "border-white/20" : ""}`}>
                <CardContent className="pt-5 pb-5">
                  <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                    {/* Provider identity */}
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <div className={`w-11 h-11 rounded-xl border flex items-center justify-center text-xl shrink-0 ${meta.color}`}>
                        {meta.emoji}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold text-sm">{meta.name}</h3>
                          {meta.freeNote && (
                            <Badge className="text-[10px] bg-green-500/10 text-green-400 border-green-500/20">
                              {meta.freeNote}
                            </Badge>
                          )}
                          {id === primaryProvider && (
                            <Badge className="text-[10px] bg-primary/10 text-primary border-primary/20">
                              <Star className="h-2.5 w-2.5 mr-1" />Principal
                            </Badge>
                          )}
                          {fallbacks.includes(id) && (
                            <Badge className="text-[10px] bg-slate-500/10 text-slate-400 border-slate-500/20">
                              Fallback #{fallbacks.indexOf(id) + 1}
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{meta.description}</p>
                        {status?.configured && (
                          <div className="flex items-center gap-1.5 mt-2">
                            <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
                            <span className="text-[11px] text-green-400 font-medium">
                              Configurado {status.keySource === "env" ? "(desde .env)" : "(desde DB)"}
                              {status.apiKeyMasked && ` · ${status.apiKeyMasked}`}
                            </span>
                          </div>
                        )}
                        {!status?.configured && (
                          <div className="flex items-center gap-1.5 mt-2">
                            <AlertTriangle className="h-3.5 w-3.5 text-yellow-400" />
                            <a href={meta.docsUrl} target="_blank" rel="noreferrer"
                              className="text-[11px] text-yellow-400 hover:underline">
                              Obtener API Key ↗
                            </a>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Config form */}
                    <div className="flex flex-col gap-2 sm:w-72">
                      {/* Model select */}
                      <Select value={models[id] || ""} onValueChange={v => setModels(prev => ({ ...prev, [id]: v }))}>
                        <SelectTrigger className="h-8 border-white/10 bg-background/50 text-xs">
                          <SelectValue placeholder="Seleccionar modelo..." />
                        </SelectTrigger>
                        <SelectContent>
                          {meta.models.map(m => (
                            <SelectItem key={m.id} value={m.id}>
                              {m.label} {m.note ? `· ${m.note}` : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      {/* API Key or URL input */}
                      {id === "ollama_local" ? (
                        <Input
                          placeholder="URL de Ollama (ej: http://localhost:11434)"
                          value={urls[id] || ""}
                          onChange={e => setUrls(prev => ({ ...prev, [id]: e.target.value }))}
                          className="h-8 text-xs border-white/10 bg-background/50 font-mono"
                        />
                      ) : (
                        <div className="relative">
                          <Input
                            type={isKeyShown ? "text" : "password"}
                            placeholder={status?.configured ? "Nueva key (dejar vacío para mantener)" : "API Key..."}
                            value={apiKeys[id] || ""}
                            onChange={e => setApiKeys(prev => ({ ...prev, [id]: e.target.value }))}
                            className="h-8 text-xs border-white/10 bg-background/50 pr-8 font-mono"
                          />
                          <button
                            className="absolute right-2 top-1.5 text-muted-foreground hover:text-white"
                            onClick={() => setShowKey(prev => ({ ...prev, [id]: !prev[id] }))}>
                            {isKeyShown ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                          </button>
                        </div>
                      )}

                      {/* Test result */}
                      {testResult && (
                        <div className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[11px] ${
                          testResult.ok ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"
                        }`}>
                          {testResult.ok ? (
                            <><CheckCircle2 className="h-3 w-3" />OK · {testResult.latency}ms · {testResult.model}</>
                          ) : (
                            <><XCircle className="h-3 w-3" />{testResult.error?.slice(0, 60)}</>
                          )}
                        </div>
                      )}

                      {/* Action buttons */}
                      <div className="flex gap-1.5">
                        <Button size="sm" variant="outline" className="flex-1 h-7 text-[11px] border-white/10 gap-1"
                          onClick={() => handleTest(id)} disabled={isTesting}>
                          {isTesting ? <Loader2 className="h-3 w-3 animate-spin" /> : <TestTube2 className="h-3 w-3" />}
                          {isTesting ? "Probando..." : "Probar"}
                        </Button>
                        <Button size="sm" className="flex-1 h-7 text-[11px] gap-1"
                          onClick={() => handleSave(id)} disabled={isSaving}>
                          {isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                          {isSaving ? "..." : "Guardar"}
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Info box */}
        <Card className="bg-primary/5 border-primary/10">
          <CardContent className="pt-5 pb-5">
            <div className="flex items-start gap-3">
              <Zap className="h-5 w-5 text-primary mt-0.5 shrink-0" />
              <div className="space-y-1">
                <p className="text-sm font-semibold">Cómo funciona el sistema multi-proveedor</p>
                <ul className="text-xs text-muted-foreground space-y-1">
                  <li>• El agente de ventas usa el <strong className="text-white">proveedor principal</strong> para todas las conversaciones</li>
                  <li>• Si ese proveedor falla o tiene error, pasa automáticamente al siguiente <strong className="text-white">fallback</strong></li>
                  <li>• Las API Keys guardadas en DB solo aplican a este tenant. Las del <code className="bg-muted px-1 rounded">.env</code> son globales</li>
                  <li>• Puedes tener múltiples proveedores activos — el Arquitecto IA usará el principal para generar agentes</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
