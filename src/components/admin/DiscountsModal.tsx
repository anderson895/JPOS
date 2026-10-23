import { useEffect, useState } from 'react';
import { BadgePercent, Check, Loader2, Pencil, Plus, Trash2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import Portal from '@/components/shared/Portal';
import Switch from '@/components/shared/Switch';
import {
  addSavedDiscount, deleteSavedDiscount, setSavedDiscountActive, updateSavedDiscount, watchSavedDiscounts,
} from '@/lib/discounts';
import { DISCOUNT_NAME_MAX, discountValueLabel, savedDiscountProblem, type DiscountKind } from '@/lib/pricing';
import { cn } from '@/lib/utils';
import { changes, logActivity } from '@/lib/activity';
import type { SavedDiscount } from '@/types';

const EMPTY = { name: '', kind: 'percent' as DiscountKind, value: '' };

/**
 * Admin → Products → Discounts: the store's saved discounts ("Employee 10%",
 * "Promo ₱50") that cashiers pick at the POS. Senior / PWD is built in.
 */
export default function DiscountsModal({ onClose }: { onClose: () => void }) {
  const [list, setList] = useState<SavedDiscount[] | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => watchSavedDiscounts(setList, () => { setList([]); toast.error("Couldn't load the discounts."); }), []);

  const draft = { name: form.name, kind: form.kind, value: Number(form.value) };
  const problem = form.name || form.value ? savedDiscountProblem(draft) : null;

  async function save() {
    const p = savedDiscountProblem(draft);
    if (p) { toast.error(p); return; }
    setSaving(true);
    try {
      if (editId) {
        const was = list?.find(d => d.id === editId);
        await updateSavedDiscount(editId, { ...draft, active: was?.active ?? true });
        toast.success('Discount saved.');
        logActivity('discount.edit', draft.name, changes([['Name', was?.name, draft.name.trim()], ['Amount', was ? discountValueLabel(was) : '', discountValueLabel(draft)]]));
      } else {
        await addSavedDiscount({ ...draft, active: true });
        toast.success('Discount added.');
        logActivity('discount.add', draft.name, discountValueLabel(draft));
      }
      setForm(EMPTY);
      setEditId(null);
    } catch (err) {
      console.error('[Discounts] save', err);
      toast.error("Couldn't save the discount. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function toggle(d: SavedDiscount) {
    setBusyId(d.id);
    try { await setSavedDiscountActive(d.id, !d.active); }
    catch { toast.error("Couldn't change it. Please try again."); }
    finally { setBusyId(null); }
  }

  async function remove(d: SavedDiscount) {
    if (!confirm(`Delete the "${d.name}" discount?`)) return;
    setBusyId(d.id);
    try {
      await deleteSavedDiscount(d.id);
      logActivity('discount.delete', d.name, discountValueLabel(d));
      if (editId === d.id) { setEditId(null); setForm(EMPTY); }
      toast.success('Discount deleted.');
    } catch {
      toast.error("Couldn't delete it. Please try again.");
    } finally {
      setBusyId(null);
    }
  }

  const startEdit = (d: SavedDiscount) => { setEditId(d.id); setForm({ name: d.name, kind: d.kind, value: String(d.value) }); };

  return (
    <Portal>
      <div className="modal-backdrop">
        <div className="modal-panel max-w-md max-h-[90vh] overflow-y-auto" role="dialog" aria-labelledby="discounts-title">
          <div className="modal-header">
            <div>
              <p className="eyebrow text-2xl -mb-1">Ready at the POS</p>
              <h2 id="discounts-title" className="font-display text-2xl text-espresso-900">Discounts</h2>
            </div>
            <button onClick={onClose} className="icon-btn" title="Close"><X className="w-5 h-5" /></button>
          </div>

          <div className="p-6 space-y-5">
            <p className="text-sm text-bark-500">Cashiers pick these at checkout. Senior citizen and PWD are always there.</p>

            {list === null ? (
              <div className="flex justify-center py-6"><Loader2 className="w-6 h-6 animate-spin text-caramel-600" aria-label="Loading" /></div>
            ) : list.length === 0 ? (
              <p className="rounded-2xl bg-cream-200/60 px-4 py-5 text-center text-sm text-bark-500">No discounts yet. Add one below.</p>
            ) : (
              <ul className="space-y-2">
                {list.map(d => (
                  <li key={d.id} className={cn('flex items-center gap-3 rounded-2xl border border-cream-300 bg-cream-100/70 px-3 py-2.5', !d.active && 'opacity-70')}>
                    <BadgePercent className="w-5 h-5 shrink-0 text-caramel-600" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-espresso-900">{d.name}</p>
                      <p className="text-xs text-bark-500">{discountValueLabel(d)} off{d.active ? '' : ' · Off'}</p>
                    </div>
                    {busyId === d.id
                      ? <Loader2 className="w-4 h-4 animate-spin text-caramel-600" aria-label="Working" />
                      : <Switch checked={d.active} onChange={() => toggle(d)} label={`Use ${d.name}`} />}
                    <button onClick={() => startEdit(d)} disabled={!!busyId} className="icon-btn w-8 h-8" title="Edit"><Pencil className="w-3.5 h-3.5" /></button>
                    <button onClick={() => remove(d)} disabled={!!busyId} className="icon-btn w-8 h-8 hover:text-red-600" title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
                  </li>
                ))}
              </ul>
            )}

            {/* Add, or edit the one picked */}
            <div className="space-y-3 rounded-3xl border border-cream-300 bg-cream-50 p-4">
              <p className="text-sm font-semibold text-espresso-900">{editId ? 'Edit discount' : 'Add a discount'}</p>
              <div>
                <label htmlFor="discount-name" className="label">Name</label>
                <input id="discount-name" className="input" maxLength={DISCOUNT_NAME_MAX} placeholder="e.g. Employee" value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))} disabled={saving} />
              </div>
              <div>
                <label htmlFor="discount-value" className="label">Amount off</label>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-0.5 bg-cream-200 rounded-full p-0.5 border border-cream-400/60">
                    {(['percent', 'fixed'] as DiscountKind[]).map(k => (
                      <button key={k} type="button" onClick={() => setForm(f => ({ ...f, kind: k }))} aria-pressed={form.kind === k} disabled={saving}
                        className={cn('w-9 h-8 rounded-full text-sm font-semibold transition-all', form.kind === k ? 'bg-espresso-800 text-cream-50 shadow-sm' : 'text-bark-500')}>
                        {k === 'percent' ? '%' : '₱'}
                      </button>
                    ))}
                  </div>
                  <input id="discount-value" type="number" min="0" step="0.01" inputMode="decimal" className="input flex-1 text-right"
                    placeholder={form.kind === 'percent' ? 'e.g. 10' : 'e.g. 50'} value={form.value}
                    onChange={e => setForm(f => ({ ...f, value: e.target.value }))} disabled={saving}
                    onKeyDown={e => { if (e.key === 'Enter') save(); }} />
                </div>
                {problem && <p className="mt-1.5 px-1 text-xs text-red-600">{problem}</p>}
              </div>
              <div className="flex gap-2">
                {editId && (
                  <button onClick={() => { setEditId(null); setForm(EMPTY); }} disabled={saving} className="btn-secondary flex-1">Cancel</button>
                )}
                <button onClick={save} disabled={saving || !!problem || !form.name.trim() || !form.value} className="btn-primary flex-1">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : editId ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                  {saving ? 'Saving…' : editId ? 'Save discount' : 'Add discount'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Portal>
  );
}
