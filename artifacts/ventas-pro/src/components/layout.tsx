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
  Wand2
} from "lucide-react";
import { Sidebar, SidebarContent, SidebarHeader, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarProvider, SidebarTrigger, SidebarGroup, SidebarGroupContent } from "./ui/sidebar";
import { Badge as UiBadge } from "@/components/ui/badge";
import { useGetWhatsAppStatus, getGetWhatsAppStatusQueryKey } from "@workspace/api-client-react";

export function AppSidebar() {
  const [location] = useLocation();

  const navItems = [
    { label: "Panel", href: "/", icon: LayoutDashboard },
    { label: "Conversaciones", href: "/conversations", icon: MessageSquare },
    { label: "Agentes IA", href: "/agents", icon: Bot },
    { label: "Prospectos", href: "/leads", icon: Users },
    { label: "Productos", href: "/products", icon: Package },
    { label: "WhatsApp", href: "/whatsapp", icon: Phone },
    { label: "Arquitecto IA", href: "/code-agent", icon: Wand2 },
    { label: "Configuración", href: "/settings", icon: Settings },
    { label: "Planes", href: "/pricing", icon: Badge },
  ];

  const { data: wsStatus } = useGetWhatsAppStatus({
    query: { refetchInterval: 5000, queryKey: getGetWhatsAppStatusQueryKey() }
  });

  return (
    <Sidebar className="border-r border-white/10 shadow-[8px_0_32px_rgba(0,0,0,0.1)] dark:shadow-[8px_0_32px_rgba(0,0,0,0.4)] bg-background/60 backdrop-blur-3xl supports-[backdrop-filter]:bg-background/40">
      <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-accent/5 pointer-events-none" />
      <SidebarHeader className="flex h-[80px] items-center border-b border-white/5 px-6 relative z-10">
        <Link href="/" className="flex items-center gap-3 font-bold text-xl text-foreground transition-all duration-300 hover:scale-[1.02] group">
          {/* Premium Logo */}
          <div className="relative flex items-center justify-center w-10 h-10 rounded-xl overflow-hidden border border-white/10 shadow-lg group-hover:border-orange-500/50 transition-all duration-300">
            <div className="absolute inset-0 bg-gradient-to-br from-orange-500 to-yellow-500 opacity-20 group-hover:opacity-40 transition-opacity" />
            <div className="absolute -inset-1 bg-gradient-to-r from-orange-500 to-yellow-500 rounded-xl blur opacity-0 group-hover:opacity-30 transition-opacity" />
            <span className="text-xl font-black bg-gradient-to-br from-orange-400 to-yellow-500 bg-clip-text text-transparent relative z-10">V</span>
          </div>
          <div className="flex flex-col">
            <span className="tracking-tight font-extrabold bg-gradient-to-br from-white via-white to-white/50 bg-clip-text text-transparent group-hover:from-orange-400 group-hover:to-yellow-500 transition-all duration-500">VentasPro</span>
            <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-[0.25em]">IA Engine</span>
          </div>
        </Link>
      </SidebarHeader>
      <SidebarContent className="px-3 py-4">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu className="gap-2">
              {navItems.map((item) => {
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
      <div className="flex min-h-screen w-full bg-background relative overflow-hidden text-foreground">
        {/* Mesh Gradient Background */}
        <div className="pointer-events-none fixed inset-0 z-0">
          <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-primary/5 blur-[120px]" />
          <div className="absolute bottom-[-10%] right-[-5%] w-[30%] h-[40%] rounded-full bg-accent/5 blur-[100px]" />
        </div>
        
        <AppSidebar />
        <div className="flex flex-1 flex-col w-full min-w-0 relative z-10 transition-all duration-300">
          <header className="flex h-[72px] items-center gap-4 border-b bg-background/60 backdrop-blur-3xl px-4 md:px-6 sticky top-0 z-20 supports-[backdrop-filter]:bg-background/40">
            <SidebarTrigger className="hover:bg-primary/10 rounded-xl w-10 h-10 flex items-center justify-center transition-all text-primary" />
            <div className="flex-1" />
            <div className="flex items-center gap-2">
              <UiBadge variant="outline" className="bg-primary/5 text-primary border-primary/20 hidden sm:flex">V1.5 PREMIUM</UiBadge>
            </div>
          </header>
          <main className="flex-1 p-4 md:p-8 overflow-y-auto animate-enter scroll-smooth">
            <div className="max-w-7xl mx-auto pb-20 md:pb-8">
              {children}
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
