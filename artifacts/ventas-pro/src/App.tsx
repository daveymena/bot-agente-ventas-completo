import { useEffect, useState, createContext, useContext, lazy, Suspense } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { AnimatePresence, motion } from "framer-motion";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
const NotFound = lazy(() => import("@/pages/not-found"));
import { useAuth } from "@/hooks/useAuth";
const Dashboard = lazy(() => import("@/pages/dashboard"));
const Conversations = lazy(() => import("@/pages/conversations"));
const Agents = lazy(() => import("@/pages/agents"));
const Leads = lazy(() => import("@/pages/leads"));
const PaymentApprovals = lazy(() => import("@/pages/payment-approvals"));
const PedidosPage = lazy(() => import("@/pages/pedidos"));
const PuntoDeVentaPage = lazy(() => import("@/pages/punto-de-venta"));
const Products = lazy(() => import("@/pages/products"));
const WhatsAppConnection = lazy(() => import("@/pages/whatsapp"));
const WhatsAppMonitorPage = lazy(() => import("@/pages/whatsapp-monitor"));
const Settings = lazy(() => import("@/pages/settings"));
const AuthPage = lazy(() => import("@/pages/auth"));
const PricingPage = lazy(() => import("@/pages/pricing"));
const Branding = lazy(() => import("@/pages/branding"));
const SubscriptionSuccessPage = lazy(() => import("@/pages/subscription-success"));
const SubscriptionFailurePage = lazy(() => import("@/pages/subscription-failure"));
const ActivatePage = lazy(() => import("@/pages/activate"));
const OnboardingPage = lazy(() => import("@/pages/onboarding"));
const WooCommercePage = lazy(() => import("@/pages/woocommerce"));
const DropiPage = lazy(() => import("@/pages/dropi"));
const IntegracionesPage = lazy(() => import("@/pages/integraciones"));
const FacebookAdsPage = lazy(() => import("@/pages/facebook"));
const MarketingPage = lazy(() => import("@/pages/marketing"));
const LandingStudioPage = lazy(() => import("@/pages/landing-studio-v2"));
const CreativosPage = lazy(() => import("@/pages/creativos"));
const EstudioPage = lazy(() => import("@/pages/estudio"));
const CodeAgentPage = lazy(() => import("@/pages/code-agent"));
const ArchitectPage = lazy(() => import("@/pages/architect"));
const AdminStorePage = lazy(() => import("@/pages/admin-store"));
const ArenaPage = lazy(() => import("@/pages/arena"));
const AdminTenantsPage = lazy(() => import("@/pages/admin-tenants"));
const PrivacyPolicyPage = lazy(() => import("@/pages/privacy-policy"));
const LandingPage = lazy(() => import("@/pages/landing"));
const HelpCenterPage = lazy(() => import("@/pages/help"));
const AgentLabPage = lazy(() => import("@/pages/agent-lab"));
const ProbarVendedorPage = lazy(() => import("@/pages/probar-vendedor"));
const EnsenarConEjemploPage = lazy(() => import("@/pages/ensenar-con-ejemplo"));
const AgentLabDashboardPage = lazy(() => import("@/pages/agent-lab-dashboard"));
interface SessionContextType { tenant:any|null; isLoading:boolean; isAuthenticated:boolean; logout:()=>Promise<void>; refreshSession:()=>Promise<void>; }
const SessionContext=createContext<SessionContextType>({tenant:null,isLoading:true,isAuthenticated:false,logout:async()=>{},refreshSession:async()=>{}});
export const useSession=()=>useContext(SessionContext);
function TiendaRedirect(){const{tenant,isLoading}=useSession();const[,setLocation]=useLocation();useEffect(()=>{if(isLoading)return;const slug=tenant?.slug||"";window.open(slug?`/tienda/${slug}`:"/tienda","_blank","noopener,noreferrer");setLocation("/");},[tenant,isLoading,setLocation]);return null;}
function HomeRoute(){const{isAuthenticated,isLoading}=useSession();if(isLoading)return null;return isAuthenticated?<Dashboard/>:<LandingPage/>;}
const queryClient=new QueryClient({defaultOptions:{queries:{retry:false,refetchOnWindowFocus:false,staleTime:5000,onError:(error:any)=>{const status=error?.status||error?.response?.status;if(status===401&&window.location.pathname!=="/auth")window.location.href="/auth";}},mutations:{onError:(error:any)=>{const status=error?.status||error?.response?.status;if(status===401&&window.location.pathname!=="/auth")window.location.href="/auth";}}}});
const DiagnosticoPage = lazy(() => import("@/pages/diagnostico"));
function Router(){return <Switch><Route path="/" component={HomeRoute}/><Route path="/conversations" component={Conversations}/><Route path="/agents" component={Agents}/><Route path="/leads" component={Leads}/><Route path="/payment-approvals" component={PaymentApprovals}/><Route path="/pedidos" component={PedidosPage}/><Route path="/punto-de-venta" component={PuntoDeVentaPage}/><Route path="/products" component={Products}/><Route path="/whatsapp" component={WhatsAppConnection}/><Route path="/whatsapp-monitor" component={WhatsAppMonitorPage}/><Route path="/diagnostico" component={DiagnosticoPage}/><Route path="/probar-vendedor" component={ProbarVendedorPage}/><Route path="/ensenar-con-ejemplo" component={EnsenarConEjemploPage}/><Route path="/agent-lab" component={AgentLabPage}/><Route path="/agent-lab-dashboard" component={AgentLabDashboardPage}/><Route path="/settings" component={Settings}/><Route path="/pricing" component={PricingPage}/><Route path="/branding" component={Branding}/><Route path="/woocommerce" component={WooCommercePage}/><Route path="/dropi" component={DropiPage}/><Route path="/integraciones" component={IntegracionesPage}/><Route path="/subscription-success" component={SubscriptionSuccessPage}/><Route path="/subscription-failure" component={SubscriptionFailurePage}/><Route path="/activate" component={ActivatePage}/><Route path="/onboarding" component={OnboardingPage}/><Route path="/facebook" component={FacebookAdsPage}/><Route path="/marketing" component={MarketingPage}/><Route path="/landing-studio" component={LandingStudioPage}/><Route path="/creativos" component={CreativosPage}/><Route path="/estudio" component={EstudioPage}/><Route path="/ayuda" component={HelpCenterPage}/><Route path="/code-agent" component={CodeAgentPage}/><Route path="/architect" component={ArchitectPage}/><Route path="/admin/store" component={AdminStorePage}/><Route path="/mi-tienda" component={TiendaRedirect}/><Route path="/arena" component={ArenaPage}/><Route path="/admin/tenants" component={AdminTenantsPage}/><Route path="/privacidad" component={PrivacyPolicyPage}/><Route path="/auth" component={AuthPage}/><Route component={NotFound}/></Switch>}function AppContent(){const{tenant,isLoading,isAuthenticated,logout,refreshSession}=useAuth();const[location,setLocation]=useLocation();useEffect(()=>{const isPublicRoute=location==="/"||location==="/auth"||location==="/pricing"||location==="/onboarding"||location==="/privacidad"||location==="/mi-tienda"||location.startsWith("/store")||location.startsWith("/tienda");if(!isLoading&&!isAuthenticated&&!isPublicRoute)setLocation("/auth");},[isLoading,isAuthenticated,location,setLocation]);if(isLoading)return <div className="flex items-center justify-center h-screen bg-gray-50"><div className="text-center"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"/><p className="text-gray-600">Verificando sesión...</p></div></div>;return <SessionContext.Provider value={{tenant,isLoading,isAuthenticated,logout,refreshSession}}><Suspense fallback={<div role="status" className="p-8 text-sm text-muted-foreground">Cargando tu espacio de trabajo…</div>}><Router/></Suspense></SessionContext.Provider>}
function App(){return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/,"")}><AppContent/></WouterRouter><Toaster/><SonnerToaster/></TooltipProvider></QueryClientProvider>}
export default App;
