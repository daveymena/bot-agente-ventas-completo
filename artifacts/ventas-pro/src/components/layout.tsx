import "./workspace-sidebar.css";
import { AvisoAppAndroid } from "@/components/app-android";
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
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
  PanelLeftClose,
  PanelLeftOpen,
  ArrowUpRight,
} from "lucide-react";
import { Sidebar, SidebarContent, SidebarHeader, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarProvider, SidebarTrigger, useSidebar } from "./ui/sidebar";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useGetWhatsAppStatus, getGetWhatsAppStatusQueryKey } from "@workspace/api-client-react";
import { useSession } from "@/App";
import { MobileNav } from "./mobile-nav";
import { HelpChatWidget } from "./HelpChatWidget";
import { useIsMobile } from "@/hooks/use-mobile";
import { iconoMarca } from "@/components/logo-marca";

type NavItem = { label: string; href: string; icon: any; external?: boolean | string };
type NavGroup = { id: string; label: string; icon: any; items: NavItem[] };

/** Ruta activa: coincide exacta o por prefijo de sección. */
function estaActiva(location: string, href: string, search = ""): boolean {
  const [ruta, consulta] = href.split("?");
  if (location !== ruta && !(ruta !== "/" && location.startsWith(`${ruta}/`))) return false;
  const actual = new URLSearchParams(search);
  if (consulta) return [...new URLSearchParams(consulta)].every(([key, value]) => actual.get(key) === value);
  return ruta !== "/estudio" || actual.get("espacio") !== "creativos";
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
  const [location] = useLocation();
  const search = useSearch();
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({ crecimiento: true });
  const { state: sidebarState, toggleSidebar, isMobile } = useSidebar();
  const collapsed = sidebarState === "collapsed" && !isMobile;
  const { tenant: sessionTenant, logout } = useSession();
  const grupos = useGruposDeNavegacion(!!sessionTenant?.isAdmin, sessionTenant?.slug);
  const workspace = sessionTenant?.businessName || sessionTenant?.name || "Mi negocio";
  const principal: NavItem[] = [{ label: "Inicio", href: "/", icon: LayoutDashboard }, ...grupos[0].items];

  useEffect(() => {
    const activo = grupos.find((g) => g.items.some((item) => !item.external && estaActiva(location, item.href, search)));
    if (activo) setOpenGroups((actual) => actual[activo.id] ? actual : { ...actual, [activo.id]: true });
  }, [location, search, grupos]);

  const renderItem = (item: NavItem) => {
    const active = !item.external && estaActiva(location, item.href, search);
    const Icon = item.icon;
    const content = <>
      <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
      {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
      {!collapsed && item.external && <ArrowUpRight className="h-3 w-3 shrink-0 opacity-45" aria-hidden="true" />}
    </>;
    return <SidebarMenuItem key={item.href}>
      <SidebarMenuButton asChild isActive={active} tooltip={item.label} className="vp-workspace-link h-9 rounded-lg px-2.5 text-[13px]">
        {item.external ? <a href={typeof item.external === "string" ? item.external : item.href} target="_blank" rel="noopener noreferrer" aria-label={collapsed ? `${item.label} (nueva pestaña)` : undefined}>{content}</a>
          : <Link href={item.href} aria-current={active ? "page" : undefined} aria-label={collapsed ? item.label : undefined}>{content}</Link>}
      </SidebarMenuButton>
    </SidebarMenuItem>;
  };

  return <Sidebar collapsible="icon" className="vp-workspace-sidebar">
    <SidebarHeader className={`flex-row items-center gap-2.5 border-b border-sidebar-border py-4 ${collapsed ? "justify-center px-1" : "px-4"}`}>
      <Link href="/" aria-label="VentasPro · Inicio" className="flex min-w-0 flex-1 items-center gap-2.5">
        <img src="/logo-mark-plano.svg" alt="" className="h-8 w-8 shrink-0" />
        {!collapsed && <span className="min-w-0"><span className="block text-[15px] font-semibold tracking-tight">VentasPro<span className="ml-1 text-indigo-600 dark:text-indigo-400">IA</span></span><span className="block truncate text-[11px] text-sidebar-foreground/60">{workspace}</span></span>}
      </Link>
      {!collapsed && <button type="button" onClick={toggleSidebar} title="Contraer menú (Ctrl+B)" aria-label="Contraer menú" className="vp-workspace-control"><PanelLeftClose className="h-4 w-4" /></button>}
    </SidebarHeader>
    <SidebarContent className={`gap-5 py-4 [scrollbar-width:thin] ${collapsed ? "px-1.5" : "px-3"}`}>
      <SidebarMenu className="gap-1">{renderItem(ATLAS)}</SidebarMenu>
      <nav aria-label="Navegación principal" className="space-y-5">
        <section>
          {!collapsed && <p className="vp-workspace-heading">Tu negocio</p>}
          <SidebarMenu className="gap-0.5">{principal.map(renderItem)}</SidebarMenu>
        </section>
        {grupos.filter((g) => g.id !== "operacion" && g.id !== "sistema").map((grupo) => {
          const Icon = grupo.icon;
          const open = !!openGroups[grupo.id];
          const active = grupo.items.some((item) => !item.external && estaActiva(location, item.href, search));
          return <section key={grupo.id}>
            <button type="button" aria-label={collapsed ? grupo.label : undefined} title={collapsed ? grupo.label : undefined} aria-expanded={!collapsed && open} aria-controls={`menu-${grupo.id}`} className={`vp-workspace-section ${active ? "is-current" : ""} ${collapsed ? "justify-center px-1" : ""}`} onClick={() => {
              if (collapsed) { setOpenGroups((actual) => ({ ...actual, [grupo.id]: true })); toggleSidebar(); }
              else setOpenGroups((actual) => ({ ...actual, [grupo.id]: !actual[grupo.id] }));
            }}>
              {collapsed ? <Icon className="h-[18px] w-[18px]" /> : <><span className="flex-1">{grupo.label}</span><ChevronDown className={`h-3.5 w-3.5 transition-transform motion-reduce:transition-none ${open ? "rotate-180" : ""}`} /></>}
            </button>
            <SidebarMenu id={`menu-${grupo.id}`} hidden={collapsed || !open} className={collapsed || !open ? "hidden" : "mt-1 gap-0.5"}>{grupo.items.map(renderItem)}</SidebarMenu>
          </section>;
        })}
      </nav>
    </SidebarContent>
    <div className={`mt-auto border-t border-sidebar-border py-3 ${collapsed ? "px-1.5" : "px-3"}`}>
      <SidebarMenu className="gap-0.5">
        {collapsed && <SidebarMenuItem><SidebarMenuButton tooltip="Expandir menú" aria-label="Expandir menú" onClick={toggleSidebar} className="vp-workspace-link h-9"><PanelLeftOpen className="h-[18px] w-[18px]" /></SidebarMenuButton></SidebarMenuItem>}
        <SidebarMenuItem>
          <SidebarMenuButton tooltip="Configuración y ayuda" aria-label={collapsed ? "Configuración y ayuda" : undefined} onClick={() => {
            if (collapsed) toggleSidebar();
            setOpenGroups((actual) => ({ ...actual, sistema: !actual.sistema || collapsed }));
          }} aria-expanded={!collapsed && !!openGroups.sistema} aria-controls="menu-sistema" className="vp-workspace-link h-9 rounded-lg px-2.5 text-[13px]">
            <Settings className="h-[18px] w-[18px] shrink-0" />{!collapsed && <><span className="flex-1">Configuración y ayuda</span><ChevronDown className={`h-3.5 w-3.5 ${openGroups.sistema ? "rotate-180" : ""}`} /></>}
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
      <div id="menu-sistema" hidden={collapsed || !openGroups.sistema} className="max-h-[35svh] overflow-y-auto">
        <SidebarMenu className="mt-1 gap-0.5">{grupos.find((g) => g.id === "sistema")?.items.map(renderItem)}</SidebarMenu>
        <button type="button" onClick={() => logout()} className="vp-workspace-section mt-1 w-full justify-start gap-2.5 text-xs"><LogOut className="h-4 w-4" />Cerrar sesión</button>
      </div>
    </div>
  </Sidebar>;
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
