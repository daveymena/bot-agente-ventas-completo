import { useState, useEffect } from "react";
import { 
  useGetSettings, getGetSettingsQueryKey,
  useUpdateSettings
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Save, X, Plus, Settings as SettingsIcon, ShieldCheck, Terminal } from "lucide-react";
import { toast } from "sonner";

export default function Settings() {
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
    aiProvider: "github" as "github" | "github_copilot_internal" | "ollama_local" | "openai_default" | "nvidia",
    githubToken: "",
    githubModel: "gpt-4o-mini",
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
            <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-br from-foreground to-foreground/70 bg-clip-text text-transparent">Configuración</h1>
            <p className="text-muted-foreground mt-1">Preferencias generales del negocio y comportamiento de IA.</p>
          </div>
        </div>

        {isLoading ? (
          <div className="grid gap-6 md:grid-cols-2">
            <Skeleton className="h-[400px] w-full rounded-3xl" />
            <Skeleton className="h-[400px] w-full rounded-3xl" />
            <Skeleton className="h-[300px] w-full rounded-3xl md:col-span-2" />
            <Card className="rounded-3xl border-0 shadow-lg glass-panel overflow-hidden md:col-span-2 relative">
              <div className="absolute top-0 right-0 w-full h-2 bg-gradient-to-r from-orange-500 to-yellow-500" />
              <CardHeader className="pt-8">
                <CardTitle className="text-xl">Sincronización y Despliegue</CardTitle>
                <CardDescription>Sincroniza los cambios locales con tu repositorio de GitHub.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col md:flex-row items-center gap-6">
                <div className="flex-1 space-y-4">
                  <div className="p-4 bg-muted/20 rounded-2xl border border-white/5">
                    <h4 className="text-sm font-bold flex items-center gap-2 mb-2">
                      <Terminal className="h-4 w-4 text-primary" /> Estado de Git
                    </h4>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Al presionar el botón inferior, el sistema ejecutará <code className="bg-muted px-1 rounded">git add .</code>, <code className="bg-muted px-1 rounded">git commit</code> y <code className="bg-muted px-1 rounded">git push</code> automáticamente hacia tu rama principal.
                    </p>
                  </div>
                </div>
                <div className="flex flex-col gap-3 w-full md:w-auto">
                  <Button 
                    variant="outline" 
                    className="h-14 px-8 rounded-2xl border-primary/20 hover:bg-primary/10 group transition-all"
                    onClick={async () => {
                      const confirm = window.confirm("¿Estás seguro de subir todos los cambios a GitHub?");
                      if (!confirm) return;
                      
                      const loadingToast = toast.loading("Sincronizando con GitHub...");
                      try {
                        const res = await fetch("/api/sync/push", { method: "POST" });
                        const data = await res.json();
                        if (data.success) {
                          toast.success(data.message, { id: loadingToast });
                        } else {
                          toast.error(data.error || data.message, { id: loadingToast });
                        }
                      } catch (e) {
                        toast.error("Error crítico de conexión", { id: loadingToast });
                      }
                    }}
                  >
                    <Save className="h-5 w-5 mr-2 group-hover:animate-bounce" /> Subir Cambios a Git
                  </Button>
                  <p className="text-[10px] text-center text-muted-foreground uppercase font-bold tracking-widest">Rama: main</p>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2">
            <Card className="rounded-3xl border-0 shadow-lg glass-panel overflow-hidden md:col-span-2 relative">
              <div className="absolute top-0 right-0 w-full h-2 bg-gradient-to-r from-orange-500 to-yellow-500" />
              <CardHeader className="pt-8">
                <CardTitle className="text-xl">Sincronización y Despliegue</CardTitle>
                <CardDescription>Sincroniza los cambios locales con tu repositorio de GitHub.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col md:flex-row items-center gap-6">
                <div className="flex-1 space-y-4">
                  <div className="p-4 bg-muted/20 rounded-2xl border border-white/5">
                    <h4 className="text-sm font-bold flex items-center gap-2 mb-2">
                      <Terminal className="h-4 w-4 text-primary" /> Estado de Git
                    </h4>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Al presionar el botón inferior, el sistema ejecutará <code className="bg-muted px-1 rounded">git add .</code>, <code className="bg-muted px-1 rounded">git commit</code> y <code className="bg-muted px-1 rounded">git push</code> automáticamente hacia tu rama principal.
                    </p>
                  </div>
                </div>
                <div className="flex flex-col gap-3 w-full md:w-auto">
                  <Button 
                    variant="outline" 
                    className="h-14 px-8 rounded-2xl border-primary/20 hover:bg-primary/10 group transition-all"
                    onClick={async () => {
                      const confirm = window.confirm("¿Estás seguro de subir todos los cambios a GitHub?");
                      if (!confirm) return;
                      
                      const loadingToast = toast.loading("Sincronizando con GitHub...");
                      try {
                        const res = await fetch("/api/sync/push", { method: "POST" });
                        const data = await res.json();
                        if (data.success) {
                          toast.success(data.message, { id: loadingToast });
                        } else {
                          toast.error(data.error || data.message, { id: loadingToast });
                        }
                      } catch (e) {
                        toast.error("Error crítico de conexión", { id: loadingToast });
                      }
                    }}
                  >
                    <Save className="h-5 w-5 mr-2 group-hover:animate-bounce" /> Subir Cambios a Git
                  </Button>
                  <p className="text-[10px] text-center text-muted-foreground uppercase font-bold tracking-widest">Rama: main</p>
                </div>
              </CardContent>
            </Card>

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

            <Card className="rounded-3xl border-0 shadow-lg glass-panel overflow-hidden relative md:col-span-2">
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
                      <option value="github_copilot_internal">GitHub Copilot Internal (VS Code Flow)</option>
                      <option value="github">GitHub Models (Azure)</option>
                      <option value="nvidia">NVIDIA NIM (High Performance)</option>
                      <option value="ollama_local">Ollama (Local)</option>
                      <option value="openai_default">OpenAI Direct</option>
                    </select>
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
                      <div className="p-5 rounded-2xl border border-white/5 bg-muted/20 space-y-4">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-muted rounded-lg text-muted-foreground">
                            <Terminal className="h-5 w-5" />
                          </div>
                          <div>
                            <h4 className="text-sm font-bold">Autorización por código (alternativo)</h4>
                            <p className="text-[10px] text-muted-foreground uppercase font-semibold">Genera un código, visita GitHub y autoriza manualmente.</p>
                          </div>
                        </div>

                        {!deviceFlow.active ? (
                          <>
                            <div className="grid grid-cols-4 gap-2">
                              {["gpt-4o", "gpt-4o-mini", "claude-3.5-sonnet", "o1", "o3-mini"].map(m => (
                                <Badge key={m} variant="secondary" className="justify-center text-[9px] py-1 bg-background/50 border-white/5">{m}</Badge>
                              ))}
                            </div>
                            <Button 
                              variant="outline" 
                              className="w-full h-11 rounded-xl border-white/10 hover:bg-white/5 font-bold"
                              onClick={async () => {
                                const loadingToast = toast.loading("Solicitando código a GitHub...");
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
                                    toast.success("Código generado. Por favor autoriza en GitHub.", { id: loadingToast });
                                  } else {
                                    toast.error("No se pudo generar el código", { id: loadingToast });
                                  }
                                } catch (e) {
                                  toast.error("Error de red", { id: loadingToast });
                                }
                              }}
                            >
                              <SettingsIcon className="h-4 w-4 mr-2" /> Iniciar con código de autorización
                            </Button>
                          </>
                        ) : (
                          <div className="space-y-4 animate-in zoom-in-95 duration-200">
                            <p className="text-xs text-center">Visita <a href={deviceFlow.verificationUri} target="_blank" rel="noreferrer" className="text-green-500 underline font-bold">este enlace</a> e introduce el código para conectar tu cuenta.</p>
                            <div className="flex items-center gap-2">
                              <div className="flex-1 bg-black/40 border border-white/10 rounded-xl p-4 text-center tracking-[0.5em] font-mono text-xl font-bold">
                                {deviceFlow.userCode}
                              </div>
                              <Button 
                                variant="outline" 
                                size="icon" 
                                className="h-14 w-14 rounded-xl"
                                onClick={() => {
                                  navigator.clipboard.writeText(deviceFlow.userCode);
                                  toast.success("Código copiado");
                                }}
                              >
                                <Save className="h-5 w-5" />
                              </Button>
                            </div>
                            <div className="flex justify-between items-center text-[10px]">
                              <div className="flex items-center gap-2 text-green-500">
                                <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                                Esperando autorización...
                              </div>
                              <div className="flex gap-4">
                                <button onClick={() => window.open(deviceFlow.verificationUri, "_blank")} className="hover:underline font-bold">Abrir GitHub ↗</button>
                                <button onClick={() => setDeviceFlow({ ...deviceFlow, active: false })} className="text-muted-foreground hover:text-foreground">Cancelar</button>
                              </div>
                            </div>
                          </div>
                        )}
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
                  <div className="flex-1">
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
        <div className="sticky bottom-6 flex justify-end z-20 mt-4 pointer-events-none">
          <Button 
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