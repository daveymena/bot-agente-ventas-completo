import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  MessageSquare,
  Bot,
  Users,
  Package,
  Phone,
  Settings,
  Badge,
  Wand2,
  Palette,
  ShoppingCart,
  Eye,
  Facebook,
  Activity,
  Crown,
  HelpCircle,
  Megaphone,
  LayoutTemplate,
  ChevronDown,
  LogOut
} from "lucide-react";
import { Sidebar, SidebarContent, SidebarHeader, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarProvider, SidebarTrigger, SidebarGroup, SidebarGroupContent, SidebarGroupLabel } from "./ui/sidebar";
import { Badge as UiBadge } from "@/components/ui/badge";
import { useGetWhatsAppStatus, getGetWhatsAppStatusQueryKey } from "@workspace/api-client-react";
import { useSaasStatus } from "@/hooks/useSaasStatus";
import { useSession } from "@/App";
import { MobileNav } from "./mobile-nav";
import { HelpChatWidget } from "./HelpChatWidget";
import { useIsMobile } from "@/hooks/use-mobile";

export function AppSidebar() {
  const [location] = useLocation();

  const { data: wsStatus } = useGetWhatsAppStatus({
    query: { refetchInterval: 5000, queryKey: getGetWhatsAppStatusQueryKey() }
  });

  const { saasStatus } = useSaasStatus();
  const { tenant: sessionTenant } = useSession();
  const currentPlan = saasStatus?.plan;
  const isPremium = currentPlan && currentPlan !== 'free' && currentPlan !== 'basic';
  const isAdmin = !!sessionTenant?.isAdmin;

  const groupedNavItems = [
    {
      label: "Operación",
      items: [
        { label: "Inicio", href: "/", icon: LayoutDashboard },
        { label: "Conversaciones", href: "/conversations", icon: MessageSquare },
        { label: "Prospectos", href: "/leads", icon: Users },
        { label: "Productos", href: "/products", icon: Package },
        ...(sessionTenant?.slug ? [{ label: "Pedidos", href: "/woocommerce", icon: ShoppingCart }] : []), // O WooCommerce según aplique
      ]
    },
    {
      label: "Automatización",
      items: [
        { label: "Agentes IA", href: "/agents", icon: Bot },
        { label: "WhatsApp", href: "/whatsapp", icon: Phone },
      ]
    },
    {
      label: "Crecimiento",
      items: [
        { label: "Marketing", href: "/marketing", icon: Megaphone },
        { label: "Facebook", href: "/facebook", icon: Facebook },
        { label: "Landing Studio", href: "/landing-studio", icon: LayoutTemplate },
      ]
    },
    {
      label: "Sistema",
      items: [
        { label: "Configuración", href: "/settings", icon: Settings },
        { label: "Personalización", href: "/branding", icon: Palette },
        { label: "Plan", href: "/pricing", icon: Badge },
        { label: "Ayuda", href: "/ayuda", icon: HelpCircle },
      ]
    }
  ];

  const adminItems = isAdmin ? [
    { label: "Monitor WA", href: "/whatsapp-monitor", icon: Activity },
    { label: "Administrador", href: "/admin/tenants", icon: Crown },
  ] : [];

  return (
    <Sidebar className="border-r border-slate-200 bg-slate-50 text-slate-800">
      <SidebarHeader className="flex flex-col gap-4 px-4 py-5 border-b border-slate-200">
        <div className="flex items-center justify-between">
          <Link href="/" className="flex items-center transition-opacity hover:opacity-80">
            {/* Se usa el logo principal oscuro, si hay uno. Aquí asumo que logo.svg o similar existe, o reutilizamos texto/logo */}
            <span className="font-bold text-xl text-slate-900 tracking-tight flex items-center gap-2">
              <div className="w-6 h-6 bg-indigo-600 rounded-md flex items-center justify-center">
                <span className="text-white text-xs">V</span>
              </div>
              VentasPro
            </span>
          </Link>
          {isPremium && (
            <UiBadge className="bg-amber-100 text-amber-700 border-none text-[10px] font-bold tracking-tight">
              PRO
            </UiBadge>
          )}
        </div>
        
        {/* Atlas VentasPro destacado */}
        <Link href="/code-agent" className="group">
          <div className={`flex items-center gap-3 px-3 py-2 rounded-lg border transition-all ${location === '/code-agent' ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm' : 'bg-white border-slate-200 text-slate-700 hover:border-indigo-300 hover:bg-indigo-50'}`}>
            <Wand2 className={`w-4 h-4 ${location === '/code-agent' ? 'text-indigo-200' : 'text-indigo-600 group-hover:text-indigo-700'}`} />
            <span className="text-sm font-medium">Atlas Operator</span>
          </div>
        </Link>
      </SidebarHeader>
      
      <SidebarContent className="px-3 py-4 gap-6 scrollbar-none">
        {groupedNavItems.map((group, idx) => (
          <SidebarGroup key={idx} className="pt-0">
            <SidebarGroupLabel className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 px-3">
              {group.label}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="gap-1">
                {group.items.map((item) => {
                  const isActive = location === item.href;
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        asChild
                        isActive={isActive}
                        tooltip={item.label}
                        className={`group flex items-center h-9 rounded-md transition-colors ${isActive ? 'bg-indigo-50 text-indigo-700 font-semibold' : 'text-slate-600 font-medium hover:text-indigo-700 hover:bg-slate-100'}`}
                      >
                        <Link href={item.href} className="flex items-center gap-3 px-3 w-full">
                          <item.icon className={`h-4 w-4 shrink-0 ${isActive ? 'text-indigo-600' : 'text-slate-400 group-hover:text-indigo-500'}`} />
                          <span className="text-[13px]">{item.label}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}

        {isAdmin && (
          <SidebarGroup className="pt-0">
            <SidebarGroupLabel className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 px-3">
              Administración
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="gap-1">
                {adminItems.map((item) => {
                  const isActive = location === item.href;
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        asChild
                        isActive={isActive}
                        className={`group flex items-center h-9 rounded-md transition-colors ${isActive ? 'bg-indigo-50 text-indigo-700 font-semibold' : 'text-slate-600 font-medium hover:text-indigo-700 hover:bg-slate-100'}`}
                      >
                        <Link href={item.href} className="flex items-center gap-3 px-3 w-full">
                          <item.icon className={`h-4 w-4 shrink-0 ${isActive ? 'text-indigo-600' : 'text-slate-400 group-hover:text-indigo-500'}`} />
                          <span className="text-[13px]">{item.label}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <div className="mt-auto p-4 border-t border-slate-200 bg-white">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="relative flex h-2 w-2">
              {wsStatus?.state === 'connected' && <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping"></span>}
              <span className={`relative inline-flex rounded-full h-2 w-2 ${wsStatus?.state === 'connected' ? 'bg-emerald-500' : 'bg-red-500'}`}></span>
            </div>
            <span className="text-xs font-medium text-slate-600">{wsStatus?.state === 'connected' ? 'WhatsApp Online' : 'Desconectado'}</span>
          </div>
        </div>

        <button 
          onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); window.location.href = "/auth"; }} 
          className="flex w-full items-center gap-2 text-xs font-medium px-3 py-2 rounded-md bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100 transition-colors"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Cerrar Sesión</span>
        </button>
      </div>
    </Sidebar>
  );
}

export function Layout({ children, chatCompleto = false }: { children: React.ReactNode; chatCompleto?: boolean }) {
  const isMobile = useIsMobile();
  const { tenant } = useSession();

  return (
    <SidebarProvider>
      <div className="flex h-screen w-full bg-[#f8fafc] relative overflow-x-hidden text-slate-900 font-sans">
        {!isMobile && <AppSidebar />}
        <div className="flex flex-1 flex-col w-full min-w-0 relative z-10">
          <header className="flex h-14 items-center gap-4 border-b border-slate-200 bg-white px-4 md:px-6 sticky top-0 z-20">
            {!isMobile && (
              <SidebarTrigger className="text-slate-500 hover:bg-slate-100 rounded-md w-8 h-8 flex items-center justify-center transition-colors" />
            )}
            <div className="flex-1 min-w-0 flex items-center gap-4">
              {/* Command Palette Trigger (visual mockup for now) */}
              <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-slate-100 border border-slate-200 rounded-md text-slate-400 text-sm w-64">
                <span className="flex-1">Buscar...</span>
                <kbd className="hidden sm:inline-flex h-5 items-center gap-1 rounded border border-slate-300 bg-slate-50 px-1.5 font-mono text-[10px] font-medium text-slate-500">
                  <span className="text-xs">⌘</span>K
                </kbd>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {tenant?.slug && (
                <a href={`/tienda/${tenant.slug}?from=panel`} target="_blank" rel="noopener noreferrer" className="hidden sm:flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-indigo-600">
                  <Eye className="w-4 h-4" />
                  Ver Tienda
                </a>
              )}
              <div className="w-8 h-8 rounded-full bg-indigo-100 border border-indigo-200 flex items-center justify-center text-indigo-700 font-semibold text-sm">
                {tenant?.name?.charAt(0)?.toUpperCase() || 'U'}
              </div>
            </div>
          </header>
          <main className={`flex-1 ${chatCompleto ? "p-0 overflow-hidden" : "p-4 md:p-8 overflow-y-auto"} overflow-x-hidden scroll-smooth flex flex-col h-full min-h-0`}>
            <div className={`max-w-[1440px] mx-auto w-full md:flex-1 md:flex md:flex-col md:min-h-0 ${chatCompleto ? "flex-1 flex flex-col min-h-0 pb-[calc(80px+env(safe-area-inset-bottom))] md:pb-0" : "pb-[calc(100px+env(safe-area-inset-bottom))] md:pb-8"}`}>
              {children}
            </div>
          </main>
        </div>
        <MobileNav />
        <HelpChatWidget ocultoEnMovil={chatCompleto} />
      </div>
    </SidebarProvider>
  );
}

