import {
  collection, doc, getDoc, onSnapshot, query, serverTimestamp, Timestamp, where, writeBatch, type Unsubscribe,
} from 'firebase/firestore';
import { addMonths } from 'date-fns';
import { auth, db } from '@/lib/firebase';
import { DEFAULT_ENTITLEMENTS, periodEnd } from '@/lib/entitlements';
import type { PlatformSettings, SubscriptionRequest, Tenant } from '@/types';

/**
 * Platform (Super Admin) data: platform/settings, the audit log, and reviewing
 * shops' payment requests. Every settings change is paired with an audit entry
 * in the same batch (firestore.rules require it).
 */

export const DEFAULT_PLATFORM_SETTINGS: PlatformSettings = {
  plans: {
    starter:    { name: 'Starter',    price: 499,  entitlements: DEFAULT_ENTITLEMENTS.starter },
    business:   { name: 'Business',   price: 999,  entitlements: DEFAULT_ENTITLEMENTS.business },
    enterprise: { name: 'Enterprise', price: 1999, entitlements: DEFAULT_ENTITLEMENTS.enterprise },
  },
  trialDays: 7,
  paymentChannels: {},
  messengerUrl: 'https://m.me/joshuapadilla895',
  contactPhone: '09454454744',
  lastAuditId: '',
};

const settingsRef = () => doc(db, 'platform', 'settings');

/** The saved settings, or null when the Super Admin's setup was never run on this database. */
export async function getSavedPlatformSettings(): Promise<PlatformSettings | null> {
  const snap = await getDoc(settingsRef());
  return snap.exists() ? (snap.data() as PlatformSettings) : null;
}

export async function getPlatformSettings(): Promise<PlatformSettings> {
  const snap = await getDoc(settingsRef());
  return snap.exists() ? (snap.data() as PlatformSettings) : DEFAULT_PLATFORM_SETTINGS;
}

let publicSettings: Promise<{ settings: PlatformSettings; saved: boolean }> | null = null;

/**
 * The settings for public pages, once per visit: from JPOS's server, where
 * they're cached (Redis), so visitors don't each read Firebase. If the server
 * can't answer, Firebase is read directly. A minute or two behind at most;
 * payments and new shops always read the settings fresh.
 */
export function loadPublicSettings(): Promise<{ settings: PlatformSettings; saved: boolean }> {
  publicSettings ??= fetch('/api/public/settings')
    .then(r => (r.ok ? r.json() : Promise.reject(new Error(`settings: ${r.status}`))))
    .then((b: { saved?: boolean; settings?: Partial<PlatformSettings> | null }) => {
      if (typeof b?.saved !== 'boolean') throw new Error('settings: unexpected answer');
      return b.saved && b.settings
        ? { settings: { ...DEFAULT_PLATFORM_SETTINGS, ...b.settings } as PlatformSettings, saved: true }
        : { settings: DEFAULT_PLATFORM_SETTINGS, saved: false };
    })
    .catch(async () => {
      const saved = await getSavedPlatformSettings();
      return { settings: saved ?? DEFAULT_PLATFORM_SETTINGS, saved: !!saved };
    })
    .catch(err => { publicSettings = null; throw err; });
  return publicSettings;
}

/** `saved` is false when the settings were never set up (the defaults are passed instead). */
export function subscribePlatformSettings(cb: (s: PlatformSettings, saved: boolean) => void, onError?: (e: Error) => void): Unsubscribe {
  return onSnapshot(settingsRef(), snap => cb(snap.exists() ? (snap.data() as PlatformSettings) : DEFAULT_PLATFORM_SETTINGS, snap.exists()), e => onError?.(e));
}

/** Enabled payment channels, in display order. */
export function enabledChannels(s: PlatformSettings) {
  return Object.entries(s.paymentChannels ?? {})
    .filter(([, c]) => c.enabled && c.qrImageUrl)
    .sort(([, a], [, b]) => a.order - b.order)
    .map(([id, c]) => ({ id, ...c }));
}

export async function isSuperAdmin(uid: string): Promise<boolean> {
  try { return (await getDoc(doc(db, 'platformAdmins', uid))).exists(); } catch { return false; }
}

export type AuditAction =
  | 'settings.update' | 'channel.update' | 'plans.update'
  | 'tenant.suspend' | 'tenant.unsuspend' | 'tenant.extend' | 'tenant.adjust';

