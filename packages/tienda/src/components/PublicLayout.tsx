import { Link, useParams } from 'react-router-dom';
import { ShoppingCart, MessageCircle, Store, Heart, User, LayoutDashboard } from 'lucide-react';
import { useState, useEffect, useMemo } from 'react';
import { useStore } from '../store/useStore';
import { initPixel } from '../lib/pixel';
import { FacebookIcon, InstagramIcon, TikTokIcon, XIcon, LinkedInIcon } from './SocialIcons';
import { MercadoPagoBadge, NequiBadge, PSEBadge } from './PaymentIcons';
import Encabezado, { CategoriaDelMenu } from './market/Encabezado';
import { skinDeLaTienda } from '../lib/skin';
// darken()/tint()/readableTextColor() ya no se usan acá: la paleta pasó a ser
// fija (ver themeVars abajo) en vez de derivarse del color del dueño. Los
// helpers siguen en lib/color.ts porque LandingPage y LandingPageNicho SÍ los
// usan para su propio tema.

const PublicLayout = ({ children }: { children: React.ReactNode }) => {
  const { cart, wishlist, config, updateConfig, isAdmin } = useStore();
  const { slug } = useParams();
  const effectiveSlug = slug || 'sofia-premium';
  const cartCount = cart.reduce((acc, item) => acc + item.quantity, 0);
  const base = slug ? `/tienda/${slug}` : '/tienda';

  // El usuario logueado solo ve los botones de administración cuando la
  // tienda que está viendo es LA SUYA -- isAdmin por sí solo solo dice "hay
  // sesión de algún tenant", así que sin esta comparación, un dueño logueado
  // vería el botón de "Panel Admin" en la tienda pública de OTRO negocio.
  const isOwner = isAdmin && config.slug === effectiveSlug;

  const [categorias, setCategorias] = useState<CategoriaDelMenu[]>([]);

  // ── El skin de la tienda ──────────────────────────────────────────────
  //
  // Acá vivían quince colores escritos a mano, copiados del kit URBANisty e
  // IGUALES para todos los negocios del SaaS. Se mudaron a lib/skin.ts, que
  // arma la estructura de Market con el color que cada dueño ya eligió en su
  // panel -- que es como Market se vende: una sola maqueta, cinco skins.
  const themeVars = useMemo(
    () => skinDeLaTienda(config.primaryColor),
    [config.primaryColor],
  );

  // El número de WhatsApp se resuelve aquí (no en cada página) porque el layout
  // envuelve toda la tienda. Viene del teléfono realmente conectado al bot por
  // QR: dejarlo escrito en el código lo vuelve inválido al cambiar de línea.
  useEffect(() => {
    fetch(`/api/public/whatsapp-info/${effectiveSlug}`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d?.phone) updateConfig({ whatsappPhone: d.phone }); })
      .catch(() => {});
  }, [effectiveSlug]);

  // El píxel, el color de marca y las redes sociales del footer se cargan
  // aquí por la misma razón: valen para toda la tienda, no solo para Shop --
  // si dependieran de que Shop.tsx los guardara primero, entrar directo a un
  // producto o al carrito (sin pasar por la home) los dejaría sin cargar.
  useEffect(() => {
    fetch(`/api/public/products/${effectiveSlug}`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        // ¿Esta tienda despacha algo físico? La barra superior prometía
        // "Envíos a todo el país" SIEMPRE, aunque el catálogo fuera 100%
        // digital -- en TecnoVariedades, 54 de 54 productos. Prometer un envío
        // que no existe trae reclamos y disputas de pago, y es justo lo que
        // hace que una tienda se lea como plantilla sin terminar.
        // Las categorías REALES del catálogo alimentan el menú vertical y el
        // selector del buscador. La clave es `nombre__tipo`: la MISMA que usa
        // el filtro de Shop.tsx. Si las dos no coincidieran, tocar una
        // categoría en el encabezado no filtraría nada.
        if (Array.isArray(d?.products)) {
          const porCategoria: Record<string, CategoriaDelMenu> = {};
          for (const p of d.products as any[]) {
            const tipo = (p.kind || p.type) === 'physical' ? 'physical' : 'digital';
            const nombre = p.category || 'General';
            const key = `${nombre}__${tipo}`;
            if (!porCategoria[key]) porCategoria[key] = { key, name: nombre, count: 0 };
            porCategoria[key].count++;
          }
          setCategorias(Object.values(porCategoria).sort((a, b) => b.count - a.count));
        }
        if (!d?.store) return;
        if (d.store.pixelId) initPixel(d.store.pixelId);
        updateConfig({
          socialLinks: d.store.socialLinks || {},
          ...(d.store.colors?.primary ? { primaryColor: d.store.colors.primary } : {}),
          // El NOMBRE y el LOGO del negocio también se resuelven acá, no solo
          // en Shop.
          //
          // Antes solo los guardaba Shop.tsx al cargar el catálogo, así que
          // quien entraba DIRECTO a una ficha de producto, al carrito o al
          // checkout veía en el encabezado el nombre de la tienda de demo en
          // vez del suyo. Y entrar directo a un producto es el caso normal:
          // es exactamente el enlace que manda el bot por WhatsApp.
          ...(d.store.name ? { storeName: d.store.name } : {}),
          ...(d.store.logo ? { logoUrl: d.store.logo } : {}),
        });
      })
      .catch(() => {});
  }, [effectiveSlug]);

  const waHref = config.whatsappPhone ? `https://wa.me/${config.whatsappPhone}` : null;

  return (
    <div className="min-h-screen flex flex-col bg-white text-slate-900" style={themeVars}>
      {/* ── El encabezado de tres pisos de Market ─────────────────────────
          Reemplaza al anterior, que era una sola barra de color con el logo y
          dos iconos. El cambio que más pesa no es el color: es que el BUSCADOR
          pasó a vivir en el encabezado, o sea en TODAS las páginas. Antes
          estaba dentro del catálogo, así que quien entraba por el enlace de un
          producto --el caso normal, es el enlace que manda el bot por
          WhatsApp-- no tenía forma de buscar otra cosa sin volver atrás. */}
      <Encabezado
        base={base}
        storeName={config.storeName || 'Tienda'}
        logoUrl={config.logoUrl}
        whatsappPhone={config.whatsappPhone}
        cartCount={cartCount}
        wishlistCount={wishlist.length}
        isOwner={isOwner}
        categorias={categorias}
      />

      <main className="flex-grow">
        {children}
      </main>

      {/* Bottom Nav estilo Smartjoys (mobile) */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 px-2 py-2 flex justify-around items-center">
        <Link to={base} className="flex flex-col items-center gap-0.5 text-gray-700 px-2 py-1">
          <Store className="h-5 w-5" />
          <span className="text-[10px] font-semibold">Tienda</span>
        </Link>
        <Link to={`${base}/wishlist`} className="flex flex-col items-center gap-0.5 text-gray-700 px-2 py-1 relative">
          <Heart className="h-5 w-5" />
          <span className="text-[10px] font-semibold">Deseos</span>
          {wishlist.length > 0 && (
            <span className="absolute -top-0.5 right-1 bg-[var(--store-primary)] text-[var(--store-on-primary)] text-[9px] font-bold rounded-full w-3.5 h-3.5 flex items-center justify-center">
              {wishlist.length}
            </span>
          )}
        </Link>
        <a href={waHref || "#"} target="_blank" rel="noopener noreferrer" className="flex flex-col items-center gap-0.5 -mt-4">
          <div className="w-12 h-12 rounded-full bg-green-500 flex items-center justify-center shadow-lg">
            <MessageCircle className="h-6 w-6 text-white" />
          </div>
        </a>
        <Link to={`${base}/carrito`} className="flex flex-col items-center gap-0.5 text-gray-700 px-2 py-1 relative">
          <ShoppingCart className="h-5 w-5" />
          <span className="text-[10px] font-semibold">Carrito</span>
          {cartCount > 0 && (
            <span className="absolute -top-0.5 right-1 bg-[var(--store-primary)] text-[var(--store-on-primary)] text-[9px] font-bold rounded-full w-3.5 h-3.5 flex items-center justify-center">
              {cartCount}
            </span>
          )}
        </Link>
        {/* "Cuenta" era un <button> sin onClick: en la tienda pública no hay
            login de cliente, así que solo ocupaba lugar y daba la sensación de
            que el menú inferior "no funciona" al tocarlo. Para el público se
            muestra el enlace que sí sirve (soporte por WhatsApp); el dueño
            logueado conserva su acceso al panel. */}
        {isOwner ? (
          <Link to="/admin" className="flex flex-col items-center gap-0.5 text-gray-700 px-2 py-1">
            <LayoutDashboard className="h-5 w-5" />
            <span className="text-[10px] font-semibold">Admin</span>
          </Link>
        ) : (
          <a
            href={waHref || '#'}
            target="_blank"
            rel="noopener noreferrer"
            className="flex flex-col items-center gap-0.5 text-gray-700 px-2 py-1"
          >
            <User className="h-5 w-5" />
            <span className="text-[10px] font-semibold">Soporte</span>
          </a>
        )}
      </div>

      <a
        href={waHref || "#"}
        target="_blank"
        rel="noopener noreferrer"
        className="hidden md:flex fixed bottom-5 right-5 z-40 w-14 h-14 rounded-full bg-green-500 text-white shadow-lg items-center justify-center hover:bg-green-600 transition-colors hover:scale-110 active:scale-95"
        aria-label="WhatsApp"
      >
        <MessageCircle className="w-7 h-7" />
      </a>

      <footer className="bg-[var(--store-ink)] pb-20 md:pb-0">
        <div className="max-w-6xl mx-auto px-4 py-12">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-10">
            <div>
              <div className="flex items-center gap-2.5 mb-3">
                <div className="w-8 h-8 rounded-full bg-[var(--store-primary)] flex items-center justify-center">
                  <Store className="w-4 h-4 text-white" />
                </div>
                <span className="text-base font-bold text-white">{config.storeName || 'Tienda'}</span>
              </div>
              <p className="text-sm text-gray-400 leading-relaxed mb-5">{`Comprá en ${config.storeName || "nuestra tienda"} y escribinos por WhatsApp si necesitás ayuda.`}</p>

              {/* Redes sociales -- solo se listan las que la tienda configuró
                  de verdad; sin URL no hay ícono, para no mostrar enlaces rotos */}
              {(config.socialLinks?.facebook || config.socialLinks?.instagram || config.socialLinks?.tiktok || config.socialLinks?.twitter || config.socialLinks?.linkedin) && (
                <div className="flex items-center gap-2">
                  {config.socialLinks?.facebook && (
                    <a href={config.socialLinks.facebook} target="_blank" rel="noopener noreferrer" aria-label="Facebook"
                      className="w-9 h-9 rounded-full bg-white/5 text-[var(--store-yellow)] hover:bg-[var(--store-yellow)] hover:text-[var(--store-ink)] flex items-center justify-center transition-colors">
                      <FacebookIcon className="w-4 h-4" />
                    </a>
                  )}
                  {config.socialLinks?.instagram && (
                    <a href={config.socialLinks.instagram} target="_blank" rel="noopener noreferrer" aria-label="Instagram"
                      className="w-9 h-9 rounded-full bg-white/5 text-[var(--store-yellow)] hover:bg-[var(--store-yellow)] hover:text-[var(--store-ink)] flex items-center justify-center transition-colors">
                      <InstagramIcon className="w-4 h-4" />
                    </a>
                  )}
                  {config.socialLinks?.tiktok && (
                    <a href={config.socialLinks.tiktok} target="_blank" rel="noopener noreferrer" aria-label="TikTok"
                      className="w-9 h-9 rounded-full bg-white/5 text-[var(--store-yellow)] hover:bg-[var(--store-yellow)] hover:text-[var(--store-ink)] flex items-center justify-center transition-colors">
                      <TikTokIcon className="w-4 h-4" />
                    </a>
                  )}
                  {config.socialLinks?.twitter && (
                    <a href={config.socialLinks.twitter} target="_blank" rel="noopener noreferrer" aria-label="X (Twitter)"
                      className="w-9 h-9 rounded-full bg-white/5 text-[var(--store-yellow)] hover:bg-[var(--store-yellow)] hover:text-[var(--store-ink)] flex items-center justify-center transition-colors">
                      <XIcon className="w-4 h-4" />
                    </a>
                  )}
                  {config.socialLinks?.linkedin && (
                    <a href={config.socialLinks.linkedin} target="_blank" rel="noopener noreferrer" aria-label="LinkedIn"
                      className="w-9 h-9 rounded-full bg-white/5 text-[var(--store-yellow)] hover:bg-[var(--store-yellow)] hover:text-[var(--store-ink)] flex items-center justify-center transition-colors">
                      <LinkedInIcon className="w-4 h-4" />
                    </a>
                  )}
                </div>
              )}
            </div>

            <div>
              <h4 className="text-sm font-bold text-[var(--store-yellow)] mb-3">Enlaces</h4>
              <div className="space-y-2">
                <Link to={`${base}#catalogo`} className="block text-sm text-gray-400 hover:text-white transition-colors">Productos</Link>
                <a href={waHref || "#"} target="_blank" rel="noopener noreferrer"
                  className="block text-sm text-gray-400 hover:text-white transition-colors">WhatsApp</a>
                <Link to={`${base}/carrito`} className="block text-sm text-gray-400 hover:text-white transition-colors">Carrito</Link>
              </div>
            </div>

            <div>
              <h4 className="text-sm font-bold text-[var(--store-yellow)] mb-3">Contacto</h4>
              <div className="space-y-2.5">
                {config.whatsappPhone && (
                  <a href={waHref || '#'} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors">
                    <MessageCircle className="w-4 h-4 text-emerald-500 shrink-0" />
                    <span>+{config.whatsappPhone}</span>
                  </a>
                )}
              </div>
            </div>

            <div>
              <h4 className="text-sm font-bold text-[var(--store-yellow)] mb-3">Pagos seguros</h4>
              <div className="flex flex-wrap gap-2">
                <MercadoPagoBadge />
                <NequiBadge />
                <PSEBadge />
              </div>
            </div>
          </div>
        </div>
        {/* Barra de cierre púrpura a todo el ancho: es como termina cada
            página del kit, y lo que separa el footer del borde del navegador. */}
        <div className="bg-[var(--store-primary)] py-3 text-center text-xs text-white/90">
          &copy; {new Date().getFullYear()} {config.storeName || 'Tienda'} &mdash; Todos los derechos reservados
        </div>
      </footer>
    </div>
  );
};

export default PublicLayout;
