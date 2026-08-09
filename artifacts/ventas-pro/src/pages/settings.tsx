import { useState, useEffect } from "react";
import { 
  useGetSettings, getGetSettingsQueryKey,
  useUpdateSettings
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { PaymentCredentials } from "@/components/payment-credentials";
import { EmailCredentials } from "@/components/email-credentials";
import { FacebookCredentials } from "@/components/facebook-credentials";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Save, X, Plus, Settings as SettingsIcon, ShieldCheck, Terminal, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { AIProviders } from "@/components/ai-providers";
import { TwoFactorSettings } from "@/components/two-factor-settings";
import { HelpTourButton } from "@/components/HelpTourButton";
import { useAutoTour } from "@/hooks/use-auto-tour";
import { getHelpGuide } from "@/data/help-guides";

const HELP_GUIDE = getHelpGuide("settings")!;

export default function Settings() {
  useAutoTour(HELP_GUIDE);
  const queryClient = useQueryClient();
  const { data: settings, isLoading } = useGetSettings({
    query: { queryKey: getGetSettingsQueryKey() }
  });

  const updateSettings = useUpdateSettings();

  const [formData, setFormData] = useState({
    businessName: "",
    businessDescription: "",
    timezone: "",
    workingHoursStart: "",
    workingHoursEnd: "",
    autoReplyEnabled: false,
    offHoursMessage: "",
    escalationKeywords: [] as string[],
    aiProvider: "github" as "github" | "github_copilot_internal" | "ollama_local" | "openai_default" | "nvidia" | "g4f" | "opencode",
    githubToken: "",
    githubModel: "gpt-4o-mini",
    copilotSessionToken: "",
    copilotSessionExpiresAt: "",
    nvidiaApiKey: "",
    nvidiaModel: "meta/llama-3.1-70b-instruct",
    ollamaUrl: "",
    ollamaModel: "hermes3:8b"
  });

  const [keywordInput, setKeywordInput] = useState("");

  const [deviceFlow, setDeviceFlow] = useState({
    active: false,
    userCode: "",
    deviceCode: "",
    verificationUri: "",
    status: "idle"
  });

  // Polling for Copilot token
  useEffect(() => {
    let interval: any;
    if (deviceFlow.active && deviceFlow.status === "pending") {
      interval = setInterval(async () => {
        try {
          const res = await fetch("/api/settings/copilot-device-token", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ device_code: deviceFlow.deviceCode })
          });
          const data = await res.json();
          if (data.success && data.token) {
            setFormData(prev => ({ ...prev, githubToken: data.token }));
            setDeviceFlow(prev => ({ ...prev, active: false, status: "success" }));
            toast.success("¡Cuenta de GitHub vinculada exitosamente!");
            clearInterval(interval);
          } else if (!data.success && data.status !== "pending") {
            // Un error real ocurrió (ej: expiró o fue denegado)
            setDeviceFlow(prev => ({ ...prev, active: false, status: "error" }));
            toast.error(data.error || "La autorización falló o expiró.");
            clearInterval(interval);
          }
        } catch (e) {
          console.error("Polling error", e);
        }
      }, 5000);
    }
    return () => clearInterval(interval);
  }, [deviceFlow.active, deviceFlow.status, deviceFlow.deviceCode]);

  useEffect(() => {
    if (settings) {
      setFormData({
        businessName: settings.businessName || "",
        businessDescription: settings.businessDescription || "",
        timezone: settings.timezone || "America/Mexico_City",
        workingHoursStart: settings.workingHoursStart || "09:00",
        workingHoursEnd: settings.workingHoursEnd || "18:00",
        autoReplyEnabled: settings.autoReplyEnabled ?? false,
        offHoursMessage: settings.offHoursMessage || "",
        escalationKeywords: settings.escalationKeywords || [],
        aiProvider: (settings as any).aiProvider || "github",
        githubToken: (settings as any).githubToken || "",
        githubModel: (settings as any).githubModel || "gpt-4o-mini",
        copilotSessionToken: (settings as any).copilotSessionToken || "",
        copilotSessionExpiresAt: (settings as any).copilotSessionExpiresAt || "",
        nvidiaApiKey: (settings as any).nvidiaApiKey || "",
        nvidiaModel: (settings as any).nvidiaModel || "meta/llama-3.1-70b-instruct",
        ollamaUrl: (settings as any).ollamaUrl || "",
        ollamaModel: (settings as any).ollamaModel || "hermes3:8b"
      });
    }
  }, [settings]);

  const handleSubmit = () => {
    updateSettings.mutate({ data: formData }, {
      onSuccess: () => {
        toast.success("Configuración guardada");
        queryClient.invalidateQueries({ queryKey: getGetSettingsQueryKey() });
      },
      onError: () => toast.error("Error al guardar configuración")
    });
  };

  const addKeyword = () => {
    const k = keywordInput.trim().toLowerCase();
    if (k && !formData.escalationKeywords.includes(k)) {
      setFormData(prev => ({
        ...prev,
        escalationKeywords: [...prev.escalationKeywords, k]
      }));
    }
    setKeywordInput("");
  };

  const removeKeyword = (k: string) => {
    setFormData(prev => ({
      ...prev,
      escalationKeywords: prev.escalationKeywords.filter(kw => kw !== k)
    }));
  };

  return (
    <Layout>
      <div className="flex flex-col gap-8 max-w-5xl mx-auto animate-enter">
        <div className="flex flex-col md:flex-row md:justify-between md:items-end gap-4">
          <div>
            <div className="flex items-start gap-1.5">
              <h1 className="text-3xl font-bold tracking-tight">Configuración</h1>
              <HelpTourButton guide={HELP_GUIDE} />
            </div>
            <p className="text-muted-foreground mt-1">Preferencias generales del negocio y comportamiento de IA.</p>
          </div>
        </div>

        {isLoading ? (
          <div className="grid gap-6 md:grid-cols-2">
            <Skeleton className="h-[400px] w-full rounded-3xl" />
            <Skeleton className="h-[400px] w-full rounded-3xl" />
            <Skeleton className="h-[300px] w-full rounded-3xl md:col-span-2" />
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2">
            {/* Primero de la lista a propósito: sin esto configurado, las
                ventas del negocio se cobran en la cuenta del servidor. */}
            <PaymentCredentials />
            <EmailCredentials />
            <FacebookCredentials />
            <TwoFactorSettings />

            <Card className="rounded-3xl border-0 shadow-lg glass-panel overflow-hidden relative">
              <div className="absolute top-0 right-0 w-full h-2 bg-gradient-to-r from-primary to-accent" />
              <CardHeader className="pt-8">
                <CardTitle className="text-xl flex items-center gap-2">
                  <div className="p-2 bg-primary/10 rounded-lg text-primary"><SettingsIcon className="h-5 w-5" /></div>
                  Perfil del Negocio
                </CardTitle>
                <CardDescription>Esta información sirve de contexto base para la inteligencia artificial.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="space-y-2">
                  <Label className="text-muted-foreground font-semibold uppercase tracking-wider text-[10px]">Nombre del Negocio</Label>
                  <Input 
                    value={formData.businessName} 
                    onChange={e => setFormData({...formData, businessName: e.target.value})} 
                    placeholder="Ej. VentasPro Inc."
                    className="font-medium bg-muted/30"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-muted-foreground font-semibold uppercase tracking-wider text-[10px]">Zona Horaria</Label>
                  <Input 
                    value={formData.timezone} 
                    onChange={e => setFormData({...formData, timezone: e.target.value})} 
                    placeholder="America/Mexico_City"
                    className="bg-muted/30"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-muted-foreground font-semibold uppercase tracking-wider text-[10px]">Descripción del Negocio</Label>
                  <Textarea 
                    value={formData.businessDescription} 
                    onChange={e => setFormData({...formData, businessDescription: e.target.value})} 
                    placeholder="¿A qué se dedica tu negocio? ¿Cuáles son sus valores?"
                    className="h-32 resize-none bg-muted/30"
                  />
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-3xl border-0 shadow-lg glass-panel overflow-hidden relative">
              <div className="absolute top-0 right-0 w-full h-2 bg-gradient-to-r from-accent to-purple-500" />
              <CardHeader className="pt-8">
                <CardTitle className="text-xl">Horario y Respuestas</CardTitle>
                <CardDescription>Define cuándo los agentes IA deben responder o enviar mensaje de fuera de horario.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid gap-4 grid-cols-2">
                  <div className="space-y-2">
                    <Label className="text-muted-foreground font-semibold uppercase tracking-wider text-[10px]">Hora de Inicio</Label>
                    <Input 
                      type="time"
                      value={formData.workingHoursStart} 
                      onChange={e => setFormData({...formData, workingHoursStart: e.target.value})} 
                      className="bg-muted/30 font-mono"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-muted-foreground font-semibold uppercase tracking-wider text-[10px]">Hora de Fin</Label>
                    <Input 
                      type="time"
                      value={formData.workingHoursEnd} 
                      onChange={e => setFormData({...formData, workingHoursEnd: e.target.value})} 
                      className="bg-muted/30 font-mono"
                    />
                  </div>
                </div>
                
                <div className="flex items-center justify-between border rounded-2xl p-5 bg-muted/20 shadow-inner">
                  <div className="space-y-1 pr-4">
                    <Label className="font-semibold">Respuestas Automáticas</Label>
                    <p className="text-xs text-muted-foreground leading-relaxed">Enviar mensaje especial automáticamente cuando estés fuera de horario de atención</p>
                  </div>
                  <Switch 
                    checked={formData.autoReplyEnabled}
                    onCheckedChange={c => setFormData({...formData, autoReplyEnabled: c})}
                    className="shrink-0"
                  />
                </div>

                {formData.autoReplyEnabled && (
                  <div className="space-y-2 animate-in fade-in slide-in-from-top-4">
                    <Label className="text-muted-foreground font-semibold uppercase tracking-wider text-[10px]">Mensaje Fuera de Horario</Label>
                    <Textarea 
                      value={formData.offHoursMessage} 
                      onChange={e => setFormData({...formData, offHoursMessage: e.target.value})} 
                      placeholder="Gracias por comunicarte. Nuestro horario es de..."
                      className="h-24 resize-none bg-muted/30"
                    />
                  </div>
                )}
              </CardContent>
            </Card>

            <Card data-tour="settings-ai-provider" className="rounded-3xl border-0 shadow-lg glass-panel overflow-hidden relative md:col-span-2">
              <div className="absolute top-0 right-0 w-full h-2 bg-gradient-to-r from-blue-500 to-primary" />
              <CardHeader className="pt-8">
                <CardTitle className="text-xl">Configuración de Inteligencia Artificial</CardTitle>
                <CardDescription>Configura el motor de razonamiento para tus agentes (Copilot, Ollama u OpenAI).</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-6 md:grid-cols-2">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-muted-foreground font-semibold uppercase tracking-wider text-[10px]">Proveedor Principal</Label>
                    <select 
                      value={formData.aiProvider}
                      onChange={e => setFormData({...formData, aiProvider: e.target.value as any})}
                      className="w-full h-10 rounded-xl border border-input bg-muted/30 px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                    >
                      <option value="opencode">OpenCode Zen (Gratis, con rotación de modelos)</option>
                      <option value="mimo">Xiaomi MiMo (requiere MIMO_API_KEY)</option>
                      <option value="github_copilot_internal">GitHub Copilot Internal (VS Code Flow)</option>
                      <option value="github">GitHub Models (Azure)</option>
                      <option value="nvidia">NVIDIA NIM (High Performance)</option>
                      <option value="ollama_local">Ollama (Local)</option>
                      <option value="openai_default">OpenAI Direct</option>
                      <option value="g4f">G4F (111+ Proveedores Gratis)</option>
                    </select>
                  </div>

                  {/* AI Connection Status */}
                  <div className="flex items-center gap-2 p-3 bg-muted/20 rounded-xl border border-white/5">
                    {(() => {
                      if (formData.aiProvider === "opencode") {
                        return (
                          <>
                            <div className="h-2 w-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]" />
                            <span className="text-[10px] font-bold uppercase tracking-wider text-green-400">
                              OpenCode Zen API directa (opencode.ai)
                            </span>
                          </>
                        );
                      } else if (formData.aiProvider === "github_copilot_internal") {
                        const isActive = formData.copilotSessionToken && new Date(formData.copilotSessionExpiresAt) > new Date();
                        const isExpired = formData.copilotSessionToken && !isActive;
                        return (
                          <>
                            <div className={`h-2 w-2 rounded-full ${isActive ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]' : isExpired ? 'bg-yellow-500' : 'bg-red-500'}`} />
                            <span className="text-[10px] font-bold uppercase tracking-wider">
                              {isActive ? `Sesión Copilot Activa (Expira: ${new Date(formData.copilotSessionExpiresAt).toLocaleTimeString()})` 
                                : isExpired ? 'Sesión Copilot Expirada (Se renovará al usar)' 
                                : 'Copilot Sin Conexión (Requiere Auth)'}
                            </span>
                          </>
                        );
                      } else if (formData.aiProvider === "github") {
                        const hasToken = !!formData.githubToken;
                        return (
                          <>
                            <div className={`h-2 w-2 rounded-full ${hasToken ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]' : 'bg-red-500'}`} />
                            <span className="text-[10px] font-bold uppercase tracking-wider">
                              {hasToken ? 'Conectado a GitHub Models' : 'Sin Conexión (Falta Token)'}
                            </span>
                          </>
                        );
                      } else if (formData.aiProvider === "nvidia") {
                        const hasToken = !!formData.nvidiaApiKey;
                        return (
                          <>
                            <div className={`h-2 w-2 rounded-full ${hasToken ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]' : 'bg-red-500'}`} />
                            <span className="text-[10px] font-bold uppercase tracking-wider">
                              {hasToken ? 'Conectado a NVIDIA NIM' : 'Sin Conexión (Falta API Key)'}
                            </span>
                          </>
                        );
                      } else if (formData.aiProvider === "ollama_local") {
                        const hasUrl = !!formData.ollamaUrl;
                        return (
                          <>
                            <div className={`h-2 w-2 rounded-full ${hasUrl ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]' : 'bg-red-500'}`} />
                            <span className="text-[10px] font-bold uppercase tracking-wider">
                              {hasUrl ? 'Configurado para Ollama Local' : 'Falta URL de Ollama'}
                            </span>
                          </>
                        );
                      } else if (formData.aiProvider === "g4f") {
                        return (
                          <>
                            <div className="h-2 w-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]" />
                            <span className="text-[10px] font-bold uppercase tracking-wider">
                              G4F (111+ Proveedores Gratis - Auto Fallover)
                            </span>
                          </>
                        );
                      } else {
                        return (
                          <>
                            <div className="h-2 w-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]" />
                            <span className="text-[10px] font-bold uppercase tracking-wider">
                              Conectado (OpenAI Default)
                            </span>
                          </>
                        );
                      }
                    })()}
                  </div>
                  {/* Configuración GitHub Copilot */}
                  {(formData.aiProvider === "github" || formData.aiProvider === "github_copilot_internal") && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-left-4">
                      {/* Opción 1: Token Directo */}
                      <div className="p-5 rounded-2xl border border-primary/20 bg-primary/5 space-y-4">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-primary/20 rounded-lg text-primary">
                            <ShieldCheck className="h-5 w-5" />
                          </div>
                          <div>
                            <h4 className="text-sm font-bold">Conexión rápida con tu token</h4>
                            <p className="text-[10px] text-muted-foreground uppercase font-semibold">Usa el Personal Access Token (PAT) que ya tienes.</p>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Input 
                            type="password"
                            value={formData.githubToken || ""} 
                            onChange={e => setFormData({...formData, githubToken: e.target.value})} 
                            placeholder="ghp_..."
                            className="bg-background/50 border-primary/10"
                          />
                        </div>
                        <Button 
                          variant="default" 
                          className="w-full bg-primary hover:bg-primary/90 text-white font-bold h-11 rounded-xl"
                          onClick={async () => {
                            if (!formData.githubToken) return toast.error("Ingresa un Token de GitHub primero");
                            const loadingToast = toast.loading("Verificando token...");
                            try {
                              const res = await fetch("/api/settings/copilot-token", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ githubToken: formData.githubToken })
                              });
                              const data = await res.json();
                              if (data.success) {
                                toast.success("¡Token verificado correctamente!", { id: loadingToast });
                              } else {
                                toast.error(data.error || "Token inválido", { id: loadingToast });
                              }
                            } catch (e) {
                              toast.error("Error de conexión", { id: loadingToast });
                            }
                          }}
                        >
                          <Plus className="h-4 w-4 mr-2" /> Conectar con mi token de GitHub
                        </Button>
                      </div>

                      {/* Opción 2: Código de Dispositivo (NUEVO) */}
                      <div className="p-6 rounded-3xl border border-white/10 bg-black/20 backdrop-blur-md shadow-2xl relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                          <Terminal className="h-20 w-20" />
                        </div>
                        
                        <div className="relative z-10 space-y-6">
                          <div className="flex items-start gap-4">
                            <div className="p-3 bg-gradient-to-br from-primary/20 to-accent/20 rounded-2xl text-primary border border-primary/20">
                              <Terminal className="h-6 w-6" />
                            </div>
                            <div>
                              <h4 className="text-lg font-bold tracking-tight">Autorización Inteligente</h4>
                              <p className="text-xs text-muted-foreground max-w-[250px]">Vincula tu cuenta de GitHub sin necesidad de crear un PAT manualmente.</p>
                            </div>
                          </div>

                          {!deviceFlow.active ? (
                            <div className="space-y-6 animate-in fade-in duration-500">
                              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                                {["GPT-4o", "Claude 3.5", "o1", "o3", "Llama 3"].map(m => (
                                  <div key={m} className="flex flex-col items-center gap-1">
                                    <div className="w-full h-1 bg-gradient-to-r from-transparent via-primary/30 to-transparent rounded-full" />
                                    <span className="text-[8px] font-bold text-muted-foreground uppercase">{m}</span>
                                  </div>
                                ))}
                              </div>
                              
                              <Button 
                                variant="outline" 
                                className="w-full h-14 rounded-2xl border-primary/30 hover:border-primary/60 hover:bg-primary/5 font-bold text-sm transition-all shadow-lg hover:shadow-primary/10"
                                onClick={async () => {
                                  const loadingToast = toast.loading("Conectando con GitHub Auth Service...");
                                  try {
                                    const res = await fetch("/api/settings/copilot-device-code", { method: "POST" });
                                    const data = await res.json();
                                    if (data.user_code) {
                                      setDeviceFlow({
                                        active: true,
                                        userCode: data.user_code,
                                        deviceCode: data.device_code,
                                        verificationUri: data.verification_uri,
                                        status: "pending"
                                      });
                                      toast.success("¡Código listo! Sigue las instrucciones.", { id: loadingToast });
                                    } else {
                                      toast.error("GitHub no respondió correctamente.", { id: loadingToast });
                                    }
                                  } catch (e) {
                                    toast.error("Error de conexión con el servidor", { id: loadingToast });
                                  }
                                }}
                              >
                                <Plus className="h-5 w-5 mr-3 text-primary animate-pulse" /> Generar Código de Vinculación
                              </Button>
                            </div>
                          ) : (
                            <div className="space-y-6 animate-in zoom-in-95 duration-300">
                              <div className="space-y-2">
                                <p className="text-[10px] font-bold text-primary uppercase tracking-widest text-center">Paso 1: Entra en GitHub</p>
                                <p className="text-xs text-center text-muted-foreground">
                                  Visita <a href={deviceFlow.verificationUri} target="_blank" rel="noreferrer" className="text-primary hover:text-primary/80 underline font-bold decoration-2 underline-offset-4">github.com/login/device</a>
                                </p>
                              </div>

                              <div className="space-y-3">
                                <p className="text-[10px] font-bold text-primary uppercase tracking-widest text-center">Paso 2: Ingresa este código</p>
                                <div className="flex items-center gap-3">
                                  <div 
                                    className="flex-1 bg-black/60 border-2 border-primary/30 rounded-2xl p-5 text-center tracking-[0.3em] font-mono text-3xl font-black text-white shadow-inner cursor-pointer hover:border-primary/60 transition-colors"
                                    onClick={() => {
                                      navigator.clipboard.writeText(deviceFlow.userCode);
                                      toast.success("¡Código copiado al portapapeles!");
                                    }}
                                  >
                                    {deviceFlow.userCode}
                                  </div>
                                  <Button 
                                    variant="outline" 
                                    size="icon" 
                                    className="h-[76px] w-14 rounded-2xl border-white/10 bg-white/5 hover:bg-white/10"
                                    onClick={() => {
                                      navigator.clipboard.writeText(deviceFlow.userCode);
                                      toast.success("¡Código copiado!");
                                    }}
                                  >
                                    <Save className="h-5 w-5" />
                                  </Button>
                                </div>
                              </div>

                              <div className="p-4 bg-primary/5 rounded-2xl border border-primary/10 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  <div className="relative">
                                    <div className="h-3 w-3 rounded-full bg-primary animate-ping absolute" />
                                    <div className="h-3 w-3 rounded-full bg-primary relative" />
                                  </div>
                                  <span className="text-[10px] font-bold uppercase tracking-tight">Sincronizando con GitHub...</span>
                                </div>
                                <div className="flex gap-4">
                                  <button 
                                    onClick={() => window.open(deviceFlow.verificationUri, "_blank")} 
                                    className="text-[10px] font-black uppercase text-primary hover:underline"
                                  >
                                    Abrir Web ↗
                                  </button>
                                  <button 
                                    onClick={() => setDeviceFlow({ ...deviceFlow, active: false })} 
                                    className="text-[10px] font-black uppercase text-muted-foreground hover:text-foreground"
                                  >
                                    Cancelar
                                  </button>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>


                      <div className="space-y-2">
                        <Label className="text-muted-foreground font-semibold uppercase tracking-wider text-[10px]">Modelo de GitHub</Label>
                        <Input 
                          value={formData.githubModel} 
                          onChange={e => setFormData({...formData, githubModel: e.target.value})} 
                          placeholder="gpt-4o-mini"
                          className="bg-muted/30 font-mono"
                        />
                      </div>
                    </div>
                  )}

                  {formData.aiProvider === "nvidia" && (
                    <div className="space-y-4 animate-in fade-in slide-in-from-left-4">
                      <div className="p-5 rounded-2xl border border-primary/20 bg-primary/5 space-y-4">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-primary/20 rounded-lg text-primary">
                            <ShieldCheck className="h-5 w-5" />
                          </div>
                          <div>
                            <h4 className="text-sm font-bold">NVIDIA NIM Configuration</h4>
                            <p className="text-[10px] text-muted-foreground uppercase font-semibold">Usa modelos de alto rendimiento como Llama 3.1 70B.</p>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-muted-foreground font-semibold uppercase tracking-wider text-[10px]">API Key</Label>
                          <Input 
                            type="password"
                            value={formData.nvidiaApiKey || ""} 
                            onChange={e => setFormData({...formData, nvidiaApiKey: e.target.value})} 
                            placeholder="nvapi-..."
                            className="bg-background/50 border-primary/10"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-muted-foreground font-semibold uppercase tracking-wider text-[10px]">Modelo</Label>
                          <Input 
                            value={formData.nvidiaModel} 
                            onChange={e => setFormData({...formData, nvidiaModel: e.target.value})} 
                            placeholder="meta/llama-3.1-70b-instruct"
                            className="bg-muted/30 font-mono"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {formData.aiProvider === "ollama_local" && (
                    <div className="space-y-4 animate-in fade-in slide-in-from-left-4">
                      <div className="space-y-2">
                        <Label className="text-muted-foreground font-semibold uppercase tracking-wider text-[10px]">Ollama URL</Label>
                        <Input 
                          value={formData.ollamaUrl || ""} 
                          onChange={e => setFormData({...formData, ollamaUrl: e.target.value})} 
                          placeholder="http://localhost:11434"
                          className="bg-muted/30"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-muted-foreground font-semibold uppercase tracking-wider text-[10px]">Modelo de Ollama</Label>
                        <Input 
                          value={formData.ollamaModel} 
                          onChange={e => setFormData({...formData, ollamaModel: e.target.value})} 
                          placeholder="llama3.1"
                          className="bg-muted/30 font-mono"
                        />
                      </div>
                    </div>
                  )}

                  {formData.aiProvider === "g4f" && (
                    <div className="space-y-4 animate-in fade-in slide-in-from-left-4">
                      <div className="p-5 rounded-2xl border border-primary/20 bg-primary/5 space-y-3">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-primary/20 rounded-lg text-primary">
                            <Sparkles className="h-5 w-5" />
                          </div>
                          <div>
                            <h4 className="text-sm font-bold">G4F (111+ Proveedores Gratis)</h4>
                            <p className="text-[10px] text-muted-foreground uppercase font-semibold">Rotación automática entre más de 111 proveedores gratuitos.</p>
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed pt-2">
                          G4F usa rotación inteligente entre más de 111 proveedores gratuitos.{" "}
                          No necesita API keys — funciona con su propio pool de proveedores públicos.{" "}
                          Configura <code className="text-primary">G4F_ENABLED=true</code> en las variables de entorno.
                        </p>
                      </div>
                    </div>
                  )}

                  {formData.aiProvider === "opencode" && (
                    <div className="space-y-4 animate-in fade-in slide-in-from-left-4">
                      <div className="p-5 rounded-2xl border border-primary/20 bg-primary/5 space-y-3">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-primary/20 rounded-lg text-primary">
                            <Sparkles className="h-5 w-5 animate-pulse" />
                          </div>
                          <div>
                            <h4 className="text-sm font-bold">OpenCode Zen (Gratuito)</h4>
                            <p className="text-[10px] text-muted-foreground uppercase font-semibold">Usa modelos ilimitados y gratuitos de OpenCode.</p>
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed pt-2">
                          Conecta directo a <code className="text-primary">opencode.ai/zen/v1</code>. Configura{" "}
                          <code className="text-primary">OPENCODE_API_KEY</code> y opcionalmente{" "}
                          <code className="text-primary">OPENCODE_MODEL</code> en las variables de entorno del servidor.
                        </p>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-muted-foreground font-semibold uppercase tracking-wider text-[10px]">Modelo preferido</Label>
                        <select
                          value={formData.githubModel || "nemotron-3-ultra-free"}
                          onChange={e => setFormData({...formData, githubModel: e.target.value})}
                          className="w-full h-10 rounded-md border border-input bg-muted/30 px-3 font-mono text-sm"
                        >
                          <option value="nemotron-3-ultra-free">nemotron-3-ultra-free — verificado ✅</option>
                          <option value="mimo-v2.5-free">mimo-v2.5-free</option>
                          <option value="ling-3.0-flash-free">ling-3.0-flash-free</option>
                          <option value="big-pickle">big-pickle</option>
                          <option value="hy3-free">hy3-free</option>
                          <option value="deepseek-v4-flash-free">deepseek-v4-flash-free</option>
                        </select>
                        <p className="text-[9px] text-muted-foreground leading-relaxed">
                          🔄 Si el modelo elegido agota su cuota gratis (error 429), el sistema <strong>rota solo</strong> al
                          siguiente de la lista, y solo abandona OpenCode si fallan todos.
                          <br />
                          ⚠️ <code className="text-primary">north-mini-code-free</code> queda fuera a propósito: responde
                          pero con contenido vacío.
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                <div className="bg-muted/20 rounded-2xl p-5 border border-dashed flex flex-col justify-center gap-3">
                  <h4 className="font-bold text-sm flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-green-500" /> Nota sobre Suscripción
                  </h4>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Requiere suscripción activa a GitHub Copilot. Los modelos de Claude y Gemini estarán disponibles según tu plan.
                  </p>
                  <div className="mt-2 p-3 bg-primary/5 rounded-xl border border-primary/10">
                    <p className="text-[10px] text-primary font-bold uppercase mb-1">Capacidades Activas</p>
                    <ul className="text-[10px] space-y-1 text-muted-foreground">
                      <li>• GPT-4o y Claude 3.5 Sonnet soportados</li>
                      <li>• Razonamiento por etapas habilitado</li>
                      <li>• Memoria de corto y mediano plazo activa</li>
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Alta de claves y elección de modelo por proveedor. Las claves se
                guardan cifradas y el backend las carga al entorno para usarlas. */}
            <Card className="rounded-3xl border-0 shadow-lg glass-panel overflow-hidden md:col-span-2 relative">
              <div className="absolute top-0 right-0 w-full h-2 bg-gradient-to-r from-indigo-500 to-emerald-500" />
              <CardHeader className="pt-8">
                <CardTitle className="text-xl">Proveedores y modelos de IA</CardTitle>
                <CardDescription className="mt-1 max-w-2xl">
                  Añade la clave de cada proveedor y elige el modelo de una lista real. Los gratuitos
                  funcionan sin pagar; los de pago son opcionales, para más rendimiento.
                </CardDescription>
              </CardHeader>
              <CardContent className="pb-8">
                <AIProviders />
              </CardContent>
            </Card>

            <Card className="rounded-3xl border-0 shadow-lg glass-panel overflow-hidden md:col-span-2 relative">
              <div className="absolute top-0 right-0 w-full h-2 bg-gradient-to-r from-purple-500 to-coral" />
              <CardHeader className="pt-8 md:flex-row md:justify-between md:items-center">
                <div>
                  <CardTitle className="text-xl">Escalamiento a Humanos</CardTitle>
                  <CardDescription className="mt-1 max-w-xl">Palabras clave que al ser detectadas en el mensaje del cliente, pausarán la IA inmediatamente y notificarán a un asesor.</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex flex-col md:flex-row gap-4">
                  <div className="flex-1" data-tour="settings-escalation-keywords">
                    <div className="flex gap-2">
                      <Input
                        value={keywordInput}
                        onChange={e => setKeywordInput(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addKeyword())}
                        placeholder="Ej. 'hablar con persona', 'queja', 'soporte'"
                        className="bg-muted/30 rounded-xl"
                      />
                      <Button variant="secondary" onClick={addKeyword} className="rounded-xl"><Plus className="h-4 w-4 mr-2"/> Agregar</Button>
                    </div>
                  </div>
                  <div className="flex-1">
                    <div className="flex flex-wrap gap-2 min-h-[3rem] p-4 border rounded-2xl bg-muted/10 shadow-inner">
                      {formData.escalationKeywords.length === 0 ? (
                        <span className="text-sm text-muted-foreground italic flex items-center justify-center w-full">No hay palabras clave definidas.</span>
                      ) : (
                        formData.escalationKeywords.map(k => (
                          <Badge key={k} variant="secondary" className="pl-3 pr-1.5 py-1.5 gap-1.5 text-sm bg-background border shadow-sm font-medium">
                            {k}
                            <button 
                              onClick={() => removeKeyword(k)}
                              className="hover:bg-destructive/10 hover:text-destructive rounded-full p-1 transition-colors"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </Badge>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
        
        {/* Fixed Save Button Bottom */}
        <div className="sticky bottom-[calc(88px+env(safe-area-inset-bottom))] md:bottom-6 flex justify-center md:justify-end z-20 mt-4 pointer-events-none">
          <Button
            data-tour="settings-save-button"
            className="rounded-full shadow-xl shadow-primary/20 h-14 px-8 text-base pointer-events-auto transition-transform hover:scale-105"
            onClick={handleSubmit}
            disabled={updateSettings.isPending}
          >
            <Save className="h-5 w-5 mr-2" /> Guardar Todos los Cambios
          </Button>
        </div>
      </div>
    </Layout>
  );
}
