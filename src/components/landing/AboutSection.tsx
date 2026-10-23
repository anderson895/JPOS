import { ArrowRight, Check } from 'lucide-react';
import { ABOUT_POINTS } from './content';
import { scrollToSection } from './scroll';

export default function AboutSection() {
  return (
    <section id="about" className="relative bg-cream-100 pt-8 sm:pt-10 pb-12 sm:pb-20 lg:pb-28 overflow-hidden scroll-mt-16">
      {/* Small label, top-right */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 flex justify-end">
        <p className="flex items-center gap-3 text-[11px] font-semibold tracking-[0.2em] text-caramel-600">
          <span className="h-px w-16 bg-gradient-to-r from-transparent to-caramel-500/70" />
          GOOD SERVICE <span className="text-caramel-400">•</span> GREAT BUSINESS
        </p>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 mt-8 grid gap-10 sm:gap-14 lg:gap-16 items-center lg:grid-cols-[0.95fr_1.05fr]">
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

        {/* The JPOS counter: POS terminal + receipt printer standing side by side, no frame */}
        <div className="relative mx-auto flex w-full max-w-xl items-end justify-center pb-4">
          {/* Soft floor shadow under the devices */}
          <div className="absolute inset-x-[6%] bottom-3 h-8 rounded-[50%] bg-espresso-900/15 blur-xl" aria-hidden="true" />
          <img
            src="/images/pos/terminal.webp"
            alt="A JPOS point-of-sale terminal with a receipt printer"
            width={512} height={453}
            className="relative w-[64%] drop-shadow-[0_24px_28px_rgba(40,30,20,0.3)]"
            loading="lazy"
          />
          <img
            src="/images/pos/receipt-printer.webp" alt=""
            width={308} height={308}
            className="relative -ml-[2%] w-[34%] drop-shadow-[0_18px_22px_rgba(40,30,20,0.28)]"
            loading="lazy"
          />
        </div>
      </div>
    </section>
  );
}
