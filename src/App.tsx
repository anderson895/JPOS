import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import LoginPage from './pages/LoginPage';
import AdminLayout from './components/admin/AdminLayout';
import StaffLayout from './components/staff/StaffLayout';
import AdminDashboard from './pages/admin/Dashboard';
import AdminProducts from './pages/admin/Products';
import AdminStock from './pages/admin/Stock';
import AdminReports from './pages/admin/Reports';
import AdminPOS from './pages/admin/POS';
import AdminStaff from './pages/admin/Staff';
import StaffDashboard from './pages/staff/Dashboard';
import StaffPOS from './pages/staff/POS';
import LoadingScreen from './components/shared/LoadingScreen';

function ProtectedRoute({ children, role }: { children: React.ReactNode; role?: 'admin' | 'staff' }) {
  const { currentUser, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!currentUser) return <Navigate to="/login" replace />;
  if (role && currentUser.role !== role) {
    return <Navigate to={currentUser.role === 'admin' ? '/admin' : '/staff'} replace />;
  }
  return <>{children}</>;
}

export default function App() {
  const { currentUser, loading } = useAuth();

  if (loading) return <LoadingScreen />;

  return (
    <Routes>
      <Route
        path="/login"
        element={
          currentUser
            ? <Navigate to={currentUser.role === 'admin' ? '/admin' : '/staff'} replace />
            : <LoginPage />
        }
      />

      {/* Admin Routes */}
      <Route path="/admin" element={
        <ProtectedRoute role="admin"><AdminLayout /></ProtectedRoute>
      }>
        <Route index element={<AdminDashboard />} />
        <Route path="products" element={<AdminProducts />} />
        <Route path="stock" element={<AdminStock />} />
        <Route path="reports" element={<AdminReports />} />
        <Route path="pos" element={<AdminPOS />} />
        <Route path="staff" element={<AdminStaff />} />
      </Route>

      {/* Staff Routes */}
      <Route path="/staff" element={
        <ProtectedRoute role="staff"><StaffLayout /></ProtectedRoute>
      }>
        <Route index element={<StaffDashboard />} />
        <Route path="pos" element={<StaffPOS />} />
      </Route>

      {/* Default redirect */}
      <Route path="/" element={
        currentUser
          ? <Navigate to={currentUser.role === 'admin' ? '/admin' : '/staff'} replace />
          : <Navigate to="/login" replace />
      } />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
