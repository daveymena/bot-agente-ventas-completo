import { useEffect, useState } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";

import Dashboard from "@/pages/dashboard";
import Conversations from "@/pages/conversations";
import Agents from "@/pages/agents";
import Leads from "@/pages/leads";
import Products from "@/pages/products";
import WhatsAppConnection from "@/pages/whatsapp";
import Settings from "@/pages/settings";
import CodeAgent from "@/pages/code-agent";
import AuthPage from "@/pages/auth";
import PricingPage from "@/pages/pricing";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
      staleTime: 5000,
      onError: (error: any) => {
        const status = error?.status || error?.response?.status;
        if (status === 401 && window.location.pathname !== "/auth") {
          console.log("🔒 Sesión expirada o inválida. Redirigiendo a Auth...");
          window.location.href = "/auth";
        }
      },
    },
    mutations: {
      onError: (error: any) => {
        const status = error?.status || error?.response?.status;
        if (status === 401 && window.location.pathname !== "/auth") {
          window.location.href = "/auth";
        }
      },
    },
  },
});

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/conversations" component={Conversations} />
      <Route path="/agents" component={Agents} />
      <Route path="/leads" component={Leads} />
      <Route path="/products" component={Products} />
      <Route path="/whatsapp" component={WhatsAppConnection} />
      <Route path="/settings" component={Settings} />
      <Route path="/code-agent" component={CodeAgent} />
      <Route path="/pricing" component={PricingPage} />
      <Route path="/auth" component={AuthPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function AppContent() {
  const [, setLocation] = useLocation();
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    // Verificar sesión al cargar la app
    const checkSession = async () => {
      try {
        const response = await fetch("/api/auth/me", {
          credentials: "include",
        });

        if (!response.ok) {
          // No hay sesión, redirigir a login
          console.log("📍 No hay sesión. Redirigiendo a /auth");
          setLocation("/auth");
        } else {
          // Hay sesión, permitir navegación normal
          console.log("✅ Sesión válida");
          // Si está en /auth, redirigir al dashboard
          if (window.location.pathname === "/auth") {
            setLocation("/");
          }
        }
      } catch (error) {
        console.error("❌ Error verificando sesión:", error);
        setLocation("/auth");
      } finally {
        setIsChecking(false);
      }
    };

    checkSession();
  }, [setLocation]);

  if (isChecking) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600">Verificando sesión...</p>
        </div>
      </div>
    );
  }

  return <Router />;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <AppContent />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;