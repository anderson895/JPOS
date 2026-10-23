import { collection, doc, documentId, getDoc, getDocs, limit, orderBy, query, startAfter, where, type QueryDocumentSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { tenantCol, tenantDoc } from '@/lib/tenant';
import type { Tenant } from '@/types';

/**
 * Backup (Business and up): one file with everything in the shop: its
 * details, products, categories, discounts, all sales, people and settings.
 * Never passwords or RFID card codes. Read with the admin's own access.
 */
const PAGE = 500;

async function allDocs(name: string, onProgress?: (n: number) => void) {
  const rows: Record<string, unknown>[] = [];
  let last: QueryDocumentSnapshot | null = null;
  for (;;) {
    const q = query(tenantCol(name), orderBy(documentId()), ...(last ? [startAfter(last)] : []), limit(PAGE));
    const snap = await getDocs(q);
    rows.push(...snap.docs.map(d => ({ id: d.id, ...d.data() })));
    onProgress?.(rows.length);
    if (snap.size < PAGE) return rows;
    last = snap.docs[snap.docs.length - 1];
  }
}

/** Firestore times become ISO text, so the file is plain JSON. */
function plain(v: unknown): unknown {
  if (v && typeof v === 'object') {
    if (typeof (v as { toDate?: () => Date }).toDate === 'function') return (v as { toDate: () => Date }).toDate().toISOString();
    if (Array.isArray(v)) return v.map(plain);
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, plain(x)]));
  }
  return v;
}

export async function buildBackup(tenant: Tenant, onProgress?: (step: string) => void) {
  onProgress?.('Products…');
  const products = await allDocs('products');
  const categories = await allDocs('categories');
  const discounts = await allDocs('discounts').catch(() => []);
  onProgress?.('Sales…');
  const orders = await allDocs('orders', n => onProgress?.(`Sales… ${n.toLocaleString('en-PH')}`));
  onProgress?.('People and settings…');
  const people = (await getDocs(query(collection(db, 'users'), where('tenantId', '==', tenant.id))))
    .docs.map(d => {
      const u = d.data();
      // Never the RFID card code
      return { id: d.id, displayName: u.displayName, email: u.email, role: u.role, isActive: u.isActive, createdAt: u.createdAt };
    });
  const [branding, payments] = await Promise.all([
    getDoc(tenantDoc('settings', 'branding')).then(s => (s.exists() ? s.data() : null)).catch(() => null),
    getDoc(tenantDoc('settings', 'payments')).then(s => (s.exists() ? s.data() : null)).catch(() => null),
  ]);
  const shop = (await getDoc(doc(db, 'tenants', tenant.id))).data() ?? {};
  return plain({
    backupOf: 'JPOS',
    version: 1,
    madeAt: new Date().toISOString(),
    shop: { id: tenant.id, name: shop.name, slug: shop.slug, businessType: shop.businessType, receipt: shop.receipt, plan: shop.plan },
    branding, payments, categories, products, discounts, people, orders,
    counts: { products: products.length, orders: orders.length, people: people.length },
  }) as Record<string, unknown>;
}

/** Saves the backup as a file on this device. */
export function saveBackupFile(data: Record<string, unknown>, shopName: string) {
  const safe = shopName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'shop';
  const date = new Date().toISOString().slice(0, 10);
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `jpos-backup-${safe}-${date}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
