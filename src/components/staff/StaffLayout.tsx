import { useNavigate } from 'react-router-dom';
import { signedOutHome } from '@/lib/terminal';
import { useAuth } from '@/contexts/AuthContext';
import { LayoutDashboard, ShoppingCart } from 'lucide-react';
import AppShell, { type ShellNavItem } from '@/components/shared/AppShell';
import toast from 'react-hot-toast';

const navItems: ShellNavItem[] = [
  { to: '/staff',     icon: LayoutDashboard, label: 'Dashboard', end: true },
  { to: '/staff/pos', icon: ShoppingCart,    label: 'Point of Sale' },
];

export default function StaffLayout() {
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await logout();
      navigate(signedOutHome());
      toast.success('Logged out');
    } catch {
      toast.error('Failed to logout');
    }
  };

  return (
    <AppShell
      navItems={navItems}
      panelLabel="Staff Portal"
      user={currentUser}
      roleLabel="Staff"
      fallbackInitial="S"
      onLogout={handleLogout}
    />
  );
}
