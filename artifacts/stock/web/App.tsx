import { Suspense, lazy, useEffect, type ReactNode } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { PageLoader } from "@/components/ui";
import { useAuth } from "@/store/auth";

const Home = lazy(() => import("@/pages/Home"));
const Search = lazy(() => import("@/pages/Search"));
const AssetDetail = lazy(() => import("@/pages/AssetDetail"));
const Collections = lazy(() => import("@/pages/Collections"));
const CollectionDetail = lazy(() => import("@/pages/Collections").then((m) => ({ default: m.CollectionDetailPage })));
const Pricing = lazy(() => import("@/pages/Pricing"));
const Order = lazy(() => import("@/pages/Pricing").then((m) => ({ default: m.OrderPage })));
const AiStudio = lazy(() => import("@/pages/AiStudio"));
const LicensesInfo = lazy(() => import("@/pages/Misc").then((m) => ({ default: m.LicensesInfoPage })));
const ContributorPublic = lazy(() => import("@/pages/Misc").then((m) => ({ default: m.ContributorPublicPage })));
const NotFound = lazy(() => import("@/pages/Misc").then((m) => ({ default: m.NotFoundPage })));
const AccountLayout = lazy(() => import("@/pages/account/Account").then((m) => ({ default: m.AccountLayout })));
const Licenses = lazy(() => import("@/pages/account/Account").then((m) => ({ default: m.LicensesPage })));
const Credits = lazy(() => import("@/pages/account/Account").then((m) => ({ default: m.CreditsPage })));
const Profile = lazy(() => import("@/pages/account/Account").then((m) => ({ default: m.ProfilePage })));
const Join = lazy(() => import("@/pages/contributor/Join"));
const ContributorLayout = lazy(() => import("@/pages/contributor/Contributor").then((m) => ({ default: m.ContributorLayout })));
const ContributorDashboard = lazy(() => import("@/pages/contributor/Contributor").then((m) => ({ default: m.ContributorDashboard })));
const MyAssets = lazy(() => import("@/pages/contributor/Contributor").then((m) => ({ default: m.MyAssetsPage })));
const Earnings = lazy(() => import("@/pages/contributor/Contributor").then((m) => ({ default: m.EarningsPage })));
const Upload = lazy(() => import("@/pages/contributor/Upload"));
const AdminLayout = lazy(() => import("@/pages/admin/Admin").then((m) => ({ default: m.AdminLayout })));
const AdminDashboard = lazy(() => import("@/pages/admin/Admin").then((m) => ({ default: m.AdminDashboard })));
const Moderation = lazy(() => import("@/pages/admin/Admin").then((m) => ({ default: m.ModerationPage })));
const AdminAssets = lazy(() => import("@/pages/admin/Admin").then((m) => ({ default: m.AdminAssetsPage })));
const AdminUsers = lazy(() => import("@/pages/admin/Admin").then((m) => ({ default: m.AdminUsersPage })));
const AdminOrders = lazy(() => import("@/pages/admin/Admin").then((m) => ({ default: m.AdminOrdersPage })));
const AdminPayouts = lazy(() => import("@/pages/admin/Admin").then((m) => ({ default: m.AdminPayoutsPage })));
const AdminCollections = lazy(() => import("@/pages/admin/Admin").then((m) => ({ default: m.AdminCollectionsPage })));
const AdminSettings = lazy(() => import("@/pages/admin/Admin").then((m) => ({ default: m.AdminSettingsPage })));

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { if (!pathname.startsWith("/buscar")) window.scrollTo({ top: 0 }); }, [pathname]);
  return null;
}

/** `?login=1` abre el diálogo de acceso (usado por redirecciones de rutas privadas). */
function LoginParam() {
  const [sp] = useSearchParams();
  const navigate = useNavigate();
  const { requireAuth, user, loading } = useAuth();
  useEffect(() => { if (sp.get("login") === "1" && !loading && !user) { requireAuth(); navigate({ search: "" }, { replace: true }); } }, [sp, loading, user]);
  return null;
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-paper text-ink">
      <Header />
      <main className="flex-1"><Suspense fallback={<PageLoader />}>{children}</Suspense></main>
      <Footer />
    </div>
  );
}

export default function App() {
  return (
    <>
      <ScrollToTop />
      <LoginParam />
      <Shell>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/buscar" element={<Search />} />
          <Route path="/imagenes/:slug/:id" element={<AssetDetail />} />
          <Route path="/video/:slug/:id" element={<AssetDetail />} />
          <Route path="/audio/:slug/:id" element={<AssetDetail />} />
          <Route path="/plantillas/:slug/:id" element={<AssetDetail />} />
          <Route path="/3d/:slug/:id" element={<AssetDetail />} />
          <Route path="/recurso/:id" element={<AssetDetail />} />
          <Route path="/bibliotecas" element={<Collections />} />
          <Route path="/bibliotecas/:slug" element={<CollectionDetail />} />
          <Route path="/precios" element={<Pricing />} />
          <Route path="/pedido/:id" element={<Order />} />
          <Route path="/ia" element={<AiStudio />} />
          <Route path="/licencias" element={<LicensesInfo />} />
          <Route path="/colaboradores/:id" element={<ContributorPublic />} />
          <Route path="/colaborar" element={<Join />} />
          <Route path="/cuenta" element={<AccountLayout />}>
            <Route index element={<Navigate to="/cuenta/licencias" replace />} />
            <Route path="licencias" element={<Licenses />} />
            <Route path="creditos" element={<Credits />} />
            <Route path="perfil" element={<Profile />} />
          </Route>
          <Route path="/colaborador" element={<ContributorLayout />}>
            <Route index element={<ContributorDashboard />} />
            <Route path="subir" element={<Upload />} />
            <Route path="recursos" element={<MyAssets />} />
            <Route path="ganancias" element={<Earnings />} />
          </Route>
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<AdminDashboard />} />
            <Route path="moderacion" element={<Moderation />} />
            <Route path="recursos" element={<AdminAssets />} />
            <Route path="usuarios" element={<AdminUsers />} />
            <Route path="pedidos" element={<AdminOrders />} />
            <Route path="pagos" element={<AdminPayouts />} />
            <Route path="colecciones" element={<AdminCollections />} />
            <Route path="ajustes" element={<AdminSettings />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Shell>
    </>
  );
}
