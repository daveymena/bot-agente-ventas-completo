import { useState, useEffect } from "react";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Crown, Users, Mail, Calendar, Shield, AlertCircle,
  Power, PowerOff, Trash2, MessageSquare, Package, Loader2, ShieldCheck, ShieldOff,
} from "lucide-react";
import { useSession } from "@/App";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";

interface Tenant {
  id: number;
  name: string;
  email: string;
  slug: string;
  plan: string;
  status: string;
  brandName: string;
  isAdmin: boolean;
  createdAt: string;
  conversationCount: number;
  productCount: number;
}

const PLAN_OPTIONS = ["free", "basic", "premium", "enterprise"];

export default function AdminTenantsPage() {
  const { tenant: sessionTenant } = useSession();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Guarda qué tenant tiene una acción en curso, para deshabilitar solo esos botones
  const [actingOn, setActingOn] = useState<number | null>(null);
  const [bootstrapping, setBootstrapping] = useState(false);

  const isAdmin = !!sessionTenant?.isAdmin;

  useEffect(() => {
    if (isAdmin) loadTenants();
    else setLoading(false);
  }, [isAdmin]);

  const loadTenants = async () => {
    try {
      const res = await fetch("/api/tenants/admin/list", { credentials: "include" });
      if (!res.ok) throw new Error("No autorizado");
      const data = await res.json();
      setTenants(data.tenants || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const runAction = async (tenantId: number, action: string, confirmMsg?: string) => {
    if (confirmMsg && !confirm(confirmMsg)) return;
    setActingOn(tenantId);
    try {
      const res = await fetch(`/api/tenants/admin/${tenantId}/action`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Error al ejecutar la acción");
      toast.success(data.message || "Listo");
      if (action === "delete") {
        setTenants(prev => prev.filter(t => t.id !== tenantId));
      } else {
        await loadTenants();
      }
    } catch (err: any) {
      toast.error(err.message || "Error al ejecutar la acción");
    } finally {
      setActingOn(null);
    }
  };

  const changePlan = async (tenantId: number, plan: string) => {
    setActingOn(tenantId);
    try {
      const res = await fetch(`/api/tenants/admin/${tenantId}/action`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set_plan", plan }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Error al cambiar el plan");
      toast.success(data.message || "Plan actualizado");
      await loadTenants();
    } catch (err: any) {
      toast.error(err.message || "Error al cambiar el plan");
    } finally {
      setActingOn(null);
    }
  };

  if (!isAdmin) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Card className="max-w-md w-full p-8 text-center rounded-3xl border-0 shadow-lg glass-panel">
            <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
            <h2 className="text-xl font-bold mb-2">Acceso Denegado</h2>
            <p className="text-sm text-muted-foreground">No tienes permisos para ver esta página.</p>

            {/*
              Salida para el PRIMER administrador.

              El backend permite promoverte a vos mismo mientras no exista
              ningún admin en la plataforma, y esa ventana se cierra sola apenas
              haya uno. Pero el frontend escondía el link "Administrador" detrás
              de isAdmin y esta página solo cargaba si ya lo eras: el primer
              admin no se podía crear desde ninguna pantalla. Cualquiera que
              instale este sistema desde cero quedaba trabado igual, y la única
              salida era pegar un fetch en la consola del navegador.

              Si ya existe un admin, el backend responde 403 y acá se muestra
              tal cual: hay que pedírselo a esa persona.
            */}
            <div className="mt-6 border-t pt-6">
              <p className="text-xs text-muted-foreground mb-3">
                ¿Sos quien instaló esta plataforma y todavía no hay ningún administrador?
                Podés activarte una sola vez.
              </p>
              <Button
                variant="outline"
                disabled={bootstrapping}
                onClick={async () => {
                  if (!sessionTenant?.id) return;
                  setBootstrapping(true);
                  try {
                    const res = await fetch(`/api/tenants/admin/${sessionTenant.id}/action`, {
                      method: "POST",
                      credentials: "include",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ action: "make_admin" }),
                    });
                    const data = await res.json().catch(() => ({}));
                    if (!res.ok) throw new Error(data?.error || "No se pudo activar");
                    toast.success("Listo, ya sos administrador. Recargando…");
                    setTimeout(() => window.location.reload(), 1200);
                  } catch (err: any) {
                    toast.error(err.message || "No se pudo activar el acceso de administrador");
                  } finally {
                    setBootstrapping(false);
                  }
                }}
              >
                <Crown className="mr-2 h-4 w-4" />
                {bootstrapping ? "Activando…" : "Activar mi acceso de administrador"}
              </Button>
            </div>
          </Card>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="flex flex-col gap-6">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-amber-500/20 to-yellow-500/20 border border-amber-500/20">
            <Crown className="h-6 w-6 text-amber-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Administrador de la Plataforma</h1>
            <p className="text-sm text-muted-foreground">Activa, suspende, cambia planes y otorga permisos de administrador a cualquier tenant del sistema.</p>
          </div>
        </div>

        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="rounded-2xl border-0 shadow-lg glass-panel p-6">
                <Skeleton className="h-6 w-48 mb-3" />
                <Skeleton className="h-4 w-32" />
              </Card>
            ))}
          </div>
        ) : error ? (
          <Card className="p-8 text-center rounded-3xl border-0 shadow-lg glass-panel">
            <AlertCircle className="h-10 w-10 text-destructive mx-auto mb-3" />
            <p className="text-sm text-destructive">{error}</p>
          </Card>
        ) : (
          <div className="grid gap-4">
            {tenants.map((t) => {
              const isSelf = t.id === Number(sessionTenant?.id);
              const busy = actingOn === t.id;
              return (
                <Card key={t.id} className="rounded-2xl border-0 shadow-lg glass-panel">
                  <CardContent className="p-5 flex flex-col gap-4">
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-lg">{t.brandName || t.name}</h3>
                          {t.isAdmin && (
                            <Badge className="bg-amber-500/20 text-amber-600 border-amber-500/30 gap-1">
                              <Crown className="h-3 w-3" /> Admin
                            </Badge>
                          )}
                          {isSelf && <Badge variant="outline" className="text-xs">Vos</Badge>}
                        </div>
                        <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1"><Mail className="h-3.5 w-3.5" />{t.email}</span>
                          <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" />{t.slug}</span>
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3.5 w-3.5" />
                            {t.createdAt ? format(parseISO(t.createdAt), "dd MMM yyyy", { locale: es }) : "—"}
                          </span>
                          <span className="flex items-center gap-1"><MessageSquare className="h-3.5 w-3.5" />{t.conversationCount} chats</span>
                          <span className="flex items-center gap-1"><Package className="h-3.5 w-3.5" />{t.productCount} productos</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant={t.status === "active" ? "outline" : "destructive"} className={t.status === "active" ? "border-green-500 text-green-500" : ""}>
                          {t.status}
                        </Badge>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 pt-3 border-t">
                      <Select value={t.plan} onValueChange={(v) => changePlan(t.id, v)} disabled={busy}>
                        <SelectTrigger className="w-[140px] h-8 text-xs">
                          <Shield className="h-3.5 w-3.5 mr-1" />
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {PLAN_OPTIONS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                        </SelectContent>
                      </Select>

                      {t.status === "active" ? (
                        <Button size="sm" variant="outline" disabled={busy} onClick={() => runAction(t.id, "suspend", `¿Suspender a ${t.brandName || t.name}? Dejará de poder usar la plataforma.`)}>
                          {busy ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <PowerOff className="h-3.5 w-3.5 mr-1" />} Suspender
                        </Button>
                      ) : (
                        <Button size="sm" variant="outline" disabled={busy} onClick={() => runAction(t.id, "activate")}>
                          {busy ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Power className="h-3.5 w-3.5 mr-1" />} Activar
                        </Button>
                      )}

                      {t.isAdmin ? (
                        <Button
                          size="sm" variant="outline" disabled={busy || isSelf}
                          title={isSelf ? "No podés quitarte tus propios permisos de admin" : undefined}
                          onClick={() => runAction(t.id, "revoke_admin", `¿Quitarle permisos de administrador a ${t.brandName || t.name}?`)}
                        >
                          <ShieldOff className="h-3.5 w-3.5 mr-1" /> Quitar admin
                        </Button>
                      ) : (
                        <Button size="sm" variant="outline" disabled={busy} onClick={() => runAction(t.id, "make_admin", `¿Dar permisos de administrador de la plataforma a ${t.brandName || t.name}? Va a poder ver y controlar TODOS los tenants.`)}>
                          <ShieldCheck className="h-3.5 w-3.5 mr-1" /> Hacer admin
                        </Button>
                      )}

                      <Button
                        size="sm" variant="destructive" className="ml-auto" disabled={busy || isSelf}
                        title={isSelf ? "No podés eliminar tu propia cuenta desde acá" : undefined}
                        onClick={() => runAction(t.id, "delete", `¿ELIMINAR permanentemente a ${t.brandName || t.name}? Esta acción no se puede deshacer.`)}
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-1" /> Eliminar
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
}
