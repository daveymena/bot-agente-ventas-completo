import { IconoDelMenu } from "@/components/icono-del-menu";
import { AvisoAppAndroid } from "@/components/app-android";
import { useEffect, useMemo, useState } from "react";
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
  BarChart3,
  MessageSquareText,
  ReceiptText,
  GraduationCap,
  Plug,
  ChevronDown,
  BriefcaseBusiness,
  PencilRuler,
  ImagePlus,
  Search,
  Sparkles,
  LogOut,
} from "lucide-react";
import { Sidebar, SidebarContent, SidebarHeader, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarProvider, SidebarTrigger, SidebarGroup, SidebarGroupContent, useSidebar } from "./ui/sidebar";
import { Badge as UiBadge } from "@/components/ui/badge";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useGetWhatsAppStatus, getGetWhatsAppStatusQueryKey } from "@workspace/api-client-react";
import { useSaasStatus } from "@/hooks/useSaasStatus";
import { useSession } from "@/App";
import { MobileNav } from "./mobile-nav";
import { HelpChatWidget } from "./HelpChatWidget";
import { useIsMobile } from "@/hooks/use-mobile";
import { iconoMarca } from "@/components/logo-marca";

type NavItem = { label: string; href: string; icon: any; external?: boolean | string };
type NavGroup = { id: string; label: string; icon: any; items: NavItem[] };

/** Ruta activa: coincide exacta o por prefijo de sección. */
function estaActiva(location: string, href: string): boolean {
  return location === href || (href !== "/" && location.startsWith(`${href}/`));
}

/**
 * Navegación en cuatro bloques (ver REDESENO_FRONTEND_UX_UI_2026.md, sección 6).
 * Las rutas no cambian: solo cómo se agrupan y cuántas entradas se ven a la vez.
 */
function useGruposDeNavegacion(isAdmin: boolean, slug: string | undefined): NavGroup[] {
  return useMemo<NavGroup[]>(() => [
    {
      id: "operacion", label: "Operación", icon: BriefcaseBusiness,
      items: [
        { label: "Conversaciones", href: "/conversations", icon: MessageSquare },
        { label: "Prospectos", href: "/leads", icon: Users },
        { label: "Pedidos", href: "/pedidos", icon: ShoppingCart },
        { label: "Productos", href: "/products", icon: Package },
        { label: "Punto de venta", href: "/punto-de-venta", icon: ReceiptText },
      ],
    },
    {
      id: "automatizacion", label: "Automatización", icon: Bot,
      items: [
        { label: "Agentes IA", href: "/agents", icon: Bot },
        { label: "Probar vendedor", href: "/probar-vendedor", icon: MessageSquareText },
        { label: "Enseñar con ejemplo", href: "/ensenar-con-ejemplo", icon: GraduationCap },
        { label: "WhatsApp", href: "/whatsapp", icon: iconoMarca("whatsapp") },
        { label: "Integraciones", href: "/integraciones", icon: Plug },
        { label: "WooCommerce", href: "/woocommerce", icon: iconoMarca("woocommerce") },
        { label: "Dropi", href: "/dropi", icon: iconoMarca("dropi") },
      ],
    },
    {
      id: "crecimiento", label: "Crecimiento", icon: Megaphone,
      items: [
        { label: "Marketing", href: "/marketing", icon: Megaphone },
        { label: "Facebook", href: "/facebook", icon: iconoMarca("facebook") },
        // Studio: landings + diseños + creativos con Atlas adentro (/estudio).
        { label: "Studio", href: "/estudio", icon: PencilRuler },
        { label: "Creativos", href: "/estudio?espacio=creativos", icon: ImagePlus },
        { label: "Landing Forge", href: "/landing-studio", icon: LayoutTemplate, external: "/api/landing-forge/entrar" },
        ...(slug ? [{ label: "Ver tienda", href: `/tienda/${slug}?from=panel`, icon: Eye, external: true }] : []),
      ],
    },
    {
      id: "sistema", label: "Sistema", icon: Settings,
      items: [
        { label: "Configuración", href: "/settings", icon: Settings },
        { label: "Personalización", href: "/branding", icon: Palette },
        { label: "Diagnóstico", href: "/diagnostico", icon: Activity },
        { label: "Planes", href: "/pricing", icon: Badge },
        { label: "Ayuda", href: "/ayuda", icon: HelpCircle },
        ...(isAdmin ? [
          { label: "Monitor WA", href: "/whatsapp-monitor", icon: BarChart3 },
          { label: "Administrador", href: "/admin/tenants", icon: Crown },
        ] : []),
      ],
    },
  ], [isAdmin, slug]);
}

