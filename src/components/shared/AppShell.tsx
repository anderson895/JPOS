import { useState, type ReactNode } from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import { LogOut, Menu, X, Settings, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import BrandMark from '@/components/shared/BrandMark';
import { CoffeeBranch } from '@/components/shared/Decor';
import type { User } from '@/types';
import { cn } from '@/lib/utils';

export interface ShellNavItem {
  to: string;
  icon: LucideIcon;
  label: string;
  end?: boolean;
}

interface AppShellProps {
  navItems: ShellNavItem[];
  /** Shown under the JPOS wordmark ("Admin Panel", "Staff Portal"). */
  panelLabel: string;
  user: User | null;
  /** Text under the user's name in the sidebar footer. */
  roleLabel: string;
  /** Initials fallback when the user has no name. */
  fallbackInitial: string;
  onLogout: () => void;
  /** Shows the gear button when provided. */
  onOpenSettings?: () => void;
  /** Desktop icon-rail collapse (admin only). */
  collapsible?: boolean;
  /** Extra overlays (e.g. modals) rendered after the layout. */
  children?: ReactNode;
}

/**
 * Admin/staff app frame — dark espresso sidebar + cream content area,
 * following the dashboard mock in reference_UI/FullUI.png.
 */
export default function AppShell({
  navItems, panelLabel, user, roleLabel, fallbackInitial,
  onLogout, onOpenSettings, collapsible, children,
}: AppShellProps) {
  // Desktop-only collapse (icon rail). On mobile the sidebar is always full width.
  const [collapsed, setCollapsed] = useState(false);
  // Mobile drawer open/closed.
  const [mobileOpen, setMobileOpen] = useState(false);

  const initials = user?.displayName
    ?.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2) || fallbackInitial;

  // Labels/extras are hidden only when the desktop rail is collapsed.
  // On mobile the drawer always shows the expanded layout.
  const showLabels = !(collapsible && collapsed);

  const avatar = (
    <div className="w-9 h-9 rounded-full flex-shrink-0 overflow-hidden bg-caramel-200 ring-2 ring-caramel-400/50 flex items-center justify-center">
      {user?.photoURL
        ? <img src={user.photoURL} alt="" className="w-full h-full object-cover" />
        : <span className="text-espresso-800 font-semibold text-xs">{initials}</span>
      }
    </div>
  );

  return (
    <div className="flex h-screen app-bg overflow-hidden">
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          className="drawer-backdrop"
        />
      )}

      {/* Sidebar — static on desktop, slide-in drawer on mobile */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 w-64 lg:relative lg:z-auto',
          showLabels ? 'lg:w-64' : 'lg:w-[84px]',
          mobileOpen ? 'translate-x-0' : '-translate-x-full', 'lg:translate-x-0',
          'transition-all duration-300 flex-shrink-0 espresso-surface text-cream-100 flex flex-col',
          'border-r border-caramel-300/10 shadow-[8px_0_30px_-12px_rgba(28,16,9,0.6)] overflow-hidden',
        )}
      >
        <CoffeeBranch className="absolute -bottom-6 -left-16 w-72 opacity-[0.12] rotate-[-20deg]" />

        {/* Header */}
        <div className={cn('relative flex items-center gap-2 px-4 pt-5 pb-4', !showLabels && 'lg:flex-col lg:px-2')}>
          <BrandMark tone="dark" subtitle={panelLabel} iconOnly={!showLabels} />

          {/* Desktop collapse toggle */}
          {collapsible && (
            <button
              onClick={() => setCollapsed(!collapsed)}
              className={cn(
                'hidden lg:flex w-8 h-8 rounded-full items-center justify-center text-cream-200/60 hover:text-cream-50 hover:bg-white/10 transition-colors',
                showLabels && 'ml-auto',
              )}
              title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {collapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
            </button>
          )}
          {/* Mobile close */}
          <button
            onClick={() => setMobileOpen(false)}
            className="lg:hidden ml-auto w-8 h-8 rounded-full flex items-center justify-center text-cream-200/70 hover:text-cream-50 hover:bg-white/10 transition-colors"
            title="Close menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mx-4 h-px bg-gradient-to-r from-transparent via-caramel-300/25 to-transparent" />

        {/* Nav */}
        <nav className="relative flex-1 px-3 py-5 space-y-1 overflow-y-auto">
          {showLabels && <p className="px-4 pb-2 text-[10px] font-semibold tracking-[0.18em] text-cream-200/40">MENU</p>}
          {navItems.map(({ to, icon: Icon, label, end }) => (
            <NavLink
              key={to} to={to} end={end}
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) =>
                cn('sidebar-link', isActive && 'active', !showLabels && 'lg:justify-center lg:px-0 lg:w-12 lg:h-11 lg:mx-auto')
              }
              title={!showLabels ? label : undefined}
            >
              <Icon className="w-[18px] h-[18px] flex-shrink-0" />
              {showLabels && <span>{label}</span>}
            </NavLink>
          ))}
        </nav>

        {/* User */}
        <div className="relative p-3">
          <div className={cn(
            'flex items-center gap-3 p-2.5 rounded-3xl bg-white/[0.05] border border-white/[0.06]',
            !showLabels && 'lg:flex-col lg:gap-2 lg:px-1.5',
          )}>
            {avatar}
            {showLabels && (
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-cream-50 truncate">{user?.displayName}</p>
                <p className="text-xs text-caramel-200/80 capitalize">{roleLabel}</p>
              </div>
            )}
            <div className={cn('flex items-center gap-0.5', !showLabels && 'lg:flex-col')}>
              {onOpenSettings && (
                <button
                  onClick={onOpenSettings}
                  className="w-8 h-8 rounded-full flex items-center justify-center text-cream-200/60 hover:text-cream-50 hover:bg-white/10 transition-colors"
                  title="Account Settings"
                >
                  <Settings className="w-4 h-4" />
                </button>
              )}
              <button
                onClick={onLogout}
                className="w-8 h-8 rounded-full flex items-center justify-center text-cream-200/60 hover:text-red-300 hover:bg-red-500/10 transition-colors"
                title="Logout"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile top bar */}
        <header className="lg:hidden flex items-center gap-3 px-4 h-14 espresso-surface text-cream-50 flex-shrink-0 shadow-md">
          <button
            // The drawer must open expanded: if the desktop rail was left collapsed
            // (e.g. tablet rotated), it would show no labels and no logout/settings.
            onClick={() => { setCollapsed(false); setMobileOpen(true); }}
            className="w-9 h-9 -ml-1 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors"
            title="Open menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          <BrandMark tone="dark" size="sm" subtitle={panelLabel} />
          <div className="ml-auto">{avatar}</div>
        </header>

        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>

      {children}
    </div>
  );
}
