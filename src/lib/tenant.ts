import { collection, doc, type CollectionReference, type DocumentReference } from 'firebase/firestore';
import { db } from '@/lib/firebase';

/**
 * The ONLY place that builds per-shop Firestore paths (`tenants/{T}/…`).
 *
 * AuthContext sets the signed-in user's shop (users/{uid}.tenantId) before it
 * exposes the user, so any page that renders behind login can use these helpers.
 * Collections that are not per-shop (users, slugs, platform…) keep using `db`.
 */
let currentTenant: string | null = null;

/** Called by AuthContext on sign-in (the profile's tenantId) and sign-out (null). */
export function setCurrentTenant(tenantId: string | null) {
  currentTenant = tenantId;
}

/** The signed-in user's shop. Throws if used before sign-in (a bug, not a user error). */
export function currentTenantId(): string {
  if (!currentTenant) throw new Error('No shop selected: tenant paths are only available after sign-in.');
  return currentTenant;
}

/** The shop document itself: tenants/{T}. */
export function tenantRef(tenantId: string = currentTenantId()): DocumentReference {
  return doc(db, 'tenants', tenantId);
}

/** tenants/{T}/{name}, e.g. tenantCol('orders'). */
export function tenantCol(name: string, tenantId: string = currentTenantId()): CollectionReference {
  return collection(db, 'tenants', tenantId, name);
}

/** tenants/{T}/{name}/{id}, e.g. tenantDoc('settings', 'payments'). */
export function tenantDoc(name: string, id: string, tenantId: string = currentTenantId()): DocumentReference {
  return doc(db, 'tenants', tenantId, name, id);
}
