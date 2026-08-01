import { useState } from "react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Eye, Send, Loader, Layout as LayoutIcon, Paintbrush, Sparkles, Smartphone, Monitor } from "lucide-react";
import { toast } from "sonner";

export default function ArchitectPage() {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [htmlCode, setHtmlCode] = useState<string>("");
  const [viewMode, setViewMode] = useState<"desktop" | "mobile">("desktop");

  const handleGenerate = async () => {
    if (!prompt.trim() || loading) return;

    setLoading(true);
    try {
      const res = await fetch("/api/code-agent/visual-architect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ prompt: prompt.trim() }),
      });

      if (!res.ok) throw new Error("Error al generar diseño");

      const data = await res.json();

      if (data.html) {
        setHtmlCode(data.html);
        setPreview(data.html);
      } else if (data.reply) {
        setPreview(null);
        toast.info(data.reply);
      }
    } catch (err: any) {
      toast.error(err.message || "Error al conectar con el arquitecto visual");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout>
      <div className="flex flex-col gap-6 flex-1 min-h-0">
        <div className="flex items-center gap-3 shrink-0">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-blue-500/20 to-cyan-500/20 border border-blue-500/20">
            <Eye className="h-6 w-6 text-blue-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Arquitecto Visual</h1>
            <p className="text-sm text-muted-foreground">Diseña y previsualiza componentes visuales con IA</p>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2 flex-1 min-h-0">
          <Card className="flex flex-col rounded-3xl border-0 shadow-lg glass-panel">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <Paintbrush className="h-4 w-4" />
                Diseñador
              </CardTitle>
              <CardDescription>Describe el diseño que quieres crear</CardDescription>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col gap-4">
              <Textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Ej: Crea una card de producto moderna con efecto glassmorphism, botón gradiente y sombra..." 
                className="flex-1 min-h-[200px] bg-background/50"
              />
              <Button onClick={handleGenerate} disabled={loading || !prompt.trim()} className="gap-2">
                {loading ? <Loader className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {loading ? "Generando..." : "Generar Diseño"}
              </Button>
            </CardContent>
          </Card>

          <Card className="flex flex-col rounded-3xl border-0 shadow-lg glass-panel">
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="flex items-center gap-2 text-sm">
                <LayoutIcon className="h-4 w-4" />
                Vista Previa
              </CardTitle>
              <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-1">
                <Button
                  variant={viewMode === "desktop" ? "default" : "ghost"}
                  size="sm"
                  className="h-7 px-2"
                  onClick={() => setViewMode("desktop")}
                >
                  <Monitor className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant={viewMode === "mobile" ? "default" : "ghost"}
                  size="sm"
                  className="h-7 px-2"
                  onClick={() => setViewMode("mobile")}
                >
                  <Smartphone className="h-3.5 w-3.5" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="flex-1 min-h-0">
              {preview ? (
                <div
                  className={`border border-white/10 rounded-xl overflow-hidden bg-white ${
                    viewMode === "mobile" ? "max-w-[375px] mx-auto" : "w-full"
                  }`}
                  style={{ height: "calc(100% - 1px)" }}
                >
                  <iframe
                    srcDoc={htmlCode}
                    className="w-full h-full"
                    title="Vista previa"
                    sandbox="allow-scripts"
                  />
                </div>
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground">
                  <div className="text-center">
                    <Eye className="h-10 w-10 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">Describe un diseño para ver la vista previa</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
