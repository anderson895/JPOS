// Multi-store (Phase 1) Firestore rules suite. Isolation first.
// Run: firebase emulators:exec --only firestore --project demo-jpos "node tests/rules/tenant.rules.test.mjs"
// (needs @firebase/rules-unit-testing + firebase; the emulator host comes from FIRESTORE_EMULATOR_HOST)
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import {
  doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, addDoc, collection, query, where, writeBatch, Timestamp,
} from 'firebase/firestore';

const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8085').split(':');
const env = await initializeTestEnvironment({
  projectId: 'demo-jpos',
  firestore: { rules: readFileSync(process.env.RULES_FILE ?? 'firestore.rules', 'utf8'), host, port: Number(port) },
});

const DAY = 24 * 60 * 60 * 1000;
const now = Date.now();
const iso = new Date().toISOString();
const ts = (ms) => Timestamp.fromMillis(ms);
const ENT = (rfid = true) => ({ plan: 'enterprise', staffLimit: null, rfid, fullReports: true, pdfExport: true, trends: true });
const shopDoc = (ownerUid, extra = {}) => ({
  name: 'Shop', slug: 'x', ownerUid, plan: 'enterprise', status: 'active', suspended: false,
  createdAt: ts(now - 30 * DAY), trialDays: 7, currentPeriodEnd: ts(now + 30 * DAY),
  entitlements: ENT(), staffCount: 1, ...extra,
});
const user = (tenantId, role = 'staff', isActive = true) => ({
  tenantId, email: `${role}@x.com`, displayName: role, role, isActive, rfidTag: '', photoURL: '', createdAt: iso, updatedAt: iso,
});
const order = (cashierId, extra = {}) => ({
  orderNumber: 'ORD-1', items: [], subtotal: 100, discount: 0, tax: 0, total: 100, paymentMethod: 'cash',
  status: 'completed', cashierId, cashierName: 'x', createdAt: iso, updatedAt: iso, ...extra,
});
const wallet = (enabled, qr = '') => ({ enabled, qrImageUrl: qr, accountName: 'Shop', accountHint: '0917' });
const paySettings = (uid, gcash = wallet(false)) => ({ gcash, maya: wallet(false), card: { enabled: true }, updatedAt: iso, updatedBy: uid });

// shops: A/B active (isolation pair), E expired, S setup, T trial running, X trial ended, U suspended, N no RFID
const SHOPS = {
  A: shopDoc('ownerA'), B: shopDoc('ownerB'),
  E: shopDoc('adminE', { currentPeriodEnd: ts(now - DAY) }),
  S: shopDoc('adminS', { status: 'setup', currentPeriodEnd: null }),
  T: shopDoc('adminT', { status: 'trial', trialStartedAt: ts(now - DAY), currentPeriodEnd: null }),
  X: shopDoc('adminX', { status: 'trial', trialStartedAt: ts(now - 8 * DAY), currentPeriodEnd: null }),
  U: shopDoc('adminU', { suspended: true }),
  N: shopDoc('adminN', { entitlements: ENT(false) }),
};
const USERS = {
  ownerA: user('A', 'admin'), adminA2: user('A', 'admin'), staffA: user('A'), offA: user('A', 'staff', false),
  ownerB: user('B', 'admin'), staffB: user('B'),
  adminE: user('E', 'admin'), staffE: user('E'), adminS: user('S', 'admin'), staffS: user('S'),
  adminT: user('T', 'admin'), staffT: user('T'), adminX: user('X', 'admin'), staffX: user('X'),
  adminU: user('U', 'admin'), staffU: user('U'), adminN: user('N', 'admin'), staffN: user('N'),
};

async function seed() {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    for (const [id, data] of Object.entries(SHOPS)) {
      await setDoc(doc(db, `tenants/${id}`), data);
      await setDoc(doc(db, `tenants/${id}/products/p1`), { name: 'Latte', price: 120, isAvailable: true });
      await setDoc(doc(db, `tenants/${id}/categories/c1`), { name: 'Drinks' });
      await setDoc(doc(db, `tenants/${id}/settings/payments`), paySettings('seed'));
    }
    for (const [uid, data] of Object.entries(USERS)) await setDoc(doc(db, `users/${uid}`), data);
    await setDoc(doc(db, 'tenants/A/orders/o1'), order('staffA'));
    await setDoc(doc(db, 'tenants/B/orders/o1'), order('staffB'));
    await setDoc(doc(db, 'tenants/A/rfidCards/TAGA'), { email: 'a@x.com', password: 'secret1', userId: 'staffA', staffName: 'x', createdAt: iso });
    await setDoc(doc(db, 'tenants/B/rfidCards/TAGB'), { email: 'b@x.com', password: 'secret1', userId: 'staffB', staffName: 'x', createdAt: iso });
    await setDoc(doc(db, 'tenants/N/rfidCards/TAGN'), { email: 'n@x.com', password: 'secret1', userId: 'staffN', staffName: 'x', createdAt: iso });
    await setDoc(doc(db, 'slugs/shop-a'), { tenantId: 'A' });
    // leftovers of the old single-store layout
    await setDoc(doc(db, 'products/old'), { name: 'old' });
    await setDoc(doc(db, 'orders/old'), order('staffA'));
    await setDoc(doc(db, 'rfidCards/OLD'), { email: 'o@x.com', password: 'p', userId: 'staffA' });
  });
}

