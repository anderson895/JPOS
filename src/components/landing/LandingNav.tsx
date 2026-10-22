import { useEffect, useState } from 'react';
import { Home, Info, LayoutGrid, Mail, Lock, Menu, X } from 'lucide-react';
import BrandMark from '@/components/shared/BrandMark';
import { NAV_LINKS } from './content';
import { focusLogin, scrollToSection } from './scroll';
import { cn } from '@/lib/utils';

const ICONS = { home: Home, about: Info, features: LayoutGrid, contact: Mail };

/** Fixed landing navbar: transparent over the hero, solid espresso once scrolled. */
export default function LandingNav() {
  const [scrolled, setScrolled] = useState(false);
  const [active, setActive] = useState<string>('home');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
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
      className={cn(
        'fixed inset-x-0 top-0 z-40 transition-all duration-300',
        scrolled || open
          ? 'bg-espresso-950/90 backdrop-blur-md border-b border-caramel-300/15 shadow-[0_10px_30px_-15px_rgba(0,0,0,0.7)]'
          : 'bg-transparent',
      )}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10">
        <div className={cn('flex items-center justify-between gap-4 transition-all', scrolled ? 'h-16' : 'h-20')}>
          <button onClick={() => go('home')} className="text-left" aria-label="JPOS home">
            <BrandMark tone="dark" subtitle="Point of Sale" />
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
                      ? 'text-cream-50 border border-caramel-400/70 bg-gradient-to-b from-caramel-700/50 to-espresso-900/60 shadow-glow'
                      : 'text-cream-100/85 border border-transparent hover:text-caramel-200',
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
              className="btn border border-cream-100/55 text-cream-50 hover:bg-cream-50 hover:text-espresso-900 px-4 sm:px-5"
            >
              <Lock className="w-4 h-4" />
              Login
            </button>
            <button
              onClick={() => setOpen(o => !o)}
              className="md:hidden w-10 h-10 rounded-full flex items-center justify-center text-cream-50 hover:bg-white/10"
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
                        ? 'border-caramel-400/60 bg-caramel-700/30 text-cream-50'
                        : 'border-cream-100/10 bg-white/[0.04] text-cream-100/85',
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
