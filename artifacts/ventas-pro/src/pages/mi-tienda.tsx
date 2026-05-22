import { useEffect } from "react";
import { useLocation } from "wouter";
import { useSession } from "@/App";
import { Package, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function MiTiendaPage() {
  const { tenant } = useSession();
  const [, setLocation] = useLocation();
  const slug = tenant?.slug || "demo";

  useEffect(() => {
    if (tenant?.slug) {
      setLocation(`/store/${tenant.slug}`);
    }
  }, [tenant]);

  if (!tenant?.slug) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="max-w-md border-0 shadow-sm">
          <CardContent className="p-8 text-center">
            <Package className="w-12 h-12 text-slate-200 mx-auto mb-4" />
            <h2 className="text-lg font-semibold mb-2">Configura tu tienda</h2>
            <p className="text-sm text-slate-400 mb-6">
              Necesitas configurar el slug de tu tienda en Personalización
            </p>
            <Button onClick={() => setLocation("/branding")} className="rounded-xl">
              Ir a Personalización
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return null;
}
