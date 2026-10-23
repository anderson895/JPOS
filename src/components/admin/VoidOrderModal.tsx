import { useState } from 'react';
import { Ban, Loader2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { FirebaseError } from 'firebase/app';
import Portal from '@/components/shared/Portal';
import { useAuth } from '@/contexts/AuthContext';
import { voidOrder, VOID_REASON_MAX } from '@/lib/voidOrder';
import { formatCurrency, formatDateTime } from '@/lib/utils';
import type { Order } from '@/types';

const REASONS = ['Wrong item', 'Customer cancelled', 'Wrong amount', 'Test sale'];

/** Admin → Reports: void a sale, with a reason. It stays on record, marked VOID. */
export default function VoidOrderModal({ order, onClose, onVoided }: {
  order: Order;
  onClose: () => void;
  onVoided: (change: Partial<Order>) => void;
}) {
  const { currentUser } = useAuth();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const ok = reason.trim().length >= 3;

  async function confirm() {
    if (!ok || !currentUser) return;
    setBusy(true);
    try {
      const change = await voidOrder(order.id, reason, currentUser);
      onVoided(change);
      toast.success(`${order.orderNumber} is voided.`);
      onClose();
    } catch (err) {
      console.error('[Void]', err);
      const denied = err instanceof FirebaseError && err.code === 'permission-denied';
      toast.error(denied ? "Couldn't void it. Only admins can, while the subscription is active." : err instanceof Error && !(err instanceof FirebaseError) ? err.message : "Couldn't void it. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Portal>
      <div className="modal-backdrop">
        <div className="modal-panel max-w-md max-h-[90vh] overflow-y-auto" role="alertdialog" aria-labelledby="void-title">
          <div className="modal-header">
            <div>
              <p className="eyebrow text-2xl -mb-1">Cancel a sale</p>
              <h2 id="void-title" className="font-display text-2xl text-espresso-900">Void {order.orderNumber}</h2>
            </div>
            <button onClick={onClose} disabled={busy} className="icon-btn" title="Close"><X className="w-5 h-5" /></button>
          </div>
          <div className="p-6 space-y-4">
            <div className="flex items-center justify-between rounded-2xl border border-cream-300 bg-cream-100 px-4 py-3 text-sm">
              <span className="text-bark-600">{formatDateTime(order.createdAt)} · {order.cashierName}</span>
              <span className="font-display text-lg font-semibold text-espresso-900">{formatCurrency(order.total)}</span>
            </div>
            <p className="text-sm text-bark-600">The sale stays in your records, marked VOID. It won't count in your sales.</p>
            <div>
              <label htmlFor="void-reason" className="label">Why?</label>
              <div className="mb-2 flex flex-wrap gap-2">
                {REASONS.map(r => (
                  <button key={r} type="button" onClick={() => setReason(r)} disabled={busy}
                    className={`pill ${reason === r ? 'active' : ''}`}>{r}</button>
                ))}
              </div>
              <textarea id="void-reason" rows={2} className="input resize-none" maxLength={VOID_REASON_MAX}
                placeholder="Or type the reason" value={reason} onChange={e => setReason(e.target.value)} disabled={busy} />
            </div>
          </div>
          <div className="modal-footer">
            <button onClick={onClose} disabled={busy} className="btn-secondary flex-1">Keep the sale</button>
            <button onClick={confirm} disabled={!ok || busy} className="btn flex-1 bg-red-600 text-white hover:bg-red-700 disabled:opacity-50">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Ban className="w-4 h-4" />}
              {busy ? 'Voiding…' : 'Void sale'}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}
