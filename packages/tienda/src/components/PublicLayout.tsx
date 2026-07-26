import { Link, useParams } from 'react-router-dom';
import { ShoppingCart, MessageCircle, Menu, X, Store, Search } from 'lucide-react';
import { useState } from 'react';
import { useStore } from '../store/useStore';

const PublicLayout = ({ children }: { children: React.ReactNode }) => {
  const { cart, config } = useStore();
  const { slug } = useParams();
  const cartCount = cart.reduce((acc, item) => acc + item.quantity, 0);
  const base = slug ? `/tienda/${slug}` : '/tienda';
  const [mobileMenu, setMobileMenu] = useState(false);

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <Link to={base} className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center shadow-sm">
                <Store className="w-4 h-4 text-white" />
              </div>
              <span className="text-base font-bold text-gray-900">{config.storeName || 'Tienda'}</span>
            </Link>

            <div className="hidden md:flex items-center gap-8">
              <Link to={base} className="text-sm font-medium text-gray-600 hover:text-indigo-600 transition-colors border-b-2 border-transparent hover:border-indigo-600 pb-0.5">
                Productos
              </Link>
              <a href={`https://wa.me/${config.whatsappPhone || '573208270414'}`} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-green-600 transition-colors">
                <MessageCircle className="w-4 h-4" /> WhatsApp
              </a>
              <Link to={`${base}/carrito`} className="relative p-2 text-gray-500 hover:text-indigo-600 transition-colors">
                <ShoppingCart className="w-5 h-5" />
                {cartCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-indigo-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full ring-2 ring-white min-w-[18px] text-center">
                    {cartCount}
                  </span>
                )}
              </Link>
            </div>

            <div className="flex md:hidden items-center gap-2">
              <Link to={`${base}/carrito`} className="relative p-2 text-gray-500">
                <ShoppingCart className="w-5 h-5" />
                {cartCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-indigo-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full ring-2 ring-white">
                    {cartCount}
                  </span>
                )}
              </Link>
              <button onClick={() => setMobileMenu(!mobileMenu)} className="p-2 text-gray-600">
                {mobileMenu ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>
          </div>

          {mobileMenu && (
            <div className="md:hidden border-t border-gray-100 py-3 space-y-1">
              <Link to={base} onClick={() => setMobileMenu(false)}
                className="block px-3 py-2.5 text-sm font-medium text-gray-700 rounded-lg hover:bg-gray-50">
                Productos
              </Link>
              <a href={`https://wa.me/${config.whatsappPhone || '573208270414'}`} target="_blank" rel="noopener noreferrer"
                onClick={() => setMobileMenu(false)}
                className="flex items-center gap-2 px-3 py-2.5 text-sm font-medium text-green-600 rounded-lg hover:bg-green-50">
                <MessageCircle className="w-4 h-4" /> WhatsApp
              </a>
            </div>
          )}
        </div>
      </nav>

      <main className="flex-grow">
        {children}
      </main>

      <a
        href={`https://wa.me/${config.whatsappPhone || '573208270414'}`}
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
                <a href={`https://wa.me/${config.whatsappPhone || '573208270414'}`} target="_blank" rel="noopener noreferrer"
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