/** Atlas es la herramienta estratégica: una sola acción destacada, no una entrada más de la lista. */
const ATLAS: NavItem = { label: "Atlas VentasPro", href: "/code-agent", icon: Wand2 };

function EstadoWhatsApp({ conectado }: { conectado: boolean }) {
  return (
    <div className="flex h-8 items-center gap-2 rounded-full border border-border px-3 text-xs font-medium text-muted-foreground" title="Estado de WhatsApp">
      <span className="relative flex h-2 w-2">
        {conectado && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-40" />}
        <span className={`relative inline-flex h-2 w-2 rounded-full ${conectado ? "bg-green-500" : "bg-red-500"}`} />
      </span>
      <span className="hidden sm:inline">{conectado ? "WhatsApp en línea" : "WhatsApp desconectado"}</span>
    </div>
  );
}

export function AppSidebar() {
  const [location, setLocation] = useLocation();
  const [openGroup, setOpenGroup] = useState<string | null>("operacion");
  const { state: sidebarState, toggleSidebar } = useSidebar();

  const { data: wsStatus } = useGetWhatsAppStatus({
    query: { refetchInterval: 30000, staleTime: 15000, refetchIntervalInBackground: false, queryKey: getGetWhatsAppStatusQueryKey() }
  });

  const { saasStatus } = useSaasStatus();
  const { tenant: sessionTenant } = useSession();
  const currentPlan = saasStatus?.plan;
  const isPremium = currentPlan && currentPlan !== "free" && currentPlan !== "basic";
  const isAdmin = !!sessionTenant?.isAdmin;
  const grupos = useGruposDeNavegacion(isAdmin, sessionTenant?.slug);

  useEffect(() => {
    const grupoActivo = grupos.find((g) => g.items.some((item) => estaActiva(location, item.href)));
    if (grupoActivo) setOpenGroup(grupoActivo.id);
  }, [location, grupos]);

  const renderItem = (item: NavItem) => {
    const isActive = estaActiva(location, item.href);
    const linkClassName = "flex items-center gap-3 px-2.5 w-full";
    const linkContent = (
      <>
        <IconoDelMenu icon={item.icon} href={item.href} tam={24} activo={isActive} />
        <span className="truncate">{item.label}</span>
      </>
    );
    const externalUrl = typeof item.external === "string" ? item.external : item.href;
    return (
      <SidebarMenuItem key={item.href}>
        <SidebarMenuButton
          asChild
          isActive={isActive}
          tooltip={item.label}
          className={`group flex h-9 rounded-lg text-sm transition-colors ${isActive ? "bg-sidebar-primary text-white font-medium" : "text-sidebar-foreground/85 hover:text-white hover:bg-sidebar-accent"}`}
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

  const atlasActivo = estaActiva(location, ATLAS.href);

  return (
    <Sidebar className="border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      <SidebarHeader className="flex h-14 items-center border-b border-sidebar-border px-4">
        <Link href="/" className="flex items-center transition-opacity hover:opacity-90">
          <img src="/logo-sidebar.svg" alt="VentasPro" className="h-8 w-auto" />
        </Link>
        {isPremium && (
          <UiBadge className="ml-2 border-none bg-amber-500/90 text-[10px] font-bold text-white">PRO</UiBadge>
        )}
      </SidebarHeader>

      <SidebarContent className="gap-1 px-2.5 py-3 [scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,0.2)_transparent]">
        {/* Atlas: acción destacada, siempre visible arriba. */}
        <button
          type="button"
          onClick={() => setLocation(ATLAS.href)}
          aria-current={atlasActivo ? "page" : undefined}
          className={`mb-2 flex h-10 w-full items-center gap-2.5 rounded-xl px-3 text-left text-sm font-semibold transition-colors ${atlasActivo ? "bg-sidebar-primary text-white" : "bg-sidebar-accent/60 text-white hover:bg-sidebar-accent"}`}
        >
          <Sparkles className="h-4 w-4 shrink-0" />
          <span className="flex-1 truncate">{ATLAS.label}</span>
          <span className="rounded-md border border-white/15 px-1.5 py-0.5 text-[10px] font-medium text-white/70">IA</span>
        </button>

        <SidebarGroup className="p-0">
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.5">
              {renderItem({ label: "Panel", href: "/", icon: LayoutDashboard })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <div className="mt-2 flex flex-col gap-1">
          {grupos.map((grupo) => {
            const Icon = grupo.icon;
            const open = openGroup === grupo.id;
            const tieneActivo = grupo.items.some((item) => estaActiva(location, item.href));
            return (
              <SidebarGroup key={grupo.id} className="p-0">
                <button
                  type="button"
                  aria-expanded={open}
                  title={sidebarState === "collapsed" ? grupo.label : undefined}
                  onClick={() => {
                    if (sidebarState === "collapsed") { setOpenGroup(grupo.id); toggleSidebar(); return; }
                    setOpenGroup((actual) => (actual === grupo.id ? null : grupo.id));
                  }}
                  className={`flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-sm font-semibold transition-colors ${sidebarState === "collapsed" ? "justify-center px-1" : ""} ${tieneActivo ? "text-white" : "text-sidebar-foreground/70 hover:text-white hover:bg-sidebar-accent"}`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {sidebarState !== "collapsed" && <>
                    <span className="flex-1 truncate">{grupo.label}</span>
                    <span className="text-[11px] tabular-nums text-sidebar-foreground/45">{grupo.items.length}</span>
                    <ChevronDown className={`h-4 w-4 shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
                  </>}
                </button>
                {open && sidebarState !== "collapsed" && (
                  <SidebarMenu className="ml-4 mt-0.5 mb-1 gap-0.5 border-l border-sidebar-border pl-2">
                    {grupo.items.map(renderItem)}
                  </SidebarMenu>
                )}
              </SidebarGroup>
            );
          })}
        </div>
      </SidebarContent>

      <div className="mt-auto space-y-2 border-t border-sidebar-border px-2.5 py-3">
        <button
          onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); window.location.href = "/auth"; }}
          className="flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-sm font-medium text-sidebar-foreground/75 transition-colors hover:bg-sidebar-accent hover:text-white"
        >
          <LogOut className="h-4 w-4" />
          <span>Cerrar sesión</span>
        </button>
      </div>
    </Sidebar>
  );
}

/** Buscador global (Cmd/Ctrl + K): va a cualquier sección sin recorrer el menú. */
function BuscadorRapido({ abierto, onCambiar, grupos }: { abierto: boolean; onCambiar: (v: boolean) => void; grupos: NavGroup[] }) {
  const [, setLocation] = useLocation();
  const ir = (href: string, externo?: boolean | string) => {
    onCambiar(false);
    if (externo) {
      window.open(typeof externo === "string" ? externo : href, "_blank", "noopener,noreferrer");
    } else {
      setLocation(href);
    }
  };
  return (
    <CommandDialog open={abierto} onOpenChange={onCambiar}>
      <CommandInput placeholder="Buscar sección o acción…" />
      <CommandList>
        <CommandEmpty>Sin resultados.</CommandEmpty>
        <CommandGroup heading="Atlas">
          <CommandItem onSelect={() => ir(ATLAS.href)}>
            <Wand2 className="mr-2 h-4 w-4" />
            {ATLAS.label}
          </CommandItem>
          <CommandItem onSelect={() => ir("/")}>
            <LayoutDashboard className="mr-2 h-4 w-4" />
            Panel
          </CommandItem>
        </CommandGroup>
        {grupos.map((g) => (
          <CommandGroup key={g.id} heading={g.label}>
            {g.items.map((item) => {
              const Icono = item.icon;
              return (
                <CommandItem key={item.href} onSelect={() => ir(item.href, item.external)}>
                  <Icono className="mr-2 h-4 w-4" />
                  {item.label}
                </CommandItem>
              );
            })}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  );
}

export function Layout({ children, chatCompleto = false }: { children: React.ReactNode; chatCompleto?: boolean }) {
  const isMobile = useIsMobile();
  const [, setLocation] = useLocation();
  const [buscadorAbierto, setBuscadorAbierto] = useState(false);
  const { tenant: sessionTenant } = useSession();
  const isAdmin = !!sessionTenant?.isAdmin;
  const grupos = useGruposDeNavegacion(isAdmin, sessionTenant?.slug);
  const { data: wsStatus } = useGetWhatsAppStatus({
    query: { refetchInterval: 30000, staleTime: 15000, refetchIntervalInBackground: false, queryKey: getGetWhatsAppStatusQueryKey() }
  });
  const conectado = wsStatus?.state === "connected";

  // Cmd/Ctrl + K abre el buscador desde cualquier pantalla.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setBuscadorAbierto((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <SidebarProvider>
      <div className="flex h-[100dvh] w-full bg-background relative overflow-x-hidden text-foreground">
        {!isMobile && <AppSidebar />}
        <div className="flex flex-1 flex-col w-full min-w-0 relative z-10">
          <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border bg-background/80 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/60 sm:px-5">
            {!isMobile && <SidebarTrigger className="hover:bg-accent rounded-lg w-9 h-9 flex items-center justify-center transition-colors text-muted-foreground shrink-0" />}
            <button
              type="button"
              onClick={() => setBuscadorAbierto(true)}
              className="flex h-9 min-w-0 flex-1 max-w-md items-center gap-2 rounded-xl border border-border bg-muted/50 px-3 text-sm text-muted-foreground transition-colors hover:bg-muted"
              aria-label="Buscar o ir a una sección"
            >
              <Search className="h-4 w-4 shrink-0" />
              <span className="flex-1 truncate text-left">Buscar o ir a…</span>
              <kbd className="hidden rounded-md border border-border bg-background px-1.5 py-0.5 text-[11px] font-medium sm:inline">⌘K</kbd>
            </button>
            <div className="ml-auto flex items-center gap-2">
              <EstadoWhatsApp conectado={conectado} />
              {isMobile && (
                <button
                  type="button"
                  onClick={() => setLocation(ATLAS.href)}
                  className="flex h-9 items-center gap-1.5 rounded-xl bg-primary px-3 text-sm font-semibold text-primary-foreground"
                >
                  <Wand2 className="h-4 w-4" />
                  Atlas
                </button>
              )}
              {!isMobile && (
                <button
                  type="button"
                  onClick={() => setLocation(ATLAS.href)}
                  className="flex h-9 items-center gap-1.5 rounded-xl bg-primary px-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
                >
                  <Wand2 className="h-4 w-4" />
                  Atlas
                </button>
              )}
            </div>
          </header>
          <BuscadorRapido abierto={buscadorAbierto} onCambiar={setBuscadorAbierto} grupos={grupos} />
          {!chatCompleto && <AvisoAppAndroid />}
          <main className={`flex-1 ${chatCompleto ? "p-0 md:p-6 overflow-hidden md:overflow-y-auto" : "p-4 sm:p-6 md:p-8 overflow-y-auto"} overflow-x-hidden animate-enter scroll-smooth flex flex-col h-full min-h-0`}>
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
