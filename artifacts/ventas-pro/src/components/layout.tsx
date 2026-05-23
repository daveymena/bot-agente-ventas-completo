import { Link, useLocation } from "wouter";
import { 
  LayoutDashboard, 
  MessageSquare, 
  Bot, 
  Users, 
  Package, 
  Phone, 
  Settings,
  Terminal,
  Badge,
  Wand2,
  Palette,
  ShoppingCart,
  Eye,
  Sparkles
} from "lucide-react";
import { Sidebar, SidebarContent, SidebarHeader, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarProvider, SidebarTrigger, SidebarGroup, SidebarGroupContent } from "./ui/sidebar";
import { Badge as UiBadge } from "@/components/ui/badge";
import { useGetWhatsAppStatus, getGetWhatsAppStatusQueryKey } from "@workspace/api-client-react";
import { useSaasStatus } from "@/hooks/useSaasStatus";
import { Star, Zap, Crown } from "lucide-react";
import { useSession } from "@/App";

export function AppSidebar() {
  const [location] = useLocation();

  const navItems = [
    { label: "Panel", href: "/", icon: LayoutDashboard },
    { label: "Conversaciones", href: "/conversations", icon: MessageSquare },
    { label: "Agentes IA", href: "/agents", icon: Bot },
    { label: "Prospectos", href: "/leads", icon: Users },
    { label: "Productos", href: "/products", icon: Package },
    { label: "WhatsApp", href: "/whatsapp", icon: Phone },
    { label: "WooCommerce", href: "/woocommerce", icon: ShoppingCart },
    { label: "Arquitecto IA", href: "/code-agent", icon: Wand2 },
    { label: "Arquitecto Visual", href: "/architect", icon: Eye },
    { label: "Personalización", href: "/branding", icon: Palette },
    { label: "Configuración", href: "/settings", icon: Settings },
    { label: "Planes", href: "/pricing", icon: Badge },
  ];

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
    { label: "Arquitecto Visual", href: "/architect", icon: Eye },
    { label: "Personalización", href: "/branding", icon: Palette },
    { label: "Tienda Admin", href: "/admin/store", icon: Package },
    { label: "Configuración", href: "/settings", icon: Settings },
    { label: "Planes", href: "/pricing", icon: Badge },
    { label: "LM Arena", href: "/arena", icon: Sparkles },
    ...(sessionTenant?.slug ? [{ label: "Ver Tienda", href: `/mi-tienda`, icon: Eye }] : []),
    ...(isAdmin ? [{ label: "Admin Tenants", href: "/admin/tenants", icon: Crown }] : []),
];

  return (
    <Sidebar className="border-r border-white/10 shadow-[8px_0_32px_rgba(0,0,0,0.1)] dark:shadow-[8px_0_32px_rgba(0,0,0,0.4)] bg-background/60 backdrop-blur-3xl supports-[backdrop-filter]:bg-background/40">
      <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-accent/5 pointer-events-none" />
      <SidebarHeader className="flex h-[80px] items-center border-b border-white/5 px-6 relative z-10">
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
                        group relative flex items-center h-12 rounded-xl transition-all duration-300 overflow-hidden
                        ${isActive 
                          ? 'bg-gradient-to-r from-primary/20 to-transparent text-primary font-semibold shadow-[inset_2px_0_0_0_rgba(var(--primary),1)]' 
                          : 'text-sidebar-foreground/90 font-medium hover:text-sidebar-foreground hover:bg-white/5'
                        }
                      `}
                    >
                      <Link href={item.href} className="flex items-center gap-3 px-3 w-full">
                        {isActive && <div className="absolute inset-0 bg-gradient-to-r from-primary/10 to-transparent blur-md pointer-events-none" />}
                        <item.icon className={`h-5 w-5 relative z-10 transition-transform duration-300 group-hover:scale-110 ${isActive ? 'text-primary drop-shadow-[0_0_12px_rgba(var(--primary),0.8)]' : 'text-sidebar-foreground/70 group-hover:text-primary/90'}`} />
                        <span className="relative z-10">{item.label}</span>
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

        <div className="flex items-center gap-3 text-sm font-medium px-4 py-3.5 rounded-xl bg-black/40 border border-white/10 backdrop-blur-xl shadow-lg transition-all hover:bg-black/50 hover:border-white/20">
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
  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background relative overflow-x-hidden text-foreground">
        {/* Mesh Gradient Background */}
        <div className="pointer-events-none fixed inset-0 z-0">
          <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-primary/5 blur-[120px]" />
          <div className="absolute bottom-[-10%] right-[-5%] w-[30%] h-[40%] rounded-full bg-accent/5 blur-[100px]" />
        </div>
        
        <AppSidebar />
        <div className="flex flex-1 flex-col w-full min-w-0 relative z-10 transition-all duration-300">
          <header className="flex h-[60px] sm:h-[72px] items-center gap-4 border-b bg-background/60 backdrop-blur-3xl px-3 sm:px-4 md:px-6 sticky top-0 z-20 supports-[backdrop-filter]:bg-background/40">
            <SidebarTrigger className="hover:bg-primary/10 rounded-xl w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center transition-all text-primary shrink-0" />
            <div className="flex-1 min-w-0" />
            <div className="flex items-center gap-2">
              <UiBadge variant="outline" className="bg-primary/5 text-primary border-primary/20 hidden sm:flex text-xs">V1.5 PREMIUM</UiBadge>
            </div>
          </header>
          <main className="flex-1 p-3 sm:p-4 md:p-8 overflow-y-auto overflow-x-hidden animate-enter scroll-smooth flex flex-col h-full">
            <div className="max-w-7xl mx-auto pb-8 md:pb-4 w-full flex-1 flex flex-col min-h-0">
              {children}
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
