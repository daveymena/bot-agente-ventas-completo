/**
 * DIAGNÓSTICO — qué está fallando, sin tener que adivinar.
 *
 * Nace de una tarde entera (2026-09-07) buscando por qué la pantalla de
 * campañas no mostraba nada. Se probaron tres hipótesis y las tres eran falsas,
 * porque salieron de leer el código en vez de mirar el estado real.
 *
 * Lo único que destrabó el problema fue abrir el endpoint crudo en el
 * navegador. Esto es eso mismo, con un botón.
 *
 * El botón de copiar es la mitad importante: sirve para que el dueño pueda
 * mandar el estado real sin transcribirlo, que es exactamente lo que faltó.
 */
import { useCallback, useEffect, useState } from "react";
import { Layout } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Copy, RefreshCw, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { toast } from "sonner";

interface Revision {
  que: string;
  estado: "ok" | "falla" | "sin-configurar";
  detalle: string;
  motivo?: string;
  queHacer?: string;
}

const ICONO = {
  ok: <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />,
  falla: <XCircle className="h-4 w-4 shrink-0 text-destructive" />,
  "sin-configurar": <AlertCircle className="h-4 w-4 shrink-0 text-amber-500" />,
};

export default function DiagnosticoPage() {
  const [datos, setDatos] = useState<any>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const r = await fetch("/api/diagnostico", { credentials: "include" });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.message || "No se pudo hacer el diagnóstico");
      setDatos(j);
      setError("");
    } catch (e: any) {
      setError(e?.message || "No se pudo hacer el diagnóstico");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(datos?.texto || "");
      toast.success("Diagnóstico copiado: pegalo donde lo necesites.");
    } catch {
      toast.error("No se pudo copiar. Seleccioná el texto de abajo a mano.");
    }
  };

  const revisiones: Revision[] = datos?.revisiones || [];
  const problemas = revisiones.filter((r) => r.estado !== "ok");

  return (
    <Layout>
      <div className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Diagnóstico</h1>
            <p className="text-sm text-muted-foreground">
              Qué está funcionando y qué no, con el motivo real y qué hacer.
            </p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={cargar} disabled={cargando}>
              {cargando ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />}
              Revisar
            </Button>
            <Button size="sm" onClick={copiar} disabled={!datos?.texto}>
              <Copy className="mr-1.5 h-3.5 w-3.5" /> Copiar
            </Button>
          </div>
        </div>

        {cargando && !datos && (
          <Card><CardContent className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Revisando todo…
          </CardContent></Card>
        )}

        {error && (
          <Card><CardContent className="p-6 text-sm text-destructive">{error}</CardContent></Card>
        )}

        {datos && (
          <>
            <Card>
              <CardContent className="p-4 text-sm">
                <p className="font-medium">
                  {problemas.length === 0
                    ? "Todo está funcionando."
                    : `${problemas.length} cosa(s) necesitan atención.`}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Negocio: {datos.negocio} (id {datos.tenantId ?? "—"})
                </p>
              </CardContent>
            </Card>

            <div className="space-y-2">
              {revisiones.map((r, i) => (
                <Card key={i}>
                  <CardContent className="flex gap-3 p-4">
                    {ICONO[r.estado]}
                    <div className="min-w-0 space-y-1">
                      <p className="text-sm font-medium">{r.que}</p>
                      <p className="text-sm text-muted-foreground">{r.detalle}</p>
                      {/* El motivo va TEXTUAL y sin recortar: es lo único que
                          permite arreglarlo, y resumirlo fue el error que
                          costó la tarde que dio origen a esta pantalla. */}
                      {r.motivo && (
                        <p className="break-all rounded bg-muted/60 p-2 font-mono text-xs">{r.motivo}</p>
                      )}
                      {r.queHacer && (
                        <p className="text-xs font-medium">👉 {r.queHacer}</p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground">Ver el texto para copiar</summary>
              <pre className="mt-2 overflow-x-auto rounded bg-muted/60 p-3 text-[11px] leading-relaxed">
                {datos.texto}
              </pre>
            </details>
          </>
        )}
      </div>
    </Layout>
  );
}
