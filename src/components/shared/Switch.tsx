import { cn } from '@/lib/utils';

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Accessible name, e.g. "Accept GCash". */
  label: string;
  disabled?: boolean;
}

/** On/off toggle (role="switch"), espresso when on. */
export default function Switch({ checked, onChange, label, disabled }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-7 w-12 flex-shrink-0 items-center rounded-full border transition-colors duration-200',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-caramel-300 focus-visible:ring-offset-2 focus-visible:ring-offset-cream-50',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        checked ? 'bg-espresso-800 border-espresso-800' : 'bg-cream-300 border-cream-400',
      )}
    >
      <span
        className={cn(
          'inline-block h-5 w-5 rounded-full shadow-md transition-transform duration-200',
          checked ? 'translate-x-[22px] bg-caramel-300' : 'translate-x-[3px] bg-white',
        )}
      />
    </button>
  );
}
