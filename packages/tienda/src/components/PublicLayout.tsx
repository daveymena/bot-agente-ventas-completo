import { Link, useParams } from 'react-router-dom';
import { ShoppingCart, MessageCircle, Menu, X, Store, Search } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useStore } from '../store/useStore';
import { initPixel } from '../lib/pixel';

const PublicLayout = ({ children }: { children: React.ReactNode }) => {
  const { cart, config, updateConfig } = useStore();
  const { slug } = useParams();
  const cartCount = cart.reduce((acc, item) => acc + item.quantity, 0);
  const base = slug ? `/tienda/${slug}` : '/tienda';
  const [mobileMenu, setMobileMenu] = useState(false);

  // El número de WhatsApp se resuelve aquí (no en cada página) porque el layout
  // envuelve toda la tienda. Viene del teléfono realmente conectado al bot por
  // QR: dejarlo escrito en el código lo vuelve inválido al cambiar de línea.
  useEffect(() => {
    fetch(`/api/public/whatsapp-info/${slug || 'sofia-premium'}`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d?.phone) updateConfig({ whatsappPhone: d.phone }); })
      .catch(() => {});
  }, [slug]);

  // El píxel se carga aquí por la misma razón: vale para toda la tienda. El ID
  // llega del API porque en el SaaS cada tienda mide en su propia cuenta.
  useEffect(() => {
    fetch(`/api/public/products/${slug || 'sofia-premium'}`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d?.store?.pixelId) initPixel(d.store.pixelId); })
      .catch(() => {});
  }, [slug]);

  const waHref = config.whatsappPhone ? `https://wa.me/${config.whatsappPhone}` : null;

  return (
    <div className="min-h-screen flex flex-col bg-[#09090b] text-gray-300 relative overflow-hidden">
      {/* Background glow effects */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-indigo-600/20 rounded-full blur-[120px] pointer-events-none mix-blend-screen" />
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-600/10 rounded-full blur-[100px] pointer-events-none mix-blend-screen" />

      <nav className="glass-nav sticky top-0 z-50 transition-all duration-300">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-20 items-center">
            <Link to={base} className="flex items-center gap-3 group">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/20 group-hover:scale-105 transition-transform">
                <Store className="w-5 h-5 text-white" />
              </div>
              <span className="text-xl font-heading font-bold text-white tracking-tight">{config.storeName || 'Tienda'}</span>
            </Link>

            <div className="hidden md:flex items-center gap-8">
              <Link to={base} className="text-sm font-medium text-gray-400 hover:text-white transition-colors relative after:absolute after:bottom-[-4px] after:left-0 after:h-[2px] after:w-0 hover:after:w-full after:bg-indigo-500 after:transition-all">
                Productos
              </Link>
              <a href={waHref || "#"} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-sm font-medium text-gray-400 hover:text-emerald-400 transition-colors group">
                <MessageCircle className="w-4 h-4 group-hover:animate-bounce-slow" /> WhatsApp
              </a>
              <Link to={`${base}/carrito`} className="relative p-2 text-gray-400 hover:text-white transition-colors group">
                <ShoppingCart className="w-5 h-5 group-hover:scale-110 transition-transform" />
                {cartCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-indigo-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full ring-2 ring-[#09090b] shadow-glow">
                    {cartCount}
                  </span>
                )}
              </Link>
            </div>

            <div className="flex md:hidden items-center gap-3">
              <Link to={`${base}/carrito`} className="relative p-2 text-gray-400 hover:text-white">
                <ShoppingCart className="w-5 h-5" />
                {cartCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-indigo-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full ring-2 ring-[#09090b]">
                    {cartCount}
                  </span>
                )}
              </Link>
              <button onClick={() => setMobileMenu(!mobileMenu)} className="p-2 text-gray-400 hover:text-white transition-colors bg-white/5 rounded-lg border border-white/10">
                {mobileMenu ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>
          </div>

          {mobileMenu && (
            <div className="md:hidden border-t border-white/10 py-4 space-y-2 animate-in slide-in-from-top-2 fade-in">
              <Link to={base} onClick={() => setMobileMenu(false)}
                className="block px-4 py-3 text-sm font-medium text-gray-300 rounded-xl hover:bg-white/5 hover:text-white transition-colors">
                Productos
              </Link>
              <a href={waHref || "#"} target="_blank" rel="noopener noreferrer"
                onClick={() => setMobileMenu(false)}
                className="flex items-center gap-2 px-4 py-3 text-sm font-medium text-emerald-400 rounded-xl hover:bg-emerald-400/10 transition-colors">
                <MessageCircle className="w-4 h-4" /> Asesoría por WhatsApp
              </a>
            </div>
          )}
        </div>
      </nav>

      <main className="flex-grow">
        {children}
      </main>

      <a
        href={waHref || "#"}
        target="_blank"
        rel="noopener noreferrer"
        className="fixed bottom-5 right-5 z-40 w-14 h-14 rounded-full bg-green-500 text-white shadow-lg flex items-center justify-center hover:bg-green-600 transition-colors hover:scale-110 active:scale-95"
        aria-label="WhatsApp"
      >
        <MessageCircle className="w-7 h-7" />
      </a>

      <footer className="bg-gray-900">
        <div className="max-w-7xl mx-auto px-4 py-12">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div>
              <div className="flex items-center gap-2.5 mb-3">
                <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center">
                  <Store className="w-4 h-4 text-white" />
                </div>
                <span className="text-base font-bold text-white">{config.storeName || 'Tienda'}</span>
              </div>
              <p className="text-sm text-gray-400 leading-relaxed">Tu tienda de confianza con los mejores productos digitales y físicos.</p>
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
              <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">Pagos seguros</h4>
              <div className="flex flex-wrap gap-2">
                <span className="text-xs font-semibold px-3 py-1.5 rounded-md bg-white/10 text-gray-300">MercadoPago</span>
                <span className="text-xs font-semibold px-3 py-1.5 rounded-md bg-white/10 text-gray-300">Nequi</span>
                <span className="text-xs font-semibold px-3 py-1.5 rounded-md bg-white/10 text-gray-300">PSE</span>
              </div>
            </div>
          </div>
          <div className="mt-8 pt-8 border-t border-white/10 text-center text-xs text-gray-600">
            &copy; {new Date().getFullYear()} {config.storeName || 'Tienda'} &mdash; Todos los derechos reservados
          </div>
        </div>
      </footer>
    </div>
  );
};

export default PublicLayout;
