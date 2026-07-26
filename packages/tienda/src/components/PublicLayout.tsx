import { Link, useParams } from 'react-router-dom';
import { ShoppingCart, MessageCircle, Menu, X, Store } from 'lucide-react';
import { useState } from 'react';
import { useStore } from '../store/useStore';

const PublicLayout = ({ children }: { children: React.ReactNode }) => {
  const { cart, config } = useStore();
  const { slug } = useParams();
  const cartCount = cart.reduce((acc, item) => acc + item.quantity, 0);
  const base = slug ? `/tienda/${slug}` : '/tienda';
  const [mobileMenu, setMobileMenu] = useState(false);

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <nav className="bg-white border-b border-gray-100 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <Link to={base} className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center">
                <Store className="w-4 h-4 text-white" />
              </div>
              <span className="text-lg font-bold text-gray-900">{config.storeName || 'Tienda'}</span>
            </Link>

            <div className="hidden md:flex items-center gap-6">
              <Link to={base} className="text-sm font-semibold text-gray-600 hover:text-indigo-600 transition-colors">
                Productos
              </Link>
              <a href={`https://wa.me/${config.whatsappPhone || '573208270414'}`} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-sm font-semibold text-green-600 hover:text-green-700 transition-colors">
                <MessageCircle className="w-4 h-4" /> WhatsApp
              </a>
              <Link to={`${base}/carrito`} className="relative p-2 text-gray-400 hover:text-indigo-600 transition-colors">
                <ShoppingCart className="w-5 h-5" />
                {cartCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-indigo-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full ring-2 ring-white min-w-[18px] text-center">
                    {cartCount}
                  </span>
                )}
              </Link>
            </div>

            <div className="flex md:hidden items-center gap-2">
              <Link to={`${base}/carrito`} className="relative p-2 text-gray-400">
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
                className="block px-3 py-2.5 text-sm font-semibold text-gray-700 rounded-lg hover:bg-gray-50">
                Productos
              </Link>
              <a href={`https://wa.me/${config.whatsappPhone || '573208270414'}`} target="_blank" rel="noopener noreferrer"
                onClick={() => setMobileMenu(false)}
                className="flex items-center gap-2 px-3 py-2.5 text-sm font-semibold text-green-600 rounded-lg hover:bg-green-50">
                <MessageCircle className="w-4 h-4" /> WhatsApp
              </a>
            </div>
          )}
        </div>
      </nav>

      <main className="flex-grow">
        {children}
      </main>

      <footer className="bg-gray-900">
        <div className="max-w-7xl mx-auto px-4 py-10">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center">
                <Store className="w-4 h-4 text-white" />
              </div>
              <span className="text-base font-bold text-white">{config.storeName || 'Tienda'}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-500">Pagos seguros con</span>
              <span className="text-xs font-bold px-3 py-1.5 rounded-lg bg-white/10 text-gray-300">MercadoPago</span>
              <span className="text-xs font-bold px-3 py-1.5 rounded-lg bg-white/10 text-gray-300">Nequi</span>
            </div>
          </div>
          <div className="mt-6 pt-6 border-t border-white/10 text-center text-xs text-gray-600">
            &copy; {new Date().getFullYear()} {config.storeName || 'Tienda'} &mdash; Todos los derechos reservados
          </div>
        </div>
      </footer>
    </div>
  );
};

export default PublicLayout;
