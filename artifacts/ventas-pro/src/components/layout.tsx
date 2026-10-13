import { IconoDelMenu } from "@/components/icono-del-menu";
import { AvisoAppAndroid } from "@/components/app-android";
import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  MessageSquare,
  Bot,
  Users,
  Package,
  Settings,
  Badge,
  Wand2,
  Palette,
  ShoppingCart,
  Eye,
  Activity,
  Crown,
  HelpCircle,
  Megaphone,
  LayoutTemplate,
  Beaker,
  BarChart3,
  MessageSquareText,
  ReceiptText,
  GraduationCap,
  Plug,
  ChevronDown,
  BriefcaseBusiness,
  ReceiptText,
} from "lucide-react";
import { Sidebar, SidebarContent, SidebarHeader, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarProvider, SidebarTrigger, SidebarGroup, SidebarGroupContent, useSidebar } from "./ui/sidebar";
import { Badge as UiBadge } from "@/components/ui/badge";
import { useGetWhatsAppStatus, getGetWhatsAppStatusQueryKey } from "@workspace/api-client-react";
import { useSaasStatus } from "@/hooks/useSaasStatus";
import { useSession } from "@/App";
import { MobileNav } from "./mobile-nav";
import { HelpChatWidget } from "./HelpChatWidget";
import { useIsMobile } from "@/hooks/use-mobile";
import { iconoMarca } from "@/components/logo-marca";

type NavItem = { label: string; href: string; icon: any; external?: boolean | string };
type NavGroup = { id: string; label: string; icon: any; items: NavItem[] };

