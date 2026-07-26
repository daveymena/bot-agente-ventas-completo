import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ShoppingCart, Menu, X, User, Search, Heart, MessageCircle, ChevronDown, Flame, ArrowRight, Store } from 'lucide-react';
import { useStore } from '../store/useStore';

const Header = () => {
  const { cart, config, products } = useStore();
  const location = useLocation();
  const navigate = useNavigate();
  const cartCount = cart.reduce((acc, item) => acc + item.quantity, 0);
  const cartTotal = cart.reduce((acc, item) => acc + item.price * item.quantity, 0);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const searchResults = searchTerm.length > 0
    ? products.filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase())).slice(0, 4)
    : [];

  return (
    <header className="bg-white border-b border-gray-100 sticky top-0 z-50">
      <div className="bg-slate-950 text-white">
        <div className="max-w-7xl mx-auto px-4 h-10 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs">
            <span className="w-5 h-5 rounded-md bg-emerald-700 flex items-center justify-center">
              <Store className="w-3 h-3" />
            </span>
            <span className="font-bold text-sm">{config.storeName}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate('/')}
              className="text-xs font-semibold text-slate-300 hover:text-white px-3 py-1 rounded-full transition-colors"
            >
              Vista cliente
            </button>
            <Link
              to="/admin"
              className="text-xs font-semibold text-slate-300 hover:text-white px-3 py-1 rounded-full bg-white/10 transition-colors"
            >
              Panel de tienda
            </Link>
          </div>
        </div>
      </div>

      <div className="border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center gap-5">
          <div className="flex items-center gap-2 flex-shrink-0">
            <img src="/store-logo.svg" alt={config.storeName} className="h-8 w-auto" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          </div>

          <div className="flex-1 min-w-[280px] hidden md:flex h-11 border-2 border-indigo-600 rounded-lg overflow-hidden bg-white">
            <div className="flex items-center gap-1.5 px-3.5 border-r border-gray-100 text-xs font-semibold text-slate-600 whitespace-nowrap">
              Todas <ChevronDown className="w-3 h-3 text-slate-300" />
            </div>
            <input
              type="text"
              placeholder="Buscar productos y cursos..."
              className="flex-1 min-w-0 px-3.5 text-sm outline-none text-slate-600 placeholder:text-slate-300"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && searchTerm) { navigate(`/shop?q=${encodeURIComponent(searchTerm)}`); setSearchTerm(''); } }}
            />
            <button
              onClick={() => { if (searchTerm) { navigate(`/shop?q=${encodeURIComponent(searchTerm)}`); setSearchTerm(''); } }}
              className="w-13 bg-indigo-600 text-white flex items-center justify-center flex-shrink-0 hover:bg-indigo-700"
            >
              <Search className="w-4 h-4" />
            </button>
            {searchResults.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-2xl border border-slate-100 p-2 z-50 max-w-md mx-auto">
                {searchResults.map(p => (
                  <button
                    key={p.id}
                    onClick={() => { navigate(`/shop?q=${encodeURIComponent(p.name)}`); setSearchTerm(''); }}
                    className="w-full flex items-center gap-3 p-2 hover:bg-slate-50 rounded-lg transition-colors text-left"
                  >
                    <img src={p.image} className="w-10 h-10 rounded-lg object-cover" />
                    <div>
                      <p className="text-xs font-bold text-slate-900">{p.name}</p>
                      <p className="text-[10px] text-indigo-600 font-bold">${p.price}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-4 flex-shrink-0">
            <a href="https://wa.me/573208270414" target="_blank" rel="noopener noreferrer" className="hidden sm:flex items-center gap-2 text-sm">
              <MessageCircle className="w-5 h-5 text-green-500" />
              <div className="leading-tight hidden lg:block">
                <p className="text-[10px] text-slate-400 font-semibold">WhatsApp</p>
                <p className="text-xs font-bold">320 827 0414</p>
              </div>
            </a>
            <span className="w-px h-6 bg-gray-100 hidden sm:block"></span>
            <button className="relative text-slate-600 hover:text-slate-900">
              <Heart className="w-5 h-5" />
              <span className="absolute -top-1.5 -right-1.5 min-w-4 h-4 rounded-full bg-slate-900 text-white text-[8px] font-extrabold flex items-center justify-center px-1">3</span>
            </button>
            <button className="text-slate-600 hover:text-slate-900">
              <User className="w-5 h-5" />
            </button>
            <Link to="/cart" className="flex items-center gap-2">
              <span className="relative text-slate-600 hover:text-slate-900">
                <ShoppingCart className="w-5 h-5" />
                {cartCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-4 h-4 rounded-full bg-indigo-600 text-white text-[8px] font-extrabold flex items-center justify-center px-1">{cartCount}</span>
                )}
              </span>
              <span className="text-xs font-bold text-slate-700 font-mono hidden md:block">${cartTotal.toFixed(2)}</span>
            </Link>
          </div>

          <button onClick={() => setMobileMenu(!mobileMenu)} className="md:hidden text-slate-600">
            {mobileMenu ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      <div className="border-b border-gray-100 hidden md:block">
        <div className="max-w-7xl mx-auto px-4 flex items-center gap-0.5 h-11">
          <span className="flex items-center gap-2 h-11 px-4 pr-5 mr-3 border-r border-gray-100 text-sm font-bold text-indigo-600">
            <Menu className="w-4 h-4" /> Categorías
          </span>
          {['Tecnología', 'Hogar', 'Estilo de Vida', 'Digital'].map(cat => (
            <Link key={cat} to={`/category/${cat.toLowerCase()}`} className="flex items-center gap-1.5 h-11 px-3.5 text-sm font-semibold text-slate-800 hover:text-indigo-600">
              {cat} <ChevronDown className="w-3 h-3 text-slate-300" />
            </Link>
          ))}
          <Link to="/shop" className="h-11 flex items-center px-3.5 text-sm font-semibold text-slate-800 hover:text-indigo-600">Combos</Link>
          <Link to="/ofertas" className="h-11 flex items-center gap-1.5 px-3.5 text-sm font-bold text-rose-700 ml-auto">
            <Flame className="w-4 h-4" /> Ofertas del día
          </Link>
        </div>
      </div>

      {mobileMenu && (
        <div className="md:hidden border-t border-gray-100 bg-white p-4 space-y-3">
          <div className="flex h-10 border-2 border-indigo-600 rounded-lg overflow-hidden">
            <input type="text" placeholder="Buscar..." className="flex-1 px-3 text-sm outline-none"
              value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { navigate(`/shop?q=${encodeURIComponent(searchTerm)}`); setMobileMenu(false); } }} />
            <button className="w-10 bg-indigo-600 text-white flex items-center justify-center"><Search className="w-4 h-4" /></button>
          </div>
          {['Tecnología', 'Hogar', 'Estilo de Vida', 'Digital', 'Combos'].map(cat => (
            <Link key={cat} to={`/category/${cat.toLowerCase()}`} onClick={() => setMobileMenu(false)}
              className="block px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 rounded-lg">{cat}</Link>
          ))}
          <Link to="/ofertas" onClick={() => setMobileMenu(false)}
            className="block px-3 py-2 text-sm font-bold text-rose-700 hover:bg-rose-50 rounded-lg">🔥 Ofertas del día</Link>
        </div>
      )}
    </header>
  );
};

