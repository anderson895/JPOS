import { useState } from 'react';
import { BadgePercent, Check, Contact as IdCard, Tag, X } from 'lucide-react';
import Portal from '@/components/shared/Portal';
import {
  discountValueLabel, seniorProblem, SENIOR_LABEL,
  type DiscountKind, type DiscountPick, type SeniorInfo, type SeniorType,
} from '@/lib/pricing';
import { cn } from '@/lib/utils';
import type { SavedDiscount } from '@/types';

/**
 * Picks a discount at the POS: one of the store's saved discounts, another
 * amount, or (whole order only) Senior citizen / PWD with the ID details.
 */
export default function DiscountSheet({
  itemName, saved, current, senior, onApply, onRemove, onSenior, onClose,
}: {
  /** Set for a discount on one item; empty = the whole order. */
  itemName?: string;
  /** The store's saved discounts that are on. */
  saved: SavedDiscount[];
  current: DiscountPick | null;
  senior?: SeniorInfo | null;
  onApply: (d: DiscountPick) => void;
  onRemove: () => void;
  /** Whole order only: Senior citizen / PWD (null removes it). */
  onSenior?: (s: SeniorInfo | null) => void;
  onClose: () => void;
}) {
  const forOrder = !itemName;
  const [tab, setTab] = useState<'discount' | 'senior'>(senior ? 'senior' : 'discount');
  const [kind, setKind] = useState<DiscountKind>(current && !current.savedId ? current.kind : 'percent');
  const [amount, setAmount] = useState(current && !current.savedId ? String(current.value) : '');
  const [sType, setSType] = useState<SeniorType>(senior?.type ?? 'senior');
  const [idNumber, setIdNumber] = useState(senior?.idNumber ?? '');
  const [name, setName] = useState(senior?.name ?? '');

  const value = Number(amount);
  const amountOk = value > 0 && (kind === 'fixed' || value <= 100);
  const sProblem = seniorProblem({ idNumber, name });

  const pick = (d: DiscountPick) => { onApply(d); onClose(); };
  const applyOther = () => {
    if (!amountOk) return;
    pick({ name: `Discount ${discountValueLabel({ kind, value })}`, kind, value });
  };
  const applySenior = () => {
    if (sProblem || !onSenior) return;
    onSenior({ type: sType, idNumber: idNumber.trim(), name: name.trim() });
    onClose();
  };

  return (
    <Portal>
      <div className="modal-backdrop" onClick={onClose}>
        <div className="modal-panel max-w-md max-h-[92vh] overflow-y-auto" role="dialog" aria-labelledby="discount-title" onClick={e => e.stopPropagation()}>
          <div className="modal-header">
            <div className="min-w-0">
              <p className="eyebrow text-2xl -mb-1">Discount</p>
              <h2 id="discount-title" className="font-display text-2xl text-espresso-900 truncate">{itemName ?? 'Whole order'}</h2>
            </div>
            <button onClick={onClose} className="icon-btn" title="Close"><X className="w-5 h-5" /></button>
          </div>

          <div className="p-6 space-y-5">
            {forOrder && onSenior && (
              <div className="segmented" role="tablist" aria-label="Kind of discount">
                <button role="tab" aria-selected={tab === 'discount'} onClick={() => setTab('discount')} className={cn('segmented-item', tab === 'discount' && 'active')}>
                  <Tag className="w-4 h-4" aria-hidden="true" /> Discount
                </button>
                <button role="tab" aria-selected={tab === 'senior'} onClick={() => setTab('senior')} className={cn('segmented-item', tab === 'senior' && 'active')}>
                  <IdCard className="w-4 h-4" aria-hidden="true" /> Senior / PWD
                </button>
              </div>
            )}

            {tab === 'discount' && (
              <>
                {saved.length > 0 && (
                  <div>
                    <p className="label">Your discounts</p>
                    <div className="grid grid-cols-2 gap-2">
                      {saved.map(s => {
                        const on = current?.savedId === s.id;
                        return (
                          <button
                            key={s.id}
                            onClick={() => pick({ name: s.name, kind: s.kind, value: s.value, savedId: s.id })}
                            className={cn(
                              'flex items-center gap-2 rounded-2xl border px-3 py-2.5 text-left transition-colors',
                              on ? 'border-caramel-500 bg-caramel-50 ring-1 ring-caramel-400' : 'border-cream-400/80 bg-cream-50 hover:border-caramel-300',
                            )}
                          >
                            <BadgePercent className="w-4 h-4 shrink-0 text-caramel-600" aria-hidden="true" />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-semibold text-espresso-900">{s.name}</span>
                              <span className="block text-xs text-bark-500">{discountValueLabel(s)} off</span>
                            </span>
                            {on && <Check className="w-4 h-4 shrink-0 text-caramel-700" aria-hidden="true" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div>
                  <label htmlFor="discount-amount" className="label">{saved.length ? 'Other amount' : 'Amount off'}</label>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-0.5 bg-cream-200 rounded-full p-0.5 border border-cream-400/60">
                      <button onClick={() => setKind('percent')} aria-pressed={kind === 'percent'}
                        className={cn('w-9 h-8 rounded-full text-sm font-semibold transition-all', kind === 'percent' ? 'bg-espresso-800 text-cream-50 shadow-sm' : 'text-bark-500')}>%</button>
                      <button onClick={() => setKind('fixed')} aria-pressed={kind === 'fixed'}
                        className={cn('w-9 h-8 rounded-full text-sm font-semibold transition-all', kind === 'fixed' ? 'bg-espresso-800 text-cream-50 shadow-sm' : 'text-bark-500')}>₱</button>
                    </div>
                    <input
                      id="discount-amount" type="number" min="0" step="0.01" inputMode="decimal"
                      className="input flex-1 text-right" placeholder={kind === 'percent' ? 'e.g. 10' : 'e.g. 50'}
                      value={amount} onChange={e => setAmount(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') applyOther(); }}
                    />
                    <button onClick={applyOther} disabled={!amountOk} className="btn-primary px-5">Apply</button>
                  </div>
                  {amount && !amountOk && (
                    <p className="mt-1.5 px-1 text-xs text-red-600">{kind === 'percent' && value > 100 ? 'Use 100% or less.' : 'Enter an amount above 0.'}</p>
                  )}
                </div>
                {forOrder && senior && <p className="text-xs text-bark-500">This takes the place of the Senior / PWD discount.</p>}
              </>
            )}

            {tab === 'senior' && onSenior && (
              <>
                <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Senior citizen or PWD">
                  {(['senior', 'pwd'] as SeniorType[]).map(t => (
                    <button key={t} role="radio" aria-checked={sType === t} onClick={() => setSType(t)}
                      className={cn('rounded-2xl border px-3 py-2.5 text-sm font-semibold transition-colors',
                        sType === t ? 'border-caramel-500 bg-caramel-50 text-espresso-900 ring-1 ring-caramel-400' : 'border-cream-400/80 bg-cream-50 text-espresso-800 hover:border-caramel-300')}>
                      {SENIOR_LABEL[t]}
                    </button>
                  ))}
                </div>
                <div>
                  <label htmlFor="senior-id" className="label">{sType === 'senior' ? 'OSCA ID number' : 'PWD ID number'}</label>
                  <input id="senior-id" className="input" maxLength={30} value={idNumber} onChange={e => setIdNumber(e.target.value)} autoComplete="off" />
                </div>
                <div>
                  <label htmlFor="senior-name" className="label">Name on the ID</label>
                  <input id="senior-name" className="input" maxLength={60} value={name} onChange={e => setName(e.target.value)} autoComplete="off"
                    onKeyDown={e => { if (e.key === 'Enter') applySenior(); }} />
                </div>
                <p className="rounded-2xl bg-cream-200/70 px-4 py-3 text-xs text-espresso-800">
                  20% off the price. It takes the place of other discounts.
                </p>
                <button onClick={applySenior} disabled={!!sProblem} className="btn-primary w-full">
                  <Check className="w-4 h-4" aria-hidden="true" /> Apply {SENIOR_LABEL[sType]} discount
                </button>
              </>
            )}
          </div>

          <div className="modal-footer">
            {tab === 'senior' && senior
              ? <button onClick={() => { onSenior?.(null); onClose(); }} className="btn-secondary flex-1">Remove Senior / PWD</button>
              : current && <button onClick={() => { onRemove(); onClose(); }} className="btn-secondary flex-1">Remove discount</button>}
            <button onClick={onClose} className="btn-ghost flex-1">Close</button>
          </div>
        </div>
      </div>
    </Portal>
  );
}
