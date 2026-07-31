import { useState, useEffect } from "react";
import { useSession } from "@/App";
import { Button } from "@/components/ui/button";
import { Layout } from "@/components/layout";
import {
  ExternalLink,
  RefreshCw,
  Monitor,
  Smartphone,
  Copy,
  Check,
} from "lucide-react";

export default function MiTiendaPage() {
  const { tenant } = useSession();
  const slug = tenant?.slug || "";
  const [viewMode, setViewMode] = useState<"desktop" | "mobile">("desktop");
  const [copied, setCopied] = useState(false);
  const [key, setKey] = useState(0); // para forzar reload del iframe

  // La tienda pública se sirve en /tienda/{slug} desde el mismo servidor API
  const storeUrl = slug ? `/tienda/${slug}` : null;
  const fullStoreUrl = slug
    ? `${window.location.origin}/tienda/${slug}`
    : null;

  const copyUrl = () => {
    if (!fullStoreUrl) return;
    navigator.clipboard.writeText(fullStoreUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Layout>
      <div className="flex flex-col h-[calc(100vh-4rem)] gap-0">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-4 py-3 border-b bg-background/80 backdrop-blur-sm shrink-0">
          <div className="flex items-center gap-3">
            <div>
              <h1 className="text-lg font-bold leading-tight">Mi Tienda</h1>
              {fullStoreUrl && (
                <p className="text-xs text-muted-foreground truncate max-w-[320px]">
                  {fullStoreUrl}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Copy URL */}
            {fullStoreUrl && (
              <Button
                variant="outline"
                size="sm"
                className="gap-2 text-xs"
                onClick={copyUrl}
              >
                {copied ? (
                  <Check className="h-3.5 w-3.5 text-green-500" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
                {copied ? "¡Copiado!" : "Copiar URL"}
              </Button>
            )}

            {/* Device toggle */}
            <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
              <Button
                variant={viewMode === "desktop" ? "default" : "ghost"}
                size="sm"
                className="h-7 px-2"
                onClick={() => setViewMode("desktop")}
                title="Vista escritorio"
              >
                <Monitor className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant={viewMode === "mobile" ? "default" : "ghost"}
                size="sm"
                className="h-7 px-2"
                onClick={() => setViewMode("mobile")}
                title="Vista móvil"
              >
                <Smartphone className="h-3.5 w-3.5" />
              </Button>
            </div>

            {/* Reload */}
            <Button
              variant="outline"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => setKey((k) => k + 1)}
              title="Recargar tienda"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>

            {/* Open in new tab */}
            {fullStoreUrl && (
              <Button
                size="sm"
                className="gap-2 text-xs"
                onClick={() => window.open(fullStoreUrl, "_blank")}
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Abrir tienda
              </Button>
            )}
          </div>
        </div>

        {/* iframe container */}
        <div className="flex-1 bg-muted/30 flex items-start justify-center overflow-auto p-4">
          {storeUrl ? (
            <div
              className={`bg-white rounded-xl shadow-2xl overflow-hidden transition-all duration-300 h-full ${
                viewMode === "mobile" ? "w-[390px]" : "w-full"
              }`}
            >
              {/* Browser chrome decorativo */}
              <div className="flex items-center gap-2 px-3 py-2 bg-gray-100 border-b border-gray-200">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-red-400" />
                  <div className="w-3 h-3 rounded-full bg-yellow-400" />
                  <div className="w-3 h-3 rounded-full bg-green-400" />
                </div>
                <div className="flex-1 bg-white rounded-md px-3 py-1 text-xs text-gray-500 border border-gray-200 truncate">
                  {fullStoreUrl}
                </div>
              </div>
              <iframe
                key={key}
                src={storeUrl}
                className="w-full"
                style={{ height: "calc(100% - 37px)" }}
                title={`Tienda: ${tenant?.brandName || slug}`}
                allow="payment"
              />
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center gap-4">
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
                <Monitor className="h-8 w-8 text-muted-foreground" />
              </div>
              <div>
                <h3 className="font-semibold text-lg">Tienda no configurada</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Configura el slug de tu tienda en Ajustes para ver la preview aquí.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
