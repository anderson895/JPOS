import { useRef, useState } from 'react';
import { Star } from 'lucide-react';
import { SectionTitle } from '@/components/shared/Decor';
import { TESTIMONIALS } from './content';
import { cn } from '@/lib/utils';

const initials = (name: string) => name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();

/** Three quote cards — a swipeable row with dots on small screens, a grid on desktop. */
export default function TestimonialsSection() {
  const rowRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);

  const onScroll = () => {
    const row = rowRef.current;
    if (!row || !row.firstElementChild) return;
    const cardWidth = (row.firstElementChild as HTMLElement).offsetWidth + 16;
    setIndex(Math.round(row.scrollLeft / cardWidth));
  };

  const goTo = (i: number) => {
    const card = rowRef.current?.children[i] as HTMLElement | undefined;
    card?.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
  };

  return (
    <section className="relative bg-cream-100 py-16 lg:py-20 overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10">
        <SectionTitle title="What Our Customers Say" subtitle="What small business owners like about JPOS." />

        <div
          ref={rowRef}
          onScroll={onScroll}
          className="mt-10 flex gap-4 overflow-x-auto snap-x snap-mandatory scrollbar-none pb-2 md:grid md:grid-cols-3 md:gap-6 md:overflow-visible"
        >
          {TESTIMONIALS.map(t => (
            <figure key={t.name} className="card-glass p-6 flex gap-4 snap-start flex-shrink-0 w-[85%] sm:w-[60%] md:w-auto">
              <span className="w-14 h-14 rounded-full flex-shrink-0 flex items-center justify-center font-display text-lg font-semibold text-cream-50 bg-gradient-to-br from-caramel-500 to-espresso-700 ring-4 ring-cream-50 shadow-md">
                {initials(t.name)}
              </span>
              <div className="min-w-0">
                <div className="flex gap-0.5 text-caramel-500" aria-label="5 out of 5 stars">
                  {[...Array(5)].map((_, i) => <Star key={i} className="w-4 h-4 fill-current" />)}
                </div>
                <blockquote className="mt-2 text-sm text-espresso-800 leading-relaxed">“{t.quote}”</blockquote>
                <figcaption className="mt-3">
                  <p className="text-sm font-semibold text-espresso-900">— {t.name}</p>
                  <p className="text-xs text-bark-500">{t.role}</p>
                </figcaption>
              </div>
            </figure>
          ))}
        </div>

        <p className="mt-4 text-center text-xs text-bark-400">Sample reviews for illustration.</p>

        {/* Dots — only meaningful while the row scrolls (below md) */}
        <div className="mt-6 flex justify-center gap-2 md:hidden">
          {TESTIMONIALS.map((t, i) => (
            <button
              key={t.name}
              onClick={() => goTo(i)}
              aria-label={`Show testimonial ${i + 1}`}
              className={cn('h-2.5 rounded-full transition-all', i === index ? 'w-6 bg-espresso-800' : 'w-2.5 bg-cream-500')}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
