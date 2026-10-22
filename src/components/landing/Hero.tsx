import type { CSSProperties } from 'react';
import { ArrowRight, BarChart3, Coffee, ShieldCheck } from 'lucide-react';
import LoginCard from './LoginCard';
import { CoffeeBean, Swash, Wave } from '@/components/shared/Decor';
import { focusLogin, scrollToSection } from './scroll';

const HIGHLIGHTS = [
  { icon: Coffee, line1: 'Fast & Easy', line2: 'Transactions' },
  { icon: BarChart3, line1: 'Real-time', line2: 'Sales Reports' },
  { icon: ShieldCheck, line1: 'Secure &', line2: 'Reliable' },
];

// Fixed positions (no randomness, so nothing jumps between renders).
const BEANS: { className: string; rotate: number }[] = [
  { className: 'top-[20%] left-[45%] w-7 animate-float', rotate: 35 },
  { className: 'top-[43%] left-[47%] w-8 animate-float-slow', rotate: -25 },
  { className: 'top-[55%] left-[50%] w-5 animate-float', rotate: 70 },
  { className: 'top-[12%] left-[57%] w-4 animate-float-slow', rotate: 10 },
];

/** Landing hero: café photo, headline, highlights, CTAs and the sign-in card. */
export default function Hero() {
  return (
    <section id="home" className="relative isolate overflow-hidden bg-espresso-950 text-cream-50">
      {/* Background photo + readability gradients */}
      <img
        src="/images/hero-bg.jpg" alt="" aria-hidden="true"
        className="absolute inset-0 -z-10 w-full h-full object-cover object-[78%_center]"
      />
      <div className="absolute inset-0 -z-10 bg-espresso-950/70 lg:bg-transparent lg:bg-gradient-to-r lg:from-espresso-950/95 lg:via-espresso-950/65 lg:to-espresso-950/5" />
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-espresso-950/70 via-transparent to-espresso-950/60" />
      <div className="absolute -top-48 -left-48 -z-10 w-[640px] h-[640px] rounded-full bg-caramel-400/20 blur-3xl" />

      {/* Floating beans (desktop) */}
      <div className="hidden lg:block" aria-hidden="true">
        {BEANS.map((b, i) => (
          <CoffeeBean
            key={i}
            className={`absolute drop-shadow-[0_6px_8px_rgba(0,0,0,0.6)] ${b.className}`}
            style={{ '--r': `${b.rotate}deg`, transform: `rotate(${b.rotate}deg)` } as CSSProperties}
          />
        ))}
      </div>

      <div className="relative max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-10 pt-28 sm:pt-32 lg:pt-36 pb-16 lg:pb-24 grid gap-12 lg:gap-10 items-center lg:grid-cols-[1.15fr_minmax(0,420px)] xl:grid-cols-[1.3fr_minmax(0,420px)_0.22fr]">
        {/* Copy */}
        <div className="animate-slide-up">
          <p className="relative inline-block font-script text-4xl sm:text-5xl text-caramel-300">
            Good Coffee <span className="mx-1 text-caramel-400">•</span> Better Days
            <Swash className="absolute left-6 -bottom-2 w-[85%] h-3 text-caramel-400/80" />
          </p>

          <h1 className="mt-5 font-display font-semibold leading-[1.02] text-[40px] min-[400px]:text-[44px] sm:text-6xl lg:text-[52px] xl:text-[68px] 2xl:text-[76px] tracking-tight">
            <span className="whitespace-nowrap">Your Coffee Shop,</span>
            <br />
            <span className="relative inline-block italic text-gradient-caramel pr-2">
              Simplified
              <Swash className="absolute left-0 -bottom-3 sm:-bottom-4 w-full h-4 sm:h-5 text-caramel-400" />
            </span>
          </h1>

          <p className="mt-8 max-w-xl text-base sm:text-lg text-cream-100/85 leading-relaxed">
            Manage your coffee shop effortlessly with JPOS.
            <br className="hidden sm:block" /> Track sales, inventory, and orders — all in one place.
          </p>

          <ul className="mt-8 flex flex-wrap gap-x-8 gap-y-4">
            {HIGHLIGHTS.map(({ icon: Icon, line1, line2 }) => (
              <li key={line1} className="flex items-center gap-3">
                <span className="w-12 h-12 rounded-full border border-caramel-400/60 bg-espresso-900/50 flex items-center justify-center text-caramel-300 shadow-[inset_0_0_12px_rgba(221,161,94,0.25)]">
                  <Icon className="w-5 h-5" />
                </span>
                <span className="text-sm leading-tight text-cream-100/90">{line1}<br />{line2}</span>
              </li>
            ))}
          </ul>

          <div className="mt-10 flex flex-wrap items-center gap-6">
            <button onClick={focusLogin} className="btn-caramel px-7 py-3.5 text-base">
              <Coffee className="w-5 h-5" />
              Get Started
              <ArrowRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => scrollToSection('about')}
              className="group inline-flex items-center gap-3 text-base font-semibold text-cream-50 hover:text-caramel-200 transition-colors"
            >
              Learn More
              <span className="w-8 h-8 rounded-full border border-current flex items-center justify-center group-hover:translate-x-1 transition-transform">
                <ArrowRight className="w-4 h-4" />
              </span>
            </button>
          </div>

          <div className="mt-10 hidden sm:flex items-center gap-3 text-sm text-cream-100/70">
            <span className="h-px w-20 bg-gradient-to-r from-transparent to-caramel-400/60" />
            <CoffeeBean className="w-3 h-4 opacity-80" />
            Brewing Business Success
            <span className="h-px w-20 bg-gradient-to-l from-transparent to-caramel-400/60" />
          </div>
        </div>

        {/* Sign-in card */}
        <div className="animate-slide-up">
          <LoginCard />
        </div>
      </div>

      <Wave fill="#fdf7ee" className="relative -mb-px" />
    </section>
  );
}
