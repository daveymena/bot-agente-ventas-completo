import { useState, useEffect } from "react";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Crown, Users, Mail, Calendar, Shield, AlertCircle } from "lucide-react";
import { useSession } from "@/App";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";

interface Tenant {
  id: number;
  name: string;
  email: string;
  slug: string;
  plan: string;
  status: string;
  brandName: string;
  createdAt: string;
}

export default function AdminTenantsPage() {
  const { tenant: sessionTenant } = useSession();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isAdmin = sessionTenant?.email === "daveymena16@gmail.com";

  useEffect(() => {
    if (isAdmin) loadTenants();
    else setLoading(false);
  }, [isAdmin]);

  const loadTenants = async () => {
    try {
      const res = await fetch("/api/tenants", { credentials: "include" });
      if (!res.ok) throw new Error("No autorizado");
      const data = await res.json();
      setTenants(data.tenants || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
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
            <h1 className="text-2xl font-bold">Admin Tenants</h1>
            <p className="text-sm text-muted-foreground">Gestiona todos los tenants del sistema</p>
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
            {tenants.map((t) => (
              <Card key={t.id} className="rounded-2xl border-0 shadow-lg glass-panel hover:-translate-y-0.5 transition-all duration-200">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <h3 className="font-semibold text-lg">{t.brandName || t.name}</h3>
                      <div className="flex items-center gap-3 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1"><Mail className="h-3.5 w-3.5" />{t.email}</span>
                        <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" />{t.slug}</span>
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3.5 w-3.5" />
                          {t.createdAt ? format(parseISO(t.createdAt), "dd MMM yyyy", { locale: es }) : "—"}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant={t.plan === "premium" ? "default" : "secondary"}>
                        <Shield className="h-3 w-3 mr-1" />
                        {t.plan}
                      </Badge>
                      <Badge variant={t.status === "active" ? "outline" : "destructive"} className={t.status === "active" ? "border-green-500 text-green-500" : ""}>
                        {t.status}
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
