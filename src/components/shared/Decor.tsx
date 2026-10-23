import { cn } from '@/lib/utils';

/**
 * A soft sage circle, like the round shapes in the landing's retail photo.
 * Place it with `className` (position, size); the parent needs `relative`
 * and usually `overflow-hidden`.
 */
export function SageBubble({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cn('pointer-events-none absolute rounded-full bg-sage-300/50', className)} />;
}

/** Hand-drawn caramel underline swash (under "Simplified", script headings). */
export function Swash({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 320 24" preserveAspectRatio="none" className={className} aria-hidden="true">
      <path d="M4 17 C 70 6, 170 4, 316 11" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" />
      <path d="M40 21 C 120 13, 210 12, 290 15" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.6" />
    </svg>
  );
}

/** Soft wave that separates landing sections. `fill` is the colour of the section BELOW. */
export function Wave({ fill, className, flip }: { fill: string; className?: string; flip?: boolean }) {
  return (
    <svg
      viewBox="0 0 1440 120" preserveAspectRatio="none" aria-hidden="true"
      className={cn('block w-full h-[60px] sm:h-[90px]', flip && 'rotate-180', className)}
    >
      <path d="M0 64 C 240 120, 480 10, 760 46 C 1020 80, 1240 116, 1440 58 L1440 120 L0 120 Z" fill={fill} />
      <path d="M0 64 C 240 120, 480 10, 760 46 C 1020 80, 1240 116, 1440 58" fill="none" style={{ stroke: 'rgb(var(--caramel-400))' }} strokeOpacity="0.45" strokeWidth="1.5" />
    </svg>
  );
}

/** Centered serif heading with thin caramel rules on both sides ("Key Features"). */
export function SectionTitle({ title, subtitle, tone = 'light' }: { title: string; subtitle?: string; tone?: 'light' | 'dark' }) {
  return (
    <div className="text-center">
      <div className="flex items-center justify-center gap-4 sm:gap-6">
        <span className="hidden sm:block h-px w-24 md:w-40 bg-gradient-to-r from-transparent to-caramel-400/70" />
        <span className="hidden sm:block w-1.5 h-1.5 rotate-45 bg-caramel-400" />
        <h2 className={cn('font-display text-3xl sm:text-4xl md:text-[44px] font-semibold', tone === 'dark' ? 'text-cream-50' : 'text-espresso-900')}>
          {title}
        </h2>
        <span className="hidden sm:block w-1.5 h-1.5 rotate-45 bg-caramel-400" />
        <span className="hidden sm:block h-px w-24 md:w-40 bg-gradient-to-l from-transparent to-caramel-400/70" />
      </div>
      {subtitle && <p className={cn('mt-2 text-sm sm:text-base', tone === 'dark' ? 'text-cream-200/75' : 'text-bark-600')}>{subtitle}</p>}
    </div>
  );
}
