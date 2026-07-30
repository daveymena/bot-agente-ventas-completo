import { useLocation, Link } from "wouter";
import { LayoutDashboard, MessageSquare, Users, Package, MoreHorizontal, Bot, Phone, Settings, ShoppingCart, Palette, Facebook, Wand2, Store, Activity, Crown } from "lucide-react";
import { useState } from "react";
import { useSession } from "@/App";

const mainNavItems = [
  { label: "Inicio", href: "/", icon: LayoutDashboard },
  { label: "Chats", href: "/conversations", icon: MessageSquare },
  { label: "Leads", href: "/leads", icon: Users },
  { label: "Productos", href: "/products", icon: Package },
];

const baseMoreItems = [
  { label: "Arquitecto IA", href: "/code-agent", icon: Wand2, highlight: true },
  { label: "Tienda", href: "/mi-tienda", icon: Store },
  { label: "Agentes IA", href: "/agents", icon: Bot },
  { label: "WhatsApp", href: "/whatsapp", icon: Phone },
  { label: "Configuración", href: "/settings", icon: Settings },
  { label: "WooCommerce", href: "/woocommerce", icon: ShoppingCart },
  { label: "Personalización", href: "/branding", icon: Palette },
  { label: "Facebook", href: "/facebook", icon: Facebook },
];

// "Monitor WA" muestra el estado de WhatsApp de TODOS los negocios
// registrados, no solo el propio -- antes se listaba siempre, sin ningún
// chequeo de admin (a diferencia del sidebar de escritorio, que sí lo
// filtraba, aunque con un check roto). Se agrega acá para que el menú móvil
// no ofrezca un link a una página que ahora rechaza con 403 a quien no sea
// administrador de la plataforma.
const adminMoreItems = [
  { label: "Monitor WA", href: "/whatsapp-monitor", icon: Activity },
  { label: "Administrador", href: "/admin/tenants", icon: Crown },
];

export function MobileNav() {
  const [location] = useLocation();
  const [showMore, setShowMore] = useState(false);
  const { tenant: sessionTenant } = useSession();
  const isAdmin = !!sessionTenant?.isAdmin;
  const moreItems = isAdmin ? [...baseMoreItems, ...adminMoreItems] : baseMoreItems;

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 z-50 flex h-[72px] items-center justify-evenly bg-white/90 backdrop-blur-xl border-t border-gray-100 shadow-[0_-4px_20px_rgba(0,0,0,0.06)] px-1 pb-2 safe-area-bottom md:hidden">
        {mainNavItems.map((item) => {
          const isActive = item.href === "/" ? location === "/" : location.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center justify-center gap-0.5 rounded-2xl px-2 py-1.5 min-w-[48px] transition-all duration-200 flex-1 ${
                isActive ? "text-indigo-600" : "text-gray-400 hover:text-gray-600"
              }`}
            >
              <div className={`flex items-center justify-center w-9 h-7 rounded-xl transition-all duration-200 ${
                isActive ? "bg-indigo-50" : ""
              }`}>
                <item.icon className={`w-[20px] h-[20px] transition-all duration-200 ${
                  isActive ? "text-indigo-600" : ""
                }`} />
              </div>
              <span className={`text-[10px] font-semibold tracking-tight transition-all duration-200 ${
                isActive ? "text-indigo-600" : "text-gray-400"
              }`}>
                {item.label}
              </span>
            </Link>
          );
        })}

        <button
          onClick={() => setShowMore(!showMore)}
          className={`flex flex-col items-center justify-center gap-0.5 rounded-2xl px-2 py-1.5 min-w-[48px] transition-all duration-200 flex-1 ${
            showMore ? "text-indigo-600" : "text-gray-400 hover:text-gray-600"
          }`}
        >
          <div className={`flex items-center justify-center w-9 h-7 rounded-xl transition-all duration-200 ${
            showMore ? "bg-indigo-50" : ""
          }`}>
            <MoreHorizontal className={`w-[20px] h-[20px] transition-all duration-200 ${
              showMore ? "text-indigo-600" : ""
            }`} />
          </div>
          <span className={`text-[10px] font-semibold tracking-tight transition-all duration-200 ${
            showMore ? "text-indigo-600" : "text-gray-400"
          }`}>
            Más
          </span>
        </button>
      </nav>

      {showMore && (
        <>
          <div className="fixed inset-0 z-40 md:hidden" onClick={() => setShowMore(false)} />
          <div className="fixed bottom-[72px] left-0 right-0 z-40 md:hidden animate-enter-up bg-white rounded-t-2xl shadow-xl border-t border-gray-100 px-4 py-3 pb-6 safe-area-bottom max-h-[60vh] overflow-y-auto">
            <div className="w-10 h-1 rounded-full bg-gray-200 mx-auto mb-4" />
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 px-1">Menú completo</p>
            <div className="grid grid-cols-3 gap-2">
              {moreItems.map((item) => {
                const isActive = item.href === "/" ? location === "/" : location.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setShowMore(false)}
                    className={`flex flex-col items-center gap-1.5 rounded-2xl p-3 transition-all ${
                      isActive ? "bg-indigo-50 text-indigo-600" : "text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                      isActive ? "bg-indigo-100" : "bg-gray-100"
                    }`}>
                      <item.icon className={`w-5 h-5 ${isActive ? "text-indigo-600" : "text-gray-500"}`} />
                    </div>
                    <span className="text-[10px] font-semibold text-center leading-tight">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        </>
      )}
    </>
  );
}
