import { addDoc, deleteDoc, onSnapshot, updateDoc, type Unsubscribe } from 'firebase/firestore';
import { tenantCol, tenantDoc } from '@/lib/tenant';
import { savedDiscountProblem, type DiscountKind } from '@/lib/pricing';
import type { SavedDiscount } from '@/types';

/**
 * The store's saved discounts (tenants/{T}/discounts): "Employee 10%",
 * "Promo ₱50"… The admin sets them up once; cashiers pick them at the POS.
 */

const byName = (a: SavedDiscount, b: SavedDiscount) => a.name.localeCompare(b.name);

/** Live list, sorted by name (so a discount switched off disappears from the POS at once). */
export function watchSavedDiscounts(onChange: (list: SavedDiscount[]) => void, onError?: (err: Error) => void): Unsubscribe {
  return onSnapshot(
    tenantCol('discounts'),
    snap => onChange(snap.docs.map(d => ({ id: d.id, ...d.data() } as SavedDiscount)).sort(byName)),
    err => onError?.(err),
  );
}

export interface DiscountDraft { name: string; kind: DiscountKind; value: number; active: boolean }

function clean(d: DiscountDraft) {
  const problem = savedDiscountProblem(d);
  if (problem) throw new Error(problem);
  return { name: d.name.trim(), kind: d.kind, value: Math.round(Number(d.value) * 100) / 100, active: d.active };
}

/** Admins only (firestore.rules). */
export async function addSavedDiscount(d: DiscountDraft): Promise<void> {
  const now = new Date().toISOString();
  await addDoc(tenantCol('discounts'), { ...clean(d), createdAt: now, updatedAt: now });
}

export async function updateSavedDiscount(id: string, d: DiscountDraft): Promise<void> {
  await updateDoc(tenantDoc('discounts', id), { ...clean(d), updatedAt: new Date().toISOString() });
}

export async function setSavedDiscountActive(id: string, active: boolean): Promise<void> {
  await updateDoc(tenantDoc('discounts', id), { active, updatedAt: new Date().toISOString() });
}

export async function deleteSavedDiscount(id: string): Promise<void> {
  await deleteDoc(tenantDoc('discounts', id));
}
