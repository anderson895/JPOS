import { FirebaseError } from 'firebase/app';
// DEMO ONLY — in-memory stand-in for `firebase/firestore` with fake sample data.
// Supports the subset JPOS uses: where (==, >=, <=), orderBy, limit, setDoc/addDoc.

const now = Date.now();
const HOUR = 3600000;
const DAY = 24 * HOUR;

const categories = [
  { id: 'c1', name: 'Hot Coffee' }, { id: 'c2', name: 'Cold Coffee' },
  { id: 'c3', name: 'Non-Coffee' }, { id: 'c4', name: 'Pastries' },
];
const P = (id: string, name: string, price: number, cat: string, imageUrl = '', isAvailable = true) => ({
  id, name, price, cost: Math.round(price * 0.35), categoryId: cat,
  categoryName: categories.find(c => c.id === cat)!.name,
  description: '', imageUrl, isAvailable, variants: [], createdAt: '', updatedAt: '',
});
const products = [
  P('p1', 'Americano', 120, 'c1', '/images/hero-bg.jpg'), P('p2', 'Cafe Latte', 150, 'c1'),
  P('p3', 'Cappuccino', 145, 'c1'), P('p4', 'Caramel Macchiato', 175, 'c1', '/images/about.jpg'),
  P('p5', 'Iced Americano', 130, 'c2'), P('p6', 'Iced Spanish Latte', 175, 'c2'),
  P('p7', 'Matcha Latte', 165, 'c3'), P('p8', 'Hot Chocolate', 140, 'c3'),
  P('p9', 'Butter Croissant', 95, 'c4', '', false), P('p10', 'Blueberry Muffin', 85, 'c4'),
];

const cashiers = [{ id: 'u1', name: 'Alex Rivera' }, { id: 'u3', name: 'Bea Garcia' }];
const pays = ['cash', 'gcash', 'card', 'maya', 'cash'];
const orders: any[] = [];
let seq = 0;
for (let d = 6; d >= 0; d--) {
  const count = 5 + ((d * 5) % 7);
  for (let k = 0; k < count; k++) {
    const t = new Date(now - d * DAY - (k + 1) * 0.8 * HOUR);
    const a = products[(k + d) % 8], b = products[(k * 3 + 1) % 8];
    const qa = 1 + (k % 2);
    const items = [
      { productId: a.id, productName: a.name, price: a.price, quantity: qa, subtotal: a.price * qa },
      { productId: b.id, productName: b.name, price: b.price, quantity: 1, subtotal: b.price },
    ];
    const total = items.reduce((s, i) => s + i.subtotal, 0);
    const cashier = cashiers[k % 2];
    orders.push({
      id: `o${seq}`, orderNumber: `ORD-DEMO-${String(1000 + seq++)}`, items, subtotal: total, discount: 0, tax: 0, total,
      paymentMethod: pays[k % pays.length], status: 'completed', cashierId: cashier.id, cashierName: cashier.name,
      createdAt: t.toISOString(), updatedAt: t.toISOString(),
    });
  }
}

const users = [
  { id: 'u1', displayName: 'Alex Rivera', email: 'admin@jpos.demo', role: 'admin', isActive: true },
  { id: 'u2', displayName: 'Ana Cruz', email: 'ana@jpos.demo', role: 'admin', isActive: true },
  { id: 'u3', displayName: 'Bea Garcia', email: 'bea@jpos.demo', role: 'staff', isActive: true, rfidTag: 'DEMO-0001' },
  { id: 'u4', displayName: 'Carlo Mendoza', email: 'carlo@jpos.demo', role: 'staff', isActive: true, rfidTag: 'DEMO-0002' },
  { id: 'u5', displayName: 'Dana Lim', email: 'dana@jpos.demo', role: 'staff', isActive: false },
];

// settings/payments: GCash set up with a sample QR, Maya not yet. Images on demo.jpos.test
// are fake: the recorder/screenshot tools answer those requests with local sample files.
const settings = [{
  id: 'payments',
  gcash: { enabled: true, qrImageUrl: 'https://demo.jpos.test/gcash-qr.png', accountName: 'Alex Rivera', accountHint: '0917•••1234' },
  maya: { enabled: false, qrImageUrl: '', accountName: '', accountHint: '' },
  card: { enabled: true },
  updatedAt: new Date(now - 2 * DAY).toISOString(), updatedBy: 'u1',
}];

const data: Record<string, any[]> = { categories, products, orders, users, settings, rfidCards: [] };
const latency = () => new Promise(r => setTimeout(r, 120));
const rid = () => Math.random().toString(36).slice(2, 10);

