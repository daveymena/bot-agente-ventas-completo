import { useEffect, useState } from "react";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Activity, Trash2, RefreshCw, Power, CheckCircle2, XCircle, AlertTriangle, Server, Users, AlertCircle } from "lucide-react";
import { useSession } from "@/App";

interface InstanceMetrics {
  tenantId: number;
  state: string;
  phoneNumber: string | null;
  connectedAt: string | null;
  lastError: string | null;
  ageMinutes: number | null;
  qrPending: boolean;
}

interface HealthSummary {
  total: number;
  byState: Record<string, number>;
  staleErrors: number;
}

export default function WhatsAppMonitorPage() {
  const { tenant: sessionTenant } = useSession();
  const isAdmin = !!sessionTenant?.isAdmin;
  const [metrics, setMetrics] = useState<InstanceMetrics[]>([]);
  const [health, setHealth] = useState<HealthSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cleanupResult, setCleanupResult] = useState<{ removed: number[]; kept: number[] } | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [m, h] = await Promise.all([
        fetch("/api/whatsapp/metrics").then(r => r.json()),
        fetch("/api/whatsapp/health").then(r => r.json()),
      ]);
      if (m.ok) setMetrics(m.metrics || []);
      if (h.ok) setHealth(h);
    } catch (e: any) {
      setError(e.message || "Error cargando métricas");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isAdmin) return;
    loadData();
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, [isAdmin]);

  const handleCleanup = async () => {
    if (!confirm("¿Detener y eliminar todas las instancias inactivas o en error?")) return;
    try {
      const res = await fetch("/api/whatsapp/cleanup", { method: "POST" }).then(r => r.json());
      if (res.ok) {
        setCleanupResult({ removed: res.removed, kept: res.kept });
        await loadData();
      }
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleDispose = async (tenantId: number) => {
    if (!confirm(`¿Detener la instancia del tenant ${tenantId}?`)) return;
    try {
      await fetch(`/api/whatsapp/instances/${tenantId}/dispose`, { method: "POST" });
      await loadData();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleStart = async (tenantId: number) => {
    try {
      await fetch(`/api/whatsapp/instances/${tenantId}/start`, { method: "POST" });
      await loadData();
    } catch (e: any) {
      setError(e.message);
    }
  };

  if (!isAdmin) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Card className="max-w-md w-full p-8 text-center rounded-3xl border-0 shadow-lg glass-panel">
            <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
            <h2 className="text-xl font-bold mb-2">Acceso Denegado</h2>
            <p className="text-sm text-muted-foreground">
              Este panel muestra el estado de las sesiones de WhatsApp de TODOS los negocios registrados. Solo el administrador de la plataforma puede verlo.
            </p>
          </Card>
        </div>
      </Layout>
    );
  }

  const stateBadge = (state: string) => {
    const map: Record<string, { color: string; icon: any }> = {
      connected: { color: "bg-green-500/20 text-green-600", icon: CheckCircle2 },
      connecting: { color: "bg-amber-500/20 text-amber-600", icon: RefreshCw },
      qr: { color: "bg-blue-500/20 text-blue-600", icon: Activity },
      disconnected: { color: "bg-gray-500/20 text-gray-600", icon: Power },
      error: { color: "bg-destructive/20 text-destructive", icon: XCircle },
    };
    const cfg = map[state] || map.disconnected;
    const Icon = cfg.icon;
    return (
      <Badge className={`${cfg.color} flex items-center gap-1`}>
        <Icon className="h-3 w-3" /> {state}
      </Badge>
    );
  };

  return (
    <Layout>
      <div className="flex flex-col gap-6 animate-enter">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              <Server className="h-8 w-8" /> Monitoreo Multi-Tenant
            </h1>
            <p className="text-muted-foreground mt-1">
              Estado de todas las instancias de WhatsApp conectadas al sistema.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={loadData} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Actualizar
            </Button>
            <Button variant="outline" onClick={handleCleanup} disabled={loading}>
              <Trash2 className="h-4 w-4 mr-2" /> Limpiar inactivas
            </Button>
          </div>
        </div>

        {error && (
          <Alert className="border-destructive">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Resumen */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <Users className="h-4 w-4" /> Total instancias
              </div>
              <p className="text-3xl font-bold mt-2">{health?.total ?? "—"}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <CheckCircle2 className="h-4 w-4 text-green-600" /> Conectadas
              </div>
              <p className="text-3xl font-bold mt-2 text-green-600">{health?.byState?.connected ?? 0}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <Activity className="h-4 w-4 text-blue-600" /> Esperando QR
              </div>
              <p className="text-3xl font-bold mt-2 text-blue-600">{health?.byState?.qr ?? 0}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <XCircle className="h-4 w-4 text-destructive" /> Con error
              </div>
              <p className="text-3xl font-bold mt-2 text-destructive">
                {(health?.byState?.error ?? 0) + (health?.staleErrors ?? 0)}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Lista de instancias */}
        <Card>
          <CardHeader>
            <CardTitle>Instancias activas</CardTitle>
            <CardDescription>
              Cada tenant tiene su propia sesión aislada en <code>data/whatsapp-tenants/tenant-&lt;id&gt;/</code>
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading && metrics.length === 0 ? (
              <div className="space-y-2">
                <Skeleton className="h-12" />
                <Skeleton className="h-12" />
                <Skeleton className="h-12" />
              </div>
            ) : metrics.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                No hay instancias activas. El bot aún no se ha iniciado.
              </p>
            ) : (
              <div className="space-y-3">
                {metrics.map((m) => (
                  <div key={m.tenantId} className="flex items-center justify-between p-4 bg-muted rounded-lg">
                    <div className="flex items-center gap-3">
                      {stateBadge(m.state)}
                      <div>
                        <p className="font-semibold">Tenant #{m.tenantId}</p>
                        <p className="text-xs text-muted-foreground">
                          {m.phoneNumber ? `📱 ${m.phoneNumber}` : "Sin número vinculado"}
                          {m.ageMinutes !== null && ` · Activo hace ${m.ageMinutes} min`}
                        </p>
                        {m.lastError && (
                          <p className="text-xs text-destructive mt-1 break-all">{m.lastError}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => handleStart(m.tenantId)}>
                        <RefreshCw className="h-3 w-3 mr-1" /> Reiniciar
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => handleDispose(m.tenantId)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {cleanupResult && (
          <Alert className="border-green-500">
            <CheckCircle2 className="h-4 w-4 text-green-500" />
            <AlertDescription>
              Limpieza completada: <strong>{cleanupResult.removed.length}</strong> instancias eliminadas,
              <strong> {cleanupResult.kept.length}</strong> mantenidas.
              {cleanupResult.removed.length > 0 && (
                <span className="block mt-1 text-xs">
                  IDs eliminados: {cleanupResult.removed.join(", ")}
                </span>
              )}
            </AlertDescription>
          </Alert>
        )}
      </div>
    </Layout>
  );
}
