import { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import MainLayout from './components/MainLayout';
import PublicLayout from './components/PublicLayout';
import Home from './pages/Home';
import Shop from './pages/Shop';
import Cart from './pages/Cart';
import ProductDetail from './pages/ProductDetail';
import Checkout from './pages/Checkout';
import Wishlist from './pages/Wishlist';
import AdminDashboard from './pages/AdminDashboard';
import EditorPage from './pages/EditorPage';
import LandingPageNicho from './pages/LandingPageNicho';
import InicioDelNegocio from './pages/InicioDelNegocio';
import { useStore } from './store/useStore';

/**
 * Evita que el gesto "atrás" cierre la PWA/tienda cuando se abrió en pestaña nueva.
 * Caso reportado: "siempre que estoy en leasing Estudio o en la tienda y me devuelvo la aplicación se sale".
 * - Si history.length===1 y estamos en /tienda/*, no hay a dónde volver: el navegador cierra la vista.
 * - Truco: empujar un estado dummy al entrar, así "atrás" cae en popstate y lo llevamos al inicio de la tienda en vez de salir.
 * - También intercepta popstate en raíz de tienda para no dejar salir sin querer (doble atrás sí sale).
 */
const NavegacionSeguraTienda = () => {
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    const esTienda = location.pathname.startsWith('/tienda');
    if (!esTienda) return;
    // Si entramos directo (WhatsApp, QR, ?from=panel en pestaña nueva) history=1 → empujar dummy
    try {
      if (window.history.length === 1) {
        window.history.pushState({ vp_seguro: true }, '', window.location.href);
      }
    } catch {}
    const onPopState = () => {
      // Si el usuario dio atrás y quedó sin historial, llevarlo al inicio de SU tienda, no cerrar
      try {
        const m = window.location.pathname.match(/^\/tienda\/([^/]+)/);
        const base = m ? `/tienda/${m[1]}` : '/tienda';
        // Si después del pop la ruta sigue siendo tienda pero sin estado, quedó en el dummy → ir al base
        if (window.location.pathname.startsWith('/tienda')) {
          // pequeña demora para dejar que el router procese el pop
          setTimeout(() => {
            if (window.location.pathname === base) {
              // ya está en base, empujar de nuevo para que el siguiente atrás no cierre de golpe
              try { window.history.pushState({ vp_seguro: true }, '', window.location.href); } catch {}
            }
          }, 50);
        } else {
          // si salió de /tienda por atrás (ej: a / ), volver a la tienda
          navigate(base, { replace: true });
        }
      } catch {}
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [location.pathname, navigate]);
  return null;
};

/**
 * A dónde mandar una ruta desconocida dentro de la tienda.
 *
 * Nunca a "/": esa es la raíz del dominio, donde vive el panel de
 * administración. Se saca el slug de la URL actual para volver a la tienda de
 * ese negocio; si no hay slug reconocible, a /tienda, que sí pertenece a esta
 * aplicación.
 */
const VolverALaTienda = () => {
  const m = window.location.pathname.match(/^\/tienda\/([^/]+)/);
  return <Navigate to={m ? `/tienda/${m[1]}` : "/tienda"} replace />;
};

/**
 * Boton para volver al panel de administracion.
 *
 * La tienda se abre desde el panel en una PESTANA NUEVA, asi que esa pestana
 * no tiene historial: al tocar "atras" el navegador no vuelve al panel -- lo
 * saca de la app y hay que entrar de cero. Reportado por el admin.
 *
 * Solo aparece si se llego desde el panel (?from=panel). Un cliente que entra
 * a comprar no ve nada: el marcador lo pone el propio panel al abrir el
 * enlace. Se guarda en sessionStorage porque al navegar dentro de la tienda
 * el parametro se pierde, y el boton tiene que seguir estando.
 */
const VolverAlPanel = () => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (new URLSearchParams(window.location.search).get("from") === "panel") {
        sessionStorage.setItem("vp_desde_panel", "1");
      }
      setVisible(sessionStorage.getItem("vp_desde_panel") === "1");
    } catch {
      /* sin sessionStorage (modo privado viejo): simplemente no se muestra */
    }
  }, []);

  if (!visible) return null;

  return (
    <a
      href="/"
      className="fixed bottom-4 left-4 z-[9999] inline-flex items-center gap-2 rounded-full bg-slate-900/90 px-4 py-2.5 text-sm font-medium text-white shadow-lg backdrop-blur transition hover:bg-slate-900"
      style={{ paddingBottom: "calc(0.625rem + env(safe-area-inset-bottom, 0px))" }}
    >
      <span aria-hidden>&larr;</span> Volver al panel
    </a>
  );
};

