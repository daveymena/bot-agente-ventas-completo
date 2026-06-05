import { Link, useParams } from 'react-router-dom';
import { ShoppingCart, Package } from 'lucide-react';
import { useStore } from '../store/useStore';

const PublicLayout = ({ children }: { children: React.ReactNode }) => {
  const { cart } = useStore();
  const { slug } = useParams();
  const cartCount = cart.reduce((acc, item) => acc + item.quantity, 0);
  const base = slug ? `/tienda/${slug}` : '/tienda';

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <nav className="bg-white border-b border-slate-100 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <Link to={base} className="flex items-center gap-2">
              <Package className="w-6 h-6 text-indigo-600" />
              <span className="text-lg font-bold text-slate-950">Tienda</span>
            </Link>
            <div className="flex items-center gap-4">
              <Link
                to={base}
                className="text-sm font-medium text-gray-600 hover:text-indigo-600"
              >
                Productos
              </Link>
              <Link to={`${base}/carrito`} className="relative p-2 text-gray-400 hover:text-indigo-600">
                <ShoppingCart className="w-5 h-5" />
                {cartCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-indigo-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full ring-2 ring-white">
                    {cartCount}
                  </span>
                )}
              </Link>
            </div>
          </div>
        </div>
      </nav>
      <main className="flex-grow">
        {children}
      </main>
      <footer className="bg-gray-900 text-gray-400 text-center py-6 text-sm">
        &copy; {new Date().getFullYear()} Tienda &mdash; Todos los derechos reservados
      </footer>
    </div>
  );
};

export default PublicLayout;
