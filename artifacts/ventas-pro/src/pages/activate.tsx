import { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { CheckCircle2, Loader2, AlertCircle, ShieldCheck, Zap, Rocket, KeyRound } from "lucide-react";

export default function ActivatePage() {
  const [, setLocation] = useLocation();
  const searchParams = new URLSearchParams(useSearch());
  const tokenFromUrl = searchParams.get("token");

  const [token, setToken] = useState(tokenFromUrl || "");
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [tokenInfo, setTokenInfo] = useState<any>(null);
  const [activated, setActivated] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (tokenFromUrl) {
      verifyToken(tokenFromUrl);
    }
  }, [tokenFromUrl]);

  const verifyToken = async (tokenToVerify: string) => {
    if (!tokenToVerify) return;

    setVerifying(true);
    setError("");

    try {
      const response = await fetch(`/api/activation/verify/${tokenToVerify}`);
      const data = await response.json();

      if (data.valid) {
        setTokenInfo(data);
      } else {
        setError(data.message || "Token inválido");
      }
    } catch (error) {
      console.error("Error verifying token:", error);
      setError("Error verificando el token");
    } finally {
      setVerifying(false);
    }
  };

  const handleActivate = async () => {
    if (!token) {
      setError("Por favor ingresa el token de activación");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/activation/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || data.error || "Error activando la cuenta");
      }

      setActivated(true);
      setTokenInfo(data);

      toast.success("¡Cuenta activada exitosamente! 🚀");

      // Redirigir al login después de 3 segundos
      setTimeout(() => {
        setLocation("/auth");
      }, 3000);
    } catch (error: any) {
      console.error("Error activating account:", error);
      setError(error.message || "Error activando la cuenta");
      toast.error(error.message || "No se pudo activar la cuenta");
    } finally {
      setLoading(false);
    }
  };

  if (verifying) {
    return (
      <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/20 via-background to-background flex items-center justify-center p-4">
        <div className="text-center space-y-4">
          <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto" />
          <p className="text-muted-foreground font-medium animate-pulse">Verificando tu acceso elite...</p>
        </div>
      </div>
    );
  }

  if (activated) {
    return (
      <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/20 via-background to-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md glass-panel border-none shadow-2xl animate-enter">
          <CardHeader className="text-center pt-10">
            <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-green-500/20 text-green-500 shadow-xl shadow-green-500/10 border border-green-500/20">
              <CheckCircle2 className="h-10 w-10" />
            </div>
            <CardTitle className="text-3xl font-black mb-2">¡Activación Exitosa!</CardTitle>
            <CardDescription className="text-base font-medium">
              Tu plan {tokenInfo?.subscription?.planName || tokenInfo?.subscription?.plan} está listo.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 px-8">
            <div className="bg-muted/30 border border-white/5 p-6 rounded-3xl space-y-3 shadow-inner">
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground font-bold uppercase tracking-widest text-[10px]">Empresa</span>
                <span className="font-bold">{tokenInfo?.tenant?.brandName}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground font-bold uppercase tracking-widest text-[10px]">Email</span>
                <span className="font-bold">{tokenInfo?.tenant?.email}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground font-bold uppercase tracking-widest text-[10px]">Ciclo</span>
                <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">
                  {tokenInfo?.subscription?.billingCycle === "annual" ? "Anual" : "Mensual"}
                </Badge>
              </div>
            </div>
            <p className="text-center text-sm text-muted-foreground font-medium animate-pulse">
              Redirigiendo al panel de control en unos segundos...
            </p>
          </CardContent>
          <CardFooter className="pb-10 px-8">
            <Button className="w-full h-14 rounded-2xl bg-gradient-to-r from-primary to-accent font-bold shadow-lg shadow-primary/20" onClick={() => setLocation("/auth")}>
              Acceder al Panel <Rocket className="ml-2 h-4 w-4" />
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/20 via-background to-background flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 bg-grid-white/[0.02] -z-10" />
      <div className="max-w-md w-full animate-enter">
        <div className="text-center mb-10">
          <div className="w-16 h-16 bg-gradient-to-br from-primary to-accent rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-xl shadow-primary/20">
            <Zap className="text-white h-8 w-8" />
          </div>
          <h1 className="text-3xl font-black tracking-tight mb-2">Activar Membresía</h1>
          <p className="text-muted-foreground">Ingresa el token de activación que recibiste tras tu compra.</p>
        </div>

        <Card className="glass-panel border-none shadow-2xl overflow-hidden">
          <CardHeader className="p-0">
             <div className="h-1 bg-gradient-to-r from-primary via-accent to-primary" />
          </CardHeader>
          <CardContent className="p-8 space-y-6">
            {tokenInfo && (
              <div className="bg-primary/5 border border-primary/10 p-5 rounded-2xl flex gap-4 items-start animate-in zoom-in-95">
                <ShieldCheck className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-black uppercase tracking-widest text-primary mb-1">Plan Detectado</p>
                  <p className="text-sm font-bold">{tokenInfo.planName} ({tokenInfo.billingCycle === "annual" ? "Anual" : "Mensual"})</p>
                  <p className="text-xs text-muted-foreground mt-1">Válido para {tokenInfo.tenantEmail}</p>
                </div>
              </div>
            )}

            <div className="space-y-3">
              <Label htmlFor="token" className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Token de Activación</Label>
              <div className="relative">
                <KeyRound className="absolute left-4 top-3.5 h-5 w-5 text-muted-foreground" />
                <Input
                  id="token"
                  type="text"
                  placeholder="XXXXXXXX-XXXX"
                  value={token}
                  onChange={(e) => {
                    setToken(e.target.value.toUpperCase());
                    setError("");
                  }}
                  className={`h-12 pl-12 bg-muted/20 border-white/10 rounded-xl font-mono text-lg tracking-widest uppercase ${error ? "border-red-500 focus-visible:ring-red-500" : ""}`}
                />
              </div>
              {error && (
                <div className="flex items-center gap-2 text-xs text-red-500 font-bold animate-in slide-in-from-top-1">
                  <AlertCircle className="h-3.5 w-3.5" />
                  <span>{error}</span>
                </div>
              )}
            </div>

            <div className="p-4 bg-muted/30 rounded-2xl border border-white/5 space-y-3">
              <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">¿Necesitas ayuda?</p>
              <ul className="text-xs text-muted-foreground space-y-2">
                <li className="flex gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-primary/40 shrink-0" />
                  Revisa tu carpeta de spam o correo no deseado.
                </li>
                <li className="flex gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-primary/40 shrink-0" />
                  Verifica que el email usado en el pago sea el correcto.
                </li>
              </ul>
            </div>
          </CardContent>
          <CardFooter className="p-8 pt-0 flex flex-col gap-3">
            <Button
              className="w-full h-14 rounded-2xl bg-primary hover:bg-primary/90 font-bold text-base shadow-lg shadow-primary/20 transition-all active:scale-[0.98]"
              onClick={handleActivate}
              disabled={loading || !token}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Verificando...
                </>
              ) : (
                "Activar Mi Cuenta Elite"
              )}
            </Button>
            <Button
              variant="ghost"
              className="w-full text-xs text-muted-foreground hover:text-foreground rounded-xl"
              onClick={() => setLocation("/pricing")}
            >
              Volver a ver Planes
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
