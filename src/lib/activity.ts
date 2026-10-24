import { addDoc, getDocs, limit, orderBy, query, serverTimestamp, startAfter, where, type QueryDocumentSnapshot } from 'firebase/firestore';
import { auth } from '@/lib/firebase';
import { currentTenantId, tenantCol } from '@/lib/tenant';
import type { FirestoreTime } from '@/types';

/**
 * Audit trail (Business and up): who did what, and when, in the shop.
 * tenants/{T}/activity/{id}. Entries can't be changed or deleted
 * (firestore.rules), and always carry the real person and the server's time.
 */
export type ActivityAction =
  | 'signin'
  | 'product.add' | 'product.edit' | 'product.delete' | 'product.show' | 'product.hide' | 'product.import'
  | 'sale.void' | 'sale.import'
  | 'discount.add' | 'discount.edit' | 'discount.delete'
  | 'staff.add' | 'staff.edit' | 'staff.delete' | 'staff.on' | 'staff.off'
  | 'store.settings' | 'payment.settings';

export interface ActivityEntry {
  id: string;
  action: ActivityAction;
  by: string;
  byName: string;
  at: FirestoreTime | null;
  /** What it was about: a product's name, an order number, a person's name. */
  target: string;
  /** Short before → after notes, e.g. "Price: ₱120 → ₱130". */
  note: string;
}

let logging: { enabled: boolean; name: string } = { enabled: false, name: '' };

/** Set by the app shell: is the audit trail on for this shop, and who is signed in. */
export function setActivityLogging(enabled: boolean, name: string) {
  logging = { enabled, name: name.trim().slice(0, 60) };
}

/**
 * Writes one entry. Never stops the action it describes: a failed entry is
 * only reported in the console.
 */
export function logActivity(action: ActivityAction, target = '', note = ''): void {
  const uid = auth.currentUser?.uid;
  if (!logging.enabled || !uid) return;
  let col;
  try { col = tenantCol('activity'); } catch { return; }
  addDoc(col, {
    action,
    by: uid,
    byName: logging.name || 'Someone',
    at: serverTimestamp(),
    target: target.trim().slice(0, 120),
    note: note.trim().slice(0, 300),
  }).catch(err => console.warn('[activity] not saved', action, err));
}

/** "Price: ₱120 → ₱130 · Stock: 4 → 20" from the fields that changed. */
export function changes(pairs: [label: string, before: unknown, after: unknown][]): string {
  return pairs
    .filter(([, a, b]) => String(a ?? '') !== String(b ?? ''))
    .map(([label, a, b]) => `${label}: ${a === '' || a == null ? '-' : a} → ${b === '' || b == null ? '-' : b}`)
    .join(' · ');
}

export const PAGE = 30;

/** A page of entries, newest first; optionally one person's. */
export async function activityPage(after?: QueryDocumentSnapshot | null, by?: string) {
  const base = tenantCol('activity', currentTenantId());
  const parts = [...(by ? [where('by', '==', by)] : []), orderBy('at', 'desc'), ...(after ? [startAfter(after)] : []), limit(PAGE)];
  const snap = await getDocs(query(base, ...parts));
  return {
    entries: snap.docs.map(d => ({ id: d.id, ...d.data() } as ActivityEntry)),
    last: snap.docs[snap.docs.length - 1] ?? null,
    more: snap.docs.length === PAGE,
  };
}

/** The entry in plain words. */
export function describe(e: Pick<ActivityEntry, 'action' | 'target'>): string {
  const t = e.target ? ` ${e.target}` : '';
  switch (e.action) {
    case 'signin': return 'Signed in';
    case 'product.add': return `Added a product:${t}`;
    case 'product.edit': return `Changed a product:${t}`;
    case 'product.delete': return `Deleted a product:${t}`;
    case 'product.show': return `Put back on sale:${t}`;
    case 'product.hide': return `Took off sale:${t}`;
    case 'product.import': return `Imported products from a file:${t}`;
    case 'sale.void': return `Voided a sale:${t}`;
    case 'sale.import': return `Imported past sales from a file:${t}`;
    case 'discount.add': return `Added a discount:${t}`;
    case 'discount.edit': return `Changed a discount:${t}`;
    case 'discount.delete': return `Deleted a discount:${t}`;
    case 'staff.add': return `Added a person:${t}`;
    case 'staff.edit': return `Changed a person:${t}`;
    case 'staff.delete': return `Removed a person:${t}`;
    case 'staff.on': return `Turned on the account of${t}`;
    case 'staff.off': return `Turned off the account of${t}`;
    case 'store.settings': return 'Changed the store settings';
    case 'payment.settings': return 'Changed the payment settings';
    default: return String(e.action);
  }
}