const results = [];
async function t(name, expect, fn) {
  await seed();
  try {
    await (expect === 'allow' ? assertSucceeds(fn()) : assertFails(fn()));
    results.push(['PASS', expect, name]);
  } catch (e) {
    results.push(['FAIL', expect, `${name}  <- ${String(e?.message ?? e).split('\n')[0]}`]);
  }
}
const anon = () => env.unauthenticatedContext().firestore();
const as = (uid) => env.authenticatedContext(uid).firestore();

// ── Isolation (#1) ──────────────────────────────────────────────────────
await t('A staff reads A products', 'allow', () => getDocs(collection(as('staffA'), 'tenants/A/products')));
await t('A staff reads B products', 'deny', () => getDocs(collection(as('staffA'), 'tenants/B/products')));
await t('A staff reads B orders', 'deny', () => getDocs(collection(as('staffA'), 'tenants/B/orders')));
await t('A admin reads B settings', 'deny', () => getDoc(doc(as('ownerA'), 'tenants/B/settings/payments')));
await t('A admin reads shop B doc', 'deny', () => getDoc(doc(as('ownerA'), 'tenants/B')));
await t('A staff reads own shop doc', 'allow', () => getDoc(doc(as('staffA'), 'tenants/A')));
await t('A staff sells in shop B', 'deny', () => addDoc(collection(as('staffA'), 'tenants/B/orders'), order('staffA')));
await t('A admin writes B products', 'deny', () => setDoc(doc(as('ownerA'), 'tenants/B/products/p9'), { name: 'x' }));
await t('A admin writes B settings', 'deny', () => setDoc(doc(as('ownerA'), 'tenants/B/settings/payments'), paySettings('ownerA')));
await t('A admin lists B people', 'deny', () => getDocs(query(collection(as('ownerA'), 'users'), where('tenantId', '==', 'B'))));
await t('A admin lists ALL people (unpinned)', 'deny', () => getDocs(collection(as('ownerA'), 'users')));
await t('A admin reads a B person', 'deny', () => getDoc(doc(as('ownerA'), 'users/staffB')));
await t('A admin adds a person to shop B', 'deny', () => setDoc(doc(as('ownerA'), 'users/new1'), user('B')));
await t('A admin moves A staff to shop B', 'deny', () => updateDoc(doc(as('ownerA'), 'users/staffA'), { tenantId: 'B' }));
await t('A admin deletes a B person', 'deny', () => deleteDoc(doc(as('ownerA'), 'users/staffB')));
await t('A admin writes a B RFID card', 'deny', () => setDoc(doc(as('ownerA'), 'tenants/B/rfidCards/T9'), { email: 'x', password: 'y', userId: 'staffB' }));
await t('A admin makes an A card for a B person', 'deny', () => setDoc(doc(as('ownerA'), 'tenants/A/rfidCards/T9'), { email: 'x', password: 'y', userId: 'staffB' }));
await t('A admin deletes B card', 'deny', () => deleteDoc(doc(as('ownerA'), 'tenants/B/rfidCards/TAGB')));

// ── Not signed in (terminal / landing) ──────────────────────────────────
await t('anon: get a slug (terminal lookup)', 'allow', () => getDoc(doc(anon(), 'slugs/shop-a')));
await t('anon: list slugs', 'deny', () => getDocs(collection(anon(), 'slugs')));
await t('anon: get one RFID card (shop has RFID)', 'allow', () => getDoc(doc(anon(), 'tenants/A/rfidCards/TAGA')));
await t('anon: get a card in a shop WITHOUT RFID', 'deny', () => getDoc(doc(anon(), 'tenants/N/rfidCards/TAGN')));
await t('anon: list RFID cards', 'deny', () => getDocs(collection(anon(), 'tenants/A/rfidCards')));
await t('anon: read a shop', 'deny', () => getDoc(doc(anon(), 'tenants/A')));
await t('anon: read products', 'deny', () => getDocs(collection(anon(), 'tenants/A/products')));
await t('anon: read people', 'deny', () => getDocs(collection(anon(), 'users')));
await t('anon: list shops', 'deny', () => getDocs(collection(anon(), 'tenants')));