/** Saves platform settings together with an audit entry (one batch). */
export async function savePlatformSettings(next: Omit<PlatformSettings, 'lastAuditId' | 'updatedAt' | 'updatedBy'>, action: AuditAction, details: Record<string, string>) {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Sign in again.');
  const auditRef = doc(collection(db, 'platformAudit'));
  const batch = writeBatch(db);
  batch.set(auditRef, { action, by: uid, at: serverTimestamp(), details });
  batch.set(settingsRef(), { ...next, lastAuditId: auditRef.id, updatedAt: serverTimestamp(), updatedBy: uid });
  await batch.commit();
}

/** Live list of payment requests waiting for review (Super Admin). */
export function watchPendingRequests(cb: (rows: SubscriptionRequest[]) => void, onError?: (e: Error) => void): Unsubscribe {
  return onSnapshot(
    query(collection(db, 'subscriptionRequests'), where('status', '==', 'pending')),
    snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() }) as SubscriptionRequest)
      .sort((a, b) => (a.createdAt?.toMillis?.() ?? 0) - (b.createdAt?.toMillis?.() ?? 0))),
    e => onError?.(e),
  );
}

/** Live list of every shop (Super Admin). */
export function watchShops(cb: (rows: Tenant[]) => void, onError?: (e: Error) => void): Unsubscribe {
  return onSnapshot(collection(db, 'tenants'),
    snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() }) as Tenant)
      .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))),
    e => onError?.(e));
}

/**
 * Approves a payment: the shop becomes active with the paid package, for one
 * month after whichever is later: now, or the end of its current trial/period
 * (so unused days aren't lost). The rules check the date is within a month.
 */
export async function approveRequest(req: SubscriptionRequest, settings: PlatformSettings) {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Sign in again.');
  const tenantSnap = await getDoc(doc(db, 'tenants', req.tenantId));
  if (!tenantSnap.exists()) throw new Error('This shop no longer exists.');
  const tenant = { id: tenantSnap.id, ...tenantSnap.data() } as Tenant;
  if (tenant.pendingRequestId !== req.id) throw new Error('This request is no longer the shop’s open request.');
  const now = new Date();
  const end = periodEnd(tenant);
  const base = end && end > now ? end : now;
  const newEnd = addMonths(base, req.months || 1);
  const plan = settings.plans[req.plan];
  if (!plan) throw new Error('Unknown package.');

  const batch = writeBatch(db);
  batch.update(doc(db, 'subscriptionRequests', req.id), { status: 'approved', reviewedBy: uid, reviewedAt: serverTimestamp() });
  batch.update(doc(db, 'tenants', req.tenantId), {
    status: 'active', plan: req.plan, entitlements: plan.entitlements,
    currentPeriodEnd: Timestamp.fromDate(newEnd), pendingRequestId: null, updatedAt: serverTimestamp(),
  });
  await batch.commit();
  return newEnd;
}

/** Rejects a payment with a reason the shop sees; it can submit a new one. */
export async function rejectRequest(req: SubscriptionRequest, reason: string) {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Sign in again.');
  const clean = reason.trim();
  if (!clean) throw new Error('Write a reason the shop will see.');
  const batch = writeBatch(db);
  batch.update(doc(db, 'subscriptionRequests', req.id), { status: 'rejected', reason: clean.slice(0, 300), reviewedBy: uid, reviewedAt: serverTimestamp() });
  batch.update(doc(db, 'tenants', req.tenantId), { pendingRequestId: null, updatedAt: serverTimestamp() });
  await batch.commit();
}

/** Suspends or restores a shop (Super Admin), with an audit entry. */
export async function setSuspended(tenantId: string, suspended: boolean, reason: string) {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Sign in again.');
  const auditRef = doc(collection(db, 'platformAudit'));
  const batch = writeBatch(db);
  batch.set(auditRef, { action: suspended ? 'tenant.suspend' : 'tenant.unsuspend', by: uid, at: serverTimestamp(), details: { tenantId, reason: reason.slice(0, 300) } });
  batch.update(doc(db, 'tenants', tenantId), { suspended, lastAuditId: auditRef.id, updatedAt: serverTimestamp() });
  await batch.commit();
}
