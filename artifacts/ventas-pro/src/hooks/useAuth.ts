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
      
      // Leer tenant_id de localStorage como fallback al cookie
      const localTenantId = localStorage.getItem("tenant_id");
      
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      
      // Enviar como header si existe en localStorage (funciona detrás de proxies HTTPS)
      if (localTenantId) {
        headers["X-Tenant-Id"] = localTenantId;
      }
      
      const response = await fetch("/api/auth/me", {
        method: "GET",
        credentials: "include",
        headers,
      });

      if (response.ok) {
        const data = await response.json();
        setTenant(data.tenant);
        setIsAuthenticated(true);
        // Persistir el ID en localStorage para la próxima visita
        if (data.tenant?.id) {
          localStorage.setItem("tenant_id", String(data.tenant.id));
        }
      } else if (response.status === 401) {
        setTenant(null);
        setIsAuthenticated(false);
        localStorage.removeItem("tenant_id");
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
      localStorage.removeItem("tenant_id"); // Limpiar tambi\u00e9n localStorage
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
