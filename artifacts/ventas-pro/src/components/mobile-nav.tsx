import { useLocation, Link } from "wouter";
import { LayoutDashboard, MessageSquare, Users, GraduationCap, MoreHorizontal } from "lucide-react";

const mobileNavItems = [
  { label: "Inicio", href: "/", icon: LayoutDashboard },
  { label: "Chats", href: "/conversations", icon: MessageSquare },
  { label: "Leads", href: "/leads", icon: Users },
  { label: "Cursos", href: "/agents", icon: GraduationCap },
  { label: "Más", href: "/settings", icon: MoreHorizontal },
];

export function MobileNav() {
  const [location] = useLocation();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 flex h-[72px] items-center justify-around bg-white/90 backdrop-blur-xl border-t border-gray-100 shadow-[0_-4px_20px_rgba(0,0,0,0.06)] px-2 pb-2 safe-area-bottom md:hidden">
      {mobileNavItems.map((item) => {
        const isActive = item.href === "/" ? location === "/" : location.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-col items-center justify-center gap-0.5 rounded-2xl px-4 py-1.5 min-w-[56px] transition-all duration-200 ${
              isActive
                ? "text-indigo-600"
                : "text-gray-400 hover:text-gray-600"
            }`}
          >
            <div className={`flex items-center justify-center w-10 h-8 rounded-xl transition-all duration-200 ${
              isActive ? "bg-indigo-50" : ""
            }`}>
              <item.icon className={`w-[22px] h-[22px] transition-all duration-200 ${
                isActive ? "text-indigo-600" : ""
              }`} />
            </div>
            <span className={`text-[11px] font-semibold tracking-tight transition-all duration-200 ${
              isActive ? "text-indigo-600" : "text-gray-400"
            }`}>
              {item.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
