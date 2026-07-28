import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import MainLayout from './components/MainLayout';
import PublicLayout from './components/PublicLayout';
import Home from './pages/Home';
import Shop from './pages/Shop';
import Cart from './pages/Cart';
import ProductDetail from './pages/ProductDetail';
import AdminDashboard from './pages/AdminDashboard';
import EditorPage from './pages/EditorPage';
import { useStore } from './store/useStore';

const App = () => {
  const { isAdmin } = useStore();

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
          path="/tienda/carrito"
          element={
            <PublicLayout>
              <Cart />
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
            isAdmin ? <AdminDashboard /> : <Navigate to="/" replace />
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
              <Navigate to="/" replace />
            )
          }
        />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
};

export default App;
