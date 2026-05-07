import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AnimatePresence } from "framer-motion";
import NotFound from "@/pages/not-found";

import LandingPage from "@/pages/landing";
import Dashboard from "@/pages/dashboard";
import Conversations from "@/pages/conversations";
import Agents from "@/pages/agents";
import Leads from "@/pages/leads";
import Products from "@/pages/products";
import WhatsAppConnection from "@/pages/whatsapp";
import Settings from "@/pages/settings";
import CodeAgent from "@/pages/code-agent";
import AuthPage from "@/pages/auth";
import Billing from "@/pages/billing";
import WooCommercePage from "@/pages/woocommerce";
import NichesPage from "@/pages/niches";
import StorePage from "@/pages/store";
import AIProvidersPage from "@/pages/ai-providers";
import { PageTransition } from "@/components/PageTransition";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
      staleTime: 5000,
      onError: (error: any) => {
        const status = error?.status || error?.response?.status;
        if (status === 401 && window.location.pathname !== "/auth" && window.location.pathname !== "/") {
          window.location.href = "/";
        }
      },
    },
    mutations: {
      onError: (error: any) => {
        const status = error?.status || error?.response?.status;
        if (status === 401 && window.location.pathname !== "/auth" && window.location.pathname !== "/") {
          window.location.href = "/";
        }
      },
    },
  },
});

function AnimatedRouter() {
  const [location] = useLocation();

  return (
    <AnimatePresence mode="wait" initial={false}>
      <PageTransition routeKey={location}>
        <Switch>
          <Route path="/" component={LandingPage} />
          <Route path="/dashboard" component={Dashboard} />
          <Route path="/conversations" component={Conversations} />
          <Route path="/agents" component={Agents} />
          <Route path="/leads" component={Leads} />
          <Route path="/products" component={Products} />
          <Route path="/whatsapp" component={WhatsAppConnection} />
          <Route path="/settings" component={Settings} />
          <Route path="/code-agent" component={CodeAgent} />
          <Route path="/billing" component={Billing} />
          <Route path="/woocommerce" component={WooCommercePage} />
          <Route path="/niches" component={NichesPage} />
          <Route path="/store" component={StorePage} />
          <Route path="/ai-providers" component={AIProvidersPage} />
          <Route path="/auth" component={AuthPage} />
          <Route component={NotFound} />
        </Switch>
      </PageTransition>
    </AnimatePresence>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <AnimatedRouter />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
