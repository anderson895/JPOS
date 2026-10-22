import { roundMoney } from '@/lib/utils';
import type { Order, PaymentMethod } from '@/types';

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: 'Cash',
  gcash: 'GCash',
  maya: 'Maya',
  card: 'Card',
};

const METHOD_ORDER: PaymentMethod[] = ['cash', 'gcash', 'maya', 'card'];

export interface MethodTotal {
  method: string;
  label: string;
  /** Completed orders paid this way. */
  count: number;
  /** Their total, rounded to centavos. */
  total: number;
}

/**
 * Completed sales per payment method, for reconciling against the cash drawer
 * and the store's GCash/Maya statements. Every method is listed, in a fixed
 * order (Cash, GCash, Maya, Card), even at zero; an unexpected method in old
 * data gets its own row instead of disappearing.
 */
export function paymentBreakdown(orders: Pick<Order, 'status' | 'paymentMethod' | 'total'>[]): MethodTotal[] {
  const rows = new Map<string, MethodTotal>(
    METHOD_ORDER.map(m => [m, { method: m, label: PAYMENT_METHOD_LABEL[m], count: 0, total: 0 }]),
  );
  for (const o of orders) {
    if (o.status !== 'completed') continue;
    const key = String(o.paymentMethod);
    const row = rows.get(key) ?? { method: key, label: key.toUpperCase(), count: 0, total: 0 };
    row.count += 1;
    row.total = roundMoney(row.total + (Number(o.total) || 0));
    rows.set(key, row);
  }
  return [...rows.values()];
}

/**
 * The Ref column: the GCash/Maya reference or card approval code, else `empty`.
 * Pass '-' for the PDF (its built-in fonts don't cover every character).
 */
export function paymentRefLabel(order: Pick<Order, 'paymentReference'>, empty = '—'): string {
  return order.paymentReference || empty;
}
