import { useNavigate } from 'react-router-dom';
import { signedOutHome } from '@/lib/terminal';
import { useAuth } from '@/contexts/AuthContext';
import { Coffee, LayoutDashboard, BarChart3, ShoppingCart, Users, Wallet, CreditCard, ShieldCheck } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { watchPendingRequests } from '@/lib/platform';
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
  { to: '/admin/billing',  icon: CreditCard,      label: 'Subscription' },
];

export default function AdminLayout() {
  const { currentUser, logout, isSuperAdmin } = useAuth();
  const navigate = useNavigate();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const seen = useRef<Set<string> | null>(null);

  // Super Admin: count of payments waiting, plus a browser pop-up for each new one
  useEffect(() => {
    if (!isSuperAdmin) return;
    return watchPendingRequests(rows => {
      setPendingCount(rows.length);
      if (seen.current && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        for (const r of rows) {
          if (!seen.current.has(r.id)) {
            new Notification('New JPOS payment', { body: `${r.tenantName} · ${r.plan} · PHP ${r.amount.toLocaleString('en-PH')}` });
            toast(`New payment from ${r.tenantName}`, { icon: <CreditCard className="w-4 h-4 text-caramel-600" aria-hidden="true" /> });
          }
        }
      }
      seen.current = new Set(rows.map(r => r.id));
    });
  }, [isSuperAdmin]);

  const items: ShellNavItem[] = isSuperAdmin
    ? [...navItems, { to: '/admin/platform', icon: ShieldCheck, label: pendingCount ? `Super Admin (${pendingCount})` : 'Super Admin' }]
    : navItems;

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
      navItems={items}
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
