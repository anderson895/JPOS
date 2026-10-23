import { getDoc, increment, writeBatch, type DocumentReference } from 'firebase/firestore';
import { FirebaseError } from 'firebase/app';
import { db } from '@/lib/firebase';
import { tenantDoc } from '@/lib/tenant';
import { paymentRefKey } from '@/lib/eWallet';
import type { Order } from '@/types';

/** The e-wallet reference was already used for another order. */
export class ReferenceUsedError extends Error {
  constructor(readonly orderNumber: string) {
    super(`This reference was already used for order ${orderNumber}.`);
    this.name = 'ReferenceUsedError';
  }
}

/**
 * Saves an order. A GCash/Maya order also claims its reference in
 * `paymentRefs/{method}_{REF}` IN THE SAME BATCH, so a reference can never be
 * used twice (firestore.rules require the pair).
 *
 * - Reused reference → throws ReferenceUsedError with the other order's number.
 * - Saved already (e.g. a retry after a lost response) → resolves as saved.
 *
 * Inventory: lines marked `stockTracked` take their quantity off the product's
 * stock in the same batch. If that part is refused (the product was deleted,
 * or stopped keeping count), the sale is saved without it: a sale always wins.
 */
export async function saveOrderAtomically(orderRef: DocumentReference, order: Omit<Order, 'id'>): Promise<void> {
  const tracked = order.items.filter(i => i.stockTracked);
  if (tracked.length) {
    try {
      await commitOrder(orderRef, order, true);
      return;
    } catch (err) {
      if (!(err instanceof FirebaseError) || !['permission-denied', 'not-found'].includes(err.code)) throw err;
      console.warn('[POS] stock not updated for this sale', err.code);
      order = { ...order, items: order.items.map(({ stockTracked: _drop, ...i }) => i) };
    }
  }
  await commitOrder(orderRef, order, false);
}

async function commitOrder(orderRef: DocumentReference, order: Omit<Order, 'id'>, withStock: boolean): Promise<void> {
  const key = paymentRefKey(order);
  const batch = writeBatch(db);
  batch.set(orderRef, order);
  if (withStock) {
    // The same product can be on two lines (sizes): take the total off once
    const qty = new Map<string, number>();
    for (const i of order.items) if (i.stockTracked) qty.set(i.productId, (qty.get(i.productId) ?? 0) + i.quantity);
    for (const [productId, q] of qty) batch.update(tenantDoc('products', productId), { stock: increment(-q) });
  }
  if (key) {
    batch.set(tenantDoc('paymentRefs', key), {
      orderId: orderRef.id,
      orderNumber: order.orderNumber,
      cashierId: order.cashierId,
      method: order.paymentMethod,
      reference: order.paymentReference,
      createdAt: order.createdAt,
    });
  }

  try {
    await batch.commit();
  } catch (err) {
    if (!key || !(err instanceof FirebaseError) || err.code !== 'permission-denied') throw err;
    // Denied: find out whether the reference is already taken, and by which order
    const claim = await getDoc(tenantDoc('paymentRefs', key)).catch(() => null);
    if (!claim?.exists()) throw err;
    const { orderId, orderNumber } = claim.data() as { orderId?: string; orderNumber?: string };
    if (orderId === orderRef.id) return;   // our own earlier attempt went through
    throw new ReferenceUsedError(orderNumber ?? 'another order');
  }
}