type Q = { name: string; filters: any[]; order?: { field: string; dir: string }; lim?: number };

export const collection = (_db: unknown, name: string): Q => ({ name, filters: [] });
export const where = (field: string, op: string, value: unknown) => ({ t: 'where', field, op, value });
export const orderBy = (field: string, dir = 'asc') => ({ t: 'order', field, dir });
export const limit = (n: number) => ({ t: 'limit', n });
export function query(c: Q, ...cs: any[]): Q {
  return {
    ...c,
    filters: [...c.filters, ...cs.filter(x => x?.t === 'where')],
    order: cs.find(x => x?.t === 'order') ?? c.order,
    lim: cs.find(x => x?.t === 'limit')?.n ?? c.lim,
  };
}
export function doc(a: any, b?: string, c?: string) {
  if (typeof b === 'string') return { coll: b, id: c ?? rid() };   // doc(db, 'users', id)
  return { coll: a?.name, id: rid() };                               // doc(collection(db, 'orders'))
}

const test = (row: any, f: any) => {
  const v = row[f.field];
  if (f.op === '==') return v === f.value;
  if (f.op === '>=') return v >= f.value;
  if (f.op === '<=') return v <= f.value;
  return true;
};

export async function getDocs(q: Q) {
  await latency();
  let rows = (data[q.name] || []).filter(r => q.filters.every(f => test(r, f)));
  if (q.order) {
    const { field, dir } = q.order;
    rows = [...rows].sort((x, y) => (x[field] < y[field] ? -1 : x[field] > y[field] ? 1 : 0) * (dir === 'desc' ? -1 : 1));
  }
  if (q.lim) rows = rows.slice(0, q.lim);
  return { docs: rows.map(r => ({ id: r.id, data: () => r, ref: { coll: q.name, id: r.id } })) };
}
const snapshotOf = (ref: any) => {
  const row = (data[ref.coll] || []).find(r => r.id === ref.id);
  return { id: ref.id, exists: () => !!row, data: () => row, ref };
};
// Live listeners on single docs (e.g. settings/payments for the POS)
const listeners = new Map<string, Set<(snap: any) => void>>();
const keyOf = (ref: any) => `${ref.coll}/${ref.id}`;
const notify = (ref: any) => listeners.get(keyOf(ref))?.forEach(fn => fn(snapshotOf(ref)));

export async function getDoc(ref: any) {
  return snapshotOf(ref);
}
export async function setDoc(ref: any, value: any) {
  await latency();
  const list = (data[ref.coll] ||= []);
  const i = list.findIndex(r => r.id === ref.id);
  if (i >= 0) list[i] = { id: ref.id, ...value }; else list.push({ id: ref.id, ...value });
  notify(ref);
}
export async function addDoc(c: Q, value: any) { const ref = doc(c); await setDoc(ref, value); return ref; }
export async function updateDoc(ref: any, value: any) {
  const row = (data[ref.coll] || []).find(r => r.id === ref.id);
  if (row) Object.assign(row, value);
  notify(ref);
}
export async function deleteDoc(ref: any) {
  const list = data[ref.coll] || [];
  const i = list.findIndex(r => r.id === ref.id);
  if (i >= 0) list.splice(i, 1);
}
export const writeBatch = () => {
  const ops: (() => Promise<void>)[] = [];
  const claims: any[] = [];
  return {
    set: (ref: any, v: any) => { if (ref.coll === 'paymentRefs') claims.push(ref); ops.push(() => setDoc(ref, v)); },
    update: (ref: any, v: any) => { ops.push(() => updateDoc(ref, v)); },
    delete: (ref: any) => { ops.push(() => deleteDoc(ref)); },
    commit: async () => {
      // Like firestore.rules: a paymentRefs claim that already exists denies the whole batch
      for (const ref of claims) {
        if ((data.paymentRefs || []).some(r => r.id === ref.id)) {
          throw new FirebaseError('permission-denied', 'Missing or insufficient permissions.');
        }
      }
      for (const op of ops) await op();
    },
  };
};
export function onSnapshot(ref: any, onNext: (snap: any) => void) {
  const key = keyOf(ref);
  if (!listeners.has(key)) listeners.set(key, new Set());
  listeners.get(key)!.add(onNext);
  setTimeout(() => onNext(snapshotOf(ref)), 50);
  return () => { listeners.get(key)?.delete(onNext); };
}
export const getFirestore = () => ({});
