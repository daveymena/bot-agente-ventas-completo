import { AlertCircle, Clock, Zap } from "lucide-react";
import { Link } from "wouter";
import { useSaasStatus } from "@/hooks/useSaasStatus";

const PLAN_NAMES: Record<string, string> = {
  free: "Gratis",
  starter: "Iniciador",
  professional: "Profesional",
  enterprise: "Empresarial",
};

export function SaasStatusBanner() {
  const { saasStatus, loading } = useSaasStatus();

  if (loading || !saasStatus) {
    return null;
  }

  // Si está en período de prueba y quedan pocos días
  if (saasStatus.status === "trial" && saasStatus.trialDaysRemaining !== null) {
    if (saasStatus.trialDaysRemaining <= 3) {
      return (
        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-4 mb-6 flex items-start gap-4">
          <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="font-semibold text-amber-900 dark:text-amber-100">
              Tu período de prueba vence pronto
            </h3>
            <p className="text-sm text-amber-800 dark:text-amber-200 mt-1">
              Te quedan {saasStatus.trialDaysRemaining} día{saasStatus.trialDaysRemaining !== 1 ? "s" : ""} de acceso gratuito. 
              Actualiza tu plan para continuar usando Sofía.
            </p>
            <Link href="/pricing" className="inline-flex items-center gap-2 mt-3 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-medium transition-colors">
              <Zap className="h-4 w-4" />
              Ver planes
            </Link>
          </div>
        </div>
      );
    }

    return (
      <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-6 flex items-start gap-4">
        <Clock className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <h3 className="font-semibold text-blue-900 dark:text-blue-100">
            Estás en período de prueba
          </h3>
          <p className="text-sm text-blue-800 dark:text-blue-200 mt-1">
            Plan: <span className="font-semibold">{PLAN_NAMES[saasStatus.plan] || saasStatus.plan}</span> • 
            Te quedan {saasStatus.trialDaysRemaining} día{saasStatus.trialDaysRemaining !== 1 ? "s" : ""}
          </p>
        </div>
      </div>
    );
  }

  // Si la cuenta está suspendida
  if (saasStatus.status === "suspended") {
    return (
      <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-6 flex items-start gap-4">
        <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <h3 className="font-semibold text-red-900 dark:text-red-100">
            Tu cuenta ha sido suspendida
          </h3>
          <p className="text-sm text-red-800 dark:text-red-200 mt-1">
            Por favor, contacta con soporte para más información.
          </p>
        </div>
      </div>
    );
  }

  return null;
}
