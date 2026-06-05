import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { ShoppingCart, Menu, X, User, Search, Package, LayoutDashboard, LogOut, Star, ShieldCheck, Zap, Globe } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useStoreCart } from "./store-context";

function StoreInit({ slug }: { slug: string }) {
  const { products, setProducts, setConfig, setLoading } = useStoreCart();

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    fetch(`/api/public/products/${slug}`)
      .then(r => { if (!r.ok) throw new Error("No encontrada"); return r.json(); })
      .then(data => {
        setProducts(data.products);
        if (data.store) {
          setConfig({
            name: data.store.name || "Mi Tienda",
            slug: data.store.slug || slug,
            logo: data.store.logo || null,
            primaryColor: data.store.colors?.primary || "#4f46e5",
            secondaryColor: data.store.colors?.secondary || "#9333ea",
          });
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [slug]);

  return null;
}

export function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const { cart, config, isAdmin, setAdmin } = useStoreCart();
  const [location] = useLocation();
  const cartCount = cart.reduce((acc, item) => acc + item.quantity, 0);
  const base = `/store/${config.slug}`;

  const navLinks = [
    { name: "Inicio", path: base },
    { name: "Tienda", path: `${base}/productos` },
    { name: "Digitales", path: `${base}/categoria/digital` },
  ];

  return (
    <nav className="bg-white/80 backdrop-blur-md border-b border-slate-100 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-20">
          <div className="flex items-center">
            <Link to={base} className="flex-shrink-0 flex items-center gap-3 group">
              {config.logo ? (
                <img src={config.logo} alt={config.name} className="h-10 w-auto object-contain" />
              ) : (
                <div
                  className="w-11 h-11 rounded-2xl flex items-center justify-center transition-transform group-hover:rotate-12"
                  style={{ backgroundColor: config.primaryColor }}
                >
                  <Package className="text-white w-6 h-6" />
                </div>
              )}
              <span className="text-2xl font-black text-slate-950 tracking-tighter uppercase">
                {config.name}
              </span>
            </Link>
          </div>

          {/* Desktop Menu */}
          <div className="hidden md:flex items-center space-x-8">
            {navLinks.map((link) => (
              <Link
                key={link.path}
                to={link.path}
                className={`text-sm font-medium transition-colors hover:text-indigo-600 ${
                  location === link.path ? "text-indigo-600" : "text-gray-600"
                }`}
              >
                {link.name}
              </Link>
            ))}
          </div>

          <div className="hidden md:flex items-center space-x-5">
            <Link to={`${base}/carrito`} className="relative p-2 text-gray-400 hover:text-indigo-600 transition-colors">
              <ShoppingCart className="w-5 h-5" />
              {cartCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-indigo-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full ring-2 ring-white">
                  {cartCount}
                </span>
              )}
            </Link>
          </div>

          {/* Mobile menu button */}
          <div className="md:hidden flex items-center space-x-4">
            <Link to={`${base}/carrito`} className="relative p-2 text-gray-400">
              <ShoppingCart className="w-6 h-6" />
              {cartCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-indigo-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full ring-2 ring-white">
                  {cartCount}
                </span>
              )}
            </Link>
            <button
              onClick={() => setIsOpen(!isOpen)}
              className="inline-flex items-center justify-center p-2 rounded-md text-gray-400 hover:text-indigo-600 hover:bg-gray-100 transition-all"
            >
              {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden bg-white border-t border-gray-100 overflow-hidden"
          >
            <div className="px-2 pt-2 pb-3 space-y-1 sm:px-3">
              {navLinks.map((link) => (
                <Link
                  key={link.path}
                  to={link.path}
                  onClick={() => setIsOpen(false)}
                  className="block px-3 py-2 rounded-md text-base font-medium text-gray-700 hover:text-indigo-600 hover:bg-gray-50"
                >
                  {link.name}
                </Link>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}

export function Footer() {
  const { config } = useStoreCart();
  const base = `/store/${config.slug}`;

  return (
    <footer className="bg-gray-900 text-gray-300">
      <div className="max-w-7xl mx-auto px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12">
          <div className="col-span-1 md:col-span-1">
            <div className="flex items-center gap-2 mb-6">
              <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
                <Package className="text-white w-5 h-5" />
              </div>
              <span className="text-xl font-extrabold text-white">{config.name}</span>
            </div>
            <p className="text-sm leading-relaxed">
              La mejor solución e-commerce para productos digitales, físicos y dropshipping.
              Escalable, profesional y segura.
            </p>
          </div>
          <div>
            <h3 className="text-white font-bold mb-6">Tienda</h3>
            <ul className="space-y-4 text-sm">
              <li><Link to={`${base}/categoria/digital`} className="hover:text-indigo-400 transition-colors">Productos Digitales</Link></li>
              <li><Link to={`${base}/categoria/fisico`} className="hover:text-indigo-400 transition-colors">Productos Físicos</Link></li>
              <li><Link to={`${base}/productos`} className="hover:text-indigo-400 transition-colors">Todos los Productos</Link></li>
            </ul>
          </div>
          <div>
            <h3 className="text-white font-bold mb-6">Soporte</h3>
            <ul className="space-y-4 text-sm">
              <li><a href="#" className="hover:text-indigo-400 transition-colors">Preguntas Frecuentes</a></li>
              <li><a href="#" className="hover:text-indigo-400 transition-colors">Envíos y Devoluciones</a></li>
              <li><a href="#" className="hover:text-indigo-400 transition-colors">Contacto</a></li>
            </ul>
          </div>
          <div>
            <h3 className="text-white font-bold mb-6">Newsletter</h3>
            <p className="text-sm mb-4">Suscríbete para recibir ofertas exclusivas y novedades.</p>
            <form className="flex gap-2" onSubmit={e => e.preventDefault()}>
              <input
                type="email"
                placeholder="Tu email"
                className="bg-gray-800 border-none rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500 w-full"
              />
              <button className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors">
                Unirse
              </button>
            </form>
          </div>
        </div>
        <div className="border-t border-gray-800 mt-12 pt-8 text-center text-xs">
          <p>&copy; {new Date().getFullYear()} {config.name}. Todos los derechos reservados.</p>
        </div>
      </div>
    </footer>
  );
}

export function StoreLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const slug = location.split("/")[2];

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <StoreInit slug={slug} />
      <Navbar />
      <main className="flex-grow">{children}</main>
      <Footer />
    </div>
  );
}
