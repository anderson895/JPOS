import type { DocumentReference, Firestore } from 'firebase-admin/firestore';
import {
  checkQuota, last24Hours, withinBudget,
  PAYMENT_LIMIT, VERIFY_IP_LIMIT, VERIFY_LIMIT,
  type Limit, type MailKind, type QuotaState,
} from './quota.js';

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
  /**
   * Counts one confirmation email for this account, this network (hashed IP,
   * when known) and the verify share of the budget, if all the limits allow it.
   */
  reserveVerifyEmail(uid: string, ipId: string | null, now: Date): Promise<Reserve>;
  /** Gives back what reserveVerifyEmail counted, when the email couldn't be sent. */
  releaseVerifyEmail(uid: string, ipId: string | null, now: Date): Promise<void>;
  getPaymentRequest(id: string): Promise<PaymentRequestDoc | null>;
  /** Marks this payment's Super Admin email as sent. Refused ('duplicate') if it already was. */
  reservePaymentNotice(requestId: string, uid: string, now: Date): Promise<Reserve>;
  /** Undoes reservePaymentNotice when the email couldn't be sent, so it can be tried again. */
  releasePaymentNotice(requestId: string, uid: string, now: Date): Promise<void>;
}

/**
 * Server-only collection: no Firestore rule matches it, so the app can never
 * read or change it. Only this server (Admin SDK) writes the counters.
 */
const LOG = 'mailLog';

interface Counted {
  kind: MailKind;
  quotaId: string;
  limit: Limit;
  ipId?: string | null;
  onceId?: string;
  now: Date;
}

const count = (snap: { get(field: string): unknown }) => Number(snap.get('count') ?? 0);

export function firestoreStore(db: Firestore): Store {
  const col = db.collection(LOG);

  const reserve = (r: Counted): Promise<Reserve> =>
    db.runTransaction(async (tx) => {
      const quotaRef = col.doc(r.quotaId);
      const onceRef = r.onceId ? col.doc(r.onceId) : null;
      const ipRef = r.ipId ? col.doc(r.ipId) : null;
      const hourRefs = last24Hours(r.now).map(h => col.doc(`hour_${r.kind}_${h}`));
      const refs: DocumentReference[] = [quotaRef, ...(onceRef ? [onceRef] : []), ...(ipRef ? [ipRef] : []), ...hourRefs];
      const snaps = await tx.getAll(...refs);
      let i = 0;
      const quota = snaps[i++];
      const once = onceRef ? snaps[i++] : null;
      const ip = ipRef ? snaps[i++] : null;
      const hours = snaps.slice(i).map(count);

      if (once?.exists) return { ok: false, reason: 'duplicate' };
      const now = r.now.getTime();
      const check = checkQuota(quota.data() as Partial<QuotaState> | undefined, now, r.limit);
      if (!check.ok) return check;
      const ipCheck = ip ? checkQuota(ip.data() as Partial<QuotaState> | undefined, now, VERIFY_IP_LIMIT) : null;
      if (ipCheck && !ipCheck.ok) return { ok: false, reason: 'limit', retryAfterSec: ipCheck.retryAfterSec };
      if (!withinBudget(r.kind, hours)) return { ok: false, reason: 'busy' };

      tx.set(quotaRef, check.next);
      if (ipRef && ipCheck?.ok) tx.set(ipRef, ipCheck.next);
      tx.set(hourRefs[0], { count: hours[0] + 1 });
      if (onceRef) tx.set(onceRef, { at: r.now });
      return { ok: true };
    });

  /**
   * Takes one back from each counter reserve() added. The wait between emails
   * (lastSentAt) stays, so a failing send can't be hammered.
   */
  const release = (r: Omit<Counted, 'limit'>): Promise<void> =>
    db.runTransaction(async (tx) => {
      const quotaRef = col.doc(r.quotaId);
      const ipRef = r.ipId ? col.doc(r.ipId) : null;
      const hourRef = col.doc(`hour_${r.kind}_${last24Hours(r.now)[0]}`);
      const refs: DocumentReference[] = [quotaRef, hourRef, ...(ipRef ? [ipRef] : [])];
      const [quota, hour, ip] = await tx.getAll(...refs);
      if (quota.exists) tx.set(quotaRef, { count: Math.max(0, count(quota) - 1) }, { merge: true });
      if (hour.exists) tx.set(hourRef, { count: Math.max(0, count(hour) - 1) });
      if (ipRef && ip?.exists) tx.set(ipRef, { count: Math.max(0, count(ip) - 1) }, { merge: true });
      if (r.onceId) tx.delete(col.doc(r.onceId));
    });

  return {
    reserveVerifyEmail: (uid, ipId, now) => reserve({ kind: 'verify', quotaId: `verify_${uid}`, limit: VERIFY_LIMIT, ipId, now }),
    releaseVerifyEmail: (uid, ipId, now) => release({ kind: 'verify', quotaId: `verify_${uid}`, ipId, now }),
    reservePaymentNotice: (requestId, uid, now) =>
      reserve({ kind: 'payment', quotaId: `pay_${uid}`, limit: PAYMENT_LIMIT, onceId: `paid_${requestId}`, now }),
    releasePaymentNotice: (requestId, uid, now) =>
      release({ kind: 'payment', quotaId: `pay_${uid}`, onceId: `paid_${requestId}`, now }),
    async getPaymentRequest(id) {
      const snap = await db.collection('subscriptionRequests').doc(id).get();
      return snap.exists ? (snap.data() as PaymentRequestDoc) : null;
    },
  };
}
