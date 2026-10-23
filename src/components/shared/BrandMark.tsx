import { cn } from '@/lib/utils';

interface BrandMarkProps {
  /** `dark` = placed on an espresso background (cream text). */
  tone?: 'light' | 'dark';
  subtitle?: string;
  size?: 'sm' | 'md' | 'lg';
  /** Hide the wordmark and show only the logo tile (collapsed sidebar). */
  iconOnly?: boolean;
  /** The shop's own name and logo (Store Settings); default JPOS. */
  name?: string;
  logoUrl?: string;
  className?: string;
}

const TILE = { sm: 'w-9 h-9 rounded-xl', md: 'w-11 h-11 rounded-2xl', lg: 'w-14 h-14 rounded-2xl' };
const WORD = { sm: 'text-lg', md: 'text-xl', lg: 'text-2xl' };

/** Logo tile + wordmark (the shop's own, or JPOS), as in the reference navbar and sidebar. */
export default function BrandMark({ tone = 'light', subtitle, size = 'md', iconOnly, name = 'JPOS', logoUrl = '/logo.png', className }: BrandMarkProps) {
  // A long shop name gets a smaller wordmark so more of it fits
  const word = name.length > 14 ? { sm: 'text-base', md: 'text-lg', lg: 'text-xl' }[size] : WORD[size];
  return (
    <div className={cn('flex items-center gap-3 min-w-0', className)}>
      <span
        className={cn(
          'flex-shrink-0 overflow-hidden bg-cream-100 p-0.5 shadow-md',
          tone === 'dark' ? 'ring-1 ring-caramel-300/40' : 'ring-1 ring-cream-400/70',
          TILE[size],
        )}
      >
        <img src={logoUrl} alt={name} className="w-full h-full object-cover rounded-[inherit]" />
      </span>
      {!iconOnly && (
        <span className="min-w-0 leading-tight">
          <span className={cn('block truncate font-display font-semibold tracking-wide', word, tone === 'dark' ? 'text-cream-50' : 'text-espresso-900')} title={name}>
            {name}
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
