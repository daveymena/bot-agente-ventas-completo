import { useLocation } from "wouter";
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
  { label: "Atlas VentasPro", href: "/code-agent", icon: Wand2, highlight: true },
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
  // `setLocation` NO estaba en este destructuring, pero los onClick de abajo lo
  // llamaban igual: como cada handler hace e.preventDefault() ANTES, se
  // cancelaba la navegación nativa del <a> y acto seguido reventaba con
  // "setLocation is not defined". Resultado: en móvil ningún botón de la barra
  // inferior (ni del panel "Más") navegaba a ningún lado. TypeScript lo habría
  // marcado, pero vite/esbuild solo transpila -- el error solo aparecía en la
  // consola del navegador, en runtime.
  const [location, setLocation] = useLocation();
  const [showMore, setShowMore] = useState(false);
  const { tenant: sessionTenant } = useSession();
  const isAdmin = !!sessionTenant?.isAdmin;
  // "Tienda" es la SPA pública, no una ruta de esta app -- external:true hace
  // que se abra en pestaña nueva en vez de reemplazar el panel admin (ver el
  // mismo tratamiento en components/layout.tsx).
  const tiendaItem = sessionTenant?.slug
    ? [{ label: "Tienda", href: `/tienda/${sessionTenant.slug}`, icon: Store, external: true }]
    : [];
  const moreItems = isAdmin
    ? [...tiendaItem, ...baseMoreItems, ...adminMoreItems]
    : [...tiendaItem, ...baseMoreItems];

  return (
    <>
      {/* min-h en vez de h: con `h-[72px]` la altura quedaba clavada en 72px
          y, como Tailwind usa border-box, el padding de `safe-area-bottom`
          (el hueco del home indicator, ~34px en los iPhone con notch) se
          comía el espacio interior en vez de agrandar la barra. Al ícono +
          etiqueta le quedaban ~38px y los textos se recortaban -- los
          botones "se escondían". Con min-h la barra crece lo necesario. */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 flex min-h-[72px] items-center justify-evenly bg-white/90 backdrop-blur-xl border-t border-gray-100 shadow-[0_-4px_20px_rgba(0,0,0,0.06)] px-1 pb-2 safe-area-bottom md:hidden">
        {mainNavItems.map((item) => {
          const isActive = item.href === "/" ? location === "/" : location.startsWith(item.href);
          return (
            <a
              key={item.href}
              href={item.href}
              onClick={(e) => {
                e.preventDefault();
                setLocation(item.href);
              }}
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
            </a>
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
          <div className="fixed bottom-[calc(72px+env(safe-area-inset-bottom))] left-0 right-0 z-40 md:hidden animate-enter-up bg-white rounded-t-2xl shadow-xl border-t border-gray-100 px-4 py-3 pb-6 max-h-[60vh] overflow-y-auto">
            <div className="w-10 h-1 rounded-full bg-gray-200 mx-auto mb-4" />
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 px-1">Menú completo</p>
            <div className="grid grid-cols-3 gap-2">
              {moreItems.map((item) => {
                const isActive = item.href === "/" ? location === "/" : location.startsWith(item.href);
                const isExternal = (item as any).external;
                return (
                  <a
                    key={item.href}
                    href={item.href}
                    target={isExternal ? "_blank" : undefined}
                    rel={isExternal ? "noopener noreferrer" : undefined}
                    onClick={(e) => {
                      // Los destinos externos (la tienda pública) siguen su
                      // navegación normal en pestaña nueva; solo las rutas
                      // internas usan el router de la SPA.
                      if (isExternal) { setShowMore(false); return; }
                      e.preventDefault();
                      setLocation(item.href);
                    }}
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
                  </a>
                );
              })}
            </div>
          </div>
        </>
      )}
    </>
  );
}