// ── Old single-store paths are gone ─────────────────────────────────────
await t('old app: read root products', 'deny', () => getDocs(collection(as('staffA'), 'products')));
await t('old app: create root order', 'deny', () => addDoc(collection(as('staffA'), 'orders'), order('staffA')));
await t('old app: get root RFID card', 'deny', () => getDoc(doc(anon(), 'rfidCards/OLD')));
await t('old app: write root settings', 'deny', () => setDoc(doc(as('ownerA'), 'settings/payments'), paySettings('ownerA')));

// ── Roles inside shop A ────────────────────────────────────────────────
await t('staff writes products', 'deny', () => setDoc(doc(as('staffA'), 'tenants/A/products/p9'), { name: 'x' }));
await t('admin writes products', 'allow', () => setDoc(doc(as('ownerA'), 'tenants/A/products/p9'), { name: 'x' }));
await t('admin writes categories', 'allow', () => setDoc(doc(as('ownerA'), 'tenants/A/categories/c9'), { name: 'x' }));
await t('staff sells (cash) as self', 'allow', () => addDoc(collection(as('staffA'), 'tenants/A/orders'), order('staffA')));
await t('staff sells as someone else', 'deny', () => addDoc(collection(as('staffA'), 'tenants/A/orders'), order('ownerA')));
await t('staff edits an order', 'deny', () => updateDoc(doc(as('staffA'), 'tenants/A/orders/o1'), { total: 1 }));
await t('admin deletes an order', 'allow', () => deleteDoc(doc(as('ownerA'), 'tenants/A/orders/o1')));
await t('inactive staff reads products', 'deny', () => getDocs(collection(as('offA'), 'tenants/A/products')));
await t('inactive staff sells', 'deny', () => addDoc(collection(as('offA'), 'tenants/A/orders'), order('offA')));
await t('staff lists people', 'deny', () => getDocs(query(collection(as('staffA'), 'users'), where('tenantId', '==', 'A'))));
await t('admin lists own shop people', 'allow', () => getDocs(query(collection(as('ownerA'), 'users'), where('tenantId', '==', 'A'))));
await t('staff reads own profile', 'allow', () => getDoc(doc(as('staffA'), 'users/staffA')));
await t('admin adds staff to own shop', 'allow', () => setDoc(doc(as('ownerA'), 'users/new1'), user('A')));
await t('admin adds a person with extra fields', 'deny', () => setDoc(doc(as('ownerA'), 'users/new1'), { ...user('A'), superAdmin: true }));
await t('staff adds a person', 'deny', () => setDoc(doc(as('staffA'), 'users/new1'), user('A')));
await t('admin promotes staff', 'allow', () => updateDoc(doc(as('ownerA'), 'users/staffA'), { role: 'admin' }));
await t('second admin demotes the OWNER', 'deny', () => updateDoc(doc(as('adminA2'), 'users/ownerA'), { role: 'staff' }));
await t('second admin deactivates the OWNER', 'deny', () => updateDoc(doc(as('adminA2'), 'users/ownerA'), { isActive: false }));
await t('second admin renames the owner', 'allow', () => updateDoc(doc(as('adminA2'), 'users/ownerA'), { displayName: 'Boss' }));
await t('admin deletes the OWNER', 'deny', () => deleteDoc(doc(as('adminA2'), 'users/ownerA')));
await t('admin deletes self', 'deny', () => deleteDoc(doc(as('adminA2'), 'users/adminA2')));
await t('admin deletes a staff', 'allow', () => deleteDoc(doc(as('ownerA'), 'users/staffA')));
await t('staff renames self', 'allow', () => updateDoc(doc(as('staffA'), 'users/staffA'), { displayName: 'New', updatedAt: iso }));
await t('staff makes self admin', 'deny', () => updateDoc(doc(as('staffA'), 'users/staffA'), { role: 'admin' }));
await t('staff moves self to shop B', 'deny', () => updateDoc(doc(as('staffA'), 'users/staffA'), { tenantId: 'B' }));
await t('member writes the shop doc', 'deny', () => updateDoc(doc(as('ownerA'), 'tenants/A'), { status: 'active' }));
await t('anyone writes platformAdmins', 'deny', () => setDoc(doc(as('ownerA'), 'platformAdmins/ownerA'), { name: 'me' }));

