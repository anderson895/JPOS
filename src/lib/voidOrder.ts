import { updateDoc } from 'firebase/firestore';
import { tenantDoc } from '@/lib/tenant';
import type { Order } from '@/types';

export const VOID_REASON_MAX = 200;

/**
 * Admins void a completed sale, with a reason (firestore.rules allows only this
 * change). The sale stays for the record, marked VOID, and every sales total
 * leaves it out (they count completed orders only).
 */
export async function voidOrder(orderId: string, reason: string, by: { id: string; displayName: string }): Promise<Pick<Order, 'status' | 'voidedBy' | 'voidedByName' | 'voidedAt' | 'voidReason' | 'updatedAt'>> {
  const why = reason.trim();
  if (why.length < 3) throw new Error('Say why the sale is voided.');
  if (why.length > VOID_REASON_MAX) throw new Error('Keep the reason short.');
  const now = new Date().toISOString();
  const change = {
    status: 'voided' as const,
    voidedBy: by.id,
    voidedByName: by.displayName.trim().slice(0, 60),
    voidedAt: now,
    voidReason: why,
    updatedAt: now,
  };
  await updateDoc(tenantDoc('orders', orderId), change);
  return change;
}
