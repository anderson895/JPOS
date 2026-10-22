import type { Firestore } from 'firebase-admin/firestore';
import { checkQuota, dayKey, DAILY_TOTAL, PAYMENT_LIMIT, VERIFY_LIMIT, type Limit, type QuotaState } from './quota.js';

export type Reserve =
  | { ok: true }
  | { ok: false; reason: 'cooldown' | 'limit' | 'busy' | 'duplicate'; retryAfterSec?: number };

/** The fields of subscriptionRequests/{id} the payment email uses. */
export interface PaymentRequestDoc {
  tenantId: string;
  tenantName: string;
  uid: string;
  requesterName: string;
  plan: string;
  amount: number;
  channelLabel: string;
  reference: string;
  proofUrl: string;
  status: string;
}

/** What the email handlers read and count in Firestore. */
export interface Store {
  /** Counts one confirmation email for this account (and for the day), if the limits allow it. */
  reserveVerifyEmail(uid: string, now: Date): Promise<Reserve>;
  getPaymentRequest(id: string): Promise<PaymentRequestDoc | null>;
  /** Marks this payment's Super Admin email as sent. Refused ('duplicate') if it already was. */
  reservePaymentNotice(requestId: string, uid: string, now: Date): Promise<Reserve>;
  /** Undoes reservePaymentNotice when the email couldn't be sent, so it can be tried again. */
  releasePaymentNotice(requestId: string): Promise<void>;
}

/**
 * Server-only collection: no Firestore rule matches it, so the app can never
 * read or change it. Only this server (Admin SDK) writes the counters.
 */
const LOG = 'mailLog';

export function firestoreStore(db: Firestore): Store {
  const reserve = (quotaId: string, limit: Limit, now: Date, onceId?: string): Promise<Reserve> =>
    db.runTransaction(async (tx) => {
      const quotaRef = db.collection(LOG).doc(quotaId);
      const dayRef = db.collection(LOG).doc(`day_${dayKey(now)}`);
      const onceRef = onceId ? db.collection(LOG).doc(onceId) : null;
      const [quota, day, once] = await tx.getAll(quotaRef, dayRef, ...(onceRef ? [onceRef] : []));

      if (once?.exists) return { ok: false, reason: 'duplicate' };
      const check = checkQuota(quota.data() as Partial<QuotaState> | undefined, now.getTime(), limit);
      if (!check.ok) return check;
      const sentToday = Number(day.get('count') ?? 0);
      if (sentToday >= DAILY_TOTAL) return { ok: false, reason: 'busy' };

      tx.set(quotaRef, check.next);
      tx.set(dayRef, { count: sentToday + 1 });
      if (onceRef) tx.set(onceRef, { at: now });
      return { ok: true };
    });

  return {
    reserveVerifyEmail: (uid, now) => reserve(`verify_${uid}`, VERIFY_LIMIT, now),
    reservePaymentNotice: (requestId, uid, now) => reserve(`pay_${uid}`, PAYMENT_LIMIT, now, `paid_${requestId}`),
    async releasePaymentNotice(requestId) {
      await db.collection(LOG).doc(`paid_${requestId}`).delete();
    },
    async getPaymentRequest(id) {
      const snap = await db.collection('subscriptionRequests').doc(id).get();
      return snap.exists ? (snap.data() as PaymentRequestDoc) : null;
    },
  };
}
