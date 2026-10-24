import { AggregateField, type DocumentReference, type Firestore } from 'firebase-admin/firestore';
import type { UsageCounts } from './usage.js';
import type { OrderLite, SummaryShop } from './summary.js';
import {
  checkQuota, last24Hours, withinBudget,
  PAYMENT_LIMIT, SUMMARY_LIMIT, VERIFY_IP_LIMIT, VERIFY_LIMIT,
  type Limit, type MailKind, type QuotaState,
} from './quota.js';
import { checkCode, type CodeCheck, type StoredCode } from './signupCode.js';

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

/** What the API handlers read, count and keep in Firestore. */
/** JPOS's public settings (prices, trial, payment QRs, contact) for the public pages. */
export interface PublicSettings {
  /** False when the Super Admin's setup was never run (the app then shows its defaults). */
  saved: boolean;
  settings: Record<string, unknown> | null;
}

export interface Store {
  /**
   * Counts one sign-up code email for this address (its emailId), this network
   * (hashed IP, when known) and the verify share of the budget, if all the limits allow it.
   */
  reserveVerifyEmail(emailId: string, ipId: string | null, now: Date): Promise<Reserve>;
  /** Gives back what reserveVerifyEmail counted, when the email couldn't be sent. */
  releaseVerifyEmail(emailId: string, ipId: string | null, now: Date): Promise<void>;
  /**
   * Keeps the newest code under this id (a sign-up's emailId, or an email
   * change's `chg_<uid>`); it replaces any older one.
   */
  saveSignupCode(id: string, code: StoredCode): Promise<void>;
  /** Checks a typed code: a right one is used up, a wrong one counts as a try. */
  checkSignupCode(id: string, hash: string, now: Date): Promise<CodeCheck>;
  /** True when this login has a JPOS profile or runs JPOS (Super Admin). */
  accountInUse(uid: string): Promise<boolean>;
  /** True when this login runs JPOS (platformAdmins/{uid}). */
  isPlatformAdmin(uid: string): Promise<boolean>;
  /** users/{uid}: the person's shop and role, or null without a profile. */
  profile(uid: string): Promise<{ tenantId: string; role: string; isActive: boolean } | null>;
  /** What a shop stores, counted (null when there's no such shop). */
  shopUsage(tenantId: string): Promise<UsageCounts | null>;
  /** platform/settings without who changed it and when (public pages don't need that). */
  publicSettings(): Promise<PublicSettings>;
  /** Shops on a free trial or a paid package, with their owner's email (the daily sales email). */
  summaryShops(): Promise<SummaryShop[]>;
  /** A shop's orders made in [startIso, endIso). */
  ordersBetween(tenantId: string, startIso: string, endIso: string): Promise<OrderLite[]>;
  /** Counts this shop's daily email for `date`; refused ('duplicate') when it was already sent. */
  reserveSummary(tenantId: string, date: string, now: Date): Promise<Reserve>;
  releaseSummary(tenantId: string, date: string, now: Date): Promise<void>;
  /** Writes the new email into users/{uid}, when that profile exists. */
  setProfileEmail(uid: string, email: string): Promise<void>;
  getPaymentRequest(id: string): Promise<PaymentRequestDoc | null>;
  /** Marks this payment's Super Admin email as sent. Refused ('duplicate') if it already was. */
  reservePaymentNotice(requestId: string, uid: string, now: Date): Promise<Reserve>;
  /** Undoes reservePaymentNotice when the email couldn't be sent, so it can be tried again. */
  releasePaymentNotice(requestId: string, uid: string, now: Date): Promise<void>;
}

/**
 * Server-only collections: no Firestore rule matches them, so the app can never
 * read or change them. Only this server (Admin SDK) writes the counters and codes.
 */
