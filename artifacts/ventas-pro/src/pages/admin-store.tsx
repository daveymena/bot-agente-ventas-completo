import { useSession } from "@/App";
import { ExternalLink, RefreshCw, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { Layout } from "@/components/layout";

export default function AdminStore() {
  const { tenant } = useSession();
  const [key, setKey] = useState(0);
  const slug = tenant?.slug || "";
  const storeUrl = slug ? `/tienda/${slug}` : "/tienda";

  return (
    <Layout>
      <div className="flex flex-col h-[calc(100vh-10rem)] md:h-[calc(100vh-8rem)] animate-enter">
        <div className="flex items-center justify-between gap-3 mb-3 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-md shadow-emerald-200 shrink-0">
              <Store className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-bold tracking-tight">Mi Tienda</h1>
              <p className="text-muted-foreground text-xs md:text-sm">
                {slug ? `${storeUrl}` : "Configura tu tienda pública"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="outline" size="sm" onClick={() => setKey(k => k + 1)} className="h-9 text-xs">
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Recargar
            </Button>
            <Button variant="default" size="sm" onClick={() => window.open(storeUrl, "_blank")} className="h-9 text-xs">
              <ExternalLink className="h-3.5 w-3.5 mr-1.5" /> Abrir pública
            </Button>
          </div>
        </div>

        {slug ? (
          <div className="flex-1 rounded-2xl border border-border overflow-hidden bg-white shadow-sm min-h-0">
            <iframe
              key={key}
              src={storeUrl}
              className="w-full h-full border-0"
              title="Vista previa de la tienda"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            />
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center rounded-2xl border border-dashed border-border bg-muted/30">
            <div className="text-center max-w-md">
              <Store className="w-16 h-16 text-muted-foreground/30 mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">Tienda no publicada</h3>
              <p className="text-sm text-muted-foreground">
                Para activar tu tienda pública, ve a{" "}
                <a href="/settings" className="text-primary underline underline-offset-4 hover:text-primary/80 transition-colors">
                  Configuración
                </a>{" "}
                y completa los datos de tu negocio.
              </p>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
