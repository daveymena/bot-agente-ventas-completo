import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { XCircle, AlertTriangle, RefreshCcw, HelpCircle } from "lucide-react";

export default function SubscriptionFailurePage() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-destructive/10 via-background to-background flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 bg-grid-white/[0.02] -z-10" />
      <div className="max-w-md w-full animate-enter">
        <div className="text-center mb-10">
          <div className="w-16 h-16 bg-gradient-to-br from-destructive to-red-600 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-xl shadow-destructive/20">
            <AlertTriangle className="text-white h-8 w-8" />
          </div>
          <h1 className="text-3xl font-black tracking-tight mb-2">Pago Interrumpido</h1>
          <p className="text-muted-foreground">No hemos podido procesar tu suscripción elite.</p>
        </div>

        <Card className="glass-panel border-none shadow-2xl overflow-hidden">
          <CardHeader className="p-0">
             <div className="h-1 bg-gradient-to-r from-destructive via-red-500 to-destructive" />
          </CardHeader>
          <CardContent className="p-8 space-y-6">
            <div className="bg-destructive/5 border border-destructive/10 p-5 rounded-2xl">
              <p className="text-sm text-muted-foreground leading-relaxed">
                El proceso de pago fue cancelado o rechazado por el procesador de pagos. Esto puede deberse a:
              </p>
              <ul className="mt-4 space-y-2">
                {[
                  "Cancelación manual del proceso",
                  "Fondos insuficientes en la cuenta",
                  "Restricciones de seguridad del banco",
                  "Error de conexión con MercadoPago/PayPal"
                ].map((reason, i) => (
                  <li key={i} className="flex gap-2 items-center text-xs text-muted-foreground">
                    <XCircle className="h-3 w-3 text-destructive" />
                    {reason}
                  </li>
                ))}
              </ul>
            </div>

            <div className="p-4 bg-muted/30 rounded-2xl border border-white/5 flex gap-4 items-center">
              <HelpCircle className="h-5 w-5 text-muted-foreground shrink-0" />
              <p className="text-xs text-muted-foreground">
                ¿Crees que es un error? Contacta a <span className="font-bold text-foreground underline decoration-primary/50 cursor-pointer">soporte@sofiaai.com</span> para ayudarte personalmente.
              </p>
            </div>
          </CardContent>
          <CardFooter className="p-8 pt-0 flex flex-col gap-3">
            <Button
              className="w-full h-14 rounded-2xl bg-gradient-to-r from-primary to-accent font-bold text-base shadow-lg shadow-primary/20 transition-all active:scale-[0.98]"
              onClick={() => setLocation("/pricing")}
            >
              <RefreshCcw className="mr-2 h-4 w-4" /> Reintentar Pago
            </Button>
            <Button
              variant="ghost"
              className="w-full text-xs text-muted-foreground hover:text-foreground rounded-xl"
              onClick={() => setLocation("/")}
            >
              Volver al Inicio
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
