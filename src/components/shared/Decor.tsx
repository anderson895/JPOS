import { useId, type CSSProperties } from 'react';
import { cn } from '@/lib/utils';

/** A roasted coffee bean (SVG) — used as floating decoration. */
export function CoffeeBean({ className, style }: { className?: string; style?: CSSProperties }) {
  // Unique per bean: a shared id breaks when the first bean is display:none.
  const gradId = `bean-${useId().replace(/:/g, '')}`;
  return (
    <svg viewBox="0 0 40 56" className={className} style={style} aria-hidden="true">
      <defs>
        <radialGradient id={gradId} cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#8a5531" />
          <stop offset="55%" stopColor="#4a2a16" />
          <stop offset="100%" stopColor="#24130a" />
        </radialGradient>
      </defs>
      <ellipse cx="20" cy="28" rx="18" ry="26" fill={`url(#${gradId})`} />
      <path d="M20 4 C 10 18, 30 36, 20 52" fill="none" stroke="#1a0d06" strokeWidth="3" strokeLinecap="round" opacity="0.85" />
      <ellipse cx="13" cy="17" rx="4" ry="8" fill="#fff" opacity="0.12" transform="rotate(-18 13 17)" />
    </svg>
  );
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

/** Line-art coffee branch from reference_UI (transparent PNG). */
export function CoffeeBranch({ className, style }: { className?: string; style?: CSSProperties }) {
  return <img src="/images/coffee-branch.png" alt="" aria-hidden="true" draggable={false} className={cn('pointer-events-none select-none', className)} style={style} />;
}
