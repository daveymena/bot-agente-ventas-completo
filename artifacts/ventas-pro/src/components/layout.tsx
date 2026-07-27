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
  Facebook
} from "lucide-react";
import { Sidebar, SidebarContent, SidebarHeader, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarProvider, SidebarTrigger, SidebarGroup, SidebarGroupContent } from "./ui/sidebar";
import { Badge as UiBadge } from "@/components/ui/badge";
import { useGetWhatsAppStatus, getGetWhatsAppStatusQueryKey } from "@workspace/api-client-react";
import { useSaasStatus } from "@/hooks/useSaasStatus";
import { useSession } from "@/App";
import { MobileNav } from "./mobile-nav";
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
  const isAdmin = sessionTenant?.email === 'daveymena16@gmail.com';

  const allNavItems = [
    { label: "Panel", href: "/", icon: LayoutDashboard },
    { label: "Conversaciones", href: "/conversations", icon: MessageSquare },
    { label: "Agentes IA", href: "/agents", icon: Bot },
    { label: "Prospectos", href: "/leads", icon: Users },
    { label: "Productos", href: "/products", icon: Package },
    { label: "WhatsApp", href: "/whatsapp", icon: Phone },
    { label: "WooCommerce", href: "/woocommerce", icon: ShoppingCart },
    { label: "Arquitecto IA", href: "/code-agent", icon: Wand2 },
    { label: "Personalización", href: "/branding", icon: Palette },
    { label: "Facebook", href: "/facebook", icon: Facebook },
    { label: "Configuración", href: "/settings", icon: Settings },
    { label: "Planes", href: "/pricing", icon: Badge },
    ...(sessionTenant?.slug ? [{ label: "Ver Tienda", href: `/mi-tienda`, icon: Eye }] : []),
];

  return (
    <Sidebar className="border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      <SidebarHeader className="flex h-16 items-center border-b border-sidebar-border px-5">
        <Link href="/" className="flex items-center transition-all duration-300 hover:scale-[1.02] group">
          {/* Logo optimizado para sidebar oscuro */}
          <img 
            src="/logo-sidebar.svg" 
            alt="VentasPro" 
            className="h-10 w-auto transition-all duration-300 group-hover:brightness-110"
          />
        </Link>
        {isPremium && (
          <UiBadge className="ml-2 bg-gradient-to-r from-amber-400 to-orange-600 border-none text-[10px] font-black tracking-tighter animate-pulse shadow-[0_0_15px_rgba(245,158,11,0.5)]">
            PREMIUM
          </UiBadge>
        )}
      </SidebarHeader>
      <SidebarContent className="px-3 py-4">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu className="gap-2">
              {allNavItems.map((item) => {
                const isActive = location === item.href;
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      tooltip={item.label}
                      className={`
                        group flex items-center h-11 rounded-lg transition-colors
                        ${isActive
                          ? 'bg-sidebar-primary text-white font-medium'
                          : 'text-sidebar-foreground font-medium hover:text-white hover:bg-sidebar-accent'
                        }
                      `}
                    >
                      <Link href={item.href} className="flex items-center gap-3 px-3 w-full">
                        <item.icon className={`h-[18px] w-[18px] shrink-0 ${isActive ? 'text-white' : 'text-sidebar-foreground group-hover:text-white'}`} />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <div className="mt-auto p-4 space-y-2 relative z-10">
        <button 
          onClick={async () => {
            await fetch("/api/auth/logout", { method: "POST" });
            window.location.href = "/auth";
          }}
          className="flex w-full items-center gap-3 text-sm font-medium px-4 py-3 rounded-xl bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-500/20 transition-all mb-2"
        >
          <div className="flex h-3.5 w-3.5 items-center justify-center">
            <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
          </div>
          <span>Cerrar Sesión</span>
        </button>

        <div className="flex items-center gap-3 text-sm font-medium px-4 py-3 rounded-lg bg-sidebar-accent border border-sidebar-border transition-colors">
          <div className="relative flex h-3.5 w-3.5 items-center justify-center">
            {wsStatus?.state === 'connected' && (
              <span className="absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-30 animate-ping"></span>
            )}
            <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${wsStatus?.state === 'connected' ? 'bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.8)]' : 'bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.8)]'}`}></span>
          </div>
          <span className="text-white/90 tracking-wide">{wsStatus?.state === 'connected' ? 'WhatsApp Online' : 'Desconectado'}</span>
        </div>
      </div>
    </Sidebar>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  const isMobile = useIsMobile();

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background relative overflow-x-hidden text-foreground">
        {!isMobile && <AppSidebar />}
        <div className="flex flex-1 flex-col w-full min-w-0 relative z-10">
          <header className="flex h-14 sm:h-16 items-center gap-4 border-b border-border bg-card px-3 sm:px-4 md:px-6 sticky top-0 z-20">
            {!isMobile && <SidebarTrigger className="hover:bg-primary/10 rounded-xl w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center transition-all text-primary shrink-0" />}
            <div className="flex-1 min-w-0" />
            <div className="flex items-center gap-2">
              <UiBadge variant="outline" className="bg-primary/5 text-primary border-primary/20 hidden sm:flex text-xs">V1.5 PREMIUM</UiBadge>
            </div>
          </header>
          <main className={`flex-1 p-3 sm:p-4 md:p-8 overflow-y-auto overflow-x-hidden animate-enter scroll-smooth flex flex-col h-full ${isMobile ? 'pb-[88px]' : ''}`}>
            <div className="max-w-7xl mx-auto pb-8 md:pb-4 w-full flex-1 flex flex-col min-h-0">
              {children}
            </div>
          </main>
        </div>
        <MobileNav />
      </div>
    </SidebarProvider>
  );
}
