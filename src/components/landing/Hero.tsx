import { ArrowRight, BarChart3, ShieldCheck, Store, Zap } from 'lucide-react';
import { Link } from 'react-router-dom';
import LoginCard from './LoginCard';
import { Swash, Wave } from '@/components/shared/Decor';
import { scrollToSection } from './scroll';

const HIGHLIGHTS = [
  { icon: Zap, line1: 'Fast & Easy', line2: 'Transactions' },
  { icon: BarChart3, line1: 'Real-time', line2: 'Sales Reports' },
  { icon: ShieldCheck, line1: 'Secure &', line2: 'Reliable' },
];

/**
 * Landing hero: a light retail-shop photo (reference_UI/Sage Green Retail
 * Login Background.png, mirrored so the shop sits on the right), headline,
 * highlights, CTAs and the sign-in card.
 */
export default function Hero() {
  return (
    <section id="home" className="relative isolate overflow-hidden bg-cream-100 text-espresso-900">
      {/* Background photo. Phones show its calm side (cream and sage), under a light cream veil */}
      <img
        src="/images/hero-retail.jpg" alt="" aria-hidden="true"
        className="absolute inset-0 -z-10 h-full w-full object-cover object-[15%_50%] lg:object-right"
      />
      <div className="absolute inset-0 -z-10 bg-cream-100/45 lg:bg-transparent lg:bg-gradient-to-r lg:from-cream-100/45 lg:via-cream-100/10 lg:to-transparent" />

      <div className="relative max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-10 pt-28 sm:pt-32 lg:pt-36 pb-14 lg:pb-24 grid gap-10 sm:gap-12 lg:gap-10 items-center lg:grid-cols-[1.15fr_minmax(0,420px)] xl:grid-cols-[1.3fr_minmax(0,420px)]">
        {/* Copy: hidden on phones (the page opens on the sign-in card), centered on
            tablets, left-aligned next to the card on wide screens */}
        <div className="animate-slide-up hidden md:block text-center lg:text-left">
          <p className="relative inline-block whitespace-nowrap font-script text-[30px] min-[400px]:text-4xl sm:text-5xl text-caramel-600">
            Good Business <span className="mx-1 text-caramel-500">•</span> Better Days
            <Swash className="absolute left-6 -bottom-2 w-[85%] h-3 text-caramel-500/70" />
          </p>

          <h1 className="mt-5 font-display font-semibold leading-[1.02] text-[40px] min-[400px]:text-[44px] sm:text-6xl lg:text-[52px] xl:text-[68px] 2xl:text-[76px] tracking-tight">
            <span className="whitespace-nowrap">Your Business,</span>
            <br />
            <span className="relative inline-block italic text-gradient-caramel-deep pr-2">
              Simplified
              <Swash className="absolute left-0 -bottom-3 sm:-bottom-4 w-full h-4 sm:h-5 text-caramel-500" />
            </span>
          </h1>

          <p className="mx-auto lg:mx-0 mt-8 sm:mt-10 max-w-xl text-base sm:text-lg text-espresso-800/85 leading-relaxed">
            Run your store, café or service shop with JPOS.
            <br className="hidden sm:block" /> Track sales, orders, and staff — all in one place.
          </p>

          {/* Three even columns on phones (icon above the words); a row on wide screens */}
          <ul className="mx-auto lg:mx-0 mt-10 sm:mt-12 grid max-w-md grid-cols-3 gap-2 lg:flex lg:max-w-none lg:flex-wrap lg:gap-x-10 lg:gap-y-4">
            {HIGHLIGHTS.map(({ icon: Icon, line1, line2 }) => (
              <li key={line1} className="flex flex-col items-center gap-2 lg:flex-row lg:gap-3">
                <span className="w-11 h-11 sm:w-12 sm:h-12 shrink-0 rounded-full border border-caramel-300 bg-white/70 flex items-center justify-center text-caramel-600 shadow-sm backdrop-blur-sm">
                  <Icon className="w-5 h-5" aria-hidden="true" />
                </span>
                <span className="text-xs sm:text-sm font-medium leading-tight text-espresso-800">{line1}<br />{line2}</span>
              </li>
            ))}
          </ul>

          {/* Phones: one big Get Started button, Learn More under it. Wider: side by side */}
          <div className="mx-auto lg:mx-0 mt-12 sm:mt-14 flex max-w-sm flex-col items-center gap-5 sm:max-w-none sm:flex-row sm:justify-center sm:gap-8 lg:justify-start">
            {/* Straight to sign-up, with the free trial picked */}
            <Link to="/subscribe?plan=trial" className="btn-primary w-full px-7 py-3.5 text-base sm:w-auto">
              <Store className="w-5 h-5" />
              Get Started
              <ArrowRight className="w-4 h-4" />
            </Link>
            <button
              onClick={() => scrollToSection('about')}
              className="group inline-flex items-center gap-3 text-base font-semibold text-espresso-900 hover:text-caramel-700 transition-colors"
            >
              Learn More
              <span className="w-8 h-8 rounded-full border border-current flex items-center justify-center group-hover:translate-x-1 transition-transform">
                <ArrowRight className="w-4 h-4" />
              </span>
            </button>
          </div>
        </div>

        {/* Sign-in card */}
        <div className="animate-slide-up lg:flex lg:justify-end lg:[&>#login]:mr-0">
          <LoginCard />
        </div>
      </div>

      <Wave fill="#fdf7ee" className="relative -mb-px" />
    </section>
  );
}
