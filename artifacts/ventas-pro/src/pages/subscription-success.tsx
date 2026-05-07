import { useLocation, useSearch } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, Mail, ArrowRight } from "lucide-react";

export default function SubscriptionSuccessPage() {
  const [, setLocation] = useLocation();
  const searchParams = new URLSearchParams(useSearch());
  const email = searchParams.get("email");

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
            <CheckCircle2 className="h-10 w-10 text-green-600" />
          </div>
          <CardTitle className="text-2xl">¡Pago Exitoso!</CardTitle>
          <CardDescription>
            Tu pago ha sido procesado correctamente
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
                  Tu pago ha sido confirmado exitosamente. En unos momentos recibirás un email con tu token de activación.
                </p>
              </div>
            </div>
          </div>

          {email && (
            <div className="bg-blue-50 border-l-4 border-blue-400 p-4 rounded">
              <div className="flex">
                <div className="flex-shrink-0">
                  <Mail className="h-5 w-5 text-blue-400" />
                </div>
                <div className="ml-3">
                  <p className="text-sm text-blue-700">
                    <strong>Email:</strong> {email}
                  </p>
                  <p className="text-sm text-blue-700 mt-1">
                    Revisa tu bandeja de entrada y carpeta de spam.
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <h3 className="font-semibold text-sm">Próximos pasos:</h3>
            <ol className="list-decimal list-inside space-y-2 text-sm text-gray-600">
              <li>Revisa tu email para encontrar el token de activación</li>
              <li>Copia el token que recibiste</li>
              <li>Haz clic en "Activar Cuenta" abajo</li>
              <li>Ingresa tu token para activar tu plan</li>
            </ol>
          </div>

          <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded">
            <p className="text-sm text-yellow-700">
              ⏱️ El email puede tardar unos minutos en llegar. Si no lo recibes en 10 minutos, contacta al soporte.
            </p>
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-2">
          <Button className="w-full" onClick={() => setLocation("/activate")}>
            <ArrowRight className="mr-2 h-4 w-4" />
            Activar Cuenta
          </Button>
          <Button variant="outline" className="w-full" onClick={() => setLocation("/pricing")}>
            Volver a Planes
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
