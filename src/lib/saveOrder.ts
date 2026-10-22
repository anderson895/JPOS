import { doc, getDoc, writeBatch, type DocumentReference } from 'firebase/firestore';
import { FirebaseError } from 'firebase/app';
import { db } from '@/lib/firebase';
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
 */
export async function saveOrderAtomically(orderRef: DocumentReference, order: Omit<Order, 'id'>): Promise<void> {
  const key = paymentRefKey(order);
  const batch = writeBatch(db);
  batch.set(orderRef, order);
  if (key) {
    batch.set(doc(db, 'paymentRefs', key), {
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
    const claim = await getDoc(doc(db, 'paymentRefs', key)).catch(() => null);
    if (!claim?.exists()) throw err;
    const { orderId, orderNumber } = claim.data() as { orderId?: string; orderNumber?: string };
    if (orderId === orderRef.id) return;   // our own earlier attempt went through
    throw new ReferenceUsedError(orderNumber ?? 'another order');
  }
}
