import { cn } from '@/lib/utils';

interface BrandMarkProps {
  /** `dark` = placed on an espresso background (cream text). */
  tone?: 'light' | 'dark';
  subtitle?: string;
  size?: 'sm' | 'md' | 'lg';
  /** Hide the wordmark and show only the logo tile (collapsed sidebar). */
  iconOnly?: boolean;
  className?: string;
}

const TILE = { sm: 'w-9 h-9 rounded-xl', md: 'w-11 h-11 rounded-2xl', lg: 'w-14 h-14 rounded-2xl' };
const WORD = { sm: 'text-lg', md: 'text-xl', lg: 'text-2xl' };

/** JPOS logo tile + wordmark, as in the reference navbar and sidebar. */
export default function BrandMark({ tone = 'light', subtitle, size = 'md', iconOnly, className }: BrandMarkProps) {
  return (
    <div className={cn('flex items-center gap-3 min-w-0', className)}>
      <span
        className={cn(
          'flex-shrink-0 overflow-hidden bg-cream-100 p-0.5 shadow-md',
          tone === 'dark' ? 'ring-1 ring-caramel-300/40' : 'ring-1 ring-cream-400/70',
          TILE[size],
        )}
      >
        <img src="/logo.png" alt="JPOS" className="w-full h-full object-cover rounded-[inherit]" />
      </span>
      {!iconOnly && (
        <span className="min-w-0 leading-tight">
          <span className={cn('block font-display font-semibold tracking-wide', WORD[size], tone === 'dark' ? 'text-cream-50' : 'text-espresso-900')}>
            JPOS
          </span>
          {subtitle && (
            <span className={cn('block text-[11px] truncate', tone === 'dark' ? 'text-cream-200/70' : 'text-bark-500')}>
              {subtitle}
            </span>
          )}
        </span>
      )}
    </div>
  );
}
