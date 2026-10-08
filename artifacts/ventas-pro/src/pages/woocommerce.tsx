import { useState, useEffect } from "react";
import { SecretInput } from "@/components/ui/secret-input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, CheckCircle2, XCircle, RefreshCw, ShoppingCart, Package } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Layout } from "@/components/layout";
import { HelpTourButton } from "@/components/HelpTourButton";
import { useAutoTour } from "@/hooks/use-auto-tour";
import { getHelpGuide } from "@/data/help-guides";

const HELP_GUIDE = getHelpGuide("woocommerce")!;

// Helper para hacer requests
const apiRequest = async (endpoint: string, options: RequestInit = {}) => {
  const response = await fetch(`/api${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
    credentials: "include",
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Error desconocido" }));
    throw new Error(error.error || error.message || "Error en la solicitud");
  }

  return response.json();
};

interface WooCommerceConfig {
  enabled: boolean;
  storeUrl: string;
  consumerKey: string;
  consumerSecret: string;
  syncProducts: boolean;
  autoCreateOrders: boolean;
  syncInterval: number;
  lastSync: string | null;
  hasCredentials: boolean;
}

export default function WooCommercePage() {
  useAutoTour(HELP_GUIDE);
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<"success" | "error" | null>(null);

  const [config, setConfig] = useState<WooCommerceConfig>({
    enabled: false,
    storeUrl: "",
    consumerKey: "",
    consumerSecret: "",
    syncProducts: false,
    autoCreateOrders: false,
    syncInterval: 60,
    lastSync: null,
    hasCredentials: false,
  });

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      setLoading(true);
      const data = await apiRequest("/woocommerce/config");
      setConfig(data);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Error cargando configuración",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);

      // Validaciones
      if (config.enabled && !config.storeUrl) {
        toast({
          title: "Error",
          description: "La URL de la tienda es requerida",
          variant: "destructive",
        });
        return;
      }

      if (config.enabled && (!config.hasCredentials && (!config.consumerKey || !config.consumerSecret))) {
        toast({
          title: "Error",
          description: "Consumer Key y Consumer Secret son requeridos",
          variant: "destructive",
        });
        return;
      }

      await apiRequest("/woocommerce/config", {
        method: "PUT",
        body: JSON.stringify(config),
      });

      toast({
        title: "✅ Configuración guardada",
        description: "La configuración de WooCommerce se guardó exitosamente",
      });

      // Recargar configuración
      await loadConfig();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Error guardando configuración",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    try {
      setTesting(true);
      setConnectionStatus(null);

      const data = await apiRequest("/woocommerce/test-connection", {
        method: "POST",
      });

      if (data.success) {
        setConnectionStatus("success");
        toast({
          title: "✅ Conexión exitosa",
          description: "La conexión con WooCommerce fue exitosa",
        });
      } else {
        setConnectionStatus("error");
        toast({
          title: "❌ Error de conexión",
          description: data.error || "No se pudo conectar con WooCommerce",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      setConnectionStatus("error");
      toast({
        title: "❌ Error de conexión",
        description: error.message || "No se pudo conectar con WooCommerce",
        variant: "destructive",
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSyncProducts = async () => {
    try {
      setSyncing(true);

      const data = await apiRequest("/woocommerce/sync-products", {
        method: "POST",
      });

      toast({
        title: "✅ Sincronización completada",
        description: `${data.synced} productos sincronizados${
          data.errors > 0 ? `, ${data.errors} errores` : ""
        }`,
      });

      // Recargar configuración para actualizar lastSync
      await loadConfig();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Error sincronizando productos",
        variant: "destructive",
      });
    } finally {
      setSyncing(false);
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-[calc(100vh-200px)]">
          <div className="text-center space-y-4">
            <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto" />
            <p className="text-muted-foreground animate-pulse font-medium">Cargando integración...</p>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6 animate-enter max-w-7xl mx-auto">
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:justify-between md:items-end gap-6 mb-8">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center border border-primary/20 shadow-inner">
                <ShoppingCart className="h-6 w-6 text-primary" />
              </div>
              <h1 className="text-4xl font-extrabold tracking-tight bg-gradient-to-br from-foreground to-foreground/60 bg-clip-text text-transparent">
                WooCommerce
              </h1>
              <HelpTourButton guide={HELP_GUIDE} />
            </div>
            <p className="text-muted-foreground text-lg ml-1">
              Sincroniza tu catálogo y automatiza tus ventas en WhatsApp.
            </p>
          </div>
          <div className="flex gap-3">
            {config.enabled && config.hasCredentials && (
              <Button
                data-tour="woocommerce-sync-button"
                variant="outline"
                size="lg"
                onClick={handleSyncProducts}
                disabled={syncing}
                className="bg-card hover:bg-muted/50 border-border/50 shadow-sm rounded-xl px-6 transition-all"
              >
                {syncing ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-2 h-4 w-4" />
                )}
                Sincronizar Catálogo
              </Button>
            )}
            <Button 
              size="lg" 
              onClick={handleSave} 
              disabled={saving} 
              className="shadow-xl shadow-primary/25 rounded-xl px-8 bg-gradient-to-tr from-primary to-primary/80 hover:from-primary hover:to-primary transition-all active:scale-95"
            >
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Guardar Cambios
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
            {/* Configuración de Conexión */}
            <Card className="glass-panel overflow-hidden border-none shadow-2xl relative">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary/50 via-transparent to-primary/50 opacity-30" />
              <CardHeader className="bg-muted/5 border-b pb-6 px-8">
                <CardTitle className="text-2xl flex items-center gap-3">
                  <div className="p-2 bg-primary/10 rounded-lg">
                    <RefreshCw className="h-5 w-5 text-primary" />
                  </div>
                  Conexión con la Tienda
                </CardTitle>
                <CardDescription className="text-base">
                  Establece las credenciales REST API de tu WordPress.
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-8 px-8 space-y-8">
                <div className={`flex items-center justify-between p-5 rounded-2xl border transition-all duration-300 ${config.enabled ? 'bg-primary/5 border-primary/20 shadow-inner' : 'bg-muted/20 border-border/50'}`}>
                  <div className="space-y-1">
                    <Label className="text-lg font-bold">Habilitar Integración</Label>
                    <p className="text-sm text-muted-foreground">
                      Permite que VentasPro gestione tus productos y órdenes.
                    </p>
                  </div>
                  <Switch
                    data-tour="woocommerce-enable-toggle"
                    checked={config.enabled}
                    onCheckedChange={(checked) => setConfig({ ...config, enabled: checked })}
                    className="data-[state=checked]:bg-primary"
                  />
                </div>

                <div className="grid gap-6">
                  <div className="space-y-2.5">
                    <Label htmlFor="storeUrl" className="text-sm font-semibold uppercase tracking-wider text-muted-foreground ml-1">URL de la tienda (HTTPS)</Label>
                    <Input
                      id="storeUrl"
                      placeholder="https://mitienda.com"
                      value={config.storeUrl}
                      onChange={(e) => setConfig({ ...config, storeUrl: e.target.value })}
                      disabled={!config.enabled}
                      className="bg-background/40 h-12 rounded-xl border-border/40 focus:ring-primary/20 text-base"
                    />
                  </div>

                  <div className="grid md:grid-cols-2 gap-6">
                    <div className="space-y-2.5">
                      <Label htmlFor="consumerKey" className="text-sm font-semibold uppercase tracking-wider text-muted-foreground ml-1">Consumer Key</Label>
                      <SecretInput
                        id="consumerKey"
                        guardado={config.hasCredentials && ((config as any).consumerKeyUltimos4 || true)}
                        placeholder="ck_..."
                        value={config.consumerKey}
                        onChange={(v) => setConfig({ ...config, consumerKey: v })}
                        disabled={!config.enabled}
                        className="bg-background/40 h-12 rounded-xl border-border/40 focus:ring-primary/20"
                      />
                    </div>
                    <div className="space-y-2.5">
                      <Label htmlFor="consumerSecret" className="text-sm font-semibold uppercase tracking-wider text-muted-foreground ml-1">Consumer Secret</Label>
                      <SecretInput
                        id="consumerSecret"
                        guardado={config.hasCredentials && ((config as any).consumerSecretUltimos4 || true)}
                        placeholder="cs_..."
                        value={config.consumerSecret}
                        onChange={(v) => setConfig({ ...config, consumerSecret: v })}
                        disabled={!config.enabled}
                        className="bg-background/40 h-12 rounded-xl border-border/40 focus:ring-primary/20"
                      />
                    </div>
                  </div>
                </div>
                
                <div className="pt-4 flex justify-end">
                  <Button
                    variant="secondary"
                    onClick={handleTestConnection}
                    disabled={testing || !config.enabled}
                    className="w-full md:w-auto rounded-xl px-8 py-6 font-bold transition-all hover:bg-muted"
                  >
                    {testing ? (
                      <Loader2 className="mr-3 h-5 w-5 animate-spin" />
                    ) : connectionStatus === "success" ? (
                      <CheckCircle2 className="mr-3 h-5 w-5 text-green-500" />
                    ) : connectionStatus === "error" ? (
                      <XCircle className="mr-3 h-5 w-5 text-red-500" />
                    ) : (
                      <RefreshCw className="mr-3 h-5 w-5" />
                    )}
                    Verificar Estado de Conexión
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Automatización de Pedidos */}
            <Card className="glass-panel overflow-hidden border-none shadow-2xl relative">
              <CardHeader className="bg-muted/5 border-b pb-6 px-8">
                <CardTitle className="text-2xl flex items-center gap-3">
                  <div className="p-2 bg-orange-500/10 rounded-lg">
                    <Package className="h-5 w-5 text-orange-500" />
                  </div>
                  Automatización de Pedidos
                </CardTitle>
                <CardDescription className="text-base">
                  Cierra ventas en piloto automático directamente en tu tienda.
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-8 px-8 space-y-6">
                <div className="flex items-center justify-between p-2">
                  <div className="space-y-1">
                    <Label className="text-lg font-bold">Crear órdenes automáticamente</Label>
                    <p className="text-sm text-muted-foreground">
                      La IA generará un borrador al detectar una confirmación de compra.
                    </p>
                  </div>
                  <Switch
                    checked={config.autoCreateOrders}
                    onCheckedChange={(checked) => setConfig({ ...config, autoCreateOrders: checked })}
                    disabled={!config.enabled}
                    className="data-[state=checked]:bg-orange-500"
                  />
                </div>

                {config.autoCreateOrders && (
                  <div className="bg-orange-500/5 border border-orange-500/20 rounded-2xl p-6 flex gap-4 transition-all animate-in fade-in slide-in-from-top-2">
                    <div className="bg-orange-500/10 p-2 h-fit rounded-lg">
                      <Package className="h-5 w-5 text-orange-600 dark:text-orange-400 mt-0.5" />
                    </div>
                    <div className="space-y-2">
                      <p className="text-sm font-bold text-orange-800 dark:text-orange-200">
                        Flujo de Venta Asistida
                      </p>
                      <p className="text-sm text-orange-700 dark:text-orange-300 leading-relaxed opacity-90">
                        Los pedidos se crearán como <strong>"Pendiente de pago"</strong>. Tu equipo solo debe validar el comprobante y marcarlo como pagado.
                      </p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-8">
             {/* Tutorial Section */}
             <Card className="bg-gradient-to-br from-primary/10 via-background to-background border-primary/20 shadow-xl overflow-hidden relative group">
              <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full -mr-16 -mt-16 blur-2xl group-hover:bg-primary/10 transition-all duration-500" />
              <CardHeader className="pb-2">
                <CardTitle className="text-xl flex items-center gap-3 text-primary">
                  <ShoppingCart className="h-6 w-6" />
                  Guía de Conexión
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6 pt-4">
                <div className="space-y-4 text-sm text-muted-foreground leading-relaxed font-medium">
                  <p>Sigue estos pasos en tu WordPress:</p>
                  <div className="space-y-3">
                    {[
                      "WooCommerce → Ajustes → Avanzado",
                      "Selecciona la pestaña REST API",
                      "Click en 'Añadir clave'",
                      "Descripción: 'VentasPro AI'",
                      "Permisos: Lectura/Escritura"
                    ].map((step, i) => (
                      <div key={i} className="flex gap-3 items-center">
                        <span className="w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center text-[10px] font-bold shrink-0">{i+1}</span>
                        <span>{step}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="p-4 bg-background/50 rounded-xl border border-primary/10">
                  <p className="text-xs font-bold text-foreground flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-green-500" /> 
                    Requerido: SSL (HTTPS) habilitado.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Sync Dashboard */}
            <Card className="glass-panel border-none shadow-2xl overflow-hidden">
              <CardHeader className="bg-muted/5 border-b py-4">
                <CardTitle className="text-sm font-bold uppercase tracking-[0.15em] text-muted-foreground">Estado de Inventario</CardTitle>
              </CardHeader>
              <CardContent className="p-8 space-y-8">
                <div className="flex items-center justify-between">
                   <div className="space-y-0.5">
                    <Label className="text-base font-bold">Auto-sincronizar</Label>
                    <p className="text-xs text-muted-foreground">Actualización periódica.</p>
                   </div>
                   <Switch
                    checked={config.syncProducts}
                    onCheckedChange={(checked) => setConfig({ ...config, syncProducts: checked })}
                    disabled={!config.enabled}
                  />
                </div>
                
                {config.syncProducts && (
                  <div className="space-y-3 animate-in fade-in slide-in-from-right-4 duration-500">
                    <Label className="text-xs font-bold text-muted-foreground">INTERVALO DE ACTUALIZACIÓN (MIN)</Label>
                    <div className="relative">
                      <Input
                        type="number"
                        min="5"
                        value={config.syncInterval}
                        onChange={(e) => setConfig({ ...config, syncInterval: parseInt(e.target.value) || 60 })}
                        disabled={!config.enabled}
                        className="bg-background/50 pl-10 h-12 font-bold tabular-nums"
                      />
                      <RefreshCw className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
                    </div>
                  </div>
                )}

                <div className="pt-6 border-t border-border/50">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-3">Última Actividad</p>
                  <div className="flex items-center gap-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]" />
                    <p className="text-sm font-mono font-bold text-foreground/80">
                      {config.lastSync ? new Date(config.lastSync).toLocaleString('es-ES', { 
                        day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' 
                      }) : "Sin registros previos"}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </Layout>
  );
}
