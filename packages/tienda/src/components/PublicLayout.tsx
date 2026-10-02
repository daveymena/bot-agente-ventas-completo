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
  const [hayFisicos, setHayFisicos] = useState(false);

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
            const k = p.kind || p.type;
            const tipo = k === 'physical' ? 'physical' : (k === 'servicio' || k === 'service') ? 'servicio' : 'digital';
            const nombre = p.category || 'General';
            const key = `${nombre}__${tipo}`;
            if (!porCategoria[key]) porCategoria[key] = { key, name: nombre, count: 0, tipo };
            porCategoria[key].count++;
          }
          setCategorias(Object.values(porCategoria).sort((a, b) => b.count - a.count));
          setHayFisicos((d.products as any[]).some(p => (p.kind || p.type) === 'physical'));
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
    <div className="min-h-screen flex flex-col bg-white text-slate-900 antialiased" style={themeVars}>
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
        hayFisicos={hayFisicos}
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

      <footer className="mt-4 bg-[#0f0d27] pb-20 text-white md:pb-0">
        <div className="mx-auto max-w-[1280px] px-4 py-14 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 gap-10 md:grid-cols-[1.4fr_1fr_1fr_1.2fr]">
            <div className="col-span-2 md:col-span-1">
              <div className="mb-3 flex items-center gap-2.5">
                {config.logoUrl ? (
                  <img src={config.logoUrl} alt={config.storeName} className="h-9 w-auto object-contain" />
                ) : (
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--tech-violeta)]">
                    <Store className="h-4 w-4 text-white" />
                  </div>
                )}
                <span className="text-base font-black text-white">{config.storeName || 'Tienda'}</span>
              </div>
              <p className="mb-5 text-[13px] leading-relaxed text-white/60">{`Tu tienda de confianza. Compra en ${config.storeName || "nuestra tienda"} y escríbenos por WhatsApp si necesitas ayuda.`}</p>

              {/* Redes sociales -- solo se listan las que la tienda configuró
                  de verdad; sin URL no hay ícono, para no mostrar enlaces rotos */}
              {(config.socialLinks?.facebook || config.socialLinks?.instagram || config.socialLinks?.tiktok || config.socialLinks?.twitter || config.socialLinks?.linkedin) && (
                <div className="flex items-center gap-2">
                  {config.socialLinks?.facebook && (
                    <a href={config.socialLinks.facebook} target="_blank" rel="noopener noreferrer" aria-label="Facebook"
                      className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white/80 transition-colors hover:bg-[var(--tech-violeta)] hover:text-white">
                      <FacebookIcon className="h-4 w-4" />
                    </a>
                  )}
                  {config.socialLinks?.instagram && (
                    <a href={config.socialLinks.instagram} target="_blank" rel="noopener noreferrer" aria-label="Instagram"
                      className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white/80 transition-colors hover:bg-[var(--tech-violeta)] hover:text-white">
                      <InstagramIcon className="h-4 w-4" />
                    </a>
                  )}
                  {config.socialLinks?.tiktok && (
                    <a href={config.socialLinks.tiktok} target="_blank" rel="noopener noreferrer" aria-label="TikTok"
                      className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white/80 transition-colors hover:bg-[var(--tech-violeta)] hover:text-white">
                      <TikTokIcon className="h-4 w-4" />
                    </a>
                  )}
                  {config.socialLinks?.twitter && (
                    <a href={config.socialLinks.twitter} target="_blank" rel="noopener noreferrer" aria-label="X (Twitter)"
                      className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white/80 transition-colors hover:bg-[var(--tech-violeta)] hover:text-white">
                      <XIcon className="h-4 w-4" />
                    </a>
                  )}
                  {config.socialLinks?.linkedin && (
                    <a href={config.socialLinks.linkedin} target="_blank" rel="noopener noreferrer" aria-label="LinkedIn"
                      className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white/80 transition-colors hover:bg-[var(--tech-violeta)] hover:text-white">
                      <LinkedInIcon className="h-4 w-4" />
                    </a>
                  )}
                </div>
              )}
            </div>

            <div>
              <h4 className="mb-4 text-[14px] font-bold text-white">Enlaces rápidos</h4>
              <div className="space-y-2.5">
                <Link to={base} className="block text-[13px] text-white/60 transition-colors hover:text-white">Inicio</Link>
                <Link to={`${base}#catalogo`} className="block text-[13px] text-white/60 transition-colors hover:text-white">Tienda</Link>
                <Link to={`${base}/wishlist`} className="block text-[13px] text-white/60 transition-colors hover:text-white">Deseados</Link>
                <Link to={`${base}/carrito`} className="block text-[13px] text-white/60 transition-colors hover:text-white">Carrito</Link>
              </div>
            </div>

            <div>
              <h4 className="mb-4 text-[14px] font-bold text-white">Atención al cliente</h4>
              <div className="space-y-2.5">
                <a href={waHref || "#"} target="_blank" rel="noopener noreferrer"
                  className="block text-[13px] text-white/60 transition-colors hover:text-white">Soporte por WhatsApp</a>
                <Link to={`${base}/carrito`} className="block text-[13px] text-white/60 transition-colors hover:text-white">Mi pedido</Link>
              </div>
              <h4 className="mb-2 mt-6 text-sm font-black text-white">Pagos seguros</h4>
              <div className="flex flex-wrap gap-2">
                <MercadoPagoBadge />
                <NequiBadge />
                <PSEBadge />
              </div>
            </div>

            <div>
              <h4 className="mb-4 text-[14px] font-bold text-white">Contacto</h4>
              <div className="space-y-2.5">
                {config.whatsappPhone ? (
                  <a href={waHref || '#'} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2 text-[13px] text-white/60 transition-colors hover:text-white">
                    <MessageCircle className="h-4 w-4 shrink-0 text-emerald-400" />
                    <span>+{config.whatsappPhone}</span>
                  </a>
                ) : (
                  <span className="block text-[13px] text-white/60">Escríbenos desde cualquier producto</span>
                )}
              </div>
            </div>
          </div>
        </div>
        <div className="border-t border-white/10">
          <div className="mx-auto flex max-w-[1280px] flex-col items-center justify-between gap-2 px-4 py-5 text-xs text-white/50 sm:flex-row sm:px-6 lg:px-8">
            <span>&copy; {new Date().getFullYear()} {config.storeName || 'Tienda'}. Todos los derechos reservados.</span>
            <span>Compra segura con atención por WhatsApp</span>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default PublicLayout;
