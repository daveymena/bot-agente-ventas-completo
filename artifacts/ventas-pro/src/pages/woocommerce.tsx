import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, CheckCircle2, XCircle, RefreshCw, ShoppingCart, Package } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

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
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Integración con WooCommerce</h1>
        <p className="text-muted-foreground mt-2">
          Conecta tu tienda WooCommerce para sincronizar productos y crear órdenes automáticamente
        </p>
      </div>

      {/* Información */}
      <Alert>
        <ShoppingCart className="h-4 w-4" />
        <AlertDescription>
          <strong>¿Qué es WooCommerce?</strong>
          <br />
          WooCommerce es una plataforma de comercio electrónico para WordPress. Con esta integración
          puedes:
          <ul className="list-disc list-inside mt-2 space-y-1">
            <li>Sincronizar productos desde tu tienda WooCommerce</li>
            <li>Crear órdenes automáticamente cuando un cliente compra por WhatsApp</li>
            <li>Mantener tu inventario actualizado</li>
            <li>Gestionar todo desde un solo lugar</li>
          </ul>
        </AlertDescription>
      </Alert>

      {/* Configuración General */}
      <Card>
        <CardHeader>
          <CardTitle>Configuración General</CardTitle>
          <CardDescription>
            Configura la conexión con tu tienda WooCommerce
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Habilitar integración */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Habilitar integración</Label>
              <p className="text-sm text-muted-foreground">
                Activa la integración con WooCommerce
              </p>
            </div>
            <Switch
              checked={config.enabled}
              onCheckedChange={(checked) => setConfig({ ...config, enabled: checked })}
            />
          </div>

          {/* URL de la tienda */}
          <div className="space-y-2">
            <Label htmlFor="storeUrl">URL de la tienda *</Label>
            <Input
              id="storeUrl"
              placeholder="https://mitienda.com"
              value={config.storeUrl}
              onChange={(e) => setConfig({ ...config, storeUrl: e.target.value })}
              disabled={!config.enabled}
            />
            <p className="text-sm text-muted-foreground">
              La URL completa de tu tienda WooCommerce (sin /wp-admin)
            </p>
          </div>

          {/* Consumer Key */}
          <div className="space-y-2">
            <Label htmlFor="consumerKey">Consumer Key *</Label>
            <Input
              id="consumerKey"
              type="password"
              placeholder={config.hasCredentials ? "••••••••" : "ck_..."}
              value={config.consumerKey}
              onChange={(e) => setConfig({ ...config, consumerKey: e.target.value })}
              disabled={!config.enabled}
            />
            <p className="text-sm text-muted-foreground">
              Obtén las credenciales en WooCommerce → Ajustes → Avanzado → REST API
            </p>
          </div>

          {/* Consumer Secret */}
          <div className="space-y-2">
            <Label htmlFor="consumerSecret">Consumer Secret *</Label>
            <Input
              id="consumerSecret"
              type="password"
              placeholder={config.hasCredentials ? "••••••••" : "cs_..."}
              value={config.consumerSecret}
              onChange={(e) => setConfig({ ...config, consumerSecret: e.target.value })}
              disabled={!config.enabled}
            />
          </div>

          {/* Botones de acción */}
          <div className="flex gap-3">
            <Button onClick={handleSave} disabled={saving || !config.enabled}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Guardar configuración
            </Button>

            <Button
              variant="outline"
              onClick={handleTestConnection}
              disabled={testing || !config.enabled || !config.hasCredentials}
            >
              {testing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {connectionStatus === "success" && <CheckCircle2 className="mr-2 h-4 w-4 text-green-500" />}
              {connectionStatus === "error" && <XCircle className="mr-2 h-4 w-4 text-red-500" />}
              Probar conexión
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Sincronización de Productos */}
      <Card>
        <CardHeader>
          <CardTitle>Sincronización de Productos</CardTitle>
          <CardDescription>
            Configura cómo se sincronizan los productos desde WooCommerce
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Sincronizar productos */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Sincronizar productos automáticamente</Label>
              <p className="text-sm text-muted-foreground">
                Los productos se sincronizarán cada {config.syncInterval} minutos
              </p>
            </div>
            <Switch
              checked={config.syncProducts}
              onCheckedChange={(checked) => setConfig({ ...config, syncProducts: checked })}
              disabled={!config.enabled}
            />
          </div>

          {/* Intervalo de sincronización */}
          {config.syncProducts && (
            <div className="space-y-2">
              <Label htmlFor="syncInterval">Intervalo de sincronización (minutos)</Label>
              <Input
                id="syncInterval"
                type="number"
                min="5"
                max="1440"
                value={config.syncInterval}
                onChange={(e) =>
                  setConfig({ ...config, syncInterval: parseInt(e.target.value) || 60 })
                }
                disabled={!config.enabled}
              />
            </div>
          )}

          {/* Última sincronización */}
          {config.lastSync && (
            <div className="text-sm text-muted-foreground">
              Última sincronización: {new Date(config.lastSync).toLocaleString("es-ES")}
            </div>
          )}

          {/* Botón de sincronización manual */}
          <Button
            variant="outline"
            onClick={handleSyncProducts}
            disabled={syncing || !config.enabled || !config.hasCredentials}
          >
            {syncing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Sincronizar ahora
          </Button>
        </CardContent>
      </Card>

      {/* Órdenes Automáticas */}
      <Card>
        <CardHeader>
          <CardTitle>Órdenes Automáticas</CardTitle>
          <CardDescription>
            Crea órdenes en WooCommerce automáticamente desde WhatsApp
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Crear órdenes automáticamente */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Crear órdenes automáticamente</Label>
              <p className="text-sm text-muted-foreground">
                Cuando un cliente compra por WhatsApp, se crea una orden en WooCommerce
              </p>
            </div>
            <Switch
              checked={config.autoCreateOrders}
              onCheckedChange={(checked) => setConfig({ ...config, autoCreateOrders: checked })}
              disabled={!config.enabled}
            />
          </div>

          {config.autoCreateOrders && (
            <Alert>
              <Package className="h-4 w-4" />
              <AlertDescription>
                Las órdenes se crearán con estado "Pendiente" y se actualizarán automáticamente
                cuando el cliente envíe el comprobante de pago.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
