import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import {
  Coffee, LayoutDashboard, BarChart3,
  ShoppingCart, Users, LogOut, ChevronRight, Menu, X, Settings
} from 'lucide-react';
import { useState } from 'react';
import AccountSettingsModal from '@/components/admin/AccountSettingsModal';
import toast from 'react-hot-toast';

const navItems = [
  { to: '/admin',          icon: LayoutDashboard, label: 'Dashboard',    end: true },
  { to: '/admin/pos',      icon: ShoppingCart,    label: 'Point of Sale' },
  { to: '/admin/products', icon: Coffee,          label: 'Products' },
  { to: '/admin/reports',  icon: BarChart3,       label: 'Reports' },
  { to: '/admin/staff',    icon: Users,           label: 'Manage Staff' },
];

export default function AdminLayout() {
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen]   = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const initials = currentUser?.displayName
    ?.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2) || 'A';

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
      toast.success('Logged out successfully');
    } catch {
      toast.error('Failed to logout');
    }
  };

  return (
    <div className="flex h-screen bg-espresso-50 overflow-hidden">
      {/* Sidebar */}
      <aside className={`${sidebarOpen ? 'w-64' : 'w-20'} transition-all duration-300 flex-shrink-0 bg-white border-r border-cream-200 flex flex-col shadow-sm`}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-5 border-b border-cream-100">
          {sidebarOpen && (
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-espresso-600 rounded-xl flex items-center justify-center flex-shrink-0">
                <Coffee className="w-5 h-5 text-cream-50" />
              </div>
              <div>
                <h1 className="font-display text-lg text-espresso-900 leading-tight">JPOS</h1>
                <span className="text-xs text-bark-400 font-body">Admin Panel</span>
              </div>
            </div>
          )}
          {!sidebarOpen && (
            <div className="w-9 h-9 bg-espresso-600 rounded-xl flex items-center justify-center mx-auto">
              <Coffee className="w-5 h-5 text-cream-50" />
            </div>
          )}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="text-bark-400 hover:text-espresso-600 transition-colors ml-auto"
          >
            {sidebarOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map(({ to, icon: Icon, label, end }) => (
            <NavLink
              key={to} to={to} end={end}
              className={({ isActive }) =>
                `sidebar-link ${isActive ? 'active' : ''} ${!sidebarOpen ? 'justify-center px-2' : ''}`
              }
              title={!sidebarOpen ? label : undefined}
            >
              <Icon className="w-5 h-5 flex-shrink-0" />
              {sidebarOpen && <span>{label}</span>}
              {sidebarOpen && <ChevronRight className="w-3 h-3 ml-auto opacity-40" />}
            </NavLink>
          ))}
        </nav>

        {/* User */}
        <div className="p-3 border-t border-cream-100">
          <div className={`flex items-center gap-3 px-3 py-2.5 rounded-xl bg-cream-50 ${!sidebarOpen ? 'justify-center' : ''}`}>
            <div className="w-8 h-8 rounded-full flex-shrink-0 overflow-hidden bg-espresso-200 flex items-center justify-center">
              {currentUser?.photoURL
                ? <img src={currentUser.photoURL} alt="" className="w-full h-full object-cover" />
                : <span className="text-espresso-700 font-semibold text-xs">{initials}</span>
              }
            </div>
            {sidebarOpen && (
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-espresso-800 truncate">{currentUser?.displayName}</p>
                <p className="text-xs text-bark-400 capitalize">{currentUser?.role}</p>
              </div>
            )}
            {sidebarOpen && (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setSettingsOpen(true)}
                  className="text-bark-400 hover:text-espresso-600 transition-colors"
                  title="Account Settings"
                >
                  <Settings className="w-4 h-4" />
                </button>
                <button
                  onClick={handleLogout}
                  className="text-bark-400 hover:text-red-500 transition-colors"
                  title="Logout"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
          {!sidebarOpen && (
            <div className="flex flex-col gap-1 mt-2">
              <button
                onClick={() => setSettingsOpen(true)}
                className="w-full flex items-center justify-center py-1.5 text-bark-400 hover:text-espresso-600 transition-colors"
                title="Account Settings"
              >
                <Settings className="w-4 h-4" />
              </button>
              <button
                onClick={handleLogout}
                className="w-full flex items-center justify-center py-1.5 text-bark-400 hover:text-red-500 transition-colors"
                title="Logout"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>

      {/* Account Settings Modal */}
      {settingsOpen && (
        <AccountSettingsModal onClose={() => setSettingsOpen(false)} />
      )}
    </div>
  );
}