export function AppSidebar() {
  const [location] = useLocation();
  const [openGroup, setOpenGroup] = useState<string | null>("ventas");
  const { state: sidebarState, toggleSidebar } = useSidebar();

  const { data: wsStatus } = useGetWhatsAppStatus({
    query: { refetchInterval: 5000, queryKey: getGetWhatsAppStatusQueryKey() }
  });

  const { saasStatus } = useSaasStatus();
  const { tenant: sessionTenant } = useSession();
  const currentPlan = saasStatus?.plan;
  const isPremium = currentPlan && currentPlan !== 'free' && currentPlan !== 'basic';
  const isAdmin = !!sessionTenant?.isAdmin;

  const grupos: NavGroup[] = [
    {
      id: "ventas", label: "Ventas", icon: BriefcaseBusiness,
      items: [
        { label: "Conversaciones", href: "/conversations", icon: MessageSquare },
        { label: "Prospectos", href: "/leads", icon: Users },
        { label: "Pedidos", href: "/pedidos", icon: ShoppingCart },
        { label: "Punto de venta", href: "/punto-de-venta", icon: ReceiptText },
        { label: "Productos", href: "/products", icon: Package },
      ],
    },
    {
      id: "asistente", label: "Asistente IA", icon: Bot,
      items: [
        { label: "Agentes IA", href: "/agents", icon: Bot },
        { label: "Probar vendedor", href: "/probar-vendedor", icon: MessageSquareText },
        { label: "Enseñar con ejemplo", href: "/ensenar-con-ejemplo", icon: GraduationCap },
        { label: "Atlas VentasPro", href: "/code-agent", icon: Wand2 },
      ],
    },
    {
      id: "canales", label: "Canales e integraciones", icon: Plug,
      items: [
        { label: "WhatsApp", href: "/whatsapp", icon: iconoMarca("whatsapp") },
        { label: "Integraciones", href: "/integraciones", icon: Plug },
        { label: "WooCommerce", href: "/woocommerce", icon: iconoMarca("woocommerce") },
        { label: "Dropi", href: "/dropi", icon: iconoMarca("dropi") },
      ],
    },
    {
      id: "crecimiento", label: "Marketing", icon: Megaphone,
      items: [
        { label: "Facebook", href: "/facebook", icon: iconoMarca("facebook") },
        { label: "Marketing", href: "/marketing", icon: Megaphone },
        { label: "Landing Studio", href: "/landing-studio", icon: LayoutTemplate, external: "/api/landing-forge/entrar" },
        ...(sessionTenant?.slug ? [{ label: "Ver Tienda", href: `/tienda/${sessionTenant.slug}?from=panel`, icon: Eye, external: true }] : []),
      ],
    },
    {
      id: "administracion", label: "Administración", icon: Settings,
      items: [
        { label: "Personalización", href: "/branding", icon: Palette },
        { label: "Configuración", href: "/settings", icon: Settings },
        { label: "Diagnóstico", href: "/diagnostico", icon: Activity },
        { label: "Ayuda", href: "/ayuda", icon: HelpCircle },
        { label: "Planes", href: "/pricing", icon: Badge },
        ...(isAdmin ? [
          { label: "Monitor WA", href: "/whatsapp-monitor", icon: Activity },
          { label: "Administrador", href: "/admin/tenants", icon: Crown },
        ] : []),
      ],
    },
  ];

  useEffect(() => {
    const grupoActivo = grupos.find((g) => g.items.some((item) => location === item.href || (item.href !== "/" && location.startsWith(`${item.href}/`))));
    if (grupoActivo) setOpenGroup(grupoActivo.id);
  }, [location, isAdmin, sessionTenant?.slug]);

  const renderItem = (item: NavItem) => {
    const isActive = location === item.href || (item.href !== "/" && location.startsWith(`${item.href}/`));
    const linkClassName = "flex items-center gap-3 px-3 w-full";
    const linkContent = (
      <>
        <IconoDelMenu icon={item.icon} href={item.href} tam={28} activo={isActive} />
        <span>{item.label}</span>
      </>
    );
    const externalUrl = typeof item.external === "string" ? item.external : item.href;
    return (
      <SidebarMenuItem key={item.href}>
        <SidebarMenuButton
          asChild
          isActive={isActive}
          tooltip={item.label}
          className={`group flex items-center h-10 rounded-lg transition-colors ${isActive ? "bg-sidebar-primary text-white font-medium" : "text-sidebar-foreground font-medium hover:text-white hover:bg-sidebar-accent"}`}
        >
          {item.external ? (
            <a href={externalUrl} target="_blank" rel="noopener noreferrer" className={linkClassName}>{linkContent}</a>
          ) : (
            <Link href={item.href} className={linkClassName}>{linkContent}</Link>
          )}
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  };

  return (
    <Sidebar className="border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      <SidebarHeader className="flex h-16 items-center border-b border-sidebar-border px-5">
        <Link href="/" className="flex items-center transition-all duration-300 hover:scale-[1.02] group">
          <img src="/logo-sidebar.svg" alt="VentasPro" className="h-10 w-auto transition-all duration-300 group-hover:brightness-110" />
        </Link>
        {isPremium && (
          <UiBadge className="ml-2 bg-gradient-to-r from-amber-400 to-orange-600 border-none text-[10px] font-black tracking-tighter animate-pulse shadow-[0_0_15px_rgba(245,158,11,0.5)]">
            PREMIUM
          </UiBadge>
        )}
      </SidebarHeader>
      <SidebarContent className="px-3 py-3 [scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,0.25)_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-white/25 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-track]:bg-transparent">
        <SidebarGroup className="p-0">
          <SidebarGroupContent>
            <SidebarMenu className="gap-1">
              {renderItem({ label: "Panel", href: "/", icon: LayoutDashboard })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <div className="flex flex-col gap-1.5">
          {grupos.map((grupo) => {
            const Icon = grupo.icon;
            const open = openGroup === grupo.id;
            const tieneActivo = grupo.items.some((item) => location === item.href || (item.href !== "/" && location.startsWith(`${item.href}/`)));
            return (
              <SidebarGroup key={grupo.id} className="p-0">
                <button
                  type="button"
                  aria-expanded={open}
                  title={sidebarState === "collapsed" ? grupo.label : undefined}
                  onClick={() => {
                    if (sidebarState === "collapsed") { setOpenGroup(grupo.id); toggleSidebar(); return; }
                    setOpenGroup((actual) => actual === grupo.id ? null : grupo.id);
                  }}
                  className={`flex h-10 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-semibold transition-colors ${sidebarState === "collapsed" ? "justify-center px-1" : ""} ${tieneActivo ? "text-white bg-sidebar-accent/70" : "text-sidebar-foreground/80 hover:text-white hover:bg-sidebar-accent"}`}
                >
                  <Icon className="h-[18px] w-[18px] shrink-0" />
                  {sidebarState !== "collapsed" && <>
                    <span className="flex-1 truncate">{grupo.label}</span>
                    <span className="text-[10px] tabular-nums text-sidebar-foreground/50">{grupo.items.length}</span>
                    <ChevronDown className={`h-4 w-4 shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
                  </>}
                </button>
                {open && sidebarState !== "collapsed" && (
                  <SidebarMenu className="ml-3 mt-1 gap-0.5 border-l border-sidebar-border pl-2">
                    {grupo.items.map(renderItem)}
                  </SidebarMenu>
                )}
              </SidebarGroup>
            );
          })}
        </div>
      </SidebarContent>
      <div className="mt-auto px-3 py-3 space-y-2 relative z-10">
        <button onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); window.location.href = "/auth"; }} className="flex w-full items-center gap-3 text-sm font-medium px-4 py-2.5 rounded-xl bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-500/20 transition-all mb-2">
          <div className="flex h-3.5 w-3.5 items-center justify-center"><span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span></div>
          <span>Cerrar Sesión</span>
        </button>
        <div className="flex items-center gap-3 text-sm font-medium px-4 py-2.5 rounded-lg bg-sidebar-accent border border-sidebar-border transition-colors">
          <div className="relative flex h-3.5 w-3.5 items-center justify-center">
            {wsStatus?.state === 'connected' && <span className="absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-30 animate-ping"></span>}
            <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${wsStatus?.state === 'connected' ? 'bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.8)]' : 'bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.8)]'}`}></span>
          </div>
          <span className="text-white/90 tracking-wide">{wsStatus?.state === 'connected' ? 'WhatsApp Online' : 'Desconectado'}</span>
        </div>
      </div>
    </Sidebar>
  );
}

export function Layout({ children, chatCompleto = false }: { children: React.ReactNode; chatCompleto?: boolean }) {
  const isMobile = useIsMobile();

  return (
    <SidebarProvider>
      <div className="flex h-screen w-full bg-background relative overflow-x-hidden text-foreground">
        {!isMobile && <AppSidebar />}
        <div className="flex flex-1 flex-col w-full min-w-0 relative z-10">
          <header className="flex h-12 items-center gap-4 border-b border-border bg-card px-3 sm:px-4 md:px-6 sticky top-0 z-20">
            {!isMobile && <SidebarTrigger className="hover:bg-primary/10 rounded-xl w-9 h-9 flex items-center justify-center transition-all text-primary shrink-0" />}
            <div className="flex-1 min-w-0" />
            <div className="flex items-center gap-2"><UiBadge variant="outline" className="bg-primary/5 text-primary border-primary/20 hidden sm:flex text-xs">V1.5 PREMIUM</UiBadge></div>
          </header>
          {!chatCompleto && <AvisoAppAndroid />}
          <main className={`flex-1 ${chatCompleto ? "p-0 md:p-6 overflow-hidden md:overflow-y-auto" : "p-3 sm:p-4 md:p-6 overflow-y-auto"} overflow-x-hidden animate-enter scroll-smooth flex flex-col h-full min-h-0`}>
            <div className={`max-w-7xl mx-auto w-full break-words min-w-0 md:flex-1 md:flex md:flex-col md:min-h-0 ${chatCompleto ? "flex-1 flex flex-col min-h-0 pb-[calc(80px+env(safe-area-inset-bottom))] md:pb-4" : "pb-[calc(184px+env(safe-area-inset-bottom))] md:pb-4"}`}>
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
