import { BadgePercent, Ban, Check, Download, Palette, Receipt, ScanBarcode, Sparkles, type LucideIcon } from 'lucide-react';
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
/** In every package, the free trial too (shown once, under the cards). */
const EVERY_PACKAGE: { icon: LucideIcon; label: string }[] = [
  { icon: Palette, label: 'Your logo, colors and name' },
  { icon: ScanBarcode, label: 'Barcode scan + product details' },
  { icon: BadgePercent, label: 'Discounts + Senior/PWD' },
  { icon: Receipt, label: 'VAT receipts' },
  { icon: Ban, label: 'Void sales with a reason' },
  { icon: Download, label: 'Install on phone or computer' },
];

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
    <div>
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

    {/* What every package has, the free trial included */}
    <div className="mt-5 rounded-3xl border border-cream-300/80 bg-cream-50/70 px-5 py-5 backdrop-blur-sm">
      <p className="text-center text-sm font-semibold text-espresso-900">Every package has</p>
      <ul className="mt-3 flex flex-wrap justify-center gap-2">
        {EVERY_PACKAGE.map(({ icon: Icon, label }) => (
          <li key={label} className="inline-flex items-center gap-2 rounded-full border border-cream-300 bg-white/80 px-3.5 py-2 text-sm text-espresso-800">
            <Icon className="w-4 h-4 text-caramel-600" aria-hidden="true" /> {label}
          </li>
        ))}
      </ul>
    </div>
    </div>
  );
}
