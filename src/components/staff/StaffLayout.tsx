import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Coffee, LayoutDashboard, ShoppingCart, LogOut } from 'lucide-react';
import toast from 'react-hot-toast';

export default function StaffLayout() {
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
      toast.success('Logged out');
    } catch {
      toast.error('Failed to logout');
    }
  };

  return (
    <div className="flex h-screen bg-espresso-50 overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 flex-shrink-0 bg-white border-r border-cream-200 flex flex-col shadow-sm">
        <div className="flex items-center gap-3 px-5 py-5 border-b border-cream-100">
          <div className="w-9 h-9 bg-espresso-600 rounded-xl flex items-center justify-center">
            <Coffee className="w-5 h-5 text-cream-50" />
          </div>
          <div>
            <h1 className="font-display text-lg text-espresso-900">JPOS</h1>
            <span className="text-xs text-bark-400">Staff Portal</span>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          <NavLink to="/staff" end className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
            <LayoutDashboard className="w-5 h-5" />
            <span>Dashboard</span>
          </NavLink>
          <NavLink to="/staff/pos" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
            <ShoppingCart className="w-5 h-5" />
            <span>Point of Sale</span>
          </NavLink>
        </nav>

        <div className="p-3 border-t border-cream-100">
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-cream-50">
            <div className="w-8 h-8 bg-espresso-200 rounded-full flex items-center justify-center text-espresso-700 font-semibold text-sm">
              {currentUser?.displayName?.[0]?.toUpperCase() || 'S'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-espresso-800 truncate">{currentUser?.displayName}</p>
              <p className="text-xs text-bark-400">Staff</p>
            </div>
            <button onClick={handleLogout} className="text-bark-400 hover:text-red-500 transition-colors">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
