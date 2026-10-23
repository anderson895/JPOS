import { ArrowRight, CheckCircle2 } from 'lucide-react';
import DashboardMock from './DashboardMock';
import { Wave } from '@/components/shared/Decor';
import { DASHBOARD_POINTS } from './content';
import { scrollToSection } from './scroll';

/** Dark "Powerful Dashboard" band with the dashboard preview. */
export default function DashboardSection() {
  return (
    <section className="relative espresso-surface text-cream-50 overflow-hidden">
      <Wave fill="#f6e8d4" flip className="relative -mt-px" />
      <div className="absolute right-0 top-1/3 w-[520px] h-[520px] rounded-full bg-caramel-500/10 blur-3xl pointer-events-none" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-14 lg:py-16 grid gap-12 items-center lg:grid-cols-[0.75fr_1.25fr]">
        <div>
          <h2 className="font-display text-4xl sm:text-5xl font-semibold leading-tight">
            Powerful
            <br />
            Dashboard
          </h2>
          <p className="mt-5 max-w-sm text-cream-100/80 leading-relaxed text-base sm:text-lg">
            Get a clear overview of your business performance in real-time.
          </p>
          <ul className="mt-6 space-y-3">
            {DASHBOARD_POINTS.map(point => (
              <li key={point} className="flex items-center gap-3 text-cream-50">
                <CheckCircle2 className="w-5 h-5 text-caramel-300" />
                {point}
              </li>
            ))}
          </ul>
          <button onClick={() => scrollToSection('features')} className="btn-caramel mt-8 px-6">
            Explore Features <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        <div className="relative">
          <DashboardMock />
        </div>
      </div>

      <Wave fill="#fdf7ee" className="relative -mb-px" />
    </section>
  );
}
