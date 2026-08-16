import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";
import { Link } from "wouter";

/**
 * Acá estaba el 404 que trae la plantilla del framework, con el texto
 * "Did you forget to add the page to the router?" -- una pregunta dirigida al
 * desarrollador, en inglés, que veía cualquier cliente que entrara a una URL
 * equivocada (por ejemplo /dashboard, que no existe). Al que se le rompe un
 * link hay que decirle qué pasó y cómo seguir, no preguntarle por el router.
 */
export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gray-50">
      <Card className="w-full max-w-md mx-4">
        <CardContent className="pt-6">
          <div className="flex mb-4 gap-2">
            <AlertCircle className="h-8 w-8 text-amber-500" />
            <h1 className="text-2xl font-bold text-gray-900">Esta página no existe</h1>
          </div>

          <p className="mt-4 text-sm text-gray-600">
            El enlace que seguiste no lleva a ningún lado, o la página cambió de dirección.
          </p>

          <Link
            href="/"
            className="mt-5 inline-block rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800 transition-colors"
          >
            Volver al inicio
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
