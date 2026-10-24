import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import { Loader2, LogOut, Menu, X, Settings, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import BrandMark from '@/components/shared/BrandMark';
import { applyTheme } from '@/components/shared/theme';
import { useAuth, useStoreBrand } from '@/contexts/AuthContext';
import { hasFeature } from '@/lib/entitlements';
import { logActivity, setActivityLogging } from '@/lib/activity';
import InstallAppButton from '@/components/shared/InstallApp';
import SubscriptionBanner from '@/components/shared/SubscriptionBanner';
import FeedbackBubble from '@/components/shared/FeedbackBubble';
import type { User } from '@/types';
import { cn } from '@/lib/utils';

export interface ShellNavItem {
  to: string;
  icon: LucideIcon;
  label: string;
  /** The label in the phone tab bar (short: "POS", "Home"). */
  short?: string;
  end?: boolean;
}

/** Phones and tablets: this many pages get their own tab; the rest are under "More". */
const TABS = 4;

interface AppShellProps {
  navItems: ShellNavItem[];
  /** Shown under the JPOS wordmark ("Admin Panel", "Staff Portal"). */
  panelLabel: string;
  user: User | null;
  /** Text under the user's name in the sidebar footer. */
  roleLabel: string;
  /** Initials fallback when the user has no name. */
  fallbackInitial: string;
  onLogout: () => void | Promise<void>;
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

  // The shop's own name, logo and colors (Store Settings). Leaving the app
  // (sign-out) puts the JPOS colors back for the public pages.
  const brand = useStoreBrand();
  // Audit trail (Business and up): actions are recorded with this person's name
  const { tenant, isSuperAdmin } = useAuth();
  const auditOn = hasFeature(tenant, 'auditTrail');
  useEffect(() => {
    setActivityLogging(auditOn, user?.displayName || user?.email || '');
    if (!auditOn || !user?.id) return;
    const key = `jpos-signin-logged-${user.id}`;
    try { if (sessionStorage.getItem(key)) return; sessionStorage.setItem(key, '1'); } catch { /* no session storage */ }
    logActivity('signin');
  }, [auditOn, user?.id, user?.displayName, user?.email]);
  useEffect(() => () => setActivityLogging(false, ''), []);
  useEffect(() => { applyTheme(brand.theme); }, [brand.theme]);
  useEffect(() => () => applyTheme(null), []);

  // <main> is shared by every page, so its scroll position would carry over
  // (e.g. Reports opening half-way down after scrolling the Dashboard).
  const { pathname } = useLocation();
  const mainRef = useRef<HTMLElement>(null);
  useEffect(() => { mainRef.current?.scrollTo(0, 0); }, [pathname]);

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

  // Phones and tablets: the first pages are tabs at the bottom, the rest open from "More"
  const tabs = navItems.slice(0, TABS);
  const isOn = (t: ShellNavItem) => (t.end ? pathname === t.to : pathname === t.to || pathname.startsWith(t.to + '/'));
  const onATab = tabs.some(isOn);

  // h-dvh: on phones 100vh is taller than the visible area (the toolbar would cover the bottom).
  // --tabbar-h: the bottom tab bar's height, so bars fixed at the bottom (the POS "View Order") sit above it.
  return (
    <div className="flex h-dvh app-bg overflow-hidden [--tabbar-h:calc(4rem+env(safe-area-inset-bottom))] lg:[--tabbar-h:0px]">
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
          'border-r border-caramel-300/10 overflow-hidden lg:shadow-[8px_0_30px_-12px_rgb(var(--espresso-950)/0.6)]',
          mobileOpen && 'shadow-[8px_0_30px_-12px_rgb(var(--espresso-950)/0.6)]',
          // Closed drawer is only off-screen; hide it so Tab skips its links.
          // transition-all keeps it visible while it slides out.
          !mobileOpen && 'max-lg:invisible',
        )}
      >

        {/* Header */}
        <div className={cn('relative flex items-center gap-2 px-4 pt-5 pb-4', !showLabels && 'lg:flex-col lg:px-2')}>
          <BrandMark tone="dark" subtitle={panelLabel} iconOnly={!showLabels} name={brand.name} logoUrl={brand.logoUrl} />

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

        {/* Install as an app (hidden once installed, or where the browser can't) */}
        <div className="relative px-3">
          <InstallAppButton variant="sidebar" iconOnly={!showLabels} />
        </div>

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
          <BrandMark tone="dark" size="sm" subtitle={panelLabel} name={brand.name} logoUrl={brand.logoUrl} />
          {/* The avatar opens Account Settings and Logout (on phones the sidebar is hidden) */}
          <AccountMenu
            avatar={avatar}
            name={user?.displayName ?? ''}
            roleLabel={roleLabel}
            onLogout={onLogout}
            onOpenSettings={onOpenSettings}
          />
        </header>

        {/* relative: hidden screen-reader labels (sr-only) far down a long page stay
            inside this scroll area instead of stretching the whole window (an empty
            strip under the sidebar) */}
        <main ref={mainRef} className="relative flex-1 overflow-y-auto">
          <SubscriptionBanner />
          <Outlet />
        </main>

        {/* Phones and tablets: tabs at the bottom, like a phone app. "More" opens the full menu. */}
        <nav
          aria-label="Main"
          className="lg:hidden relative z-30 flex-shrink-0 grid espresso-surface border-t border-caramel-300/15 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_24px_-16px_rgb(var(--espresso-950)/0.7)]"
          style={{ gridTemplateColumns: `repeat(${tabs.length + 1}, minmax(0, 1fr))` }}
        >
          {tabs.map(t => (
            <NavLink
              key={t.to} to={t.to} end={t.end}
              className={({ isActive }) => cn(
                'flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors',
                isActive ? 'text-caramel-200' : 'text-cream-200/65 hover:text-cream-50',
              )}
            >
              {({ isActive }) => (
                <>
                  <span className={cn('flex h-7 w-12 items-center justify-center rounded-full transition-colors', isActive && 'bg-caramel-300/20')}>
                    <t.icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <span className="max-w-full truncate px-1">{t.short ?? t.label}</span>
                </>
              )}
            </NavLink>
          ))}
          <button
            type="button"
            // The menu opens expanded: if the desktop rail was left collapsed (a
            // rotated tablet), it would show no labels and no logout or settings.
            onClick={() => { setCollapsed(false); setMobileOpen(true); }}
            aria-expanded={mobileOpen}
            className={cn(
              'flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors',
              !onATab ? 'text-caramel-200' : 'text-cream-200/65 hover:text-cream-50',
            )}
          >
            <span className={cn('flex h-7 w-12 items-center justify-center rounded-full transition-colors', !onATab && 'bg-caramel-300/20')}>
              <Menu className="h-5 w-5" aria-hidden="true" />
            </span>
            More
          </button>
        </nav>
      </div>

      {/* Feedback for the Super Admin. Not on the point of sale (it would cover the
          order total and Checkout), and not for the Super Admin, who reads it */}
      {!isSuperAdmin && !/\/pos$/.test(pathname) && <FeedbackBubble />}

      {children}
    </div>
  );
}

