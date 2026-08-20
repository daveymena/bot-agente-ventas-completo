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
  Megaphone
} from "lucide-react";
import { Sidebar, SidebarContent, SidebarHeader, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarProvider, SidebarTrigger, SidebarGroup, SidebarGroupContent } from "./ui/sidebar";
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

  const allNavItems = [
    { label: "Panel", href: "/", icon: LayoutDashboard },
    { label: "Conversaciones", href: "/conversations", icon: MessageSquare },
    { label: "Agentes IA", href: "/agents", icon: Bot },
    { label: "Prospectos", href: "/leads", icon: Users },
    { label: "Productos", href: "/products", icon: Package },
    { label: "WhatsApp", href: "/whatsapp", icon: Phone },
    ...(isAdmin ? [
      { label: "Monitor WA", href: "/whatsapp-monitor", icon: Activity },
      { label: "Administrador", href: "/admin/tenants", icon: Crown },
    ] : []),
    { label: "WooCommerce", href: "/woocommerce", icon: ShoppingCart },
    { label: "Atlas VentasPro", href: "/code-agent", icon: Wand2 },
    { label: "Personalización", href: "/branding", icon: Palette },
    { label: "Facebook", href: "/facebook", icon: Facebook },
    { label: "Marketing", href: "/marketing", icon: Megaphone },
    { label: "Configuración", href: "/settings", icon: Settings },
    { label: "Ayuda", href: "/ayuda", icon: HelpCircle },
    { label: "Planes", href: "/pricing", icon: Badge },
    ...(sessionTenant?.slug ? [{ label: "Ver Tienda", href: `/tienda/${sessionTenant.slug}?from=panel`, icon: Eye, external: true }] : []),
];

  return (
    <Sidebar className="border-r border-sidebar-border bg-sidebar/80 backdrop-blur-xl text-sidebar-foreground">
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
                const linkClassName = "flex items-center gap-3 px-3 w-full";
                const linkContent = (
                  <>
                    <item.icon className={`h-[18px] w-[18px] shrink-0 ${isActive ? 'text-white' : 'text-sidebar-foreground group-hover:text-white'}`} />
                    <span>{item.label}</span>
                  </>
                );
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
                      {/* "external" son destinos fuera de esta SPA (la tienda
                          pública, otra app entera) -- un <Link> de wouter ahí
                          termina reemplazando toda la página admin en la misma
                          pestaña. Se abren en pestaña nueva para mantener el
                          panel vivo al mismo tiempo. */}
                      {(item as any).external ? (
                        <a href={item.href} target="_blank" rel="noopener noreferrer" className={linkClassName}>
                          {linkContent}
                        </a>
                      ) : (
                        <Link href={item.href} className={linkClassName}>
                          {linkContent}
                        </Link>
                      )}
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

/**
 * `chatCompleto`: la pantalla es un CHAT y en móvil ocupa todo el alto
 * disponible, sin el padding de página ni la reserva de 184px para la barra
 * inferior.
 *
 * Sin esto, una pantalla de chat quedaba encajonada: el padding de <main> más
 * esos 184px se comían casi la mitad del alto de un celular, y a Atlas le
 * quedaban ~300px para los mensajes. En una lista de productos ese espacio es
 * correcto (evita que la barra tape el final del contenido); en un chat, que
 * tiene su propio campo de escritura abajo, sobra: el chat maneja su alto.
 */
export function Layout({ children, chatCompleto = false }: { children: React.ReactNode; chatCompleto?: boolean }) {
  const isMobile = useIsMobile();

  return (
    <SidebarProvider>
      {/* h-screen (no min-h-screen): con min-height el contenedor crece con
          el contenido en vez de quedar acotado al viewport, así que
          overflow-y-auto de <main> nunca entra en juego y termina
          scrolleando el documento entero -- con listas largas (ej. 85
          borradores de Facebook) eso deja el header y el sidebar fijo
          visualmente "atrás", fuera de la parte visible. */}
      <div className="flex h-screen w-full bg-background relative overflow-x-hidden text-foreground">
        {!isMobile && <AppSidebar />}
        <div className="flex flex-1 flex-col w-full min-w-0 relative z-10">
          <header className="flex h-14 sm:h-16 items-center gap-4 border-b border-border/50 bg-card/60 backdrop-blur-xl px-3 sm:px-4 md:px-6 sticky top-0 z-20 shadow-sm">
            {!isMobile && <SidebarTrigger className="hover:bg-primary/10 rounded-xl w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center transition-all text-primary shrink-0" />}
            <div className="flex-1 min-w-0" />
            <div className="flex items-center gap-2">
              <UiBadge variant="outline" className="bg-primary/5 text-primary border-primary/20 hidden sm:flex text-xs">V1.5 PREMIUM</UiBadge>
            </div>
          </header>
          {/* El espacio que reserva la barra inferior fija va en el div de
              adentro, NO en <main>. <main> es el contenedor que scrollea
              (overflow-y-auto) y WebKit -- o sea Safari en iPhone, que es
              justamente donde se veía el problema -- descarta el
              padding-bottom de un contenedor scrolleable cuando el contenido
              desborda. Resultado: lo último de cada pantalla (botones de
              guardar, selects, el final de las listas) quedaba tapado por la
              barra. En un hijo que no scrollea el padding se respeta siempre.

               El cálculo: 72px de la barra + 112px de aire para acciones y chat + el inset del
              home indicator en los teléfonos con notch. Y se resuelve con
              `md:` (CSS puro) en vez de con el hook useIsMobile (JS), para
              que el espacio no dependa de que un efecto de React ya haya
              corrido. */}
          <main className={`flex-1 ${chatCompleto ? "p-0 md:p-8 overflow-hidden md:overflow-y-auto" : "p-3 sm:p-4 md:p-8 overflow-y-auto"} overflow-x-hidden animate-enter scroll-smooth flex flex-col h-full min-h-0`}>
            {/* En MÓVIL este contenedor NO se limita a la altura de la
                pantalla; en escritorio sí (md:).

                Acá estaba la causa real de que lo último quedara recortado en
                toda la app, y sobrevivió al arreglo anterior del padding:
                `flex-1` + `min-h-0` dentro de un padre de alto fijo capan la
                altura de este div a lo que se ve. Un contenido más largo NO lo
                estira -- se DESBORDA fuera de él. Y el `padding-bottom` se
                dibuja en el borde del div, o sea ARRIBA de ese desborde, no
                después del contenido. Resultado: se scrollea, aparece lo que
                faltaba... y el final queda debajo de la barra inferior fija,
                sin nada que lo empuje.

                Sin `flex-1`/`min-h-0` el div crece con su contenido, <main>
                scrollea, y el espacio de abajo queda DESPUÉS de todo, que es
                lo que hace falta. En escritorio se conserva el
                comportamiento de siempre porque ahí no hay barra inferior y
                varias pantallas (chat, ayuda) reparten el alto con flex. */}
            <div className={`max-w-7xl mx-auto w-full md:flex-1 md:flex md:flex-col md:min-h-0 ${chatCompleto ? "flex-1 flex flex-col min-h-0 pb-[calc(72px+env(safe-area-inset-bottom))] md:pb-4" : "pb-[calc(184px+env(safe-area-inset-bottom))] md:pb-4"}`}>
              {children}
            </div>
          </main>
        </div>
        <MobileNav />
        <HelpChatWidget />
      </div>
    </SidebarProvider>
  );
}
