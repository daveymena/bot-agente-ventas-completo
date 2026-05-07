import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { XCircle } from "lucide-react";

export default function SubscriptionFailurePage() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <XCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />
          <CardTitle className="text-2xl">Pago Cancelado</CardTitle>
          <CardDescription>Tu pago no pudo ser procesado</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-sm text-red-800">
              El pago fue cancelado o rechazado. Esto puede ocurrir por:
            </p>
            <ul className="list-disc list-inside text-sm text-red-800 mt-2 space-y-1">
              <li>Cancelaste el proceso de pago</li>
              <li>Fondos insuficientes</li>
              <li>Datos de pago incorrectos</li>
              <li>Problemas con el procesador de pagos</li>
            </ul>
          </div>

          <div className="flex gap-2">
            <Button className="flex-1" onClick={() => setLocation("/pricing")}>
              Intentar Nuevamente
            </Button>
            <Button variant="outline" className="flex-1" onClick={() => setLocation("/")}>
              Volver al Inicio
            </Button>
          </div>

          <div className="text-center">
            <p className="text-sm text-gray-600">
              ¿Necesitas ayuda?{" "}
              <a href="mailto:support@sofiaai.com" className="text-blue-600 hover:underline">
                Contacta a soporte
              </a>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
