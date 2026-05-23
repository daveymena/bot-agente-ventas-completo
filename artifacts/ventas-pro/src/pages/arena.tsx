import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { ExternalLink, Sparkles } from "lucide-react";

export default function ArenaPage() {
  return (
    <Layout>
      <div className="flex items-center justify-center min-h-[70vh]">
        <div className="max-w-lg text-center space-y-6 p-10 rounded-2xl border border-white/10 bg-gradient-to-b from-primary/5 to-transparent backdrop-blur-xl">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/30 to-accent/30 flex items-center justify-center">
            <Sparkles className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">LM Arena</h1>
          <p className="text-muted-foreground leading-relaxed">
            Esta herramienta no se puede incrustar en iframe, pero puedes abrirla en una nueva pestaña para comparar modelos de IA, generar imágenes y probar prompts lado a lado.
          </p>
          <Button
            size="lg"
            className="rounded-xl text-base gap-2"
            onClick={() => window.open("https://arena.ai/", "_blank", "noopener,noreferrer")}
          >
            <ExternalLink className="h-5 w-5" />
            Abrir LM Arena
          </Button>
        </div>
      </div>
    </Layout>
  );
}
