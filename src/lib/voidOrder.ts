import { getDoc, increment, writeBatch } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { tenantDoc } from '@/lib/tenant';
import type { Order } from '@/types';

export const VOID_REASON_MAX = 200;

/**
 * Admins void a completed sale, with a reason (firestore.rules allows only this
 * change). The sale stays for the record, marked VOID, and every sales total
 * leaves it out (they count completed orders only). Inventory: what the sale
 * took off a product's stock goes back (products since deleted are skipped).
 */
export async function voidOrder(
  orderId: string, reason: string, by: { id: string; displayName: string }, items: Order['items'] = [],
): Promise<Pick<Order, 'status' | 'voidedBy' | 'voidedByName' | 'voidedAt' | 'voidReason' | 'updatedAt'>> {
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
  const back = new Map<string, number>();
  for (const i of items) if (i.stockTracked) back.set(i.productId, (back.get(i.productId) ?? 0) + i.quantity);
  const batch = writeBatch(db);
  batch.update(tenantDoc('orders', orderId), change);
  for (const [productId, q] of back) {
    const product = await getDoc(tenantDoc('products', productId)).catch(() => null);
    if (product?.exists() && product.data().trackStock) batch.update(product.ref, { stock: increment(q) });
  }
  await batch.commit();
  return change;
}
