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
import PaymentApprovals from "@/pages/payment-approvals";
import PedidosPage from "@/pages/pedidos";
import PuntoDeVentaPage from "@/pages/punto-de-venta";
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
import DropiPage from "@/pages/dropi";
import IntegracionesPage from "@/pages/integraciones";
import FacebookAdsPage from "@/pages/facebook";
import MarketingPage from "@/pages/marketing";
import LandingStudioPage from "@/pages/landing-studio-v2";
import EstudioPage from "@/pages/estudio";
import CodeAgentPage from "@/pages/code-agent";
import ArchitectPage from "@/pages/architect";
import AdminStorePage from "@/pages/admin-store";
import ArenaPage from "@/pages/arena";
import AdminTenantsPage from "@/pages/admin-tenants";
import PrivacyPolicyPage from "@/pages/privacy-policy";
import LandingPage from "@/pages/landing";
import HelpCenterPage from "@/pages/help";
import AgentLabPage from "@/pages/agent-lab";
import ProbarVendedorPage from "@/pages/probar-vendedor";
import EnsenarConEjemploPage from "@/pages/ensenar-con-ejemplo";
import AgentLabDashboardPage from "@/pages/agent-lab-dashboard";
interface SessionContextType { tenant:any|null; isLoading:boolean; isAuthenticated:boolean; logout:()=>Promise<void>; refreshSession:()=>Promise<void>; }
const SessionContext=createContext<SessionContextType>({tenant:null,isLoading:true,isAuthenticated:false,logout:async()=>{},refreshSession:async()=>{}});
export const useSession=()=>useContext(SessionContext);
function TiendaRedirect(){const{tenant,isLoading}=useSession();const[,setLocation]=useLocation();useEffect(()=>{if(isLoading)return;const slug=tenant?.slug||"";window.open(slug?`/tienda/${slug}`:"/tienda","_blank","noopener,noreferrer");setLocation("/");},[tenant,isLoading,setLocation]);return null;}
function HomeRoute(){const{isAuthenticated,isLoading}=useSession();if(isLoading)return null;return isAuthenticated?<Dashboard/>:<LandingPage/>;}
// Un 401 aislado (una petición sin cookie al volver de otra página) no debe
// sacar al usuario de la app. Antes de mandarlo a /auth se confirma con
// /api/auth/me: si la sesión sigue viva, solo se vuelven a pedir los datos.
let verificandoSesion = false;
async function verificarSesionAntesDeSalir() {
  if (verificandoSesion || window.location.pathname === "/auth") return;
  verificandoSesion = true;
  try {
    const r = await fetch("/api/auth/me", { credentials: "include" });
    if (r.status === 401) {
      window.location.href = "/auth";
    } else {
      queryClient.invalidateQueries();
    }
  } catch {
    // Sin red: no se saca al usuario; la app sigue y reintenta sola.
  } finally {
    verificandoSesion = false;
  }
}
const queryClient=new QueryClient({defaultOptions:{queries:{retry:false,refetchOnWindowFocus:false,staleTime:5000,onError:(error:any)=>{const status=error?.status||error?.response?.status;if(status===401)verificarSesionAntesDeSalir();}},mutations:{onError:(error:any)=>{const status=error?.status||error?.response?.status;if(status===401)verificarSesionAntesDeSalir();}}}});
import DiagnosticoPage from "@/pages/diagnostico";
/** /creativos vive dentro de /estudio: se conserva el producto y el espacio. */
function IrAEstudioCreativos(){const[,setLocation]=useLocation();useEffect(()=>{const q=window.location.search.replace(/^\?/,"");setLocation("/estudio?espacio=creativos"+(q?"&"+q:""));},[setLocation]);return null}
function Router(){return <Switch><Route path="/" component={HomeRoute}/><Route path="/conversations" component={Conversations}/><Route path="/agents" component={Agents}/><Route path="/leads" component={Leads}/><Route path="/payment-approvals" component={PaymentApprovals}/><Route path="/pedidos" component={PedidosPage}/><Route path="/punto-de-venta" component={PuntoDeVentaPage}/><Route path="/products" component={Products}/><Route path="/whatsapp" component={WhatsAppConnection}/><Route path="/whatsapp-monitor" component={WhatsAppMonitorPage}/><Route path="/diagnostico" component={DiagnosticoPage}/><Route path="/probar-vendedor" component={ProbarVendedorPage}/><Route path="/ensenar-con-ejemplo" component={EnsenarConEjemploPage}/><Route path="/agent-lab" component={AgentLabPage}/><Route path="/agent-lab-dashboard" component={AgentLabDashboardPage}/><Route path="/settings" component={Settings}/><Route path="/pricing" component={PricingPage}/><Route path="/branding" component={Branding}/><Route path="/woocommerce" component={WooCommercePage}/><Route path="/dropi" component={DropiPage}/><Route path="/integraciones" component={IntegracionesPage}/><Route path="/subscription-success" component={SubscriptionSuccessPage}/><Route path="/subscription-failure" component={SubscriptionFailurePage}/><Route path="/activate" component={ActivatePage}/><Route path="/onboarding" component={OnboardingPage}/><Route path="/facebook" component={FacebookAdsPage}/><Route path="/marketing" component={MarketingPage}/><Route path="/landing-studio" component={LandingStudioPage}/><Route path="/creativos" component={IrAEstudioCreativos}/><Route path="/estudio" component={EstudioPage}/><Route path="/ayuda" component={HelpCenterPage}/><Route path="/code-agent" component={CodeAgentPage}/><Route path="/architect" component={ArchitectPage}/><Route path="/admin/store" component={AdminStorePage}/><Route path="/mi-tienda" component={TiendaRedirect}/><Route path="/arena" component={ArenaPage}/><Route path="/admin/tenants" component={AdminTenantsPage}/><Route path="/privacidad" component={PrivacyPolicyPage}/><Route path="/auth" component={AuthPage}/><Route component={NotFound}/></Switch>}function AppContent(){const{tenant,isLoading,isAuthenticated,logout,refreshSession}=useAuth();const[location,setLocation]=useLocation();useEffect(()=>{const isPublicRoute=location==="/"||location==="/auth"||location==="/pricing"||location==="/onboarding"||location==="/privacidad"||location==="/mi-tienda"||location.startsWith("/store")||location.startsWith("/tienda");if(!isLoading&&!isAuthenticated&&!isPublicRoute)setLocation("/auth");},[isLoading,isAuthenticated,location,setLocation]);if(isLoading)return <div className="flex items-center justify-center h-screen bg-gray-50"><div className="text-center"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"/><p className="text-gray-600">Verificando sesión...</p></div></div>;return <SessionContext.Provider value={{tenant,isLoading,isAuthenticated,logout,refreshSession}}><Router/></SessionContext.Provider>}
function App(){return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/,"")}><AppContent/></WouterRouter><Toaster/><SonnerToaster/></TooltipProvider></QueryClientProvider>}
export default App;
