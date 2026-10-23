import { forwardRef } from 'react';
import { AlertTriangle } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { formatCurrency, roundMoney } from '@/lib/utils';
import { receiptQrPayload } from '@/lib/receiptQr';
import { SENIOR_LABEL, VAT_RATE } from '@/lib/pricing';
import type { Order, ReceiptInfo } from '@/types';

const row = 'flex justify-between gap-3';

/**
 * The printed receipt: the shop's name and details (Store Settings), the items
 * with their discounts, the order discounts, Senior/PWD, the VAT breakdown
 * (VAT-registered stores) and the order QR. `id="receipt"` is what the
 * @media print rules print.
 */
const Receipt = forwardRef<HTMLDivElement, { order: Order; shopName: string; info: ReceiptInfo }>(
  function Receipt({ order, shopName, info }, ref) {
    // Old orders have one "discount" amount and no list: show it the old way
    const itemDiscounts = roundMoney(order.items.reduce((s, i) => s + (i.discount ?? 0), 0));
    const orderDiscounts = order.discounts
      ?? (order.discount - itemDiscounts > 0 ? [{ name: 'Discount', amount: roundMoney(order.discount - itemDiscounts) }] : []);
    const voided = order.status === 'voided';

    return (
      <div ref={ref} id="receipt" className="relative mx-6 my-5 p-5 bg-white rounded-2xl border border-dashed border-cream-500 font-mono text-xs space-y-1 text-espresso-900 print:m-0 print:p-0 print:border-0 print:rounded-none">
        {voided && (
          <p className="pointer-events-none absolute inset-x-0 top-1/3 -rotate-12 text-center text-5xl font-bold tracking-widest text-red-600/30">VOID</p>
        )}
        {/* The shop's own name and details: every shop prints its own receipts */}
        <p className="text-center font-bold text-base font-body uppercase break-words">{shopName}</p>
        {info.address && <p className="text-center break-words">{info.address}</p>}
        {info.phone && <p className="text-center">{info.phone}</p>}
        {(info.vatRegistered || info.tin) && (
          <p className="text-center">{info.vatRegistered ? 'VAT REG TIN' : 'NON-VAT REG TIN'} {info.tin}</p>
        )}
        <p className="text-center text-bark-500 pt-1">{new Date(order.createdAt).toLocaleString()}</p>
        <p className="text-center text-bark-500 pb-2">{order.orderNumber}</p>

        <div className="border-t border-dashed border-bark-300 pt-2 space-y-1">
          {order.items.map((item, i) => (
            <div key={i}>
              <div className={row}>
                <span className="min-w-0 break-words">
                  {item.productName}{item.details ? ` (${item.details})` : ''} ×{item.quantity}{item.unit ? ` ${item.unit}` : ''}
                </span>
                <span className="shrink-0">{formatCurrency(item.subtotal)}</span>
              </div>
              {(item.discount ?? 0) > 0 && (
                <div className={`${row} pl-3 text-bark-600`}>
                  <span className="min-w-0 break-words">less {item.discountName || 'discount'}</span>
                  <span className="shrink-0">-{formatCurrency(item.discount ?? 0)}</span>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="border-t border-dashed border-bark-300 pt-2 space-y-1">
          <div className={row}><span>Subtotal</span><span>{formatCurrency(order.subtotal)}</span></div>
          {(order.lessVat ?? 0) > 0 && (
            <div className={row}><span>Less VAT {VAT_RATE * 100}%</span><span>-{formatCurrency(order.lessVat ?? 0)}</span></div>
          )}
          {orderDiscounts.map((d, i) => (
            <div key={i} className={row}><span className="min-w-0 break-words">{d.name}</span><span className="shrink-0">-{formatCurrency(d.amount)}</span></div>
          ))}
          <div className={`${row} font-bold text-sm`}><span>TOTAL</span><span>{formatCurrency(order.total)}</span></div>
          <div className={row}><span>{order.paymentMethod.toUpperCase()}</span><span>{formatCurrency(order.amountTendered || order.total)}</span></div>
          {order.paymentReference && <div className={row}><span>{order.paymentMethod === 'card' ? 'Approval' : 'Ref'}</span><span className="break-all text-right">{order.paymentReference}</span></div>}
          {order.paymentNote && <p className="flex items-start gap-1 text-amber-700"><AlertTriangle className="w-3.5 h-3.5 mt-px flex-shrink-0" aria-hidden="true" />{order.paymentNote}</p>}
          {(order.change || 0) > 0 && <div className={row}><span>Change</span><span>{formatCurrency(order.change || 0)}</span></div>}
        </div>

        {/* VAT-registered stores: what part of the sale has VAT in it */}
        {order.vat && (
          <div className="border-t border-dashed border-bark-300 pt-2 space-y-1">
            <div className={row}><span>VATable sales</span><span>{formatCurrency(order.vat.vatable)}</span></div>
            <div className={row}><span>VAT {VAT_RATE * 100}%</span><span>{formatCurrency(order.vat.vat)}</span></div>
            <div className={row}><span>VAT-exempt sales</span><span>{formatCurrency(order.vat.exempt)}</span></div>
          </div>
        )}

        {/* Senior citizen / PWD: the ID details and a line to sign */}
        {order.senior && (
          <div className="border-t border-dashed border-bark-300 pt-2 space-y-1">
            <div className={row}><span>{SENIOR_LABEL[order.senior.type]} ID</span><span className="break-all text-right">{order.senior.idNumber}</span></div>
            <div className={row}><span>Name</span><span className="break-words text-right">{order.senior.name}</span></div>
            <p className="pt-3">Signature: ____________________</p>
          </div>
        )}

        {/* Order QR on every receipt (cash too): plain order details staff can scan */}
        <div className="flex flex-col items-center pt-3">
          <QRCodeSVG value={receiptQrPayload(order)} size={128} level="M" marginSize={2} />
        </div>
        <p className="text-center text-bark-500 mt-2 break-words">{info.footer || 'Thank you for your order!'}</p>
        <p className="text-center text-bark-400">Cashier: {order.cashierName}</p>
        {voided && (
          <p className="text-center font-bold text-red-700 pt-1 break-words">VOID{order.voidReason ? `: ${order.voidReason}` : ''}</p>
        )}
      </div>
    );
  },
);

export default Receipt;
