import { format } from 'date-fns';
import type { Order } from '@/types';

/**
 * Text for the QR code printed on every receipt: plain order details that staff
 * can scan to look an order up (e.g. for a refund). It's not a link, and it's
 * not proof of payment (anyone could print one). "PHP" instead of "₱" so that
 * every scanner reads it.
 *
 *   JPOS ORDER ORD-20261022-K3F9QA
 *   2026-10-22 07:30
 *   TOTAL PHP 280.00
 *   PAID GCASH
 *   REF 1234567890123    (GCash/Maya reference, or a card approval code)
 */
export function receiptQrPayload(
  order: Pick<Order, 'orderNumber' | 'createdAt' | 'total' | 'paymentMethod' | 'paymentReference'>,
): string {
  const created = new Date(order.createdAt);
  const lines = [
    `JPOS ORDER ${order.orderNumber}`,
    isNaN(created.getTime()) ? String(order.createdAt) : format(created, 'yyyy-MM-dd HH:mm'),
    `TOTAL PHP ${order.total.toFixed(2)}`,
    `PAID ${order.paymentMethod.toUpperCase()}`,
  ];
  if (order.paymentReference) lines.push(`REF ${order.paymentReference}`);
  return lines.join('\n');
}