// ── Store-QR settings + e-wallet orders (shop A) ─────────────────────────
await t('staff writes payment settings', 'deny', () => setDoc(doc(as('staffA'), 'tenants/A/settings/payments'), paySettings('staffA')));
await t('admin saves payment settings', 'allow', () => setDoc(doc(as('ownerA'), 'tenants/A/settings/payments'), paySettings('ownerA', wallet(true, 'https://x/q.png'))));
await t('admin enables GCash without a QR', 'deny', () => setDoc(doc(as('ownerA'), 'tenants/A/settings/payments'), paySettings('ownerA', wallet(true))));
const ewallet = (db, ref = 'ABC123456') => {
  const b = writeBatch(db);
  b.set(doc(db, 'tenants/A/orders/e1'), order('staffA', { paymentMethod: 'gcash', paymentReference: ref, paymentVerification: 'manual', verifiedBy: 'staffA' }));
  b.set(doc(db, `tenants/A/paymentRefs/gcash_${ref}`), { orderId: 'e1', orderNumber: 'ORD-1', cashierId: 'staffA', method: 'gcash', reference: ref, createdAt: iso });
  return b.commit();
};
await t('GCash order + reference claim (batch)', 'allow', () => ewallet(as('staffA')));
await t('reused GCash reference', 'deny', async () => {
  await env.withSecurityRulesDisabled(ctx => setDoc(doc(ctx.firestore(), 'tenants/A/paymentRefs/gcash_ABC123456'), { orderId: 'other' }));
  return ewallet(as('staffA'));
});
await t('GCash order without a reference', 'deny', () => addDoc(collection(as('staffA'), 'tenants/A/orders'), order('staffA', { paymentMethod: 'gcash' })));
await t('GCash order with a reference but no claim', 'deny', () => setDoc(doc(as('staffA'), 'tenants/A/orders/e2'), order('staffA', { paymentMethod: 'gcash', paymentReference: 'ABC999999', paymentVerification: 'manual', verifiedBy: 'staffA' })));
await t('card order with an approval code', 'allow', () => addDoc(collection(as('staffA'), 'tenants/A/orders'), order('staffA', { paymentMethod: 'card', paymentReference: '123456' })));
await t('edit a payment reference claim', 'deny', () => updateDoc(doc(as('ownerA'), 'tenants/A/paymentRefs/x'), { orderId: 'y' }));

// ── RFID cards ──────────────────────────────────────────────────────────
await t('admin makes a card for own staff', 'allow', () => setDoc(doc(as('ownerA'), 'tenants/A/rfidCards/T5'), { email: 'a@x.com', password: 'p', userId: 'staffA' }));
await t('admin makes a card for an ADMIN', 'deny', () => setDoc(doc(as('ownerA'), 'tenants/A/rfidCards/T5'), { email: 'a@x.com', password: 'p', userId: 'adminA2' }));
await t('card in a shop WITHOUT RFID', 'deny', () => setDoc(doc(as('adminN'), 'tenants/N/rfidCards/T5'), { email: 'a@x.com', password: 'p', userId: 'staffN' }));
await t('admin deletes own card (cleanup)', 'allow', () => deleteDoc(doc(as('ownerA'), 'tenants/A/rfidCards/TAGA')));

// ── Subscription state: setup / trial / expired / suspended ───────────────
await t('SETUP: admin prepares the menu', 'allow', () => setDoc(doc(as('adminS'), 'tenants/S/products/p9'), { name: 'x' }));
await t('SETUP: admin adds staff', 'allow', () => setDoc(doc(as('adminS'), 'users/new2'), user('S')));
await t('SETUP: POS is locked (no sale)', 'deny', () => addDoc(collection(as('staffS'), 'tenants/S/orders'), order('staffS')));
await t('TRIAL running: sale allowed', 'allow', () => addDoc(collection(as('staffT'), 'tenants/T/orders'), order('staffT')));
await t('TRIAL ended: sale denied', 'deny', () => addDoc(collection(as('staffX'), 'tenants/X/orders'), order('staffX')));
await t('TRIAL ended: setup still allowed', 'allow', () => setDoc(doc(as('adminX'), 'tenants/X/products/p9'), { name: 'x' }));
await t('EXPIRED: reports still readable', 'allow', () => getDocs(collection(as('adminE'), 'tenants/E/orders')));
await t('EXPIRED: sale denied', 'deny', () => addDoc(collection(as('staffE'), 'tenants/E/orders'), order('staffE')));
await t('EXPIRED: menu read-only', 'deny', () => setDoc(doc(as('adminE'), 'tenants/E/products/p9'), { name: 'x' }));
await t('EXPIRED: no new staff', 'deny', () => setDoc(doc(as('adminE'), 'users/new3'), user('E')));
await t('SUSPENDED: sale denied', 'deny', () => addDoc(collection(as('staffU'), 'tenants/U/orders'), order('staffU')));
await t('SUSPENDED: menu read-only', 'deny', () => setDoc(doc(as('adminU'), 'tenants/U/products/p9'), { name: 'x' }));
await t('SUSPENDED: data still readable', 'allow', () => getDocs(collection(as('adminU'), 'tenants/U/products')));

await env.cleanup();
for (const [s, e, n] of results) console.log(`${s}  [${e.padEnd(5)}]  ${n}`);
const failed = results.filter(r => r[0] === 'FAIL').length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
