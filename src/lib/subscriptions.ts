import {
  collection, doc, getDoc, onSnapshot, query, serverTimestamp, where, writeBatch, type Unsubscribe,
} from 'firebase/firestore';
import { FirebaseError } from 'firebase/app';
import { auth, db } from '@/lib/firebase';
import { uploadImage } from '@/lib/cloudinary';
import { normalizeReference } from '@/lib/eWallet';
import { getPlatformSettings } from '@/lib/platform';
import { PLAN_LABEL } from '@/lib/entitlements';
import type { PlanId, SubscriptionRequest, Tenant } from '@/types';

/**
 * A shop's own subscription actions: create the shop at sign-up, start the
 * free trial once, and send a manual payment (QR + receipt) for a package.
 */

// ── Shop link (staff sign-in page: …/s/<slug>) ─────────────────────────────
const RESERVED = new Set(['admin', 'platform', 'login', 's', 'api', 'staff', 'subscribe', 'billing', 'help', 'www', 'app', 'jpos']);

/** "Kape ni Juan!" → "kape-ni-juan" */
export function slugify(text: string): string {
  return text.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/g, '');
}

/** Why this link can't be used (plain words), or null. Same rule as firestore.rules. */
export function slugProblem(slug: string): string | null {
  if (slug.length < 3) return 'Use at least 3 letters or numbers.';
  if (!/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(slug)) return 'Use only small letters, numbers and dashes.';
  if (RESERVED.has(slug)) return 'This name is reserved. Try another one.';
  return null;
}

export async function isSlugAvailable(slug: string): Promise<boolean> {
  return !(await getDoc(doc(db, 'slugs', slug))).exists();
}

export class SlugTakenError extends Error {
  constructor() { super('That shop link is already taken. Try another one.'); this.name = 'SlugTakenError'; }
}

/**
 * Creates the owner's shop in SETUP mode (they can prepare everything, but
 * can't sell until they start the trial or a payment is approved). One batch:
 * the shop, its link, and the owner's profile. Needs a verified email.
 */
export async function createShop(input: { shopName: string; slug: string; ownerName: string; desiredPlan: PlanId }) {
  const user = auth.currentUser;
  if (!user) throw new Error('Sign in again.');
  if (!user.emailVerified) throw new Error('Verify your email first.');
  await user.getIdToken(true);
  if (!(await isSlugAvailable(input.slug))) throw new SlugTakenError();

  const settings = await getPlatformSettings();
  const iso = new Date().toISOString();
  const shopRef = doc(collection(db, 'tenants'));
  const batch = writeBatch(db);
  batch.set(shopRef, {
    name: input.shopName.trim(), slug: input.slug, ownerUid: user.uid,
    plan: 'starter', desiredPlan: input.desiredPlan,
    status: 'setup', suspended: false, trialUsed: false, trialDays: settings.trialDays,
    entitlements: settings.plans.starter.entitlements,
    staffCount: 1, lastStaffChange: user.uid, pendingRequestId: null,
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  });
  batch.set(doc(db, 'slugs', input.slug), { tenantId: shopRef.id });
  batch.set(doc(db, 'users', user.uid), {
    tenantId: shopRef.id, email: user.email ?? '', displayName: input.ownerName.trim(),
    role: 'admin', isActive: true, rfidTag: '', photoURL: '', createdAt: iso, updatedAt: iso,
  });
  try {
    await batch.commit();
  } catch (err) {
    if (err instanceof FirebaseError && err.code === 'permission-denied' && !(await isSlugAvailable(input.slug))) throw new SlugTakenError();
    throw err;
  }
  return shopRef.id;
}

/** Starts the one-time free trial: selling unlocks for `trialDays` from now. */
export async function startTrial(t: Tenant) {
  if (t.trialUsed || t.status !== 'setup') throw new Error('The free trial was already used.');
  const batch = writeBatch(db);
  batch.update(doc(db, 'tenants', t.id), { status: 'trial', trialUsed: true, trialStartedAt: serverTimestamp(), updatedAt: serverTimestamp() });
  await batch.commit();
}

export class ReferenceAlreadyUsedError extends Error {
  constructor() { super('This reference number was already used for another payment.'); this.name = 'ReferenceAlreadyUsedError'; }
}