/** Phones: the avatar in the top bar opens a small menu with Account Settings and Logout. */
function AccountMenu({ avatar, name, roleLabel, onLogout, onOpenSettings }: {
  avatar: ReactNode;
  name: string;
  roleLabel: string;
  onLogout: () => void | Promise<void>;
  onOpenSettings?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { pathname } = useLocation();

  // Closes on another page, a tap outside, or Escape
  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const logout = async () => {
    setLeaving(true);
    try { await onLogout(); } finally { setLeaving(false); }
  };

  return (
    <div ref={ref} className="relative ml-auto">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        className="rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-caramel-300"
      >
        {avatar}
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Account"
          className="absolute right-0 top-full z-50 mt-2 w-60 rounded-2xl border border-cream-300 bg-cream-50 p-1.5 text-espresso-900 shadow-lift animate-fade-in"
        >
          <div className="mb-1 border-b border-cream-300/70 px-3 py-2.5">
            <p className="truncate text-sm font-semibold">{name || 'Signed in'}</p>
            <p className="text-xs capitalize text-bark-500">{roleLabel}</p>
          </div>
          {onOpenSettings && (
            <button
              type="button"
              role="menuitem"
              onClick={() => { setOpen(false); onOpenSettings(); }}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors hover:bg-cream-200"
            >
              <Settings className="h-4 w-4 text-bark-500" aria-hidden="true" />
              Account Settings
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            onClick={logout}
            disabled={leaving}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-60"
          >
            {leaving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <LogOut className="h-4 w-4" aria-hidden="true" />}
            {leaving ? 'Logging out…' : 'Logout'}
          </button>
        </div>
      )}
    </div>
  );
}
