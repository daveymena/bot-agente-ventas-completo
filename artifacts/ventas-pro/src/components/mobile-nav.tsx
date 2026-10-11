import { IconoDelMenu } from "@/components/icono-del-menu";
import { iconoMarca } from "@/components/logo-marca";
import { useLocation } from "wouter";
import {   LayoutDashboard, MessageSquare, Users, Package, MoreHorizontal, Bot, Settings, ShoppingCart, Palette, Wand2, Store, Activity, Crown, Megaphone, HelpCircle, BadgeCheck, LayoutTemplate, LogOut, MessageSquareText, GraduationCap, Plug, ChevronDown, BriefcaseBusiness, ReceiptText } from "lucide-react";
import { useEffect, useState } from "react";
import { useSession } from "@/App";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

type MobileMenuItem = { label: string; href: string; icon: any; external?: boolean | string };
type MobileMenuGroup = { id: string; label: string; icon: any; items: MobileMenuItem[] };

const mainNavItems = [
  { label: "Inicio", href: "/", icon: LayoutDashboard },
  { label: "Chats", href: "/conversations", icon: MessageSquare },
  { label: "Leads", href: "/leads", icon: Users },
  { label: "Productos", href: "/products", icon: Package },
];

export function MobileNav() {
  const [location, setLocation] = useLocation();
  const [showMore, setShowMore] = useState(false);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const { tenant: sessionTenant } = useSession();
  const isAdmin = !!sessionTenant?.isAdmin;
  const menuGroups: MobileMenuGroup[] = [
    { id: "ventas", label: "Ventas", icon: BriefcaseBusiness, items: [
      { label: "Pedidos", href: "/pedidos", icon: ShoppingCart },
      { label: "Punto de venta", href: "/punto-de-venta", icon: ReceiptText },
    ] },
    { id: "asistente", label: "Asistente IA", icon: Bot, items: [
      { label: "Agentes IA", href: "/agents", icon: Bot },
      { label: "Probar vendedor", href: "/probar-vendedor", icon: MessageSquareText },
      { label: "Enseñar con ejemplo", href: "/ensenar-con-ejemplo", icon: GraduationCap },
      { label: "Atlas VentasPro", href: "/code-agent", icon: Wand2 },
    ] },
    { id: "canales", label: "Canales e integraciones", icon: Plug, items: [
      { label: "WhatsApp", href: "/whatsapp", icon: iconoMarca("whatsapp") },
      { label: "Integraciones", href: "/integraciones", icon: Plug },
      { label: "WooCommerce", href: "/woocommerce", icon: iconoMarca("woocommerce") },
      { label: "Dropi", href: "/dropi", icon: iconoMarca("dropi") },
    ] },
    { id: "crecimiento", label: "Marketing", icon: Megaphone, items: [
      { label: "Facebook", href: "/facebook", icon: iconoMarca("facebook") },
      { label: "Marketing", href: "/marketing", icon: Megaphone },
      { label: "Landing Studio", href: "/landing-studio", icon: LayoutTemplate, external: "/api/landing-forge/entrar" },
      ...(sessionTenant?.slug ? [{ label: "Ver Tienda", href: `/tienda/${sessionTenant.slug}?from=panel`, icon: Store, external: true }] : []),
    ] },
    { id: "administracion", label: "Administración", icon: Settings, items: [
      { label: "Personalización", href: "/branding", icon: Palette },
      { label: "Configuración", href: "/settings", icon: Settings },
      { label: "Diagnóstico", href: "/diagnostico", icon: Activity },
      { label: "Ayuda", href: "/ayuda", icon: HelpCircle },
      { label: "Planes", href: "/pricing", icon: BadgeCheck },
      ...(isAdmin ? [
        { label: "Monitor WA", href: "/whatsapp-monitor", icon: Activity },
        { label: "Administrador", href: "/admin/tenants", icon: Crown },
      ] : []),
    ] },
  ];

  useEffect(() => {
    if (!showMore) return;
    const active = menuGroups.find((g) => g.items.some((item) => location === item.href || location.startsWith(`${item.href}/`)));
    if (active) setOpenGroup(active.id);
  }, [showMore, location, isAdmin, sessionTenant?.slug]);

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 z-50 flex min-h-[72px] items-center justify-evenly bg-white border-t border-gray-200 shadow-[0_-4px_20px_rgba(0,0,0,0.06)] px-1 pb-2 safe-area-bottom md:hidden">
        {mainNavItems.map((item) => {
          const isActive = item.href === "/" ? location === "/" : location.startsWith(item.href);
          return <a key={item.href} href={item.href} onClick={(e) => { e.preventDefault(); setLocation(item.href); }} className={`flex flex-col items-center justify-center gap-0.5 rounded-2xl px-2 py-1.5 min-w-[48px] transition-all duration-200 flex-1 ${isActive ? "text-indigo-600" : "text-gray-400 hover:text-gray-600"}`}><div className={`flex items-center justify-center w-9 h-7 rounded-xl transition-all duration-200 ${isActive ? "bg-indigo-50" : ""}`}><IconoDelMenu icon={item.icon} href={item.href} tam={30} activo={isActive} /></div><span className={`text-[10px] font-semibold tracking-tight ${isActive ? "text-indigo-600" : "text-gray-400"}`}>{item.label}</span></a>;
        })}
        <button onClick={() => setShowMore(!showMore)} className={`flex flex-col items-center justify-center gap-0.5 rounded-2xl px-2 py-1.5 min-w-[48px] transition-all duration-200 flex-1 ${showMore ? "text-indigo-600" : "text-gray-400 hover:text-gray-600"}`}>
          <div className={`flex items-center justify-center w-9 h-7 rounded-xl ${showMore ? "bg-indigo-50" : ""}`}><MoreHorizontal className={`w-[20px] h-[20px] ${showMore ? "text-indigo-600" : ""}`} /></div>
          <span className={`text-[10px] font-semibold tracking-tight ${showMore ? "text-indigo-600" : "text-gray-400"}`}>Más</span>
        </button>
      </nav>
      {showMore && <>
        <div className="fixed inset-0 z-40 md:hidden" onClick={() => setShowMore(false)} />
        <div className="fixed bottom-[calc(72px+env(safe-area-inset-bottom))] left-0 right-0 z-40 md:hidden animate-enter-up bg-white rounded-t-2xl shadow-xl border-t border-gray-100 px-4 py-3 pb-6 max-h-[68vh] overflow-y-auto">
          <div className="w-10 h-1 rounded-full bg-gray-200 mx-auto mb-4" />
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 px-1">Menú por áreas</p>
          <div className="flex flex-col gap-2">
            {menuGroups.map((group) => {
              const Icon = group.icon;
              const open = openGroup === group.id;
              const active = group.items.some((item) => location === item.href || location.startsWith(`${item.href}/`));
              return (
                <Collapsible key={group.id} open={open} onOpenChange={(next) => setOpenGroup(next ? group.id : null)}>
                  <CollapsibleTrigger asChild>
                    <button type="button" aria-expanded={open} className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${active ? "border-indigo-200 bg-indigo-50 text-indigo-700" : "border-gray-100 bg-gray-50 text-gray-700 hover:bg-gray-100"}`}>
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="flex-1 text-sm font-semibold">{group.label}</span>
                      <span className="text-[10px] tabular-nums text-gray-400">{group.items.length}</span>
                      <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-1.5 flex flex-col gap-1 border-l border-gray-200 ml-5 pl-3">
                    {group.items.map((item) => {
                      const isActive = location === item.href || location.startsWith(`${item.href}/`);
                      const isExternal = !!item.external;
                      const urlExterna = typeof item.external === "string" ? item.external : item.href;
                      return (
                        <a key={item.href} href={isExternal ? urlExterna : item.href} target={isExternal ? "_blank" : undefined} rel={isExternal ? "noopener noreferrer" : undefined}
                          onClick={(e) => { if (isExternal) { e.preventDefault(); setShowMore(false); try { window.open(urlExterna, "_blank", "noopener,noreferrer"); } catch { window.location.href = urlExterna; } return; } e.preventDefault(); setShowMore(false); setLocation(item.href); }}
                          className={`flex min-h-10 items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${isActive ? "bg-indigo-100 font-semibold text-indigo-700" : "text-gray-600 hover:bg-gray-50"}`}>
                          <IconoDelMenu icon={item.icon} href={item.href} tam={20} activo={isActive} />
                          <span>{item.label}</span>
                        </a>
                      );
                    })}
                  </CollapsibleContent>
                </Collapsible>
              );
            })}
          </div>
          {/* En el celular no había forma de cerrar sesión: el botón vivía
              solo en la barra lateral de escritorio (12-09-2026). Mismo
              cierre que usa layout.tsx. */}
          <button
            onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); window.location.href = "/auth"; }}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold text-red-600 bg-red-50 border border-red-100 active:bg-red-100"
          >
            <LogOut className="w-4 h-4" />
            Cerrar sesión
          </button>
        </div>
      </>}
    </>
  );
}
