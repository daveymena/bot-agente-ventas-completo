import { useLocation } from "wouter";
import { LayoutDashboard, MessageSquare, Users, Package, MoreHorizontal, Bot, Phone, Settings, ShoppingCart, Palette, Facebook, Wand2, Store, Activity, Crown, Megaphone, HelpCircle, BadgeCheck, LayoutTemplate, LogOut , Truck, MessageSquareText, GraduationCap, Plug } from "lucide-react";
import { useState } from "react";
import { useSession } from "@/App";

const mainNavItems = [
  { label: "Inicio", href: "/", icon: LayoutDashboard },
  { label: "Chats", href: "/conversations", icon: MessageSquare },
  { label: "Leads", href: "/leads", icon: Users },
  { label: "Productos", href: "/products", icon: Package },
];

const baseMoreItems = [
  { label: "Landing Studio", href: "/landing-studio", icon: LayoutTemplate },
  { label: "Atlas VentasPro", href: "/code-agent", icon: Wand2, highlight: true },
  { label: "Marketing", href: "/marketing", icon: Megaphone },
  { label: "Facebook", href: "/facebook", icon: Facebook },
  { label: "Agentes IA", href: "/agents", icon: Bot },
  { label: "Probar vendedor", href: "/probar-vendedor", icon: MessageSquareText },
  { label: "Enseñar con ejemplo", href: "/ensenar-con-ejemplo", icon: GraduationCap },
  // Ocultos del menú móvil 29-09-2026 (igual que en el lateral web): son
  // herramientas de laboratorio; las rutas /agent-lab y /agent-lab-dashboard
  // siguen vivas para quien las necesite.
  // { label: "Agent Lab", href: "/agent-lab", icon: FlaskConical },
  // { label: "Lab Dashboard", href: "/agent-lab-dashboard", icon: BarChart3 },
  { label: "WhatsApp", href: "/whatsapp", icon: Phone },
  { label: "Integraciones", href: "/integraciones", icon: Plug },
  { label: "WooCommerce", href: "/woocommerce", icon: ShoppingCart },
  { label: "Dropi", href: "/dropi", icon: Truck },
  { label: "Personalización", href: "/branding", icon: Palette },
  { label: "Configuración", href: "/settings", icon: Settings },
  { label: "Ayuda", href: "/ayuda", icon: HelpCircle },
  { label: "Planes", href: "/pricing", icon: BadgeCheck },
];

const adminMoreItems = [
  { label: "Monitor WA", href: "/whatsapp-monitor", icon: Activity },
  { label: "Administrador", href: "/admin/tenants", icon: Crown },
];

export function MobileNav() {
  const [location, setLocation] = useLocation();
  const [showMore, setShowMore] = useState(false);
  const { tenant: sessionTenant } = useSession();
  const isAdmin = !!sessionTenant?.isAdmin;
  const tiendaItem = sessionTenant?.slug
    ? [{ label: "Tienda", href: `/tienda/${sessionTenant.slug}?from=panel`, icon: Store, external: true }]
    : [];
  const moreItems = isAdmin ? [...tiendaItem, ...baseMoreItems, ...adminMoreItems] : [...tiendaItem, ...baseMoreItems];

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 z-50 flex min-h-[72px] items-center justify-evenly bg-white border-t border-gray-200 shadow-[0_-4px_20px_rgba(0,0,0,0.06)] px-1 pb-2 safe-area-bottom md:hidden">
        {mainNavItems.map((item) => {
          const isActive = item.href === "/" ? location === "/" : location.startsWith(item.href);
          return <a key={item.href} href={item.href} onClick={(e) => { e.preventDefault(); setLocation(item.href); }} className={`flex flex-col items-center justify-center gap-0.5 rounded-2xl px-2 py-1.5 min-w-[48px] transition-all duration-200 flex-1 ${isActive ? "text-indigo-600" : "text-gray-400 hover:text-gray-600"}`}><div className={`flex items-center justify-center w-9 h-7 rounded-xl transition-all duration-200 ${isActive ? "bg-indigo-50" : ""}`}><item.icon className={`w-[20px] h-[20px] ${isActive ? "text-indigo-600" : ""}`} /></div><span className={`text-[10px] font-semibold tracking-tight ${isActive ? "text-indigo-600" : "text-gray-400"}`}>{item.label}</span></a>;
        })}
        <button onClick={() => setShowMore(!showMore)} className={`flex flex-col items-center justify-center gap-0.5 rounded-2xl px-2 py-1.5 min-w-[48px] transition-all duration-200 flex-1 ${showMore ? "text-indigo-600" : "text-gray-400 hover:text-gray-600"}`}>
          <div className={`flex items-center justify-center w-9 h-7 rounded-xl ${showMore ? "bg-indigo-50" : ""}`}><MoreHorizontal className={`w-[20px] h-[20px] ${showMore ? "text-indigo-600" : ""}`} /></div>
          <span className={`text-[10px] font-semibold tracking-tight ${showMore ? "text-indigo-600" : "text-gray-400"}`}>Más</span>
        </button>
      </nav>
      {showMore && <>
        <div className="fixed inset-0 z-40 md:hidden" onClick={() => setShowMore(false)} />
        <div className="fixed bottom-[calc(72px+env(safe-area-inset-bottom))] left-0 right-0 z-40 md:hidden animate-enter-up bg-white rounded-t-2xl shadow-xl border-t border-gray-100 px-4 py-3 pb-6 max-h-[60vh] overflow-y-auto">
          <div className="w-10 h-1 rounded-full bg-gray-200 mx-auto mb-4" />
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 px-1">Menú completo</p>
          <div className="grid grid-cols-3 gap-2">
            {moreItems.map((item) => {
              const isActive = item.href === "/" ? location === "/" : location.startsWith(item.href);
              const isExternal = (item as any).external;
              return <a key={item.href} href={item.href} target={isExternal ? "_blank" : undefined} rel={isExternal ? "noopener noreferrer" : undefined} onClick={(e) => { if (isExternal) { e.preventDefault(); setShowMore(false); try { window.open(item.href, "_blank", "noopener,noreferrer"); } catch { window.location.href = item.href; } return; } e.preventDefault(); setShowMore(false); setLocation(item.href); }} className={`flex flex-col items-center gap-1.5 rounded-2xl p-3 transition-all ${isActive ? "bg-indigo-50 text-indigo-600" : "text-gray-600 hover:bg-gray-50"}`}><div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isActive ? "bg-indigo-100" : "bg-gray-100"}`}><item.icon className={`w-5 h-5 ${isActive ? "text-indigo-600" : "text-gray-500"}`} /></div><span className="text-[10px] font-semibold text-center leading-tight">{item.label}</span></a>;
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
