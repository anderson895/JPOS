import type { Entitlements, PlanId, Tenant } from '@/types';

/**
 * A shop's subscription state, computed the same way firestore.rules do
 * (`canSell` / `canSetup`), so the UI shows what the server will allow.
 */
export type ShopState =
  | 'setup'          // signed up, not started yet: view-only
  | 'trial'          // free trial running
  | 'trial-ended'    // trial over, not paid: view-only
  | 'active'         // paid period running
  | 'expired'        // paid period over: read-only
  | 'suspended';     // stopped by the Super Admin: read-only

const DAY = 24 * 60 * 60 * 1000;

/** When the current trial or paid period ends (null in setup mode). */
export function periodEnd(t: Tenant): Date | null {
  if (t.status === 'trial' && t.trialStartedAt) return new Date(t.trialStartedAt.toMillis() + t.trialDays * DAY);
  if (t.status === 'active' && t.currentPeriodEnd) return t.currentPeriodEnd.toDate();
  return null;
}

export function shopState(t: Tenant, now: Date = new Date()): ShopState {
  if (t.suspended) return 'suspended';
  const end = periodEnd(t);
  if (t.status === 'setup') return 'setup';
  if (t.status === 'trial') return end && now < end ? 'trial' : 'trial-ended';
  return end && now < end ? 'active' : 'expired';
}

/**
 * Full access (sell and edit): a running free trial or a paid period. Before
 * that, after the trial, after expiry or when suspended, the shop is view-only.
 */
export const hasAccess = (t: Tenant | null | undefined, now?: Date) => !!t && ['trial', 'active'].includes(shopState(t, now));

/** Whole days left in the trial / paid period (0 on the last day), or null. */
export function daysLeft(t: Tenant, now: Date = new Date()): number | null {
  const end = periodEnd(t);
  if (!end) return null;
  return Math.max(0, Math.ceil((end.getTime() - now.getTime()) / DAY));
}

export const PLAN_IDS: PlanId[] = ['starter', 'business', 'enterprise'];
export const PLAN_LABEL: Record<PlanId, string> = { starter: 'Starter', business: 'Business', enterprise: 'Enterprise' };

/** Defaults; the Super Admin can change them in platform settings. */
export const DEFAULT_ENTITLEMENTS: Record<PlanId, Entitlements> = {
  starter:    { plan: 'starter',    staffLimit: 3,    fullReports: false, pdfExport: false, trends: false, branding: false, discounts: false, voidSales: true,  inventory: false, auditTrail: false, emailSummary: false, backup: false, imports: false, storageMB: 500 },
  business:   { plan: 'business',   staffLimit: 10,   fullReports: true,  pdfExport: true,  trends: true,  branding: true,  discounts: true,  voidSales: true, inventory: true, auditTrail: true, emailSummary: true, backup: true, imports: true, storageMB: 2048 },
  enterprise: { plan: 'enterprise', staffLimit: 100,  fullReports: true,  pdfExport: true,  trends: true,  branding: true,  discounts: true,  voidSales: true, inventory: true, auditTrail: true, emailSummary: true, backup: true, imports: true, storageMB: 10240 },
};

/** Package features a shop may or may not have (the account limit is separate). */
export type Feature = 'fullReports' | 'pdfExport' | 'trends' | 'branding' | 'discounts' | 'voidSales' | 'inventory' | 'auditTrail' | 'emailSummary' | 'backup' | 'imports';

/**
 * Does this shop's package include it? A shop saved before a feature existed
 * has no flag for it: then the package's default decides (DEFAULT_ENTITLEMENTS),
 * exactly like firestore.rules (`shopCan`, and void open to every package).
 */
export function hasFeature(t: Pick<Tenant, 'plan' | 'entitlements'> | null | undefined, f: Feature): boolean {
  if (!t) return false;
  const v = t.entitlements?.[f];
  if (typeof v === 'boolean') return v;
  const d = DEFAULT_ENTITLEMENTS[t.plan]?.[f];
  return typeof d === 'boolean' ? d : t.plan !== 'starter';
}

/** The package's storage in MB (null = no limit); shops saved before storage limits use their package's. */
export function storageMB(plan: PlanId, e?: Partial<Entitlements> | null): number | null {
  if (e?.storageMB === null) return null;
  return typeof e?.storageMB === 'number' && e.storageMB > 0 ? e.storageMB : DEFAULT_ENTITLEMENTS[plan]?.storageMB ?? 500;
}

/** The plain-words note for a locked feature. */
export const BUSINESS_UP = 'Included in the Business and Enterprise packages.';
