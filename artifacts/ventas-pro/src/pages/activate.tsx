import { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, Loader2, AlertCircle } from "lucide-react";

export default function ActivatePage() {
  const [, setLocation] = useLocation();
  const searchParams = new URLSearchParams(useSearch());
  const tokenFromUrl = searchParams.get("token");

  const { toast } = useToast();
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

      toast({
        title: "¡Cuenta activada!",
        description: `Tu plan ${data.subscription.plan} ha sido activado exitosamente`,
      });

      // Redirigir al login después de 3 segundos
      setTimeout(() => {
        setLocation("/auth");
      }, 3000);
    } catch (error: any) {
      console.error("Error activating account:", error);
      setError(error.message || "Error activando la cuenta");
      toast({
        title: "Error",
        description: error.message || "No se pudo activar la cuenta",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  if (verifying) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center justify-center space-y-4">
              <Loader2 className="h-12 w-12 animate-spin text-blue-500" />
              <p className="text-gray-600">Verificando token...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (activated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
              <CheckCircle2 className="h-10 w-10 text-green-600" />
            </div>
            <CardTitle className="text-2xl">¡Cuenta Activada!</CardTitle>
            <CardDescription>
              Tu plan {tokenInfo?.subscription?.plan} ha sido activado exitosamente
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-green-50 border-l-4 border-green-400 p-4 rounded">
              <div className="flex">
                <div className="flex-shrink-0">
                  <CheckCircle2 className="h-5 w-5 text-green-400" />
                </div>
                <div className="ml-3">
                  <p className="text-sm text-green-700">
                    <strong>Email:</strong> {tokenInfo?.tenant?.email}
                  </p>
                  <p className="text-sm text-green-700">
                    <strong>Plan:</strong> {tokenInfo?.subscription?.planName || tokenInfo?.subscription?.plan}
                  </p>
                  <p className="text-sm text-green-700">
                    <strong>Ciclo:</strong> {tokenInfo?.subscription?.billingCycle === "annual" ? "Anual" : "Mensual"}
                  </p>
                </div>
              </div>
            </div>
            <p className="text-center text-sm text-gray-600">
              Serás redirigido al inicio de sesión en unos segundos...
            </p>
          </CardContent>
          <CardFooter>
            <Button className="w-full" onClick={() => setLocation("/auth")}>
              Ir a Iniciar Sesión
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Activar Cuenta</CardTitle>
          <CardDescription>
            Ingresa el token de activación que recibiste por email
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {tokenInfo && (
            <div className="bg-blue-50 border-l-4 border-blue-400 p-4 rounded mb-4">
              <div className="flex">
                <div className="flex-shrink-0">
                  <CheckCircle2 className="h-5 w-5 text-blue-400" />
                </div>
                <div className="ml-3">
                  <p className="text-sm text-blue-700">
                    <strong>Plan:</strong> {tokenInfo.planName}
                  </p>
                  <p className="text-sm text-blue-700">
                    <strong>Ciclo:</strong> {tokenInfo.billingCycle === "annual" ? "Anual" : "Mensual"}
                  </p>
                  <p className="text-sm text-blue-700">
                    <strong>Monto:</strong> {tokenInfo.currency} {tokenInfo.amount}
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="token">Token de Activación</Label>
            <Input
              id="token"
              type="text"
              placeholder="Ingresa tu token aquí"
              value={token}
              onChange={(e) => {
                setToken(e.target.value.toUpperCase());
                setError("");
              }}
              className={error ? "border-red-500" : ""}
            />
            {error && (
              <div className="flex items-center gap-2 text-sm text-red-500">
                <AlertCircle className="h-4 w-4" />
                <span>{error}</span>
              </div>
            )}
          </div>

          <div className="bg-gray-50 border border-gray-200 p-4 rounded">
            <p className="text-sm text-gray-600">
              📧 <strong>¿No recibiste el email?</strong>
            </p>
            <ul className="text-sm text-gray-600 mt-2 space-y-1 ml-4">
              <li>• Revisa tu carpeta de spam</li>
              <li>• Verifica que el email sea correcto</li>
              <li>• El email puede tardar unos minutos en llegar</li>
            </ul>
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-2">
          <Button
            className="w-full"
            onClick={handleActivate}
            disabled={loading || !token}
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Activando...
              </>
            ) : (
              "Activar Cuenta"
            )}
          </Button>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => setLocation("/pricing")}
          >
            Volver a Planes
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
