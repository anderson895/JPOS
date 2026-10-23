import { roundMoney } from '@/lib/utils';
import { SENIOR_LABEL, SENIOR_RATE, type DiscountPick, type PriceResult, type SeniorInfo } from '@/lib/pricing';
import type { CartItem, Order, PaymentMethod } from '@/types';

/** Everything an order needs, frozen at the moment the cashier checks out. */
export interface OrderSnapshot {
  items: CartItem[];
  /** The money of the sale, from the cart (src/lib/pricing.ts). */
  pricing: PriceResult;
  orderDiscount: DiscountPick | null;
  senior: SeniorInfo | null;
  paymentMethod: PaymentMethod;
  /** Pesos handed over for cash; the total for every other method. */
  amountTendered: number;
  change: number;
  cashierId: string;
  cashierName: string;
  customerName?: string;
  tableNumber?: string;
  notes?: string;
}

/**
 * GCash/Maya through the store's own QR (reference required, normalized), or a
 * card payment with an optional approval code. The cashier vouches for it.
 */
export interface ManualPayment {
  verification: 'manual';
  /** Normalized e-wallet reference, or the card approval code ('' if none). */
  reference: string;
  /** Uid of the cashier who confirmed the payment arrived. */
  verifiedBy: string;
}

/**
 * Builds the Firestore order document from a snapshot, so every order has the
 * same shape. Firestore rejects `undefined`, so empty optional fields are left out.
 */
export function buildOrder(s: OrderSnapshot, orderNumber: string, payment?: ManualPayment): Omit<Order, 'id'> {
  const now = new Date().toISOString();
  const isWallet = s.paymentMethod === 'gcash' || s.paymentMethod === 'maya';
  const p = s.pricing;
  // Order-level discounts, as the receipt lists them
  const discounts: { name: string; amount: number }[] = [];
  if (s.senior && p.seniorDiscount > 0) discounts.push({ name: `${SENIOR_LABEL[s.senior.type]} ${SENIOR_RATE * 100}%`, amount: p.seniorDiscount });
  if (s.orderDiscount && p.orderDiscount > 0) discounts.push({ name: s.orderDiscount.name.trim() || 'Discount', amount: p.orderDiscount });
  return {
    orderNumber,
    items: s.items.map((i, n) => {
      const line = p.lines[n];
      return {
        productId: i.productId,
        productName: i.productName,
        price: i.price,
        quantity: i.quantity,
        subtotal: roundMoney(i.price * i.quantity),
        ...(i.variantId   ? { variantId: i.variantId }     : {}),
        ...(i.variantName ? { variantName: i.variantName } : {}),
        ...(i.notes       ? { notes: i.notes }             : {}),
        ...(i.details     ? { details: i.details }         : {}),
        ...(i.unit        ? { unit: i.unit }               : {}),
        ...(line && line.discount > 0 && i.discount ? { discount: line.discount, discountName: i.discount.name.trim() || 'Discount' } : {}),
        ...(i.trackStock ? { stockTracked: true } : {}),
      };
    }),
    subtotal: p.subtotal,
    discount: p.discount,
    discountType: s.orderDiscount?.kind ?? 'percent',
    tax: p.vat?.vat ?? 0,
    total: p.total,
    ...(p.vat ? { vat: p.vat } : {}),
    ...(p.lessVat > 0 ? { lessVat: p.lessVat } : {}),
    ...(discounts.length ? { discounts } : {}),
    ...(s.senior ? { senior: { type: s.senior.type, idNumber: s.senior.idNumber.trim(), name: s.senior.name.trim() } } : {}),
    paymentMethod: s.paymentMethod,
    amountTendered: s.amountTendered,
    change: s.change,
    status: 'completed',
    cashierId: s.cashierId,
    cashierName: s.cashierName,
    ...(s.customerName ? { customerName: s.customerName } : {}),
    ...(s.tableNumber  ? { tableNumber: s.tableNumber }   : {}),
    ...(s.notes        ? { notes: s.notes }               : {}),
    ...(payment?.reference ? { paymentReference: payment.reference } : {}),
    // e-wallet orders must carry these (firestore.rules); card ones don't need them
    ...(payment && isWallet ? { paymentVerification: 'manual' as const, verifiedBy: payment.verifiedBy } : {}),
    createdAt: now,
    updatedAt: now,
  };
}

