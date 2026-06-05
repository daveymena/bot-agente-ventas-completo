import { useState } from "react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ExternalLink, Sparkles } from "lucide-react";

export default function ArenaPage() {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <Layout>
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <div className="flex items-center justify-center min-h-[70vh]">
          <div className="text-center space-y-6 p-10 rounded-2xl border border-white/10 bg-gradient-to-b from-primary/5 to-transparent backdrop-blur-xl">
            <div className="mx-auto w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/30 to-accent/30 flex items-center justify-center">
              <Sparkles className="h-8 w-8 text-primary" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight">LM Arena</h1>
            <p className="text-muted-foreground leading-relaxed max-w-md mx-auto">
              Compara y prueba modelos de IA lado a lado. Arena.ai requiere abrirse en una nueva pestaña para funcionar completamente.
            </p>
            <div className="flex gap-3 justify-center pt-4">
              <Button
                variant="outline"
                onClick={() => setIsOpen(false)}
                className="rounded-xl"
              >
                Cerrar
              </Button>
              <Button
                className="rounded-xl gap-2"
                onClick={() => window.open("https://arena.ai/", "_blank", "noopener,noreferrer")}
              >
                <ExternalLink className="h-4 w-4" />
                Abrir en Nueva Pestaña
              </Button>
            </div>
          </div>
        </div>

        <DialogContent className="max-w-[95vw] w-full h-[90vh] p-0 border-0 rounded-2xl">
          <div className="flex flex-col h-full">
            <DialogHeader className="border-b border-white/10 px-6 py-4 flex-shrink-0">
              <div className="flex items-center gap-3">
                <Sparkles className="h-6 w-6 text-primary" />
                <DialogTitle className="text-xl">LM Arena - Generador de Imágenes</DialogTitle>
              </div>
            </DialogHeader>
            <div className="flex-1 overflow-hidden p-6">
              <div className="bg-muted/30 rounded-xl p-8 h-full border border-white/5 flex flex-col items-center justify-center text-center">
                <Sparkles className="h-12 w-12 text-primary/50 mb-4" />
                <h3 className="text-lg font-semibold mb-2">Arena.ai en tu Sistema</h3>
                <p className="text-muted-foreground mb-6 max-w-md">
                  Arena.ai es una herramienta externa que funciona mejor en su propio navegador. Puedes abrirla en una nueva pestaña desde aquí.
                </p>
                <Button
                  className="rounded-xl gap-2"
                  onClick={() => window.open("https://arena.ai/", "_blank", "noopener,noreferrer")}
                >
                  <ExternalLink className="h-4 w-4" />
                  Abrir Arena.ai
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
