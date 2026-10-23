import { doc, getDoc, serverTimestamp, setDoc, writeBatch } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { tenantDoc, tenantRef } from '@/lib/tenant';
import { DEFAULT_THEME, isThemeName, type ThemeName } from '@/components/shared/theme';
import type { BusinessType, ReceiptInfo, StoreBranding, Tenant } from '@/types';

/**
 * The shop's own look and details (Store Settings): what it sells, its name,
 * logo and colors, and what its receipts say. Same limits as firestore.rules.
 */

// ── What the shop sells ────────────────────────────────────────────────────
export const BUSINESS_TYPES: BusinessType[] = ['food', 'grocery', 'clothing', 'hardware', 'pharmacy', 'gadgets', 'services', 'other'];

export const BUSINESS_LABEL: Record<BusinessType, string> = {
  food: 'Food & drinks',
  grocery: 'Sari-sari & grocery',
  clothing: 'Clothes & shoes',
  hardware: 'Hardware',
  pharmacy: 'Pharmacy',
  gadgets: 'Gadgets',
  services: 'Services',
  other: 'Something else',
};

export const isBusinessType = (v: unknown): v is BusinessType => BUSINESS_TYPES.includes(v as BusinessType);

// ── Name, logo and colors (public: the shop's sign-in page shows them) ─────
export const NAME_MIN = 2;
export const NAME_MAX = 60;
/** A logo picture this big or smaller (it's shown small everywhere). */
export const LOGO_MAX_BYTES = 2 * 1024 * 1024;

/** What the app shows for a shop: its own name, logo and colors, or the JPOS ones. */
export interface StoreBrand {
  name: string;
  /** Always a picture to show: the shop's logo, or the JPOS logo. */
  logoUrl: string;
  /** True when the shop uploaded its own logo. */
  hasLogo: boolean;
  theme: ThemeName;
}

export const JPOS_LOGO = '/logo.png';

export function storeBrand(branding: StoreBranding | null | undefined, shopName?: string | null): StoreBrand {
  const logo = branding?.logoUrl?.trim() ?? '';
  return {
    name: branding?.name?.trim() || shopName?.trim() || 'JPOS',
    logoUrl: logo || JPOS_LOGO,
    hasLogo: !!logo,
    theme: isThemeName(branding?.theme) ? branding.theme : DEFAULT_THEME,
  };
}

export function brandingRef(tenantId?: string) {
  return tenantDoc('settings', 'branding', tenantId);
}

/** The shop's sign-in page: the look of the shop with this id, before anyone signs in. */
export async function getPublicBranding(tenantId: string): Promise<StoreBranding | null> {
  const snap = await getDoc(doc(db, 'tenants', tenantId, 'settings', 'branding'));
  return snap.exists() ? (snap.data() as StoreBranding) : null;
}

// ── Receipt ────────────────────────────────────────────────────────────────
export const EMPTY_RECEIPT: ReceiptInfo = { vatRegistered: false, tin: '', address: '', phone: '', footer: '' };
export const RECEIPT_MAX = { tin: 20, address: 200, phone: 30, footer: 200 } as const;

export function receiptInfo(tenant: Pick<Tenant, 'receipt'> | null | undefined): ReceiptInfo {
  return { ...EMPTY_RECEIPT, ...(tenant?.receipt ?? {}) };
}

/** Why the store details can't be saved (plain words), or null. */
export function storeProblem(s: { name: string; receipt: ReceiptInfo }): string | null {
  const name = s.name.trim();
  if (name.length < NAME_MIN) return 'Enter your store name.';
  if (name.length > NAME_MAX) return `Keep the store name to ${NAME_MAX} letters or fewer.`;
  const r = s.receipt;
  if (r.tin.trim() && !/^[0-9][0-9 -]*[0-9]$/.test(r.tin.trim())) return 'The TIN can only have numbers and dashes.';
  if (r.vatRegistered && !r.tin.trim()) return 'A VAT-registered store needs its TIN on the receipt.';
  if (r.tin.trim().length > RECEIPT_MAX.tin) return 'The TIN is too long.';
  if (r.address.trim().length > RECEIPT_MAX.address) return 'The address is too long.';
  if (r.phone.trim().length > RECEIPT_MAX.phone) return 'The phone number is too long.';
  if (r.footer.trim().length > RECEIPT_MAX.footer) return 'The thank-you line is too long.';
  return null;
}

/**
 * Saves Store Settings (admins only, firestore.rules). One batch: the shop's
 * name, kind and receipt details, and its public name, logo and colors.
 */
export async function saveStore(input: {
  tenantId: string; name: string; businessType: BusinessType; receipt: ReceiptInfo; logoUrl: string; theme: ThemeName;
}): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Sign in again to save.');
  const problem = storeProblem(input);
  if (problem) throw new Error(problem);
  const name = input.name.trim();
  const r = input.receipt;
  const batch = writeBatch(db);
  batch.update(tenantRef(input.tenantId), {
    name,
    businessType: input.businessType,
    receipt: {
      vatRegistered: r.vatRegistered,
      tin: r.tin.trim(),
      address: r.address.trim(),
      phone: r.phone.trim(),
      footer: r.footer.trim(),
    },
    updatedAt: serverTimestamp(),
  });
  batch.set(brandingRef(input.tenantId), {
    name, logoUrl: input.logoUrl.trim(), theme: input.theme, updatedAt: serverTimestamp(), updatedBy: uid,
  });
  await batch.commit();
}

/**
 * Shops made before Store Settings have no public name yet, so their sign-in
 * page showed "JPOS". The admin app adds it once, with the shop's name. Also
 * used to put back the JPOS look when the package no longer has its own.
 */
export async function addMissingBranding(tenant: Pick<Tenant, 'id' | 'name'>): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  await setDoc(brandingRef(tenant.id), {
    name: tenant.name, logoUrl: '', theme: DEFAULT_THEME, updatedAt: serverTimestamp(), updatedBy: uid,
  });
}
