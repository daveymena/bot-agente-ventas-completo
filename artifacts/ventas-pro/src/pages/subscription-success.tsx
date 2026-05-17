import { useLocation, useSearch } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, Mail, ArrowRight, Star, Zap, ShieldCheck } from "lucide-react";

export default function SubscriptionSuccessPage() {
  const [, setLocation] = useLocation();
  const searchParams = new URLSearchParams(useSearch());
  const email = searchParams.get("email");

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-green-500/10 via-background to-background flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 bg-grid-white/[0.02] -z-10" />
      <div className="max-w-md w-full animate-enter">
        <div className="text-center mb-10">
          <div className="w-16 h-16 bg-gradient-to-br from-green-400 to-green-600 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-xl shadow-green-500/20">
            <Star className="text-white h-8 w-8" />
          </div>
          <h1 className="text-3xl font-black tracking-tight mb-2">¡Pago Confirmado!</h1>
          <p className="text-muted-foreground">Tu suscripción elite está en proceso de activación.</p>
        </div>

        <Card className="glass-panel border-none shadow-2xl overflow-hidden">
          <CardHeader className="p-0">
             <div className="h-1 bg-gradient-to-r from-green-400 via-emerald-500 to-green-400" />
          </CardHeader>
          <CardContent className="p-8 space-y-6">
            <div className="bg-green-500/10 border border-green-500/20 p-5 rounded-2xl flex gap-4 items-start">
              <ShieldCheck className="h-5 w-5 text-green-500 mt-0.5 shrink-0" />
              <p className="text-sm text-muted-foreground leading-relaxed">
                Hemos recibido tu pago correctamente. El sistema está generando tu <span className="text-green-500 font-bold">Token de Activación</span> único.
              </p>
            </div>

            {email && (
              <div className="bg-primary/5 border border-primary/10 p-5 rounded-2xl flex gap-4 items-start">
                <Mail className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-widest text-primary mb-1">Enviado a:</p>
                  <p className="text-sm font-bold truncate">{email}</p>
                  <p className="text-xs text-muted-foreground mt-1">Revisa tu bandeja de entrada y carpeta de spam.</p>
                </div>
              </div>
            )}

            <div className="space-y-4">
              <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground">Próximos pasos</h3>
              <div className="space-y-3">
                {[
                  "Busca el email con el asunto 'Tu Token de Activación'",
                  "Copia el código alfanumérico",
                  "Haz clic en el botón de abajo para activar tu cuenta"
                ].map((step, i) => (
                  <div key={i} className="flex gap-3 items-center">
                    <div className="w-5 h-5 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold shrink-0">{i+1}</div>
                    <p className="text-xs text-muted-foreground">{step}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-4 bg-orange-500/5 rounded-2xl border border-orange-500/10">
              <p className="text-[10px] text-orange-600 font-bold leading-relaxed">
                ⏱️ El email puede tardar de 1 a 5 minutos. Si no lo recibes, contacta a nuestro equipo de soporte.
              </p>
            </div>
          </CardContent>
          <CardFooter className="p-8 pt-0 flex flex-col gap-3">
            <Button
              className="w-full h-14 rounded-2xl bg-gradient-to-r from-primary to-accent font-bold text-base shadow-lg shadow-primary/20 transition-all active:scale-[0.98]"
              onClick={() => setLocation("/activate")}
            >
              Ir a Activar Cuenta <ArrowRight className="ml-2 h-4 w-4" />
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
