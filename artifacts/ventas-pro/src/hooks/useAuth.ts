import { useEffect, useState } from "react";

interface Tenant {
  id: string;
  name: string;
  email: string;
  plan: string;
}

interface UseAuthReturn {
  tenant: Tenant | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
}

/**
 * Hook para gestionar la autenticación y sesión del usuario
 */
export function useAuth(): UseAuthReturn {
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Verificar sesión al montar el componente
  useEffect(() => {
    refreshSession();
  }, []);

  /**
   * Verifica la sesión actual del usuario
   */
  const refreshSession = async () => {
    try {
      setIsLoading(true);
      const response = await fetch("/api/auth/me", {
        method: "GET",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (response.ok) {
        const data = await response.json();
        setTenant(data.tenant);
        setIsAuthenticated(true);
      } else if (response.status === 401) {
        setTenant(null);
        setIsAuthenticated(false);
      } else {
        console.error("Error verificando sesión:", response.statusText);
        setTenant(null);
        setIsAuthenticated(false);
      }
    } catch (error) {
      console.error("Error en refreshSession:", error);
      setTenant(null);
      setIsAuthenticated(false);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Cierra la sesión del usuario
   */
  const logout = async () => {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
      });
    } catch (error) {
      console.error("Error en logout:", error);
    } finally {
      setTenant(null);
      setIsAuthenticated(false);
      window.location.href = "/auth";
    }
  };

  return {
    tenant,
    isLoading,
    isAuthenticated,
    logout,
    refreshSession,
  };
}