const App = () => {
  const { isAdmin, sessionChecked, checkSession } = useStore();

  useEffect(() => {
    checkSession();
  }, []);

  // Antes de saber si hay sesión real, no se puede decidir si /admin y
  // /editor deben mostrar el panel o redirigir -- mostrar "denegado" de
  // entrada (aunque el usuario SÍ esté logueado) se veía como un parpadeo
  // roto en cada carga.
  if (!sessionChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-400 text-sm">
        Verificando sesión…
      </div>
    );
  }

  return (
    <Router>
      <NavegacionSeguraTienda />
      <VolverAlPanel />
      <Routes>
        {/* Public Routes */}
        <Route
          path="/"
          element={
            <MainLayout>
              <Home />
            </MainLayout>
          }
        />
        <Route
          path="/shop"
          element={
            <MainLayout>
              <Shop />
            </MainLayout>
          }
        />
        <Route
          path="/shop/:slug"
          element={
            <MainLayout>
              <Shop />
            </MainLayout>
          }
        />
        <Route
          path="/category/:type"
          element={
            <MainLayout>
              <Shop />
            </MainLayout>
          }
        />
        <Route
          path="/cart"
          element={
            <MainLayout>
              <Cart />
            </MainLayout>
          }
        />

        {/* Landing Pages - Real sales pages for dropshipping */}
        <Route
          path="/landing/:slug"
          element={<LandingPageNicho />}
        />
        <Route
          path="/landing"
          element={<LandingPageNicho />}
        />
        <Route
          path="/tienda/:slug/landing"
          element={<LandingPageNicho />}
        />

        {/* Public Routes (clients without admin access) */}
        <Route
          path="/tienda"
          element={
            <PublicLayout>
              <Shop />
            </PublicLayout>
          }
        />
        <Route
          path="/tienda/:slug"
          element={<InicioDelNegocio />}
        />
        <Route
          path="/tienda/:slug/producto/:productId"
          element={
            <PublicLayout>
              <ProductDetail />
            </PublicLayout>
          }
        />
        <Route
          path="/tienda/:slug/checkout"
          element={
            <PublicLayout>
              <Checkout />
            </PublicLayout>
          }
        />
        <Route
          path="/tienda/carrito"
          element={
            <PublicLayout>
              <Cart />
            </PublicLayout>
          }
        />
        <Route
          path="/tienda/wishlist"
          element={
            <PublicLayout>
              <Wishlist />
            </PublicLayout>
          }
        />
        <Route
          path="/tienda/:slug/wishlist"
          element={
            <PublicLayout>
              <Wishlist />
            </PublicLayout>
          }
        />
        <Route
          path="/tienda/:slug/carrito"
          element={
            <PublicLayout>
              <Cart />
            </PublicLayout>
          }
        />

        {/* Admin Routes */}
        <Route
          path="/admin"
          element={
            isAdmin ? <AdminDashboard /> : <VolverALaTienda />
          }
        />
        <Route
          path="/editor"
          element={
            isAdmin ? (
              <MainLayout>
                <EditorPage />
              </MainLayout>
            ) : (
              <VolverALaTienda />
            )
          }
        />

        {/* Fallback: vuelve a la tienda del cliente, NO a la raíz.
            "/" es el panel de administración: otra aplicación entera. Mandar
            ahí al cliente lo saca de la tienda y le pide iniciar sesión —
            reportado por el admin: "cuando me salgo de la tienda para
            devolverme se sale la app y me toca volver a entrar".
            Se conserva el slug de la URL actual para caer en SU tienda. */}
        <Route path="*" element={<VolverALaTienda />} />
      </Routes>
    </Router>
  );
};

export default App;
