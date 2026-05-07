import { Switch, Route, Router as WouterRouter } from "wouter";
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
import Billing from "@/pages/billing";

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
      <Route path="/billing" component={Billing} />
      <Route path="/auth" component={AuthPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;