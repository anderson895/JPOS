import { Check, Sparkles } from 'lucide-react';
import { usePlatformSettings } from '@/components/shared/ContactOwner';
import { PLAN_IDS } from '@/lib/entitlements';
import { cn } from '@/lib/utils';
import type { PlanId } from '@/types';

/** What a visitor picks: the free trial, or a package to pay for. */
export type PlanChoice = 'trial' | PlanId;
export const PLAN_CHOICES: PlanChoice[] = ['trial', ...PLAN_IDS];
export const isPlanChoice = (v: unknown): v is PlanChoice => PLAN_CHOICES.includes(v as PlanChoice);

const peso = (n: number) => `₱${n.toLocaleString('en-PH')}`;
const accounts = (limit: number | null | undefined) => (limit == null ? 'Unlimited accounts' : `Up to ${limit} accounts`);

/** Kept short on purpose: a few words per line. */
const FEATURES: Record<PlanId, string[]> = {
  starter: ['Cash + GCash/Maya QR', 'Receipts with QR', 'Today & weekly reports'],
  business: ['Everything in Starter', 'All reports + PDF', 'Sales trends', 'RFID card login'],
  enterprise: ['Everything in Business', 'Priority support'],
};
const TAGLINE: Record<PlanId, string> = {
  starter: 'For small shops',
  business: 'For growing shops',
  enterprise: 'For big teams',
};

/**
 * The packages; Starter doubles as the free trial. Used on the landing page and at sign-up.
 * Prices, trial days and account limits come from the Super Admin's settings.
 */
export default function PlanCards({ onChoose, selected }: { onChoose: (choice: PlanChoice) => void; selected?: PlanChoice }) {
  const { settings } = usePlatformSettings();
  return (
    <div className="grid gap-4 md:grid-cols-3 items-stretch">
      {PLAN_IDS.map(id => {
        const plan = settings.plans[id];
        const name = plan?.name ?? id;
        const list = [accounts(plan?.entitlements.staffLimit), ...FEATURES[id]];

        // Starter is also the free trial: the highlighted card
        if (id === 'starter') {
          return (
            <div
              key={id}
              className={cn(
                'relative flex flex-col rounded-3xl bg-espresso-900 p-6 text-cream-50 shadow-lift',
                (selected === 'trial' || selected === 'starter') && 'ring-4 ring-caramel-400',
              )}
            >
              <span className="absolute right-5 top-5 rounded-full bg-caramel-400 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-espresso-950">
                {settings.trialDays} days free
              </span>
              <p className="text-sm font-semibold text-caramel-200">{name}</p>
              <h3 className="mt-3 font-display text-2xl">{TAGLINE[id]}</h3>
              <p className="mt-4 flex items-end gap-2">
                <span className="font-display text-2xl text-cream-300/70 line-through decoration-2">{peso(plan?.price ?? 0)}</span>
                <span className="font-display text-5xl leading-none">₱0</span>
                <span className="pb-1 text-sm text-cream-200">for {settings.trialDays} days</span>
              </p>
              <button type="button" onClick={() => onChoose('trial')} className="btn-caramel w-full mt-6">
                <Sparkles className="w-4 h-4" aria-hidden="true" /> Start free trial
              </button>
              <ul className="mt-6 space-y-2.5 text-sm">
                {list.map(f => (
                  <li key={f} className="flex items-center gap-2.5"><Check className="w-4 h-4 text-caramel-300" strokeWidth={2.6} aria-hidden="true" /> {f}</li>
                ))}
              </ul>
              <p className="mt-auto pt-6 text-xs text-cream-300/80">Then {peso(plan?.price ?? 0)}/month. No automatic charges.</p>
            </div>
          );
        }

        const popular = id === 'business';
        return (
          <div key={id} className={cn('relative flex flex-col card-glass p-6', selected === id && 'ring-2 ring-espresso-800')}>
            {popular && (
              <span className="absolute right-5 top-5 rounded-full bg-espresso-800 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-caramel-200">
                Most popular
              </span>
            )}
            <p className="text-sm font-semibold text-bark-600">{name}</p>
            <h3 className="mt-3 font-display text-2xl text-espresso-900">{TAGLINE[id]}</h3>
            <p className="mt-4 flex items-end gap-1">
              <span className="font-display text-5xl leading-none text-espresso-900">{peso(plan?.price ?? 0)}</span>
              <span className="pb-1 text-sm text-bark-500">/month</span>
            </p>
            <button type="button" onClick={() => onChoose(id)} className={cn('w-full mt-6', popular ? 'btn-primary' : 'btn-outline')}>
              Choose {name}
            </button>
            <ul className="mt-6 space-y-2.5 text-sm text-espresso-800">
              {list.map(f => (
                <li key={f} className="flex items-center gap-2.5"><Check className="w-4 h-4 text-espresso-800" strokeWidth={2.6} aria-hidden="true" /> {f}</li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
