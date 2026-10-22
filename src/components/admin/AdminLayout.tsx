import { useNavigate } from 'react-router-dom';
import { signedOutHome } from '@/lib/terminal';
import { useAuth } from '@/contexts/AuthContext';
import { Coffee, LayoutDashboard, BarChart3, ShoppingCart, Users, Wallet } from 'lucide-react';
import { useState } from 'react';
import AppShell, { type ShellNavItem } from '@/components/shared/AppShell';
import AccountSettingsModal from '@/components/admin/AccountSettingsModal';
import toast from 'react-hot-toast';

const navItems: ShellNavItem[] = [
  { to: '/admin',          icon: LayoutDashboard, label: 'Dashboard',    end: true },
  { to: '/admin/pos',      icon: ShoppingCart,    label: 'Point of Sale' },
  { to: '/admin/products', icon: Coffee,          label: 'Products' },
  { to: '/admin/reports',  icon: BarChart3,       label: 'Reports' },
  { to: '/admin/staff',    icon: Users,           label: 'Manage Staff' },
  { to: '/admin/payments', icon: Wallet,          label: 'Payment Settings' },
];

export default function AdminLayout() {
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();
  const [settingsOpen, setSettingsOpen] = useState(false);

  const handleLogout = async () => {
    try {
      await logout();
      navigate(signedOutHome());
      toast.success('Logged out successfully');
    } catch {
      toast.error('Failed to logout');
    }
  };

  // Sidebar, collapse rail and mobile drawer live in AppShell
  // (incl. "drawer always opens expanded" — setCollapsed(false) on open).
  return (
    <AppShell
      navItems={navItems}
      panelLabel="Admin Panel"
      user={currentUser}
      roleLabel={currentUser?.role ?? 'admin'}
      fallbackInitial="A"
      onLogout={handleLogout}
      onOpenSettings={() => setSettingsOpen(true)}
      collapsible
    >
      {/* Account Settings Modal */}
      {settingsOpen && (
        <AccountSettingsModal onClose={() => setSettingsOpen(false)} />
      )}
    </AppShell>
  );
}
