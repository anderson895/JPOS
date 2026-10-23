import { DATA_MODE } from '@/lib/firebase';
import { cn } from '@/lib/utils';

/**
 * This computer only (npm run dev / dev:live), never in the live app: a small
 * label saying which data the page uses, so a fake test account isn't tried
 * on the real database (or a real one on the fake data). Clicks pass through.
 */
export default function DevModeBadge() {
  if (!import.meta.env.DEV || DATA_MODE === 'demo') return null;
  const local = DATA_MODE === 'local';
  return (
    <div
      aria-hidden="true"
      data-dev-only
      className={cn(
        'pointer-events-none fixed bottom-[4.75rem] lg:bottom-2 left-1/2 z-[100] -translate-x-1/2 whitespace-nowrap rounded-full px-3 py-1 text-[11px] font-semibold text-white shadow-md',
        local ? 'bg-emerald-600/90' : 'bg-red-600/90',
      )}
    >
      {local ? 'Local test · fake data' : 'LIVE database · real accounts'}
    </div>
  );
}
