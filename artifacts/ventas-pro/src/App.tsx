import { useEffect, useState, createContext, useContext } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { AnimatePresence, motion } from "framer-motion";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { useAuth } from "@/hooks/useAuth";

import Dashboard from "@/pages/dashboard";
import Conversations from "@/pages/conversations";
import Agents from "@/pages/agents";
import Leads from "@/pages/leads";
import Products from "@/pages/products";
import WhatsAppConnection from "@/pages/whatsapp";
import WhatsAppMonitorPage from "@/pages/whatsapp-monitor";
import Settings from "@/pages/settings";
import AuthPage from "@/pages/auth";
import PricingPage from "@/pages/pricing";
import Branding from "@/pages/branding";
import SubscriptionSuccessPage from "@/pages/subscription-success";
import SubscriptionFailurePage from "@/pages/subscription-failure";
import ActivatePage from "@/pages/activate";
import OnboardingPage from "@/pages/onboarding";
import WooCommercePage from "@/pages/woocommerce";
import FacebookAdsPage from "@/pages/facebook";
import MarketingPage from "@/pages/marketing";
import CodeAgentPage from "@/pages/code-agent";
import ArchitectPage from "@/pages/architect";
import AdminStorePage from "@/pages/admin-store";
import ArenaPage from "@/pages/arena";
import AdminTenantsPage from "@/pages/admin-tenants";
import PrivacyPolicyPage from "@/pages/privacy-policy";
import LandingPage from "@/pages/landing";
import HelpCenterPage from "@/pages/help";

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

// /mi-tienda ya no es una página propia: manda a la tienda pública real
// (packages/tienda, servida por express en /tienda/*), que es una SPA
// completamente distinta. Antes usaba window.location.replace() en la
// MISMA pestaña -- el panel de administración se perdía por completo cada
// vez que alguien quería ver su tienda. Abre en pestaña nueva y devuelve
// esta pestaña al panel, para poder tener las dos cosas a la vista.
function TiendaRedirect() {
  const { tenant, isLoading } = useSession();
  const [, setLocation] = useLocation();
  useEffect(() => {
    // Sin esperar a que cargue la sesión, el primer render tiene tenant=null
    // y mandaba a /tienda sin slug -- o sea a la tienda por defecto, no a la
    // del dueño que hizo click.
    if (isLoading) return;
    const slug = tenant?.slug || '';
    window.open(slug ? `/tienda/${slug}` : "/tienda", "_blank", "noopener,noreferrer");
    setLocation("/");
  }, [tenant, isLoading, setLocation]);
  return null;
}

// "/" es la landing pública para quien no tiene sesión (antes redirigía
// directo a /auth, sin mostrar nada del producto) y el Dashboard de siempre
// para quien ya inició sesión -- una sola ruta, dos vistas según el caso.
function HomeRoute() {
  const { isAuthenticated, isLoading } = useSession();
  if (isLoading) return null;
  return isAuthenticated ? <Dashboard /> : <LandingPage />;
}

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

// Antes cada navegación reemplazaba la página al instante (un corte seco de
// un layout completo a otro, sidebar incluido, porque cada página monta su
// propio <Layout>). AnimatePresence + key={location} hace un fade/slide
// corto entre la página saliente y la entrante en vez de ese salto -- mode
// "wait" para que no se dibujen las dos superpuestas (cada una es un layout
// de página completo, no un fragmento chico), con una duración breve para
// que la espera no se sienta como una pausa.
function Router() {
  return (
    <Switch>
      <Route path="/" component={HomeRoute} />
      <Route path="/conversations" component={Conversations} />
      <Route path="/agents" component={Agents} />
      <Route path="/leads" component={Leads} />
      <Route path="/products" component={Products} />
      <Route path="/whatsapp" component={WhatsAppConnection} />
      <Route path="/whatsapp-monitor" component={WhatsAppMonitorPage} />
      <Route path="/settings" component={Settings} />
      <Route path="/pricing" component={PricingPage} />
      <Route path="/branding" component={Branding} />
      <Route path="/woocommerce" component={WooCommercePage} />
      <Route path="/subscription-success" component={SubscriptionSuccessPage} />
      <Route path="/subscription-failure" component={SubscriptionFailurePage} />
      <Route path="/activate" component={ActivatePage} />
      <Route path="/onboarding" component={OnboardingPage} />
      <Route path="/facebook" component={FacebookAdsPage} />
      <Route path="/marketing" component={MarketingPage} />
      <Route path="/ayuda" component={HelpCenterPage} />
      <Route path="/code-agent" component={CodeAgentPage} />
      <Route path="/architect" component={ArchitectPage} />
      <Route path="/admin/store" component={AdminStorePage} />
      <Route path="/mi-tienda" component={TiendaRedirect} />
      <Route path="/arena" component={ArenaPage} />
      <Route path="/admin/tenants" component={AdminTenantsPage} />
      <Route path="/privacidad" component={PrivacyPolicyPage} />
      <Route path="/auth" component={AuthPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function AppContent() {
  const { tenant, isLoading, isAuthenticated, logout, refreshSession } = useAuth();
  const [location, setLocation] = useLocation();

  useEffect(() => {
    // Redirigir a /auth si no está autenticado y no está ya en una ruta
    // pública. "/" quedó afuera de este redirect: ahora es la landing
    // pública (HomeRoute), antes mandaba a /auth sin mostrar nada del
    // producto a quien todavía no tiene cuenta.
    const isPublicRoute = location === "/" ||
      location === "/auth" ||
      location === "/pricing" ||
      location === "/onboarding" ||
      location === "/privacidad" ||
      location === "/mi-tienda" ||
      location.startsWith("/store") ||
      location.startsWith("/tienda");

    if (!isLoading && !isAuthenticated && !isPublicRoute) {
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
        {/* El contenedor de sonner NUNCA estaba montado, y 27 archivos de la
            app llaman a `toast` de sonner: TODOS esos avisos se dibujaban en
            la nada. El admin lo describió como "le doy a guardar y no muestra
            si guardó, es como estar a ciegas" -- y no era solo guardar: los
            errores tampoco se veían, así que un fallo real parecía que no
            pasaba nada.

            Se montan los dos: el de shadcn lo usan 2 archivos (useToast) y
            sacarlo los dejaría mudos a ellos. Conviven sin problema. */}
        <SonnerToaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;