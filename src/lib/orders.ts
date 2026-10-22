import { roundMoney } from '@/lib/utils';
import type { CartItem, Order, PaymentMethod } from '@/types';

/** Everything an order needs, frozen at the moment the cashier checks out. */
export interface OrderSnapshot {
  items: CartItem[];
  subtotal: number;
  discountAmount: number;
  discountType: 'percent' | 'fixed';
  total: number;
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
  return {
    orderNumber,
    items: s.items.map(i => ({
      productId: i.productId,
      productName: i.productName,
      price: i.price,
      quantity: i.quantity,
      subtotal: roundMoney(i.price * i.quantity),
      ...(i.variantId   ? { variantId: i.variantId }     : {}),
      ...(i.variantName ? { variantName: i.variantName } : {}),
      ...(i.notes       ? { notes: i.notes }             : {}),
    })),
    subtotal: s.subtotal,
    discount: s.discountAmount,
    discountType: s.discountType,
    tax: 0,
    total: s.total,
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
