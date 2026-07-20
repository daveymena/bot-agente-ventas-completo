import { useState, useEffect } from "react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Store, Save, Eye, RefreshCw, Layout as LayoutIcon, Palette } from "lucide-react";
import { toast } from "sonner";
import { useSession } from "@/App";

export default function AdminStorePage() {
  const { tenant } = useSession();
  const [storeData, setStoreData] = useState({
    name: "",
    slug: "",
    description: "",
  });
  const [layout, setLayout] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (tenant?.slug) {
      setStoreData((prev) => ({ ...prev, slug: tenant.slug }));
      loadStore();
    }
  }, [tenant]);

  const loadStore = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/store/admin/${tenant?.slug}`, {
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        setStoreData((prev) => ({
          ...prev,
          name: data.store?.name || prev.name,
          description: data.store?.description || prev.description,
        }));
      }
      const layoutRes = await fetch(`/api/store/admin/${tenant?.slug}/layout`, {
        credentials: "include",
      });
      if (layoutRes.ok) {
        const layoutData = await layoutRes.json();
        setLayout(layoutData.layout);
      }
    } catch {
      // Store might not exist yet
    } finally {
      setLoading(false);
    }
  };

  const saveLayout = async () => {
    try {
      const res = await fetch(`/api/store/admin/${tenant?.slug}/layout`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          layoutData: layout || { theme: "default", colors: { primary: "#6366f1" } },
        }),
      });
      if (res.ok) {
        toast.success("Layout guardado exitosamente");
      } else {
        throw new Error("Error al guardar");
      }
    } catch {
      toast.error("Error al guardar el layout");
    }
  };

  return (
    <Layout>
      <div className="flex flex-col gap-6">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 border border-emerald-500/20">
            <Store className="h-6 w-6 text-emerald-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Tienda Admin</h1>
            <p className="text-sm text-muted-foreground">Administra tu tienda online</p>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <Card className="rounded-3xl border-0 shadow-lg glass-panel">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Palette className="h-5 w-5" />
                Apariencia
              </CardTitle>
              <CardDescription>Personaliza el diseño de tu tienda</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Nombre de la tienda</Label>
                <Input
                  value={storeData.name}
                  onChange={(e) => setStoreData((p) => ({ ...p, name: e.target.value }))}
                  placeholder="Mi Tienda"
                  className="bg-background/50"
                />
              </div>
              <div className="space-y-2">
                <Label>Descripción</Label>
                <Textarea
                  value={storeData.description}
                  onChange={(e) => setStoreData((p) => ({ ...p, description: e.target.value }))}
                  placeholder="Describe tu tienda..."
                  className="bg-background/50"
                />
              </div>
              <Button onClick={saveLayout} className="w-full gap-2">
                <Save className="h-4 w-4" />
                Guardar Cambios
              </Button>
            </CardContent>
          </Card>

          <Card className="rounded-3xl border-0 shadow-lg glass-panel">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <LayoutIcon className="h-5 w-5" />
                Vista Previa
              </CardTitle>
              <CardDescription>Así se ve tu tienda actualmente</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="aspect-video rounded-xl bg-muted/30 flex items-center justify-center border border-dashed border-white/10">
                <div className="text-center">
                  <Eye className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">Vista previa de la tienda</p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1 gap-2"
                  onClick={() => window.open(`/mi-tienda`, "_blank")}
                >
                  <Eye className="h-4 w-4" />
                  Ver Tienda
                </Button>
                <Button variant="outline" className="gap-2" onClick={loadStore}>
                  <RefreshCw className="h-4 w-4" />
                  Recargar
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
