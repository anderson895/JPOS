import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import LoginPage from './pages/LoginPage';
import TerminalPage from './pages/TerminalPage';
import SubscribePage from './pages/SubscribePage';
import LoadingScreen from './components/shared/LoadingScreen';
import { signedOutHome } from './lib/terminal';

// The signed-in areas load on demand, so the public landing page doesn't
// download recharts, jspdf, the POS and every admin page up front.
const AdminLayout    = lazy(() => import('./components/admin/AdminLayout'));
const StaffLayout    = lazy(() => import('./components/staff/StaffLayout'));
const AdminDashboard = lazy(() => import('./pages/admin/Dashboard'));
const AdminProducts  = lazy(() => import('./pages/admin/Products'));
const AdminReports   = lazy(() => import('./pages/admin/Reports'));
const AdminPOS       = lazy(() => import('./pages/admin/POS'));
const AdminStaff     = lazy(() => import('./pages/admin/Staff'));
const AdminPayments  = lazy(() => import('./pages/admin/PaymentSettings'));
const AdminBilling   = lazy(() => import('./pages/admin/Billing'));
const SuperAdmin     = lazy(() => import('./pages/admin/SuperAdmin'));
const StaffDashboard = lazy(() => import('./pages/staff/Dashboard'));
const StaffPOS       = lazy(() => import('./pages/staff/POS'));

/** A page inside a layout: only the content area waits for its code, the sidebar stays put. */
function Page({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[50vh] items-center justify-center" role="status" aria-label="Loading">
          <div className="h-9 w-9 animate-spin rounded-full border-[3px] border-caramel-400 border-t-transparent" />
        </div>
      }
    >
      {children}
    </Suspense>
  );
}

function ProtectedRoute({ children, role }: { children: React.ReactNode; role?: 'admin' | 'staff' }) {
  const { currentUser, loading, noShop } = useAuth();
  if (loading) return <LoadingScreen />;
  // Signed in but no shop yet: finish signing up
  if (noShop) return <Navigate to="/subscribe" replace />;
  // A counter device goes back to its shop terminal; anyone else to the public page
  if (!currentUser) return <Navigate to={signedOutHome()} replace />;
  if (role && currentUser.role !== role) {
    return <Navigate to={currentUser.role === 'admin' ? '/admin' : '/staff'} replace />;
  }
  return <>{children}</>;
}

export default function App() {
  const { currentUser, loading, noShop, isSuperAdmin } = useAuth();

  if (loading) return <LoadingScreen />;

  return (
    // Shown while a layout's code loads (first visit to the admin or staff area)
    <Suspense fallback={<LoadingScreen />}>
      <Routes>
        <Route
          path="/login"
          element={
            currentUser
              ? <Navigate to={currentUser.role === 'admin' ? '/admin' : '/staff'} replace />
              : noShop ? <Navigate to="/subscribe" replace /> : <LoginPage />
          }
        />

        {/* New shops: create an account, verify the email, create the shop */}
        <Route path="/subscribe" element={<SubscribePage />} />

        {/* A shop's counter terminal (RFID + password), bookmarked on the POS device */}
        <Route
          path="/s/:slug"
          element={
            currentUser
              ? <Navigate to={currentUser.role === 'admin' ? '/admin' : '/staff'} replace />
              : <TerminalPage />
          }
        />

        {/* Admin Routes */}
        <Route path="/admin" element={
          <ProtectedRoute role="admin"><AdminLayout /></ProtectedRoute>
        }>
          <Route index element={<Page><AdminDashboard /></Page>} />
          <Route path="products" element={<Page><AdminProducts /></Page>} />
          <Route path="reports" element={<Page><AdminReports /></Page>} />
          <Route path="pos" element={<Page><AdminPOS /></Page>} />
          <Route path="staff" element={<Page><AdminStaff /></Page>} />
          <Route path="payments" element={<Page><AdminPayments /></Page>} />
          <Route path="billing" element={<Page><AdminBilling /></Page>} />
          <Route path="platform" element={isSuperAdmin ? <Page><SuperAdmin /></Page> : <Navigate to="/admin" replace />} />
        </Route>

        {/* Staff Routes */}
        <Route path="/staff" element={
          <ProtectedRoute role="staff"><StaffLayout /></ProtectedRoute>
        }>
          <Route index element={<Page><StaffDashboard /></Page>} />
          <Route path="pos" element={<Page><StaffPOS /></Page>} />
        </Route>

        {/* Default redirect */}
        <Route path="/" element={
          currentUser
            ? <Navigate to={currentUser.role === 'admin' ? '/admin' : '/staff'} replace />
            : <Navigate to={signedOutHome()} replace />
        } />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
