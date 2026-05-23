import { Layout } from "@/components/layout";

export default function ArenaPage() {
  return (
    <Layout>
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">LM Arena</h1>
            <p className="text-sm text-muted-foreground">Compara y prueba modelos de IA dentro del sistema</p>
          </div>
        </div>
        <div className="flex-1 rounded-xl overflow-hidden border border-white/10 bg-black/20">
          <iframe
            src="/proxy/arena"
            className="w-full h-full min-h-[600px]"
            style={{ border: "none" }}
            title="LM Arena"
            allow="clipboard-read; clipboard-write"
          />
        </div>
      </div>
    </Layout>
  );
}