const LOG = 'mailLog';
const CODES = 'signupCodes';

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
    reserveVerifyEmail: (emailId, ipId, now) => reserve({ kind: 'verify', quotaId: `verify_${emailId}`, limit: VERIFY_LIMIT, ipId, now }),
    releaseVerifyEmail: (emailId, ipId, now) => release({ kind: 'verify', quotaId: `verify_${emailId}`, ipId, now }),
    async saveSignupCode(id, code) {
      await db.collection(CODES).doc(id).set(code);
    },
    checkSignupCode: (id, hash, now) =>
      db.runTransaction(async (tx) => {
        const ref = db.collection(CODES).doc(id);
        const snap = await tx.get(ref);
        const { result, next } = checkCode(snap.data() as Partial<StoredCode> | undefined, hash, now.getTime());
        if (next) tx.set(ref, next);
        else if (snap.exists) tx.delete(ref);
        return result;
      }),
    async accountInUse(uid) {
      const [profile, admin] = await db.getAll(db.collection('users').doc(uid), db.collection('platformAdmins').doc(uid));
      return profile.exists || admin.exists;
    },
    async isPlatformAdmin(uid) {
      return (await db.collection('platformAdmins').doc(uid).get()).exists;
    },
    async profile(uid) {
      const data = (await db.collection('users').doc(uid).get()).data();
      return data ? { tenantId: String(data.tenantId ?? ''), role: String(data.role ?? ''), isActive: data.isActive === true } : null;
    },
    async summaryShops() {
      const snap = await db.collection('tenants').where('status', 'in', ['trial', 'active']).get();
      const shops = snap.docs.map(d => ({ id: d.id, ...(d.data() as Record<string, unknown>) })) as Array<Record<string, any>>;
      const owners = shops.length ? await db.getAll(...shops.map(s => db.collection('users').doc(String(s.ownerUid || 'none')))) : [];
      const ms = (v: unknown) => (v && typeof (v as { toMillis?: () => number }).toMillis === 'function' ? (v as { toMillis: () => number }).toMillis() : null);
      return shops.map((s, i) => {
        const trialStart = ms(s.trialStartedAt);
        return {
          tenantId: s.id,
          name: String(s.name ?? ''),
          plan: String(s.plan ?? 'starter'),
          status: String(s.status ?? ''),
          suspended: s.suspended === true,
          trialEndsAt: trialStart != null ? trialStart + Number(s.trialDays ?? 0) * 24 * 60 * 60 * 1000 : null,
          periodEndsAt: ms(s.currentPeriodEnd),
          emailSummary: typeof s.entitlements?.emailSummary === 'boolean' ? s.entitlements.emailSummary : undefined,
          dailySummary: typeof s.dailySummary === 'boolean' ? s.dailySummary : undefined,
          ownerEmail: String(owners[i]?.data()?.email ?? ''),
        };
      });
    },
    async ordersBetween(tenantId, startIso, endIso) {
      const snap = await db.collection('tenants').doc(tenantId).collection('orders')
        .where('createdAt', '>=', startIso).where('createdAt', '<', endIso)
        .select('status', 'total', 'items').get();
      return snap.docs.map(d => d.data() as OrderLite);
    },
    reserveSummary: (tenantId, date, now) =>
      reserve({ kind: 'summary', quotaId: `summary_${tenantId}`, limit: SUMMARY_LIMIT, onceId: `sum_${tenantId}_${date}`, now }),
    releaseSummary: (tenantId, date, now) =>
      release({ kind: 'summary', quotaId: `summary_${tenantId}`, onceId: `sum_${tenantId}_${date}`, now }),
    async publicSettings() {
      const snap = await db.collection('platform').doc('settings').get();
      if (!snap.exists) return { saved: false, settings: null };
      const settings = { ...(snap.data() as Record<string, unknown>) };
      delete settings.updatedAt;
      delete settings.updatedBy;
      delete settings.lastAuditId;
      return { saved: true, settings };
    },
    async shopUsage(tenantId) {
      const shop = db.collection('tenants').doc(tenantId);
      const products = shop.collection('products');
      const [shopSnap, branding, payments, productCount, orderCount, pictureCount, measured, staffPhotos] = await Promise.all([
        shop.get(),
        shop.collection('settings').doc('branding').get(),
        shop.collection('settings').doc('payments').get(),
        products.count().get(),
        shop.collection('orders').count().get(),
        products.where('imageUrl', '>', '').count().get(),
        products.where('imageBytes', '>', 0).aggregate({ n: AggregateField.count(), bytes: AggregateField.sum('imageBytes') }).get(),
        // A shop has few people: counted here, so the live database needs no composite index
        db.collection('users').where('tenantId', '==', tenantId).select('photoURL').get(),
      ]);
      if (!shopSnap.exists) return null;
      const t = shopSnap.data() as { plan?: string; entitlements?: { storageMB?: number | null } };
      const pay = payments.data() as { gcash?: { qrImageUrl?: string }; maya?: { qrImageUrl?: string } } | undefined;
      const otherPictures = (branding.data()?.logoUrl ? 1 : 0) + (pay?.gcash?.qrImageUrl ? 1 : 0) + (pay?.maya?.qrImageUrl ? 1 : 0)
        + staffPhotos.docs.filter(d => { const p = d.get('photoURL'); return typeof p === 'string' && p !== ''; }).length;
      return {
        plan: t.plan ?? 'starter',
        storageMB: t.entitlements?.storageMB,
        products: productCount.data().count,
        orders: orderCount.data().count,
        productPictures: pictureCount.data().count,
        measuredPictures: measured.data().n,
        measuredBytes: Number(measured.data().bytes) || 0,
        otherPictures,
      };
    },
    async setProfileEmail(uid, email) {
      const ref = db.collection('users').doc(uid);
      if ((await ref.get()).exists) await ref.update({ email, updatedAt: new Date().toISOString() });
    },
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
