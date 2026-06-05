import { useEffect, useState } from "react";

interface SaasStatus {
  plan: string;
  status: "trial" | "active" | "inactive" | "suspended";
  trialDaysRemaining: number | null;
  createdAt: string;
}

export function useSaasStatus() {
  const [saasStatus, setSaasStatus] = useState<SaasStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchSaasStatus = async () => {
      try {
        const response = await fetch("/api/auth/me", {
          credentials: "include",
        });

        if (!response.ok) {
          throw new Error("No se pudo obtener el estado del plan");
        }

        const data = await response.json();
        setSaasStatus({
          plan: data.tenant.plan,
          status: data.tenant.status,
          trialDaysRemaining: data.tenant.trialDaysRemaining,
          createdAt: data.tenant.createdAt,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error desconocido");
      } finally {
        setLoading(false);
      }
    };

    fetchSaasStatus();
  }, []);

  return { saasStatus, loading, error };
}
