import { Link, useParams } from 'react-router-dom';
import { ShoppingCart, MessageCircle, Menu, X, Store, Heart, User, LayoutDashboard, Pencil } from 'lucide-react';
import { useState, useEffect, useMemo } from 'react';
import { useStore } from '../store/useStore';
import { initPixel } from '../lib/pixel';
import { FacebookIcon, InstagramIcon, TikTokIcon, XIcon, LinkedInIcon } from './SocialIcons';
import { MercadoPagoBadge, NequiBadge, PSEBadge } from './PaymentIcons';
import { darken, readableTextColor } from '../lib/color';

const PublicLayout = ({ children }: { children: React.ReactNode }) => {
  const { cart, wishlist, config, updateConfig, isAdmin } = useStore();
  const { slug } = useParams();
  const effectiveSlug = slug || 'sofia-premium';
  const cartCount = cart.reduce((acc, item) => acc + item.quantity, 0);
  const base = slug ? `/tienda/${slug}` : '/tienda';
  const [mobileMenu, setMobileMenu] = useState(false);

  // El usuario logueado solo ve los botones de administración cuando la
  // tienda que está viendo es LA SUYA -- isAdmin por sí solo solo dice "hay
  // sesión de algún tenant", así que sin esta comparación, un dueño logueado
  // vería el botón de "Panel Admin" en la tienda pública de OTRO negocio.
  const isOwner = isAdmin && config.slug === effectiveSlug;

  // El color de marca de la tienda (config.primaryColor, editable desde el
  // panel admin) se expone como variables CSS para que todo el layout -- y
  // las páginas hijas (Shop, ProductDetail, Cart, Checkout) -- lo lean con
  // clases Tailwind tipo bg-[var(--store-primary)] en vez de tener el rojo
  // de la demo hardcodeado.
  const themeVars = useMemo(() => {
    const primary = config.primaryColor || '#dc2626';
    return {
      '--store-primary': primary,
      '--store-primary-hover': darken(primary, 0.15),
      '--store-on-primary': readableTextColor(primary),
    } as React.CSSProperties;
  }, [config.primaryColor]);

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
        if (!d?.store) return;
        if (d.store.pixelId) initPixel(d.store.pixelId);
        updateConfig({
          socialLinks: d.store.socialLinks || {},
          ...(d.store.colors?.primary ? { primaryColor: d.store.colors.primary } : {}),
        });
      })
      .catch(() => {});
  }, [effectiveSlug]);

  const waHref = config.whatsappPhone ? `https://wa.me/${config.whatsappPhone}` : null;

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 text-slate-900" style={themeVars}>
      <nav className="sticky top-0 z-50 bg-zinc-900 text-white">
        {/* Barra de administración -- SOLO visible para el dueño logueado de
            esta tienda, nunca para el público. El cliente que compra jamás
            debería ver botones de "editar" o "panel admin" en su checkout. */}
        {isOwner && (
          <div className="bg-[var(--store-primary)] text-[var(--store-on-primary)]">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-9 flex items-center justify-between text-xs font-semibold">
              <span className="hidden sm:inline">Estás viendo tu tienda como dueño</span>
              <div className="flex items-center gap-4 ml-auto">
                <Link to="/editor" className="flex items-center gap-1.5 hover:opacity-80 transition-opacity">
                  <Pencil className="w-3.5 h-3.5" /> Editar página
                </Link>
                <Link to="/admin" className="flex items-center gap-1.5 hover:opacity-80 transition-opacity">
                  <LayoutDashboard className="w-3.5 h-3.5" /> Panel Admin
                </Link>
              </div>
            </div>
          </div>
        )}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <Link to={base} className="flex items-center gap-2 group">
              <div className="w-9 h-9 rounded-lg bg-[var(--store-primary)] flex items-center justify-center group-hover:scale-105 transition-transform">
                <Store className="w-5 h-5 text-[var(--store-on-primary)]" />
              </div>
              <span className="text-lg font-black tracking-tight uppercase">{config.storeName || 'Tienda'}</span>
            </Link>

            <div className="hidden md:flex items-center gap-6">
              <Link to={base} className="text-sm font-semibold text-gray-300 hover:text-white transition-colors">
                Productos
              </Link>
              <a href={waHref || "#"} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-sm font-semibold text-gray-300 hover:text-[var(--store-primary)] transition-colors group">
                <MessageCircle className="w-4 h-4" /> WhatsApp
              </a>
              <Link to={`${base}/wishlist`} className="relative p-2 text-gray-300 hover:text-white transition-colors">
                <Heart className="w-5 h-5" />
                {wishlist.length > 0 && (
                  <span className="absolute -top-1 -right-1 bg-[var(--store-primary)] text-[var(--store-on-primary)] text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                    {wishlist.length}
                  </span>
                )}
              </Link>
              <Link to={`${base}/carrito`} className="relative p-2 text-gray-300 hover:text-white transition-colors">
                <ShoppingCart className="w-5 h-5" />
                {cartCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-[var(--store-primary)] text-[var(--store-on-primary)] text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                    {cartCount}
                  </span>
                )}
              </Link>
            </div>

            <div className="flex md:hidden items-center gap-2">
              <Link to={`${base}/carrito`} className="relative p-2 text-gray-300 hover:text-white">
                <ShoppingCart className="w-5 h-5" />
                {cartCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-[var(--store-primary)] text-[var(--store-on-primary)] text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                    {cartCount}
                  </span>
                )}
              </Link>
              <button onClick={() => setMobileMenu(!mobileMenu)} className="p-2 text-gray-300 hover:text-white transition-colors">
                {mobileMenu ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
              </button>
            </div>
          </div>

          {mobileMenu && (
            <div className="md:hidden border-t border-gray-800 py-4 space-y-1">
              <Link to={base} onClick={() => setMobileMenu(false)}
                className="block px-4 py-3 text-sm font-semibold text-gray-200 rounded-lg hover:bg-gray-900 transition-colors">
                Productos
              </Link>
              <a href={waHref || "#"} target="_blank" rel="noopener noreferrer"
                onClick={() => setMobileMenu(false)}
                className="flex items-center gap-2 px-4 py-3 text-sm font-semibold text-[var(--store-primary)] rounded-lg hover:bg-gray-900 transition-colors">
                <MessageCircle className="w-4 h-4" /> Línea WhatsApp
              </a>
              <Link to={`${base}/wishlist`} onClick={() => setMobileMenu(false)}
                className="flex items-center gap-2 px-4 py-3 text-sm font-semibold text-gray-200 rounded-lg hover:bg-gray-900 transition-colors">
                <Heart className="w-4 h-4" /> Lista de deseos
              </Link>
              {isOwner && (
                <>
                  <Link to="/editor" onClick={() => setMobileMenu(false)}
                    className="flex items-center gap-2 px-4 py-3 text-sm font-semibold text-gray-200 rounded-lg hover:bg-gray-900 transition-colors">
                    <Pencil className="w-4 h-4" /> Editar página
                  </Link>
                  <Link to="/admin" onClick={() => setMobileMenu(false)}
                    className="flex items-center gap-2 px-4 py-3 text-sm font-semibold text-gray-200 rounded-lg hover:bg-gray-900 transition-colors">
                    <LayoutDashboard className="w-4 h-4" /> Panel Admin
                  </Link>
                </>
              )}
            </div>
          )}
        </div>
      </nav>

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

      <footer className="bg-zinc-900 pb-20 md:pb-0">
        <div className="max-w-7xl mx-auto px-4 py-12">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-10">
            <div>
              <div className="flex items-center gap-2.5 mb-3">
                <div className="w-8 h-8 rounded-lg bg-[var(--store-primary)] flex items-center justify-center">
                  <Store className="w-4 h-4 text-[var(--store-on-primary)]" />
                </div>
                <span className="text-base font-bold text-white">{config.storeName || 'Tienda'}</span>
              </div>
              <p className="text-sm text-gray-400 leading-relaxed mb-5">Tu tienda de confianza con los mejores productos digitales y físicos.</p>

              {/* Redes sociales -- solo se listan las que la tienda configuró
                  de verdad; sin URL no hay ícono, para no mostrar enlaces rotos */}
              {(config.socialLinks?.facebook || config.socialLinks?.instagram || config.socialLinks?.tiktok || config.socialLinks?.twitter || config.socialLinks?.linkedin) && (
                <div className="flex items-center gap-2">
                  {config.socialLinks?.facebook && (
                    <a href={config.socialLinks.facebook} target="_blank" rel="noopener noreferrer" aria-label="Facebook"
                      className="w-9 h-9 rounded-full bg-white/10 hover:bg-[var(--store-primary)] text-gray-300 hover:text-[var(--store-on-primary)] flex items-center justify-center transition-colors">
                      <FacebookIcon className="w-4 h-4" />
                    </a>
                  )}
                  {config.socialLinks?.instagram && (
                    <a href={config.socialLinks.instagram} target="_blank" rel="noopener noreferrer" aria-label="Instagram"
                      className="w-9 h-9 rounded-full bg-white/10 hover:bg-[var(--store-primary)] text-gray-300 hover:text-[var(--store-on-primary)] flex items-center justify-center transition-colors">
                      <InstagramIcon className="w-4 h-4" />
                    </a>
                  )}
                  {config.socialLinks?.tiktok && (
                    <a href={config.socialLinks.tiktok} target="_blank" rel="noopener noreferrer" aria-label="TikTok"
                      className="w-9 h-9 rounded-full bg-white/10 hover:bg-[var(--store-primary)] text-gray-300 hover:text-[var(--store-on-primary)] flex items-center justify-center transition-colors">
                      <TikTokIcon className="w-4 h-4" />
                    </a>
                  )}
                  {config.socialLinks?.twitter && (
                    <a href={config.socialLinks.twitter} target="_blank" rel="noopener noreferrer" aria-label="X (Twitter)"
                      className="w-9 h-9 rounded-full bg-white/10 hover:bg-[var(--store-primary)] text-gray-300 hover:text-[var(--store-on-primary)] flex items-center justify-center transition-colors">
                      <XIcon className="w-4 h-4" />
                    </a>
                  )}
                  {config.socialLinks?.linkedin && (
                    <a href={config.socialLinks.linkedin} target="_blank" rel="noopener noreferrer" aria-label="LinkedIn"
                      className="w-9 h-9 rounded-full bg-white/10 hover:bg-[var(--store-primary)] text-gray-300 hover:text-[var(--store-on-primary)] flex items-center justify-center transition-colors">
                      <LinkedInIcon className="w-4 h-4" />
                    </a>
                  )}
                </div>
              )}
            </div>

            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">Enlaces</h4>
              <div className="space-y-2">
                <Link to={base} className="block text-sm text-gray-400 hover:text-white transition-colors">Productos</Link>
                <a href={waHref || "#"} target="_blank" rel="noopener noreferrer"
                  className="block text-sm text-gray-400 hover:text-white transition-colors">WhatsApp</a>
                <Link to={`${base}/carrito`} className="block text-sm text-gray-400 hover:text-white transition-colors">Carrito</Link>
              </div>
            </div>

            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">Contacto</h4>
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
              <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">Pagos seguros</h4>
              <div className="flex flex-wrap gap-2">
                <MercadoPagoBadge />
                <NequiBadge />
                <PSEBadge />
              </div>
            </div>
          </div>
          <div className="mt-10 pt-8 border-t border-white/10 text-center text-xs text-gray-600">
            &copy; {new Date().getFullYear()} {config.storeName || 'Tienda'} &mdash; Todos los derechos reservados
          </div>
        </div>
      </footer>
    </div>
  );
};

export default PublicLayout;
