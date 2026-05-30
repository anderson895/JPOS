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
  // Desktop-only collapse (icon rail). On mobile the sidebar is always full width.
  const [collapsed, setCollapsed]       = useState(false);
  // Mobile drawer open/closed.
  const [mobileOpen, setMobileOpen]     = useState(false);
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

  // Labels/extras are hidden only when the desktop rail is collapsed.
  // On mobile the drawer always shows the expanded layout.
  const showLabels = !collapsed;

  return (
    <div className="flex h-screen bg-espresso-50 overflow-hidden">
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          className="drawer-backdrop"
        />
      )}

      {/* Sidebar — static on desktop, slide-in drawer on mobile */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-40 w-64 lg:static lg:z-auto
          ${collapsed ? 'lg:w-20' : 'lg:w-64'}
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0
          transition-all duration-300 flex-shrink-0 bg-white border-r border-cream-200 flex flex-col shadow-sm
        `}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-5 border-b border-cream-100">
          {showLabels ? (
            <div className="flex items-center gap-3">
              <img src="/coffeelogo.png" alt="JPOS" className="w-9 h-9 rounded-xl object-cover flex-shrink-0" />
              <div>
                <h1 className="font-display text-lg text-espresso-900 leading-tight">JPOS</h1>
                <span className="text-xs text-bark-400 font-body">Admin Panel</span>
              </div>
            </div>
          ) : (
            <img src="/coffeelogo.png" alt="JPOS" className="w-9 h-9 rounded-xl object-cover mx-auto" />
          )}

          {/* Desktop collapse toggle */}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="hidden lg:block text-bark-400 hover:text-espresso-600 transition-colors ml-auto"
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <Menu className="w-4 h-4" /> : <X className="w-4 h-4" />}
          </button>
          {/* Mobile close */}
          <button
            onClick={() => setMobileOpen(false)}
            className="lg:hidden text-bark-400 hover:text-espresso-600 transition-colors"
            title="Close menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map(({ to, icon: Icon, label, end }) => (
            <NavLink
              key={to} to={to} end={end}
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) =>
                `sidebar-link ${isActive ? 'active' : ''} ${!showLabels ? 'lg:justify-center lg:px-2' : ''}`
              }
              title={!showLabels ? label : undefined}
            >
              <Icon className="w-5 h-5 flex-shrink-0" />
              {showLabels && <span>{label}</span>}
              {showLabels && <ChevronRight className="w-3 h-3 ml-auto opacity-40" />}
            </NavLink>
          ))}
        </nav>

        {/* User */}
        <div className="p-3 border-t border-cream-100">
          <div className={`flex items-center gap-3 px-3 py-2.5 rounded-xl bg-cream-50 ${!showLabels ? 'lg:justify-center' : ''}`}>
            <div className="w-8 h-8 rounded-full flex-shrink-0 overflow-hidden bg-espresso-200 flex items-center justify-center">
              {currentUser?.photoURL
                ? <img src={currentUser.photoURL} alt="" className="w-full h-full object-cover" />
                : <span className="text-espresso-700 font-semibold text-xs">{initials}</span>
              }
            </div>
            {showLabels && (
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-espresso-800 truncate">{currentUser?.displayName}</p>
                <p className="text-xs text-bark-400 capitalize">{currentUser?.role}</p>
              </div>
            )}
            {showLabels && (
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
          {!showLabels && (
            <div className="hidden lg:flex flex-col gap-1 mt-2">
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

      {/* Main column */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile top bar */}
        <header className="lg:hidden flex items-center gap-3 px-4 h-14 bg-white border-b border-cream-200 flex-shrink-0">
          <button
            onClick={() => setMobileOpen(true)}
            className="text-bark-500 hover:text-espresso-600 transition-colors"
            title="Open menu"
          >
            <Menu className="w-6 h-6" />
          </button>
          <div className="flex items-center gap-2">
            <img src="/coffeelogo.png" alt="JPOS" className="w-8 h-8 rounded-lg object-cover" />
            <span className="font-display text-lg text-espresso-900">JPOS</span>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>

      {/* Account Settings Modal */}
      {settingsOpen && (
        <AccountSettingsModal onClose={() => setSettingsOpen(false)} />
      )}
    </div>
  );
}
