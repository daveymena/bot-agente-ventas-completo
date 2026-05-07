import { Link, useLocation } from "wouter";
import { useState, useEffect, useCallback } from "react";
import { 
  LayoutDashboard, 
  MessageSquare, 
  Bot, 
  Users, 
  Package, 
  Phone, 
  Settings,
  Wand2,
  CreditCard,
  ShoppingCart,
  TrendingUp,
  Store,
  Bell,
  BellRing,
  X,
  CheckCheck,
  ShieldAlert,
  ShoppingBag,
  Banknote,
  User2,
  Brain
} from "lucide-react";
import { Sidebar, SidebarContent, SidebarHeader, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarProvider, SidebarTrigger, SidebarGroup, SidebarGroupContent } from "./ui/sidebar";
import { Badge as UiBadge } from "@/components/ui/badge";
import { useGetWhatsAppStatus, getGetWhatsAppStatusQueryKey } from "@workspace/api-client-react";

interface Notification {
  id: number;
  type: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

const NOTIF_ICONS: Record<string, React.ReactNode> = {
  escalation: <ShieldAlert className="h-4 w-4 text-red-400" />,
  order: <ShoppingBag className="h-4 w-4 text-blue-400" />,
  payment: <Banknote className="h-4 w-4 text-green-400" />,
  lead: <User2 className="h-4 w-4 text-purple-400" />,
  system: <Bell className="h-4 w-4 text-yellow-400" />,
};

function NotificationCenter() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications?limit=20");
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications || []);
        setUnreadCount(data.unreadCount || 0);
      }
    } catch {}
  }, []);

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  async function markRead(id: number) {
    await fetch(`/api/notifications/${id}/read`, { method: "POST" });
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    setUnreadCount(prev => Math.max(0, prev - 1));
  }

  async function markAllRead() {
    await fetch("/api/notifications/read-all", { method: "POST" });
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    setUnreadCount(0);
  }

  function timeAgo(iso: string) {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "ahora";
    if (mins < 60) return `hace ${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `hace ${hrs}h`;
    return `hace ${Math.floor(hrs / 24)}d`;
  }

  return (
    <div className="relative">
      <button
        onClick={() => { setOpen(!open); if (!open) fetchNotifications(); }}
        className="relative w-10 h-10 flex items-center justify-center rounded-xl hover:bg-white/5 transition-colors"
      >
        {unreadCount > 0 ? <BellRing className="h-5 w-5 text-primary animate-wiggle" /> : <Bell className="h-5 w-5 text-muted-foreground" />}
        {unreadCount > 0 && (
          <span className="absolute top-1.5 right-1.5 min-w-[16px] h-4 rounded-full bg-red-500 text-[9px] font-bold text-white flex items-center justify-center px-1">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-12 w-80 z-50 rounded-2xl border border-white/10 bg-background/95 backdrop-blur-xl shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                <Bell className="h-4 w-4 text-primary" />
                <span className="font-semibold text-sm">Notificaciones</span>
                {unreadCount > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-400 font-bold">{unreadCount} nuevas</span>}
              </div>
              <div className="flex items-center gap-1">
                {unreadCount > 0 && (
                  <button onClick={markAllRead} className="text-[10px] text-muted-foreground hover:text-primary transition-colors flex items-center gap-1">
                    <CheckCheck className="h-3 w-3" />Leer todas
                  </button>
                )}
                <button onClick={() => setOpen(false)} className="ml-2 text-muted-foreground hover:text-white">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="max-h-80 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="flex flex-col items-center py-8 gap-2 text-muted-foreground">
                  <Bell className="h-8 w-8 opacity-20" />
                  <p className="text-xs">Sin notificaciones</p>
                </div>
              ) : notifications.map(n => (
                <div key={n.id}
                  className={`flex items-start gap-3 px-4 py-3 border-b border-white/5 cursor-pointer hover:bg-white/5 transition-colors ${!n.read ? "bg-primary/5" : ""}`}
                  onClick={() => !n.read && markRead(n.id)}>
                  <div className="mt-0.5 flex-shrink-0">{NOTIF_ICONS[n.type] || <Bell className="h-4 w-4 text-muted-foreground" />}</div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs font-semibold truncate ${!n.read ? "text-white" : "text-muted-foreground"}`}>{n.title}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{n.message}</p>
                    <p className="text-[10px] text-muted-foreground/60 mt-1">{timeAgo(n.createdAt)}</p>
                  </div>
                  {!n.read && <div className="w-2 h-2 rounded-full bg-primary mt-1.5 flex-shrink-0" />}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export function AppSidebar() {
  const [location] = useLocation();

  const navItems = [
    { label: "Panel", href: "/dashboard", icon: LayoutDashboard },
    { label: "Conversaciones", href: "/conversations", icon: MessageSquare },
    { label: "Agentes IA", href: "/agents", icon: Bot },
    { label: "Prospectos", href: "/leads", icon: Users },
    { label: "Productos", href: "/products", icon: Package },
    { label: "Tienda Virtual", href: "/store", icon: Store },
    { label: "WhatsApp", href: "/whatsapp", icon: Phone },
    { label: "Arquitecto IA", href: "/code-agent", icon: Wand2 },
    { label: "Motores de IA", href: "/ai-providers", icon: Brain },
    { label: "Dropi", href: "/dropi", icon: Package },
    { label: "WooCommerce", href: "/woocommerce", icon: ShoppingCart },
    { label: "Nichos Drop", href: "/niches", icon: TrendingUp },
    { label: "Facturación", href: "/billing", icon: CreditCard },
    { label: "Configuración", href: "/settings", icon: Settings },
  ];

  const { data: wsStatus } = useGetWhatsAppStatus({
    query: { refetchInterval: 5000, queryKey: getGetWhatsAppStatusQueryKey() }
  });

  return (
    <Sidebar className="border-r border-white/10 shadow-[8px_0_32px_rgba(0,0,0,0.1)] dark:shadow-[8px_0_32px_rgba(0,0,0,0.4)] bg-background/60 backdrop-blur-3xl supports-[backdrop-filter]:bg-background/40">
      <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-accent/5 pointer-events-none" />
      <SidebarHeader className="flex h-[80px] items-center border-b border-white/5 px-6 relative z-10">
        <Link href="/" className="flex items-center gap-3 font-bold text-xl text-foreground transition-all duration-300 hover:scale-[1.02] group">
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
                );
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
              <NotificationCenter />
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
