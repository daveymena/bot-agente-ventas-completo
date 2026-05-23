import { useState } from "react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { X, Sparkles } from "lucide-react";

export default function ArenaPage() {
  const [isOpen, setIsOpen] = useState(true);

  if (!isOpen) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[70vh]">
          <div className="text-center space-y-4">
            <Sparkles className="h-12 w-12 text-primary mx-auto" />
            <h1 className="text-2xl font-bold">LM Arena</h1>
            <p className="text-muted-foreground">Herramienta para comparar modelos de IA</p>
            <Button onClick={() => setIsOpen(true)} className="rounded-xl">
              Abrir LM Arena
            </Button>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <>
      {/* Overlay fullscreen */}
      <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" onClick={() => setIsOpen(false)} />
      
      {/* Modal fullscreen */}
      <div className="fixed inset-0 z-50 flex flex-col">
        {/* Header */}
        <div className="bg-background border-b border-white/10 backdrop-blur-xl px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Sparkles className="h-6 w-6 text-primary" />
            <h1 className="text-xl font-bold">LM Arena</h1>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsOpen(false)}
            className="rounded-lg hover:bg-white/10"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Content - iframe fullscreen */}
        <div className="flex-1 overflow-hidden">
          <iframe
            src="https://arena.ai"
            className="w-full h-full"
            title="LM Arena"
            allowFullScreen
            allow="clipboard-read; clipboard-write; microphone; camera"
          />
        </div>
      </div>
    </>
  );
}
