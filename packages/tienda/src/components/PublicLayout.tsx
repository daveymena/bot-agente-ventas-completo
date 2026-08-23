import { Link, useParams } from 'react-router-dom';
import { ShoppingCart, MessageCircle, Menu, X, Store, Heart, User, LayoutDashboard, Pencil, Phone, Truck, ShieldCheck } from 'lucide-react';
import { useState, useEffect, useMemo } from 'react';
import { useStore } from '../store/useStore';
import { initPixel } from '../lib/pixel';
import { FacebookIcon, InstagramIcon, TikTokIcon, XIcon, LinkedInIcon } from './SocialIcons';
import { MercadoPagoBadge, NequiBadge, PSEBadge } from './PaymentIcons';
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
  const [mobileMenu, setMobileMenu] = useState(false);

  // El usuario logueado solo ve los botones de administración cuando la
  // tienda que está viendo es LA SUYA -- isAdmin por sí solo solo dice "hay
  // sesión de algún tenant", así que sin esta comparación, un dueño logueado
  // vería el botón de "Panel Admin" en la tienda pública de OTRO negocio.
  const isOwner = isAdmin && config.slug === effectiveSlug;

  // ── Paleta de la tienda ───────────────────────────────────────────────────
  //
  // Valores EXACTOS del kit de referencia (premiumm/URBANisty), leídos de su
  // `global.json` y no estimados de las capturas.
  //
  // Antes esto derivaba todo del color que cada dueño elegía en su panel. Se
  // pasó a una paleta fija por decisión explícita del dueño del producto el
  // 2026-08-22: quería la tienda "prácticamente igual" a la referencia, y el
  // kit apoya su identidad en la COMBINACIÓN (púrpura + navy + amarillo +
  // naranja), no en un color suelto. Derivar esos cuatro de un primario
  // cualquiera daba combinaciones que no se parecían al diseño.
  //
  // Se conservan los MISMOS nombres de variable (`--store-primary`, etc.) a
  // propósito: Shop, ProductDetail, Cart y Checkout ya los leen en decenas de
  // clases `bg-[var(--store-primary)]`. Cambiando el valor acá, toda la
  // tienda adopta la paleta sin tocar una sola de esas páginas.
  //
  // ⚠️ Si algún día se quiere volver al color por cliente, se revierte este
  // bloque y el resto sigue funcionando igual: nada más depende de esto.
  const themeVars = useMemo(() => {
    return {
      '--store-primary': '#4D31B9',        // acento del kit
      '--store-primary-hover': '#3d2794',
      '--store-on-primary': '#FFFFFF',
      '--store-primary-soft': '#EBEFFC',   // lavanda de las tarjetas
      '--store-primary-deep': '#1A1E5D',   // navy: barra superior, bloques oscuros
      // Los tres acentos que el kit usa para romper el púrpura.
      '--store-yellow': '#FFC931',
      '--store-orange': '#FE4327',
      '--store-blue': '#3357D9',
      '--store-green': '#69D23B',
      '--store-ink': '#090909',
    } as React.CSSProperties;
  }, []);

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
    <div className="min-h-screen flex flex-col bg-white text-slate-900" style={themeVars}>
      <nav className="sticky top-0 z-50 bg-[var(--store-primary)] text-white">
        {/* ── Barra superior: datos de contacto reales ──────────────────
            Es la primera de las tres capas del encabezado de una tienda
            seria (el diseño de referencia la trae, y la tienda actual no
            tenía ninguna). Solo se muestra lo que EXISTE de verdad: si el
            negocio no tiene WhatsApp cargado, la franja no aparece. Poner
            una dirección o un horario inventados para "verse profesional"
            es justo lo que hace que una tienda se vea falsa. */}
        {config.whatsappPhone && (
          <div className="hidden sm:block bg-[var(--store-primary-deep)] text-white/70">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-9 flex items-center gap-6 text-[11px]">
              <a
                href={`https://wa.me/${String(config.whatsappPhone).replace(/[^0-9]/g, '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 hover:text-white transition-colors"
              >
                <Phone className="w-3 h-3" /> {config.whatsappPhone}
              </a>
              <span className="hidden md:flex items-center gap-1.5">
                <Truck className="w-3 h-3" /> Envíos a todo el país
              </span>
              <span className="ml-auto hidden md:flex items-center gap-1.5">
                <ShieldCheck className="w-3 h-3" /> Compra protegida
              </span>
            </div>
          </div>
        )}
        {/* Barra de administración -- SOLO visible para el dueño logueado de
            esta tienda, nunca para el público. El cliente que compra jamás
            debería ver botones de "editar" o "panel admin" en su checkout. */}
        {isOwner && (
          <div className="bg-[var(--store-primary-deep)] text-white">
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
              {/* El LOGO del negocio si lo cargo; el icono generico solo
                  como respaldo. Una tienda con el logo de su marca en el
                  encabezado se lee como propia; una con un icono de sistema,
                  como una plantilla sin terminar. */}
              {config.logoUrl ? (
                <img
                  src={config.logoUrl}
                  alt={config.storeName || 'Tienda'}
                  className="h-9 w-auto max-w-[140px] object-contain group-hover:scale-105 transition-transform"
                />
              ) : (
                <div className="w-9 h-9 rounded-full bg-white/15 flex items-center justify-center group-hover:scale-105 transition-transform">
                  <Store className="w-5 h-5 text-white" />
                </div>
              )}
              <span className="text-lg font-black tracking-tight uppercase">{config.storeName || 'Tienda'}</span>
            </Link>

            {/* Menu de navegacion: la tienda no tenia ninguno -- solo el
                logo y dos iconos. Sin menu, el visitante que entra por un
                producto no tiene forma de ver el resto del catalogo, que es
                justo lo que hace que una tienda parezca "muy simple". */}
            <div className="hidden md:flex items-center gap-6 ml-8 mr-auto text-sm font-medium">
              <Link to={base} className="text-white/85 hover:text-white transition-colors">Inicio</Link>
              <Link to={`${base}/shop`} className="text-white/85 hover:text-white transition-colors">Tienda</Link>
              {config.whatsappPhone && (
                <a
                  href={`https://wa.me/${String(config.whatsappPhone).replace(/[^0-9]/g, '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-white/85 hover:text-white transition-colors"
                >
                  Contacto
                </a>
              )}
            </div>

            <div className="hidden md:flex items-center gap-4">
              {/* Píldoras, no iconos sueltos: es lo que le da carácter al
                  encabezado del kit. Deseados en círculo translúcido y
                  carrito en naranja, que es el acento que el diseño usa para
                  lo accionable. */}
              <Link
                to={`${base}/wishlist`}
                aria-label="Lista de deseos"
                className="relative flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-white transition-colors hover:bg-white/25"
              >
                <Heart className="w-4 h-4" />
                {wishlist.length > 0 && (
                  <span className="absolute -top-1 -right-1 bg-[var(--store-yellow)] text-[var(--store-ink)] text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                    {wishlist.length}
                  </span>
                )}
              </Link>
              <Link
                to={`${base}/carrito`}
                aria-label="Carrito"
                className="flex items-center gap-2 rounded-full bg-[var(--store-orange)] px-4 h-9 text-white text-xs font-semibold transition-opacity hover:opacity-90"
              >
                <ShoppingCart className="w-4 h-4" />
                <span>{cartCount}</span>
              </Link>
            </div>

            <div className="flex md:hidden items-center gap-2">
              <Link
                to={`${base}/carrito`}
                aria-label="Carrito"
                className="flex items-center gap-1.5 rounded-full bg-[var(--store-orange)] px-3 h-8 text-white text-xs font-semibold"
              >
                <ShoppingCart className="w-4 h-4" />
                <span>{cartCount}</span>
              </Link>
              <button onClick={() => setMobileMenu(!mobileMenu)} className="p-2 text-gray-300 hover:text-white transition-colors">
                {mobileMenu ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
              </button>
            </div>
          </div>

          {mobileMenu && (
            <div className="md:hidden border-t border-gray-800 py-4 space-y-1">
              <Link to={`${base}#catalogo`} onClick={() => setMobileMenu(false)}
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

        {/* Franja de categorías -- estilo Smartjoys: el header queda negro
            (marca/carrito/deseos), pero la fila de navegación real vive en
            un bloque sólido con el color de marca, no en gris apagado sobre
            negro. Solo en escritorio: en mobile "Productos" y "WhatsApp" ya
            están cubiertos por la barra inferior fija y el FAB de WhatsApp. */}
        <div className="hidden md:block bg-[var(--store-primary)]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center gap-6 h-10">
              <Link to={`${base}#catalogo`} className="text-sm font-semibold text-[var(--store-on-primary)] hover:opacity-80 transition-opacity">
                Productos
              </Link>
              <a href={waHref || "#"} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-sm font-semibold text-[var(--store-on-primary)] hover:opacity-80 transition-opacity">
                <MessageCircle className="w-4 h-4" /> WhatsApp
              </a>
            </div>
          </div>
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

      <footer className="bg-[var(--store-ink)] pb-20 md:pb-0">
        <div className="max-w-7xl mx-auto px-4 py-12">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-10">
            <div>
              <div className="flex items-center gap-2.5 mb-3">
                <div className="w-8 h-8 rounded-full bg-[var(--store-primary)] flex items-center justify-center">
                  <Store className="w-4 h-4 text-white" />
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
