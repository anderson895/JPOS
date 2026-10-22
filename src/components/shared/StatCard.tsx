import type { LucideIcon } from 'lucide-react';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StatCardProps {
  icon: LucideIcon;
  label: string;
  value: string;
  /** % change; null/undefined hides the change pill. */
  change?: number | null;
  changeHint?: string;
  loading?: boolean;
  /** Icon tile colour. */
  tone?: 'espresso' | 'caramel' | 'cream';
}

const TONES = {
  espresso: 'bg-espresso-800 text-caramel-200',
  caramel: 'bg-caramel-200/80 text-caramel-800',
  cream: 'bg-cream-200 text-espresso-700',
};

/** KPI tile — icon + label, big serif value, green/red change pill (dashboard mock in reference_UI). */
export default function StatCard({ icon: Icon, label, value, change, changeHint, loading, tone = 'espresso' }: StatCardProps) {
  const up = (change ?? 0) >= 0;
  return (
    <div className="card p-5 relative overflow-hidden">
      <div className="absolute -right-8 -top-8 w-28 h-28 rounded-full bg-caramel-200/25 blur-2xl pointer-events-none" />
      <div className="flex items-center gap-3">
        <span className={cn('w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-sm', TONES[tone])}>
          <Icon className="w-5 h-5" />
        </span>
        <p className="text-sm font-medium text-bark-600">{label}</p>
      </div>
      <p className="mt-4 text-[28px] leading-none font-display font-semibold text-espresso-900 truncate">
        {loading ? <span className="inline-block h-7 w-28 rounded-full bg-cream-300/70 animate-pulse align-middle" /> : value}
      </p>
      {!loading && change !== null && change !== undefined && (
        <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1">
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold',
              up ? 'bg-emerald-100/80 text-emerald-700' : 'bg-red-100 text-red-600',
            )}
          >
            {up ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
            {up ? '+' : '-'}{Math.abs(change).toFixed(0)}%
          </span>
          {changeHint && <span className="text-xs text-bark-400">{changeHint}</span>}
        </p>
      )}
    </div>
  );
}
