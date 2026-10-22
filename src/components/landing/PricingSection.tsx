import type { CSSProperties } from 'react';
import { Check } from 'lucide-react';
import { CoffeeBean, CoffeeBranch, SectionTitle } from '@/components/shared/Decor';
import { PLANS } from './content';
import { focusLogin, scrollToSection } from './scroll';
import { cn } from '@/lib/utils';

export default function PricingSection() {
  return (
    <section
      id="pricing"
      className="relative overflow-hidden py-16 lg:py-20"
      style={{ background: 'linear-gradient(180deg, #fdf7ee 0%, #f6e8d4 100%)' }}
    >
      <CoffeeBranch className="hidden md:block absolute -left-24 top-24 w-72 opacity-50 rotate-[70deg]" />
      <CoffeeBean className="hidden lg:block absolute right-[6%] top-[22%] w-9 animate-float" style={{ '--r': '25deg' } as CSSProperties} />
      <CoffeeBean className="hidden lg:block absolute right-[9%] top-[30%] w-6 animate-float-slow" style={{ '--r': '-40deg' } as CSSProperties} />
      <CoffeeBean className="hidden lg:block absolute left-[5%] bottom-[14%] w-8 animate-float" style={{ '--r': '60deg' } as CSSProperties} />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-10">
        <SectionTitle title="Simple & Transparent Pricing" subtitle="Choose the plan that fits your business needs." />

        <div className="mt-12 grid gap-6 md:grid-cols-3 max-w-5xl mx-auto items-stretch">
          {PLANS.map(plan => (
            <div
              key={plan.name}
              className={cn(
                'relative card-glass p-7 flex flex-col text-center transition-all duration-300 hover:shadow-lift',
                plan.popular && 'ring-2 ring-espresso-800/80 md:-translate-y-3',
              )}
            >
              {plan.popular && (
                <span className="badge-dark absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 normal-case shadow-md">
                  Most Popular
                </span>
              )}
              <h3 className="font-body font-bold text-lg text-espresso-900">{plan.name}</h3>
              <p className="text-xs text-bark-500 mt-0.5">{plan.tagline}</p>
              <p className="mt-5 flex items-end justify-center gap-1">
                <span className="font-display text-5xl font-bold text-espresso-900 leading-none">{plan.price}</span>
                <span className="text-sm text-bark-500 pb-1">/month</span>
              </p>
              <ul className="mt-6 space-y-2.5 text-sm text-espresso-800 text-left mx-auto">
                {plan.features.map(f => (
                  <li key={f} className="flex items-center gap-2.5">
                    <Check className="w-4 h-4 text-espresso-800" strokeWidth={2.6} /> {f}
                  </li>
                ))}
              </ul>
              <div className="mt-auto pt-7">
                <button
                  onClick={() => (plan.action === 'login' ? focusLogin() : scrollToSection('contact'))}
                  className={cn(plan.action === 'contact' ? 'btn-outline' : 'btn-primary', plan.popular ? 'w-full' : 'px-8')}
                >
                  {plan.cta}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
