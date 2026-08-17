import { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
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
import { useStore } from './store/useStore';

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
          element={
            <PublicLayout>
              <Shop />
            </PublicLayout>
          }
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
