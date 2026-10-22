import type { CSSProperties } from 'react';
import { ArrowRight, Check } from 'lucide-react';
import { CoffeeBean, CoffeeBranch } from '@/components/shared/Decor';
import { ABOUT_POINTS } from './content';
import { scrollToSection } from './scroll';

// Organic "blob" frame used for the About photo (matches the wavy frame in the mockup).
const BLOB = '58% 42% 47% 53% / 46% 55% 45% 54%';

export default function AboutSection() {
  return (
    <section id="about" className="relative bg-cream-100 pt-10 pb-20 lg:pb-28 overflow-hidden scroll-mt-16">
      {/* Small label, top-right */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 flex justify-end">
        <p className="flex items-center gap-3 text-[11px] font-semibold tracking-[0.2em] text-caramel-600">
          <span className="h-px w-16 bg-gradient-to-r from-transparent to-caramel-500/70" />
          GOOD SERVICE <span className="text-caramel-400">•</span> GREAT BUSINESS
        </p>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 mt-8 grid gap-14 lg:gap-16 items-center lg:grid-cols-[0.95fr_1.05fr]">
        {/* Copy */}
        <div>
          <h2 className="flex items-end gap-3">
            <span className="font-script text-6xl sm:text-7xl text-caramel-500 leading-none">About</span>
            <span className="font-display text-5xl sm:text-6xl font-semibold text-espresso-900 leading-none pb-1">JPOS</span>
          </h2>
          <p className="mt-4 text-lg font-semibold text-espresso-800">A Smart Solution for Your Small Business</p>
          <p className="mt-4 max-w-lg text-bark-600 leading-relaxed">
            JPOS is a modern, easy-to-use point of sale for small businesses: cafés, milk tea
            shops, sari-sari stores, salons and more. From sales and orders to detailed reports,
            everything you need is in one powerful tool.
          </p>
          <ul className="mt-6 space-y-3">
            {ABOUT_POINTS.map(point => (
              <li key={point} className="flex items-center gap-3 text-espresso-800">
                <span className="w-5 h-5 rounded-full bg-espresso-800 text-cream-50 flex items-center justify-center flex-shrink-0">
                  <Check className="w-3 h-3" strokeWidth={3} />
                </span>
                {point}
              </li>
            ))}
          </ul>
          <button onClick={() => scrollToSection('features')} className="btn-primary mt-8 px-6">
            Learn More <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        {/* Photo in blob frame */}
        <div className="relative mx-auto w-full max-w-xl">
          <CoffeeBranch className="absolute -top-14 -right-10 w-56 opacity-70 rotate-[18deg] z-10" />
          <div
            className="absolute -inset-3 sm:-inset-4 bg-gradient-to-br from-caramel-200 via-cream-300 to-caramel-300/70"
            style={{ borderRadius: BLOB }}
          />
          <img
            src="/images/about.jpg"
            alt="A latte with heart art on a wooden café counter"
            className="relative w-full aspect-[5/4] object-cover shadow-lift"
            style={{ borderRadius: BLOB }}
            loading="lazy"
          />
          <CoffeeBean className="absolute -left-6 top-[58%] w-8 animate-float" style={{ '--r': '-30deg' } as CSSProperties} />
          <CoffeeBean className="absolute -left-2 top-[72%] w-6 animate-float-slow" style={{ '--r': '40deg' } as CSSProperties} />
          <CoffeeBean className="absolute right-[12%] -bottom-6 w-7 animate-float" style={{ '--r': '75deg' } as CSSProperties} />
        </div>
      </div>
    </section>
  );
}
