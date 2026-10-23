import { SageBubble, SectionTitle } from '@/components/shared/Decor';
import { FEATURES } from './content';

export default function FeaturesSection() {
  return (
    <section
      id="features"
      className="relative overflow-hidden scroll-mt-16 py-12 sm:py-20 lg:py-24"
      style={{ background: 'linear-gradient(180deg, #fdf7ee 0%, #f6e8d4 100%)' }}
    >
      {/* Soft sage circles at the sides, like the hero photo */}
      <SageBubble className="hidden md:block -left-24 top-10 h-72 w-72" />
      <SageBubble className="hidden md:block -left-6 top-48 h-40 w-40 bg-sage-200/60" />
      <SageBubble className="hidden md:block -right-28 bottom-0 h-80 w-80" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-10">
        <SectionTitle title="Key Features" subtitle="Everything you need to run your business smoothly." />

        <div className="mt-12 grid gap-3 sm:gap-5 grid-cols-2 lg:grid-cols-3 max-w-5xl mx-auto">
          {FEATURES.map(({ icon: Icon, title, text }) => (
            <div
              key={title}
              className="card-glass p-4 sm:p-7 text-center transition-all duration-300 hover:-translate-y-1 hover:shadow-lift"
            >
              <span className="mx-auto w-12 h-12 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center text-espresso-800 bg-gradient-to-b from-cream-200 to-cream-300/70 ring-1 ring-cream-400/50">
                <Icon className="w-6 h-6 sm:w-7 sm:h-7" strokeWidth={1.6} />
              </span>
              <h3 className="mt-3 sm:mt-4 font-body font-bold text-sm sm:text-[17px] leading-snug text-espresso-900">{title}</h3>
              <p className="mt-1 text-xs sm:text-sm text-bark-500 leading-relaxed max-w-[15rem] mx-auto">{text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
