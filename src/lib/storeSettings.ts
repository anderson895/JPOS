import { doc, getDoc, onSnapshot, setDoc, type Unsubscribe } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { withPaymentDefaults } from '@/lib/eWallet';
import type { PaymentSettings } from '@/types';

/**
 * The ONLY place that knows where the store's payment settings live. When JPOS
 * becomes multi-tenant this becomes tenants/{t}/settings/payments, and nothing
 * else has to change.
 */
export function paymentSettingsRef() {
  return doc(db, 'settings', 'payments');
}

export async function getPaymentSettings(): Promise<PaymentSettings> {
  const snap = await getDoc(paymentSettingsRef());
  return withPaymentDefaults(snap.data());
}

/** Live settings for the POS, so a new QR or a switched-off wallet shows up at once. */
export function subscribePaymentSettings(
  onChange: (settings: PaymentSettings) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  return onSnapshot(
    paymentSettingsRef(),
    snap => onChange(withPaymentDefaults(snap.data())),
    err => onError?.(err),
  );
}

/** Admins only (enforced by firestore.rules). Validate with paymentSettingsProblem() first. */
export async function savePaymentSettings(settings: Pick<PaymentSettings, 'gcash' | 'maya' | 'card'>): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Sign in again to save payment settings.');
  const clean = (w: PaymentSettings['gcash']) => ({
    enabled: w.enabled,
    qrImageUrl: w.qrImageUrl.trim(),
    accountName: w.accountName.trim(),
    accountHint: w.accountHint.trim(),
  });
  await setDoc(paymentSettingsRef(), {
    gcash: clean(settings.gcash),
    maya: clean(settings.maya),
    card: { enabled: settings.card.enabled },
    updatedAt: new Date().toISOString(),
    updatedBy: uid,
  });
}
