import { Hammer, Pill, Scissors, Shirt, ShoppingBasket, Smartphone, Store, UtensilsCrossed, type LucideIcon } from 'lucide-react';
import { BUSINESS_LABEL, BUSINESS_TYPES } from '@/lib/storeProfile';
import { cn } from '@/lib/utils';
import type { BusinessType } from '@/types';

const ICON: Record<BusinessType, LucideIcon> = {
  food: UtensilsCrossed, grocery: ShoppingBasket, clothing: Shirt, hardware: Hammer,
  pharmacy: Pill, gadgets: Smartphone, services: Scissors, other: Store,
};

/** "What do you sell?": one tap per kind of store (sign-up and Store Settings). */
export default function BusinessTypePicker({ value, onChange, disabled, labelId }: {
  value: BusinessType | null;
  onChange: (type: BusinessType) => void;
  disabled?: boolean;
  /** The id of the visible label above the choices. */
  labelId: string;
}) {
  return (
    <div role="radiogroup" aria-labelledby={labelId} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {BUSINESS_TYPES.map(type => {
        const Icon = ICON[type];
        const on = value === type;
        return (
          <button
            key={type}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={disabled}
            onClick={() => onChange(type)}
            className={cn(
              'flex min-h-[4.5rem] flex-col items-center justify-center gap-1.5 rounded-2xl border px-2 py-2.5 text-center text-xs font-semibold transition-colors',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-caramel-300 disabled:cursor-not-allowed disabled:opacity-60',
              on
                ? 'border-caramel-500 bg-caramel-50 text-espresso-900 ring-1 ring-caramel-400'
                : 'border-cream-400/80 bg-white/80 text-espresso-800 hover:border-caramel-300 hover:bg-white',
            )}
          >
            <Icon className={cn('h-5 w-5', on ? 'text-caramel-700' : 'text-bark-500')} aria-hidden="true" />
            {BUSINESS_LABEL[type]}
          </button>
        );
      })}
    </div>
  );
}
