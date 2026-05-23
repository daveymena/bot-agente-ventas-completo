import { useEffect, useState, createContext, useContext } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { useAuth } from "@/hooks/useAuth";

import Dashboard from "@/pages/dashboard";
import Conversations from "@/pages/conversations";
import Agents from "@/pages/agents";
import Leads from "@/pages/leads";
import Products from "@/pages/products";
import WhatsAppConnection from "@/pages/whatsapp";
import Settings from "@/pages/settings";
import CodeAgent from "@/pages/code-agent";
import CodeAgentVisual from "@/pages/code-agent-visual";
import AuthPage from "@/pages/auth";
import PricingPage from "@/pages/pricing";
import Branding from "@/pages/branding";
import StoreShop from "@/pages/tienda/Shop";
import StoreCart from "@/pages/tienda/Cart";
import StoreHome from "@/pages/tienda/Home";
import { StoreProvider } from "@/pages/tienda/store-context";
import { StoreLayout } from "@/pages/tienda/StoreLayout";
import MiTiendaPage from "@/pages/mi-tienda";
import SubscriptionSuccessPage from "@/pages/subscription-success";
import SubscriptionFailurePage from "@/pages/subscription-failure";
import ActivatePage from "@/pages/activate";
import OnboardingPage from "@/pages/onboarding";
import AdminTenantsPage from "@/pages/admin-tenants";
import AdminStorePage from "@/pages/admin-store";
import WooCommercePage from "@/pages/woocommerce";
import StoreEditorPage from "@/pages/store-editor/StoreEditorPage";

// Context para la sesión
interface SessionContextType {
  tenant: any | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
}

const SessionContext = createContext<SessionContextType>({
  tenant: null,
  isLoading: true,
  isAuthenticated: false,
  logout: async () => {},
  refreshSession: async () => {},
});

export const useSession = () => useContext(SessionContext);

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
      <Route path="/architect" component={CodeAgentVisual} />
      <Route path="/pricing" component={PricingPage} />
      <Route path="/branding" component={Branding} />
      <Route path="/woocommerce" component={WooCommercePage} />
      <Route path="/subscription-success" component={SubscriptionSuccessPage} />
      <Route path="/subscription-failure" component={SubscriptionFailurePage} />
      <Route path="/activate" component={ActivatePage} />
      <Route path="/onboarding" component={OnboardingPage} />
      <Route path="/store/:slug/carrito">
        <StoreProvider>
          <StoreLayout>
            <StoreCart />
          </StoreLayout>
        </StoreProvider>
      </Route>
      <Route path="/store/:slug/productos">
        <StoreProvider>
          <StoreLayout>
            <StoreShop />
          </StoreLayout>
        </StoreProvider>
      </Route>
      <Route path="/store/:slug/categoria/:type">
        <StoreProvider>
          <StoreLayout>
            <StoreShop />
          </StoreLayout>
        </StoreProvider>
      </Route>
      <Route path="/store/:slug">
        <StoreProvider>
          <StoreLayout>
            <StoreHome />
          </StoreLayout>
        </StoreProvider>
      </Route>
      <Route path="/mi-tienda" component={MiTiendaPage} />
      <Route path="/admin/tenants" component={AdminTenantsPage} />
      <Route path="/admin/store" component={AdminStorePage} />
      <Route path="/admin/store/editor" component={StoreEditorPage} />
      <Route path="/auth" component={AuthPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function AppContent() {
  const { tenant, isLoading, isAuthenticated, logout, refreshSession } = useAuth();
  const [location, setLocation] = useLocation();

  useEffect(() => {
    // Redirigir a /auth si no está autenticado y no está ya en /auth o /pricing
    if (!isLoading && !isAuthenticated && location !== "/auth" && location !== "/pricing" && location !== "/onboarding" && !location.startsWith("/store/") && !location.startsWith("/tienda/")) {
      console.log("🔒 No autenticado, redirigiendo a /auth...");
      setLocation("/auth");
    }
  }, [isLoading, isAuthenticated, location, setLocation]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600">Verificando sesión...</p>
        </div>
      </div>
    );
  }

  return (
    <SessionContext.Provider value={{ tenant, isLoading, isAuthenticated, logout, refreshSession }}>
      <Router />
    </SessionContext.Provider>
  );
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