const Breadcrumbs = () => {
  const location = useLocation();
  const paths = location.pathname.split('/').filter(Boolean);
  if (paths.length === 0) return null;
  return (
    <div className="bg-slate-50 border-b border-gray-100">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-2 text-xs text-slate-400">
        <Link to="/" className="text-slate-400 hover:text-indigo-600 font-medium">Inicio</Link>
        {paths.map((p, i) => (
          <span key={i} className="flex items-center gap-2">
            <span className="text-slate-200">/</span>
            <span className={i === paths.length - 1 ? 'font-bold text-slate-800' : 'text-slate-400'}>
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
};

const Footer = () => {
  const { config } = useStore();
  return (
    <>
      <div className="bg-white border-t border-gray-100">
        <div className="max-w-7xl mx-auto px-4 py-8 grid grid-cols-2 md:grid-cols-4 gap-6">
          {[
            { icon: Search, title: 'Envío a todo el país', desc: 'Gratis desde $150.000' },
            { icon: ArrowRight, title: 'Digital inmediato', desc: 'Enlace al confirmar el pago' },
            { icon: ShoppingCart, title: 'Compra protegida', desc: 'Garantía de 12 meses' },
            { icon: ArrowRight, title: 'Paga a cuotas', desc: 'O contra entrega' }
          ].map((f, i) => (
            <div key={i} className="flex items-center gap-3">
              <span className="w-11 h-11 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center flex-shrink-0">
                <f.icon className="w-5 h-5" />
              </span>
              <div>
                <p className="text-sm font-bold text-slate-900">{f.title}</p>
                <p className="text-xs text-slate-400">{f.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <footer className="bg-slate-950 text-slate-400">
        <div className="max-w-7xl mx-auto px-4 py-12 grid grid-cols-1 md:grid-cols-4 gap-10">
          <div>
            <img src="/store-logo-white.svg" alt={config.storeName} className="h-8 w-auto mb-4" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            <p className="text-sm leading-relaxed max-w-[34ch]">Tecnología, hogar y formación digital en un solo lugar. Atención automatizada 24/7 con Sofía IA.</p>
          </div>
          <div>
            <p className="text-white text-xs font-bold uppercase tracking-widest mb-3">Conózcanos</p>
            <div className="flex flex-col gap-2 text-sm">
              <a href="#" className="hover:text-white transition-colors">Sobre nosotros</a>
              <a href="#" className="hover:text-white transition-colors">Preguntas frecuentes</a>
              <a href="#" className="hover:text-white transition-colors">Contáctanos</a>
            </div>
          </div>
          <div>
            <p className="text-white text-xs font-bold uppercase tracking-widest mb-3">Enlaces útiles</p>
            <div className="flex flex-col gap-2 text-sm">
              <a href="#" className="hover:text-white transition-colors">Seguimiento de pedido</a>
              <a href="#" className="hover:text-white transition-colors">Cómo accedo a mi curso</a>
              <a href="#" className="hover:text-white transition-colors">Devoluciones y garantías</a>
            </div>
          </div>
          <div>
            <p className="text-white text-xs font-bold uppercase tracking-widest mb-3">Pagos seguros</p>
            <div className="flex flex-wrap gap-2">
              <span className="text-xs font-bold px-3 py-1.5 rounded-lg bg-white/10 text-slate-300">MercadoPago</span>
              <span className="text-xs font-bold px-3 py-1.5 rounded-lg bg-white/10 text-slate-300">Nequi</span>
              <span className="text-xs font-bold px-3 py-1.5 rounded-lg bg-white/10 text-slate-300">Contra entrega</span>
            </div>
          </div>
        </div>
        <div className="max-w-7xl mx-auto px-4 py-5 border-t border-white/10 text-xs text-center">
          © {new Date().getFullYear()} {config.storeName} — Todos los derechos reservados
        </div>
      </footer>
    </>
  );
};

const MainLayout = ({ children }: { children: React.ReactNode }) => {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <Header />
      <Breadcrumbs />
      <main className="flex-grow">
        {children}
      </main>
      <Footer />
    </div>
  );
};

export default MainLayout;
