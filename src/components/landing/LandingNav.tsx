import { useEffect, useRef, useState } from 'react';
import { Home, Info, LayoutGrid, Mail, Lock, Menu, X } from 'lucide-react';
import BrandMark from '@/components/shared/BrandMark';
import { NAV_LINKS } from './content';
import { focusLogin, scrollToSection } from './scroll';
import { cn } from '@/lib/utils';

const ICONS = { home: Home, about: Info, features: LayoutGrid, contact: Mail };

/**
 * Fixed landing navbar: transparent over the light hero, then it fades into
 * frosted cream as the page scrolls (gradually, not in one jump). Dark text
 * throughout, so it reads on the light hero and on the bar. No border line.
 */
export default function LandingNav() {
  const [scrolled, setScrolled] = useState(false);
  const [active, setActive] = useState<string>('home');
  const [open, setOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);

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

  const go = (id: string) => { setOpen(false); scrollToSection(id); };

  return (
    <header
      ref={headerRef}
      className={cn('fixed inset-x-0 top-0 z-40 [--nav-solid:0]', open && '![--nav-solid:1]')}
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
                    'inline-flex items-center gap-2 px-4 lg:px-5 py-2 rounded-full text-sm font-medium transition-all',
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
            <button
              onClick={() => { setOpen(false); focusLogin(); }}
              className="btn border border-espresso-800/60 bg-white/50 text-espresso-900 hover:bg-espresso-900 hover:text-cream-50 px-4 sm:px-5"
            >
              <Lock className="w-4 h-4" />
              Login
            </button>
            <button
              onClick={() => setOpen(o => !o)}
              className="md:hidden w-10 h-10 rounded-full flex items-center justify-center text-espresso-900 hover:bg-espresso-900/5"
              aria-label={open ? 'Close menu' : 'Open menu'}
              aria-expanded={open}
            >
              {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {open && (
          <nav className="md:hidden pb-4 animate-fade-in" aria-label="Main">
            <div className="grid grid-cols-2 gap-2">
              {NAV_LINKS.map(({ id, label }) => {
                const Icon = ICONS[id];
                return (
                  <button
                    key={id}
                    onClick={() => go(id)}
                    className={cn(
                      'flex items-center gap-2 px-4 py-3 rounded-2xl text-sm font-medium border',
                      active === id
                        ? 'border-espresso-800 bg-espresso-800 text-cream-50'
                        : 'border-cream-300 bg-white/70 text-espresso-800',
                    )}
                  >
                    <Icon className="w-4 h-4" /> {label}
                  </button>
                );
              })}
            </div>
          </nav>
        )}
      </div>
    </header>
  );
}
