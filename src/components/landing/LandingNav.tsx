import { useEffect, useRef, useState } from 'react';
import { Download, Home, Info, LayoutGrid, Loader2, Mail, Lock } from 'lucide-react';
import BrandMark from '@/components/shared/BrandMark';
import InstallAppButton, { useInstallAction } from '@/components/shared/InstallApp';
import { NAV_LINKS } from './content';
import { focusLogin, scrollToSection } from './scroll';
import { cn } from '@/lib/utils';

const ICONS = { home: Home, about: Info, features: LayoutGrid, contact: Mail };

/**
 * Fixed landing navbar: transparent over the light hero, then it fades into
 * frosted cream as the page scrolls (gradually, not in one jump). Dark text
 * throughout, so it reads on the light hero and on the bar. No border line.
 * Phones: the links are tabs at the bottom of the screen, like an app.
 */
export default function LandingNav() {
  const [scrolled, setScrolled] = useState(false);
  const [active, setActive] = useState<string>('home');
  const headerRef = useRef<HTMLElement>(null);
  const installer = useInstallAction();
  const canInstall = !!installer.way && installer.way !== 'installed';

  useEffect(() => {
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        // 0 at the top → 1 after 140 px: the background, blur and shadow follow it
        headerRef.current?.style.setProperty('--nav-solid', String(Math.min(1, window.scrollY / 140)));
        setScrolled(window.scrollY > 24);
        // Active link = last section whose top has passed under the navbar.
        let current: string = NAV_LINKS[0].id;
        for (const { id } of NAV_LINKS) {
          const el = document.getElementById(id);
          if (el && el.getBoundingClientRect().top <= 140) current = id;
        }
        // At the very bottom the footer (contact) may never reach the top.
        if (window.innerHeight + window.scrollY >= document.body.scrollHeight - 4) current = 'contact';
        setActive(current);
      });
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => { cancelAnimationFrame(frame); window.removeEventListener('scroll', onScroll); };
  }, []);

  const go = (id: string) => scrollToSection(id);

  return (
    <>
    <header
      ref={headerRef}
      className="fixed inset-x-0 top-0 z-40 [--nav-solid:0]"
      style={{
        backgroundColor: 'rgb(var(--cream-50) / calc(var(--nav-solid) * 0.9))',
        boxShadow: '0 12px 30px -18px rgb(var(--espresso-900) / calc(var(--nav-solid) * 0.35))',
        backdropFilter: 'blur(calc(var(--nav-solid) * 14px))',
        WebkitBackdropFilter: 'blur(calc(var(--nav-solid) * 14px))',
      }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10">
        <div className={cn('flex items-center justify-between gap-4 transition-[height] duration-300 ease-out', scrolled ? 'h-16' : 'h-20')}>
          <button onClick={() => go('home')} className="text-left" aria-label="JPOS home">
            <BrandMark subtitle="Point of Sale" />
          </button>

          {/* Desktop links */}
          <nav className="hidden md:flex items-center gap-1 lg:gap-2" aria-label="Main">
            {NAV_LINKS.map(({ id, label }) => {
              const Icon = ICONS[id];
              const isActive = active === id;
              return (
                <button
                  key={id}
                  onClick={() => go(id)}
                  aria-current={isActive ? 'true' : undefined}
                  className={cn(
                    'inline-flex items-center gap-2 px-3 lg:px-5 py-2 rounded-full text-sm font-medium transition-all',
                    isActive
                      ? 'text-cream-50 border border-espresso-800 bg-espresso-800 shadow-[0_8px_20px_-10px_rgb(var(--espresso-900)/0.7)]'
                      : 'text-espresso-800 border border-transparent hover:bg-white/60 hover:text-espresso-950',
                  )}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </button>
              );
            })}
          </nav>

          <div className="flex items-center gap-2">
            <InstallAppButton variant="nav" className="hidden md:inline-flex" />
            <button
              onClick={focusLogin}
              className="btn border border-espresso-800/60 bg-white/50 text-espresso-900 hover:bg-espresso-900 hover:text-cream-50 px-4 sm:px-5"
            >
              <Lock className="w-4 h-4" />
              Login
            </button>
          </div>
        </div>
      </div>
    </header>

    {/* Phones: tabs at the bottom, like an app (the page leaves room for them) */}
    <nav
      aria-label="Main"
      className="md:hidden fixed inset-x-0 bottom-0 z-40 grid border-t border-cream-300/80 bg-cream-50/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-10px_30px_-18px_rgb(var(--espresso-900)/0.45)] backdrop-blur-md"
      style={{ gridTemplateColumns: `repeat(${NAV_LINKS.length + (canInstall ? 1 : 0)}, minmax(0, 1fr))` }}
    >
      {NAV_LINKS.map(({ id, label }) => {
        const Icon = ICONS[id];
        const isActive = active === id;
        return (
          <button
            key={id}
            onClick={() => go(id)}
            aria-current={isActive ? 'true' : undefined}
            className={cn('flex h-16 flex-col items-center justify-center gap-1 text-[11px] transition-colors', isActive ? 'font-semibold text-espresso-900' : 'font-medium text-bark-500')}
          >
            <span className={cn('flex h-7 w-12 items-center justify-center rounded-full transition-colors', isActive && 'bg-espresso-800 text-cream-50')}>
              <Icon className="h-5 w-5" aria-hidden="true" />
            </span>
            {label}
          </button>
        );
      })}
      {canInstall && (
        <button
          onClick={installer.install}
          disabled={installer.busy}
          className="flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-semibold text-caramel-700"
        >
          <span className="flex h-7 w-12 items-center justify-center rounded-full bg-caramel-100">
            {installer.busy ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : <Download className="h-5 w-5" aria-hidden="true" />}
          </span>
          Install
        </button>
      )}
    </nav>
    {installer.steps}
    </>
  );
}
