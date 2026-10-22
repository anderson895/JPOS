import type { Order, PaymentSettings, WalletSettings } from '@/types';

/**
 * Store-QR e-wallet rules shared by the POS and the Payment Settings page.
 * No Firebase here (pure functions) so they can be unit-tested; the same
 * limits are enforced again in firestore.rules.
 */

export type WalletMethod = 'gcash' | 'maya';

export const WALLET_LABEL: Record<WalletMethod, string> = { gcash: 'GCash', maya: 'Maya' };

const EMPTY_WALLET: WalletSettings = { enabled: false, qrImageUrl: '', accountName: '', accountHint: '' };

/** Until an admin sets things up: no e-wallets, and card works as it always has. */
export const DEFAULT_PAYMENT_SETTINGS: PaymentSettings = {
  gcash: EMPTY_WALLET,
  maya: EMPTY_WALLET,
  card: { enabled: true },
};

/** Fills anything missing or malformed in a stored settings doc with the defaults. */
export function withPaymentDefaults(data: unknown): PaymentSettings {
  const d = (data && typeof data === 'object' ? data : {}) as Partial<PaymentSettings>;
  const wallet = (w: unknown): WalletSettings => {
    const v = (w && typeof w === 'object' ? w : {}) as Partial<WalletSettings>;
    return {
      enabled: v.enabled === true,
      qrImageUrl: typeof v.qrImageUrl === 'string' ? v.qrImageUrl : '',
      accountName: typeof v.accountName === 'string' ? v.accountName : '',
      accountHint: typeof v.accountHint === 'string' ? v.accountHint : '',
    };
  };
  return {
    gcash: wallet(d.gcash),
    maya: wallet(d.maya),
    card: { enabled: d.card?.enabled !== false },
    ...(typeof d.updatedAt === 'string' ? { updatedAt: d.updatedAt } : {}),
    ...(typeof d.updatedBy === 'string' ? { updatedBy: d.updatedBy } : {}),
  };
}

/** The POS may offer this wallet: it's switched on and has a QR to show. */
export function walletReady(settings: PaymentSettings, method: WalletMethod): boolean {
  const w = settings[method];
  return w.enabled && w.qrImageUrl !== '';
}

/** Why these settings can't be saved (same limits as firestore.rules), or null. */
export function paymentSettingsProblem(settings: Pick<PaymentSettings, 'gcash' | 'maya'>): string | null {
  for (const method of ['gcash', 'maya'] as const) {
    const w = settings[method];
    const label = WALLET_LABEL[method];
    if (w.enabled && !w.qrImageUrl) return `Upload the ${label} QR code before turning ${label} on.`;
    if (w.qrImageUrl && !/^https:\/\/.+/.test(w.qrImageUrl)) return `The ${label} QR image must be an https link.`;
    if (w.qrImageUrl.length > 500) return `The ${label} QR image link is too long.`;
    if (w.accountName.trim().length > 60) return `${label} account name: 60 characters at most.`;
    if (w.accountHint.trim().length > 30) return `${label} number hint: 30 characters at most.`;
  }
  return null;
}

/**
 * E-wallet reference as stored: uppercase letters and digits only.
 * Spaces, dashes and other separators people copy from the receipt are dropped.
 */
export function normalizeReference(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Why this (normalized) reference can't be used, or null. Matches firestore.rules. */
export function referenceProblem(reference: string, method: WalletMethod): string | null {
  if (!reference) return `Enter the ${WALLET_LABEL[method]} reference number.`;
  if (!/^[A-Z0-9]{6,30}$/.test(reference)) {
    return method === 'gcash'
      ? 'A GCash reference is usually 13 digits (6–30 letters or digits).'
      : 'Use 6–30 letters or digits from the Maya receipt.';
  }
  return null;
}

/** Card approval codes are optional and not unique; just keep them short. */
export function approvalCodeProblem(code: string): string | null {
  return code.length > 30 ? 'The approval code can be at most 30 characters.' : null;
}

/**
 * Document id that claims an e-wallet reference: `paymentRefs/{method}_{REF}`.
 * Null when the order doesn't need one (cash, card).
 */
export function paymentRefKey(order: Pick<Order, 'paymentMethod' | 'paymentReference'>): string | null {
  if ((order.paymentMethod === 'gcash' || order.paymentMethod === 'maya') && order.paymentReference) {
    return `${order.paymentMethod}_${order.paymentReference}`;
  }
  return null;
}
