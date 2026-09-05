import { useLocation } from "wouter";
import { LayoutDashboard, MessageSquare, Users, Package, MoreHorizontal, Bot, Phone, Settings, ShoppingCart, Palette, Facebook, Wand2, Store, Activity, Crown, Megaphone, HelpCircle, BadgeCheck, LayoutTemplate, X } from "lucide-react";
import { useState } from "react";
import { useSession } from "@/App";

const mainNavItems = [
  { label: "Inicio", href: "/", icon: LayoutDashboard },
  { label: "Chats", href: "/conversations", icon: MessageSquare },
  { label: "Leads", href: "/leads", icon: Users },
  { label: "Productos", href: "/products", icon: Package },
];

const categoryGroups = [
  {
    title: "Inteligencia",
    items: [
      { label: "Atlas Operator", href: "/code-agent", icon: Wand2, highlight: true },
    ]
  },
  {
    title: "Automatización",
    items: [
      { label: "Agentes IA", href: "/agents", icon: Bot },
      { label: "WhatsApp", href: "/whatsapp", icon: Phone },
    ]
  },
  {
    title: "Crecimiento",
    items: [
      { label: "Marketing", href: "/marketing", icon: Megaphone },
      { label: "Facebook", href: "/facebook", icon: Facebook },
      { label: "Landing Studio", href: "/landing-studio", icon: LayoutTemplate },
    ]
  },
  {
    title: "Tienda",
    items: [
      { label: "Pedidos", href: "/woocommerce", icon: ShoppingCart },
      { label: "Mi Tienda", href: "/tienda", icon: Store, external: true, requiresSlug: true },
    ]
  },
  {
    title: "Sistema",
    items: [
      { label: "Personalización", href: "/branding", icon: Palette },
      { label: "Configuración", href: "/settings", icon: Settings },
      { label: "Planes", href: "/pricing", icon: BadgeCheck },
      { label: "Ayuda", href: "/ayuda", icon: HelpCircle },
    ]
  }
];

const adminItems = [
  { label: "Monitor WA", href: "/whatsapp-monitor", icon: Activity },
  { label: "Administrador", href: "/admin/tenants", icon: Crown },
];

export function MobileNav() {
  const [location, setLocation] = useLocation();
  const [showMore, setShowMore] = useState(false);
  const { tenant: sessionTenant } = useSession();
  const isAdmin = !!sessionTenant?.isAdmin;

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 z-50 flex min-h-[70px] items-center justify-around bg-white border-t border-slate-200 px-2 pb-safe md:hidden">
        {mainNavItems.map((item) => {
          const isActive = item.href === "/" ? location === "/" : location.startsWith(item.href);
          return (
            <a key={item.href} href={item.href} onClick={(e) => { e.preventDefault(); setLocation(item.href); setShowMore(false); }} className={`flex flex-col items-center justify-center gap-1 rounded-xl px-2 py-2 min-w-[56px] transition-colors ${isActive ? "text-indigo-600" : "text-slate-500 hover:text-slate-900"}`}>
              <div className={`flex items-center justify-center w-8 h-8 rounded-full ${isActive ? "bg-indigo-50" : ""}`}>
                <item.icon className={`w-5 h-5 ${isActive ? "text-indigo-600" : "text-slate-500"}`} />
              </div>
              <span className={`text-[10px] font-medium tracking-tight ${isActive ? "text-indigo-700" : "text-slate-500"}`}>{item.label}</span>
            </a>
          );
        })}
        <button onClick={() => setShowMore(true)} className={`flex flex-col items-center justify-center gap-1 rounded-xl px-2 py-2 min-w-[56px] transition-colors ${showMore ? "text-indigo-600" : "text-slate-500 hover:text-slate-900"}`}>
          <div className={`flex items-center justify-center w-8 h-8 rounded-full ${showMore ? "bg-indigo-50" : ""}`}>
            <MoreHorizontal className={`w-5 h-5 ${showMore ? "text-indigo-600" : "text-slate-500"}`} />
          </div>
          <span className={`text-[10px] font-medium tracking-tight ${showMore ? "text-indigo-700" : "text-slate-500"}`}>Más</span>
        </button>
      </nav>
      
      {showMore && (
        <>
          <div className="fixed inset-0 z-[60] bg-slate-900/40 backdrop-blur-sm md:hidden animate-in fade-in" onClick={() => setShowMore(false)} />
          <div className="fixed bottom-0 left-0 right-0 z-[70] md:hidden bg-white rounded-t-3xl shadow-2xl px-5 py-4 max-h-[85vh] overflow-y-auto animate-in slide-in-from-bottom duration-300 ease-out pb-safe">
            <div className="sticky top-0 bg-white z-10 pb-2 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">Menú Completo</h2>
              <button onClick={() => setShowMore(false)} className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="flex flex-col gap-6 mt-4 pb-8">
              {categoryGroups.map((group, gIdx) => {
                const visibleItems = group.items.filter(i => !(i.requiresSlug && !sessionTenant?.slug));
                if (visibleItems.length === 0) return null;
                return (
                  <div key={gIdx} className="flex flex-col gap-3">
                    <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{group.title}</h3>
                    <div className="grid grid-cols-4 gap-y-4 gap-x-2">
                      {visibleItems.map((item, iIdx) => {
                        const isExternal = item.external;
                        const href = isExternal && item.requiresSlug ? `/tienda/${sessionTenant?.slug}?from=panel` : item.href;
                        const isHighlight = item.highlight;
                        return (
                          <a key={iIdx} href={href} target={isExternal ? "_blank" : undefined} rel={isExternal ? "noopener noreferrer" : undefined} onClick={(e) => { if (isExternal) { setShowMore(false); return; } e.preventDefault(); setShowMore(false); setLocation(href); }} className="flex flex-col items-center gap-2 group">
                            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-colors ${isHighlight ? "bg-indigo-600 text-white shadow-md shadow-indigo-200" : "bg-slate-50 text-slate-600 group-hover:bg-slate-100"}`}>
                              <item.icon className="w-5 h-5" />
                            </div>
                            <span className="text-[10px] font-medium text-slate-600 text-center leading-tight">{item.label}</span>
                          </a>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              
              {isAdmin && (
                <div className="flex flex-col gap-3">
                  <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Administración</h3>
                  <div className="grid grid-cols-4 gap-y-4 gap-x-2">
                    {adminItems.map((item, iIdx) => (
                      <a key={iIdx} href={item.href} onClick={(e) => { e.preventDefault(); setShowMore(false); setLocation(item.href); }} className="flex flex-col items-center gap-2 group">
                        <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-slate-50 text-slate-600 group-hover:bg-slate-100">
                          <item.icon className="w-5 h-5" />
                        </div>
                        <span className="text-[10px] font-medium text-slate-600 text-center leading-tight">{item.label}</span>
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}