/** The payment summary the owner sends on Messenger. */
export function paymentMessage(r: { tenantName: string; plan: PlanId; amount: number; reference: string; channelLabel: string }) {
  return `Hi! JPOS payment for "${r.tenantName}" · ${PLAN_LABEL[r.plan]} package · PHP ${r.amount.toLocaleString('en-PH')} via ${r.channelLabel} · Ref ${r.reference}`;
}

/**
 * Sends a manual payment: uploads the receipt screenshot, then ONE batch with
 * the request, a claim on the reference number (never reusable), and the
 * shop's "open request" slot. Checks everything first so the error is clear.
 */
export async function submitPaymentRequest(input: {
  tenant: Tenant; plan: PlanId; channelId: string; reference: string; proofFile: File; requesterName: string;
}) {
  const user = auth.currentUser;
  if (!user) throw new Error('Sign in again.');
  const { tenant } = input;
  const reference = normalizeReference(input.reference);
  if (!/^[A-Z0-9]{6,30}$/.test(reference)) throw new Error('Enter the reference number from your receipt (6 to 30 letters or numbers).');
  if (!input.proofFile.type.startsWith('image/')) throw new Error('The receipt must be a picture (screenshot or photo).');
  if (input.proofFile.size > 8 * 1024 * 1024) throw new Error('The receipt picture must be 8 MB or smaller.');

  // Fresh check: prices and QR codes may have changed since the page opened
  const settings = await getPlatformSettings();
  const plan = settings.plans[input.plan];
  const channel = settings.paymentChannels?.[input.channelId];
  if (!plan) throw new Error('This package is no longer available.');
  if (!channel?.enabled) throw new Error('This payment option was just turned off. Pick another one.');
  const fresh = await getDoc(doc(db, 'tenants', tenant.id));
  if (fresh.exists() && fresh.data().pendingRequestId) throw new Error('You already sent a payment. Please wait for the review.');
  if ((await getDoc(doc(db, 'subscriptionRefs', `${input.channelId}_${reference}`)).catch(() => null))?.exists()) throw new ReferenceAlreadyUsedError();

  const proofUrl = await uploadImage(input.proofFile);
  const reqRef = doc(collection(db, 'subscriptionRequests'));
  const batch = writeBatch(db);
  batch.set(reqRef, {
    tenantId: tenant.id, tenantName: tenant.name, uid: user.uid, requesterName: input.requesterName.slice(0, 60),
    plan: input.plan, amount: plan.price, months: 1,
    channelId: input.channelId, channelLabel: channel.label, channelAccountHint: channel.accountHint,
    reference, proofUrl, status: 'pending', createdAt: serverTimestamp(),
  });
  batch.set(doc(db, 'subscriptionRefs', `${input.channelId}_${reference}`), { requestId: reqRef.id, uid: user.uid, createdAt: serverTimestamp() });
  batch.update(doc(db, 'tenants', tenant.id), { pendingRequestId: reqRef.id, updatedAt: serverTimestamp() });
  try {
    await batch.commit();
  } catch (err) {
    if (err instanceof FirebaseError && err.code === 'permission-denied') {
      throw new Error('The payment could not be sent. The reference may already be used, or the price just changed. Refresh and try again.');
    }
    throw err;
  }
  return { id: reqRef.id, reference, amount: plan.price, channelLabel: channel.label };
}

/** Takes back a payment that's still waiting (e.g. the wrong screenshot). Its reference stays used. */
export async function cancelPaymentRequest(t: Tenant, req: SubscriptionRequest) {
  const batch = writeBatch(db);
  batch.update(doc(db, 'subscriptionRequests', req.id), { status: 'cancelled' });
  batch.update(doc(db, 'tenants', t.id), { pendingRequestId: null, updatedAt: serverTimestamp() });
  await batch.commit();
}

/** This shop's payments, newest first (live). */
export function watchShopRequests(tenantId: string, cb: (rows: SubscriptionRequest[]) => void, onError?: (e: Error) => void): Unsubscribe {
  return onSnapshot(
    query(collection(db, 'subscriptionRequests'), where('tenantId', '==', tenantId)),
    snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() }) as SubscriptionRequest)
      .sort((a, b) => (b.createdAt?.toMillis?.() ?? Date.now()) - (a.createdAt?.toMillis?.() ?? Date.now()))),
    e => onError?.(e),
  );
}
