import { Link } from "react-router-dom";
import { useAuth } from "@/store/auth";
import { Logo } from "./Header";

const TOPICS = ["logotipos", "moda", "png", "siluetas", "verano", "humor", "viajes", "fondo de pantalla", "navidad", "corazón", "amor", "mapa", "flores", "iconos", "oficina", "café", "montañas", "ciudad", "comida", "negocios", "tecnología", "naturaleza"];

export function Footer() {
  const { brand } = useAuth();
  return (
    <footer className="mt-16 border-t border-line bg-paper">
      <div className="container-x py-12">
        <div className="grid gap-10 md:grid-cols-4">
          <div className="md:col-span-1">
            <Logo dark={false} />
            <p className="mt-3 max-w-xs text-sm text-mute">{brand?.tagline}</p>
            {brand && <p className="mt-3 text-xs text-mute">{brand.stats.assets.toLocaleString("es")} recursos · {brand.stats.contributors} colaboradores</p>}
          </div>
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wide text-ink">Explorar</h4>
            <ul className="mt-3 space-y-2 text-sm text-ink-soft">
              {[["/buscar?tab=images", "Imágenes"], ["/buscar?tab=video", "Vídeos"], ["/buscar?tab=audio", "Audio"], ["/buscar?tab=template", "Plantillas"], ["/buscar?tab=free", "Recursos gratis"], ["/bibliotecas", "Colecciones"]].map(([to, l]) => <li key={to}><Link to={to} className="hover:text-ink hover:underline">{l}</Link></li>)}
            </ul>
          </div>
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wide text-ink">Comprar y vender</h4>
            <ul className="mt-3 space-y-2 text-sm text-ink-soft">
              {[["/precios", "Planes y precios"], ["/precios#creditos", "Paquetes de créditos"], ["/licencias", "Tipos de licencia"], ["/colaborar", "Vender tu contenido"], ["/ia", "IA Studio"]].map(([to, l]) => <li key={to}><Link to={to} className="hover:text-ink hover:underline">{l}</Link></li>)}
            </ul>
          </div>
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wide text-ink">Ayuda</h4>
            <ul className="mt-3 space-y-2 text-sm text-ink-soft">
              <li><Link to="/licencias" className="hover:text-ink hover:underline">Preguntas sobre licencias</Link></li>
              <li><Link to="/cuenta/licencias" className="hover:text-ink hover:underline">Mis descargas</Link></li>
              <li><a href={`mailto:${(brand as any)?.supportEmail || "soporte@ventasproia.com"}`} className="hover:text-ink hover:underline">Soporte</a></li>
            </ul>
          </div>
        </div>
        <div className="mt-10 border-t border-line pt-6">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-mute">Búsquedas populares</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-ink-soft">{TOPICS.map((t) => <Link key={t} to={`/buscar?q=${encodeURIComponent(t)}`} className="hover:text-ink hover:underline">{t}</Link>)}</div>
        </div>
        <p className="mt-8 text-xs text-mute">© {new Date().getFullYear()} {brand?.name || "VentasPro Stock"}. Todos los recursos están protegidos por derechos de autor y se licencian, no se venden.</p>
      </div>
    </footer>
  );
}
