import { Printer, X } from 'lucide-react';
import Portal from '@/components/shared/Portal';
import Receipt from '@/components/pos/Receipt';
import { useAuth, useStoreBrand } from '@/contexts/AuthContext';
import { receiptInfo } from '@/lib/storeProfile';
import type { Order } from '@/types';

/** An old sale's receipt, to look at or print again (Reports). */
export default function ReceiptModal({ order, onClose }: { order: Order; onClose: () => void }) {
  const { tenant } = useAuth();
  const brand = useStoreBrand();
  return (
    <Portal>
      <div className="modal-backdrop" onClick={onClose}>
        <div className="modal-panel max-w-sm max-h-[92vh] overflow-y-auto" role="dialog" aria-label={`Receipt ${order.orderNumber}`} onClick={e => e.stopPropagation()}>
          <div className="modal-header">
            <h2 className="font-display text-2xl text-espresso-900">Receipt</h2>
            <button onClick={onClose} className="icon-btn" title="Close"><X className="w-5 h-5" /></button>
          </div>
          <Receipt order={order} shopName={brand.name} info={receiptInfo(tenant)} />
          <div className="modal-footer">
            <button onClick={() => window.print()} className="btn-secondary flex-1"><Printer className="w-4 h-4" /> Print</button>
            <button onClick={onClose} className="btn-primary flex-1">Done</button>
          </div>
        </div>
      </div>
    </Portal>
  );
}
