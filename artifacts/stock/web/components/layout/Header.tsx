import { useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Bookmark, ChevronDown, Coins, LayoutDashboard, LogOut, Menu, Settings, Sparkles, Upload, User, X, Image as ImageIcon } from "lucide-react";
import { SEARCH_TABS } from "@shared/types";
import { useAuth } from "@/store/auth";
import { cn } from "@/lib/utils";
import { SearchBar } from "@/components/search/SearchBar";
import { Button } from "@/components/ui";

export function Logo({ dark = true, className }: { dark?: boolean; className?: string }) {
  const { brand } = useAuth();
  const name = brand?.name || "VentasPro Stock";
  const [a, ...rest] = name.split(" ");
  return (
    <Link to="/" className={cn("flex shrink-0 items-center gap-2 whitespace-nowrap", className)} aria-label={name}>
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-white"><ImageIcon className="h-4 w-4" /></span>
      <span className={cn("text-[17px] font-bold tracking-tight", dark ? "text-white" : "text-ink")}>{a} <span className="font-medium opacity-80">{rest.join(" ")}</span></span>
    </Link>
  );
}

export function Header() {
  const { user, requireAuth, logout } = useAuth();
  const loc = useLocation();
  const navigate = useNavigate();
  const [mobile, setMobile] = useState(false);
  const onHome = loc.pathname === "/";
  const isSearch = loc.pathname.startsWith("/buscar");
  const sp = new URLSearchParams(loc.search);
  const curTab = sp.get("tab") || "all";

  const tabHref = (id: string) => { const p = new URLSearchParams(loc.search); if (id === "all") p.delete("tab"); else p.set("tab", id); p.delete("page"); return `/buscar?${p.toString()}`; };

  return (
    <header className="sticky top-0 z-40 bg-ink text-white shadow-md">
      <div className="container-x flex h-14 items-center gap-3 sm:gap-5">
        <button className="rounded-md p-1.5 hover:bg-white/10 lg:hidden" onClick={() => setMobile((m) => !m)} aria-label="Menú">{mobile ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}</button>
        <Logo />
        {!onHome && <div className="hidden min-w-0 flex-1 md:block md:max-w-xl xl:max-w-2xl"><SearchBar /></div>}
        <nav className="ml-auto hidden shrink-0 items-center gap-0.5 lg:flex">
          <NavLink to="/bibliotecas" title="Mis bibliotecas" className={({ isActive }) => cn("whitespace-nowrap rounded-md px-2.5 py-2 text-sm font-medium text-slate-200 hover:bg-white/10 hover:text-white", isActive && "bg-white/10 text-white")}><Bookmark className="inline h-4 w-4" /><span className={cn("ml-1.5", !onHome && "hidden xl:inline")}>Mis bibliotecas</span></NavLink>
          <NavLink to="/ia" title="IA Studio" className={({ isActive }) => cn("whitespace-nowrap rounded-md px-2.5 py-2 text-sm font-medium text-slate-200 hover:bg-white/10 hover:text-white", isActive && "bg-white/10 text-white")}><Sparkles className="inline h-4 w-4" /><span className={cn("ml-1.5", !onHome && "hidden xl:inline")}>IA Studio</span></NavLink>
          <NavLink to="/precios" className={({ isActive }) => cn("whitespace-nowrap rounded-md px-2.5 py-2 text-sm font-medium text-slate-200 hover:bg-white/10 hover:text-white", isActive && "bg-white/10 text-white")}>Precios</NavLink>
          <NavLink to={user?.role === "contributor" || user?.role === "admin" ? "/colaborador" : "/colaborar"} className={({ isActive }) => cn("whitespace-nowrap rounded-md px-2.5 py-2 text-sm font-medium text-slate-200 hover:bg-white/10 hover:text-white", isActive && "bg-white/10 text-white")}>{user?.role === "contributor" || user?.role === "admin" ? "Colaborador" : "Vender"}</NavLink>
        </nav>
        <div className="ml-auto flex shrink-0 items-center gap-2 lg:ml-0">
          {user ? (
            <>
              <Link to="/cuenta/creditos" className="hidden items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold hover:bg-white/15 sm:flex" title="Tus créditos"><Coins className="h-3.5 w-3.5 text-amber-300" />{user.credits} {user.credits === 1 ? "crédito" : "créditos"}</Link>
              <DropdownMenu.Root>
                <DropdownMenu.Trigger asChild>
                  <button className="flex items-center gap-2 rounded-full bg-white/10 py-1 pl-1 pr-2 text-sm hover:bg-white/15">
                    <span className="grid h-7 w-7 place-items-center rounded-full bg-brand-500 text-xs font-bold">{user.name.slice(0, 1).toUpperCase()}</span>
                    <span className="hidden max-w-[120px] truncate font-medium md:inline">{user.name.split(" ")[0]}</span><ChevronDown className="h-4 w-4 opacity-70" />
                  </button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.Content align="end" sideOffset={8} className="z-50 w-60 rounded-xl border border-line bg-white p-1.5 text-ink shadow-pop fade-up">
                    <div className="px-2.5 py-2"><p className="truncate text-sm font-semibold">{user.name}</p><p className="truncate text-xs text-mute">{user.email}</p></div>
                    <DropdownMenu.Separator className="my-1 h-px bg-line" />
                    {[{ to: "/cuenta/licencias", icon: User, label: "Mi cuenta y licencias" }, { to: "/cuenta/creditos", icon: Coins, label: `Créditos: ${user.credits}` }, { to: "/bibliotecas", icon: Bookmark, label: "Mis bibliotecas" },
                      ...(user.role !== "user" ? [{ to: "/colaborador", icon: Upload, label: "Portal de colaborador" }] : [{ to: "/colaborar", icon: Upload, label: "Vender mi contenido" }]),
                      ...(user.role === "admin" ? [{ to: "/admin", icon: LayoutDashboard, label: "Administración" }] : []),
                      { to: "/cuenta/perfil", icon: Settings, label: "Ajustes" }].map((it) => (
                      <DropdownMenu.Item key={it.to} asChild><Link to={it.to} className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm outline-none hover:bg-slate-50 focus:bg-slate-50"><it.icon className="h-4 w-4 text-mute" />{it.label}</Link></DropdownMenu.Item>
                    ))}
                    <DropdownMenu.Separator className="my-1 h-px bg-line" />
                    <DropdownMenu.Item onSelect={() => { logout().then(() => navigate("/")); }} className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-red-700 outline-none hover:bg-red-50 focus:bg-red-50"><LogOut className="h-4 w-4" />Cerrar sesión</DropdownMenu.Item>
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>
            </>
          ) : (
            <>
              <button onClick={() => requireAuth(undefined, "login")} className="whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium text-slate-200 hover:bg-white/10 hover:text-white">Iniciar sesión</button>
              <Button size="sm" onClick={() => requireAuth(undefined, "register")} className="hidden sm:inline-flex">Crear cuenta</Button>
            </>
          )}
        </div>
      </div>

      {/* Pestañas de tipo (como Adobe: Todos / Imágenes / Vídeos / Audio / Plantillas / 3D / Gratis / Premium) */}
      {isSearch && (
        <div className="border-t border-white/10 bg-ink">
          <div className="container-x flex items-center gap-1 overflow-x-auto scrollbar-none">
            {SEARCH_TABS.map((t) => <Link key={t.id} to={tabHref(t.id)} className={cn("tab", curTab === t.id && "tab-active")}>{t.label}</Link>)}
          </div>
        </div>
      )}
      {!onHome && <div className="container-x pb-3 md:hidden"><SearchBar /></div>}

      {mobile && (
        <div className="border-t border-white/10 bg-ink px-4 py-3 lg:hidden">
          <nav className="grid gap-1 text-sm">
            {[["/buscar", "Explorar catálogo"], ["/bibliotecas", "Mis bibliotecas"], ["/ia", "IA Studio"], ["/precios", "Precios"], [user?.role && user.role !== "user" ? "/colaborador" : "/colaborar", "Vender contenido"], ...(user ? [["/cuenta/licencias", "Mi cuenta"]] : []), ...(user?.role === "admin" ? [["/admin", "Administración"]] : [])].map(([to, label]) => (
              <Link key={to} to={to} onClick={() => setMobile(false)} className="rounded-md px-3 py-2 font-medium text-slate-200 hover:bg-white/10">{label}</Link>
            ))}
            {!user && <button onClick={() => { setMobile(false); requireAuth(undefined, "register"); }} className="rounded-md bg-brand-600 px-3 py-2 text-left font-semibold">Crear cuenta gratis</button>}
          </nav>
        </div>
      )}
    </header>
  );
}
