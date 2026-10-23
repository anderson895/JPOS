import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import {
  doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, addDoc, collection, query, where, orderBy, limit, writeBatch,
} from 'firebase/firestore';

// `firebase emulators:exec` sets FIRESTORE_EMULATOR_HOST; default to the QA port 8085
// Legacy (single-store) cases. During the multi-store cutover the TRANSITION rules must
// still pass all of them, so the old app keeps working until every device is updated.
const RULES = process.env.RULES_FILE ?? 'firestore.transition.rules';
const [emuHost, emuPort] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8085').split(':');
const env = await initializeTestEnvironment({
  // RULES_PROJECT: run beside the local test app (npm run dev) without touching its data
  projectId: process.env.RULES_PROJECT ?? 'demo-jpos',
  firestore: { rules: readFileSync(RULES, 'utf8'), host: emuHost, port: Number(emuPort) },
});

const now = new Date().toISOString();
// Store-QR rollout: stage A still accepts GCash/Maya orders with no reference (old live app);
// stage B (after the new app is live) requires it. Detected from the rules text.
const STAGE_A = readFileSync(RULES, 'utf8').includes('// STAGE A only');
const noRef = STAGE_A ? 'allow' : 'deny';
const user = (role, isActive = true) => ({ email: `${role}@x.com`, displayName: role, role, isActive, rfidTag: '', photoURL: '', createdAt: now, updatedAt: now });
const order = (cashierId) => ({ orderNumber: 'ORD-1', items: [], subtotal: 100, discount: 0, tax: 0, total: 100, paymentMethod: 'cash', status: 'completed', cashierId, cashierName: 'x', createdAt: now, updatedAt: now });
const card = (userId) => ({ email: 'a@x.com', password: 'secret1', userId, staffName: 'x', createdAt: now });
// Store-QR e-wallet (backend task, 2026-10-22)
const wallet = (on, qr = 'https://res.cloudinary.com/demo/image/upload/qr.png') => ({ enabled: on, qrImageUrl: on ? qr : '', accountName: 'JPOS Coffee', accountHint: '0917•••1234' });
const settings = (uid, over = {}) => ({ gcash: wallet(true), maya: wallet(false), card: { enabled: true }, updatedAt: now, updatedBy: uid, ...over });
const ewOrder = (cashierId, method, ref, over = {}) => ({ ...order(cashierId), paymentMethod: method, paymentReference: ref, paymentVerification: 'manual', verifiedBy: cashierId, ...over });
const refDoc = (orderId, cashierId, method, ref, over = {}) => ({ orderId, orderNumber: 'ORD-1', cashierId, method, reference: ref, createdAt: now, ...over });
// The POS's atomic save: the order and its reference claim in ONE batch
async function payEwallet(db, { id = 'oNew', cashier, method = 'gcash', ref = 'REF1234567890', orderOver = {}, refOver = {}, withRef = true }) {
  const b = writeBatch(db);
  b.set(doc(db, `orders/${id}`), ewOrder(cashier, method, ref, orderOver));
  if (withRef) b.set(doc(db, `paymentRefs/${method}_${ref}`), refDoc(id, cashier, method, ref, refOver));
  await b.commit();
}

async function seed() {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users/admin1'), user('admin'));
    await setDoc(doc(db, 'users/admin2'), user('admin'));
    await setDoc(doc(db, 'users/adminOff'), user('admin', false));
    await setDoc(doc(db, 'users/staff1'), { ...user('staff'), rfidTag: 'TAG1' });
    await setDoc(doc(db, 'users/staffOff'), user('staff', false));
    await setDoc(doc(db, 'products/p1'), { name: 'Latte', price: 120, isAvailable: true });
    await setDoc(doc(db, 'categories/c1'), { name: 'Coffee' });
    await setDoc(doc(db, 'orders/o1'), order('staff1'));
    await setDoc(doc(db, 'rfidCards/TAG1'), card('staff1'));
    await setDoc(doc(db, 'rfidCards/ADMINTAG'), card('admin2')); // legacy admin card
    await setDoc(doc(db, 'orders/oG1'), ewOrder('staff1', 'gcash', 'USEDREF0001'));
    await setDoc(doc(db, 'paymentRefs/gcash_USEDREF0001'), refDoc('oG1', 'staff1', 'gcash', 'USEDREF0001'));
    await setDoc(doc(db, 'settings/payments'), settings('admin1'));
  });
}

const results = [];
async function t(name, expect, fn) {
  await seed();
  try {
    await (expect === 'allow' ? assertSucceeds(fn()) : assertFails(fn()));
    results.push(['PASS', expect, name]);
  } catch (e) {
    results.push(['FAIL', expect, name + '  <- ' + (e.message || e).toString().split('\n')[0]]);
  }
}

const anon = () => env.unauthenticatedContext().firestore();
const as = (uid) => env.authenticatedContext(uid).firestore();
const range = (db) => query(collection(db, 'orders'), where('createdAt', '>=', '2000'), where('createdAt', '<=', '3000'), orderBy('createdAt', 'desc'));

// ── Not signed in (landing page / RFID terminal) ──
await t('anon: get one RFID card by tag (RFID login)', 'allow', () => getDoc(doc(anon(), 'rfidCards/TAG1')));
await t('anon: LIST all RFID cards', 'deny', () => getDocs(collection(anon(), 'rfidCards')));
await t('anon: read a user profile', 'deny', () => getDoc(doc(anon(), 'users/staff1')));
await t('anon: list users', 'deny', () => getDocs(collection(anon(), 'users')));
await t('anon: read products', 'deny', () => getDocs(collection(anon(), 'products')));
await t('anon: read orders', 'deny', () => getDocs(collection(anon(), 'orders')));
await t('anon: create own admin profile (stranger signup)', 'deny', () => setDoc(doc(anon(), 'users/evil'), user('admin')));

// ── Stranger with a Firebase login but no profile (e.g. Google) ──
await t('stranger: read own (missing) profile', 'allow', () => getDoc(doc(as('evil'), 'users/evil')));
await t('stranger: create own admin profile', 'deny', () => setDoc(doc(as('evil'), 'users/evil'), user('admin')));
await t('stranger: list users (old bootstrap check)', 'deny', () => getDocs(query(collection(as('evil'), 'users'), limit(1))));
await t('stranger: read products', 'deny', () => getDocs(collection(as('evil'), 'products')));
await t('stranger: create order', 'deny', () => addDoc(collection(as('evil'), 'orders'), order('evil')));

// ── Active staff (cashier) ──
await t('staff: read own profile (login + snapshot)', 'allow', () => getDoc(doc(as('staff1'), 'users/staff1')));
await t('staff: read another profile', 'deny', () => getDoc(doc(as('staff1'), 'users/admin1')));
await t('staff: list users', 'deny', () => getDocs(collection(as('staff1'), 'users')));
await t('staff: POS menu (available products)', 'allow', () => getDocs(query(collection(as('staff1'), 'products'), where('isAvailable', '==', true))));
await t('staff: POS categories', 'allow', () => getDocs(collection(as('staff1'), 'categories')));
await t('staff: create order as self (new code setDoc)', 'allow', () => setDoc(doc(collection(as('staff1'), 'orders')), order('staff1')));
await t('staff: create order as self (old code addDoc)', 'allow', () => addDoc(collection(as('staff1'), 'orders'), order('staff1')));
await t('staff: create order as someone else (spoof cashierId)', 'deny', () => addDoc(collection(as('staff1'), 'orders'), order('admin1')));
await t('staff: edit an order', 'deny', () => updateDoc(doc(as('staff1'), 'orders/o1'), { total: 1 }));
await t('staff: delete an order', 'deny', () => deleteDoc(doc(as('staff1'), 'orders/o1')));
await t('staff: dashboard range query', 'allow', () => getDocs(range(as('staff1'))));
await t('staff: edit own name/photo', 'allow', () => updateDoc(doc(as('staff1'), 'users/staff1'), { displayName: 'New', photoURL: 'u', updatedAt: now }));
await t('staff: make self admin', 'deny', () => updateDoc(doc(as('staff1'), 'users/staff1'), { role: 'admin' }));
await t('staff: re-activate/deactivate self', 'deny', () => updateDoc(doc(as('staff1'), 'users/staff1'), { isActive: false }));
await t('staff: change own rfidTag', 'deny', () => updateDoc(doc(as('staff1'), 'users/staff1'), { rfidTag: 'X' }));
await t('staff: edit another profile', 'deny', () => updateDoc(doc(as('staff1'), 'users/admin1'), { displayName: 'x' }));
await t('staff: overwrite an RFID card', 'deny', () => setDoc(doc(as('staff1'), 'rfidCards/TAG1'), card('staff1')));
await t('staff: delete an RFID card', 'deny', () => deleteDoc(doc(as('staff1'), 'rfidCards/TAG1')));
await t('staff: write products', 'deny', () => setDoc(doc(as('staff1'), 'products/p2'), { name: 'x' }));

// ── Deactivated accounts ──
await t('inactive staff: read own profile (to be told "deactivated")', 'allow', () => getDoc(doc(as('staffOff'), 'users/staffOff')));
await t('inactive staff: read products', 'deny', () => getDocs(collection(as('staffOff'), 'products')));
await t('inactive staff: create order', 'deny', () => addDoc(collection(as('staffOff'), 'orders'), order('staffOff')));
await t('inactive admin: list users', 'deny', () => getDocs(collection(as('adminOff'), 'users')));
await t('inactive admin: write products', 'deny', () => setDoc(doc(as('adminOff'), 'products/p2'), { name: 'x' }));

// ── Admin ──
await t('admin: list staff', 'allow', () => getDocs(collection(as('admin1'), 'users')));
await t('admin: reports range query', 'allow', () => getDocs(range(as('admin1'))));
await t('admin: recent orders', 'allow', () => getDocs(query(collection(as('admin1'), 'orders'), orderBy('createdAt', 'desc'), limit(5))));
await t('admin: create order as self (admin POS)', 'allow', () => setDoc(doc(collection(as('admin1'), 'orders')), order('admin1')));
await t('admin: write products', 'allow', () => setDoc(doc(as('admin1'), 'products/p2'), { name: 'x' }));
await t('admin: write categories', 'allow', () => setDoc(doc(as('admin1'), 'categories/c2'), { name: 'x' }));
await t('admin: update + delete order', 'allow', async () => { await updateDoc(doc(as('admin1'), 'orders/o1'), { status: 'completed' }); await deleteDoc(doc(as('admin1'), 'orders/o1')); });
await t('admin: toggle staff active', 'allow', () => updateDoc(doc(as('admin1'), 'users/staff1'), { isActive: false }));
await t('admin: edit own name/photo (settings modal)', 'allow', () => updateDoc(doc(as('admin1'), 'users/admin1'), { displayName: 'A', photoURL: '', updatedAt: now }));
await t('admin: list RFID cards', 'deny', () => getDocs(collection(as('admin1'), 'rfidCards')));
await t('admin: create staff — batch profile + card (getAfter)', 'allow', async () => {
  const db = as('admin1'); const b = writeBatch(db);
  b.set(doc(db, 'users/new1'), user('staff')); b.set(doc(db, 'rfidCards/TAG2'), card('new1')); await b.commit();
});
await t('admin: create staff — batch profile only', 'allow', async () => {
  const db = as('admin1'); const b = writeBatch(db); b.set(doc(db, 'users/new1'), user('staff')); await b.commit();
});
await t('admin: OLD code — profile then card (sequential)', 'allow', async () => {
  const db = as('admin1'); await setDoc(doc(db, 'users/new1'), user('staff')); await setDoc(doc(db, 'rfidCards/TAG2'), card('new1'));
});
await t('admin: create card for a user with no profile', 'deny', () => setDoc(doc(as('admin1'), 'rfidCards/TAG9'), card('ghost')));
await t('admin: create card with no userId', 'deny', () => setDoc(doc(as('admin1'), 'rfidCards/TAG9'), { email: 'a', password: 'b' }));
await t('admin: update staff card password (tag same)', 'allow', () => setDoc(doc(as('admin1'), 'rfidCards/TAG1'), { ...card('staff1'), password: 'new' }));
await t('admin: move staff card X→Y (batch: profile, new card, delete old)', 'allow', async () => {
  const db = as('admin1'); const b = writeBatch(db);
  b.update(doc(db, 'users/staff1'), { rfidTag: 'TAG5' }); b.set(doc(db, 'rfidCards/TAG5'), card('staff1')); b.delete(doc(db, 'rfidCards/TAG1')); await b.commit();
});
await t('admin: create card for an ADMIN', 'deny', () => setDoc(doc(as('admin1'), 'rfidCards/TAG7'), card('admin2')));
await t('admin: create card for SELF (admin)', 'deny', () => setDoc(doc(as('admin1'), 'rfidCards/TAG7'), card('admin1')));
await t('admin: update legacy ADMIN card', 'deny', () => updateDoc(doc(as('admin1'), 'rfidCards/ADMINTAG'), { password: 'x' }));
await t('admin: delete legacy ADMIN card (cleanup)', 'allow', () => deleteDoc(doc(as('admin1'), 'rfidCards/ADMINTAG')));
await t('admin: demote admin + give card in one batch (getAfter)', 'allow', async () => {
  const db = as('admin1'); const b = writeBatch(db);
  b.update(doc(db, 'users/admin2'), { role: 'staff', rfidTag: 'TAG3' }); b.set(doc(db, 'rfidCards/TAG3'), card('admin2')); await b.commit();
});
await t('admin: promote staff + delete their card (batch)', 'allow', async () => {
  const db = as('admin1'); const b = writeBatch(db);
  b.update(doc(db, 'users/staff1'), { role: 'admin', rfidTag: '' }); b.delete(doc(db, 'rfidCards/TAG1')); await b.commit();
});
await t('admin: promote staff but KEEP writing their card (batch)', 'deny', async () => {
  const db = as('admin1'); const b = writeBatch(db);
  b.update(doc(db, 'users/staff1'), { role: 'admin' }); b.set(doc(db, 'rfidCards/TAG1'), card('staff1')); await b.commit();
});
await t('admin: create admin profile + card in one batch', 'deny', async () => {
  const db = as('admin1'); const b = writeBatch(db);
  b.set(doc(db, 'users/new2'), user('admin')); b.set(doc(db, 'rfidCards/TAG8'), card('new2')); await b.commit();
});
await t('admin: delete staff + their card (batch)', 'allow', async () => {
  const db = as('admin1'); const b = writeBatch(db);
  b.delete(doc(db, 'users/staff1')); b.delete(doc(db, 'rfidCards/TAG1')); await b.commit();
});

// ── Store payment settings (store-QR e-wallet) ──
await t('staff: read payment settings (POS shows the QR)', 'allow', () => getDoc(doc(as('staff1'), 'settings/payments')));
await t('anon: read payment settings', 'deny', () => getDoc(doc(anon(), 'settings/payments')));
await t('staff: write payment settings (swap in own QR)', 'deny', () => setDoc(doc(as('staff1'), 'settings/payments'), settings('staff1', { gcash: wallet(true, 'https://evil.example/my-qr.png') })));
await t('inactive admin: write payment settings', 'deny', () => setDoc(doc(as('adminOff'), 'settings/payments'), settings('adminOff')));
await t('admin: write payment settings', 'allow', () => setDoc(doc(as('admin1'), 'settings/payments'), settings('admin1', { maya: wallet(true) })));
await t('admin: enable a wallet with no QR', 'deny', () => setDoc(doc(as('admin1'), 'settings/payments'), settings('admin1', { maya: { ...wallet(false), enabled: true } })));
await t('admin: non-https QR url', 'deny', () => setDoc(doc(as('admin1'), 'settings/payments'), settings('admin1', { gcash: wallet(true, 'http://x.com/qr.png') })));
await t('admin: updatedBy someone else', 'deny', () => setDoc(doc(as('admin1'), 'settings/payments'), settings('admin2')));
await t('admin: extra field in settings', 'deny', () => setDoc(doc(as('admin1'), 'settings/payments'), { ...settings('admin1'), note: 'x' }));
await t('admin: delete payment settings', 'deny', () => deleteDoc(doc(as('admin1'), 'settings/payments')));

// ── E-wallet orders + unique references ──
await t('staff: GCash order + reference claim in one batch', 'allow', () => payEwallet(as('staff1'), { cashier: 'staff1' }));
await t('staff: Maya order + reference claim in one batch', 'allow', () => payEwallet(as('staff1'), { cashier: 'staff1', method: 'maya' }));
await t('staff: REUSED GCash reference (whole batch fails)', 'deny', () => payEwallet(as('staff1'), { cashier: 'staff1', ref: 'USEDREF0001' }));
await t('admin: REUSED reference, even for an admin', 'deny', () => payEwallet(as('admin1'), { cashier: 'admin1', ref: 'USEDREF0001' }));
await t('staff: same number under the OTHER wallet (Maya)', 'allow', () => payEwallet(as('staff1'), { cashier: 'staff1', method: 'maya', ref: 'USEDREF0001' }));
await t(`staff: GCash order WITHOUT a reference (stage ${STAGE_A ? 'A: still allowed' : 'B: required'})`, noRef, () => setDoc(doc(as('staff1'), 'orders/oX'), { ...order('staff1'), paymentMethod: 'gcash' }));
await t('staff: GCash order with a ref but NO claim doc', 'deny', () => payEwallet(as('staff1'), { cashier: 'staff1', withRef: false }));
await t('staff: GCash order with an EMPTY reference string', 'deny', () => setDoc(doc(as('staff1'), 'orders/oY'), { ...order('staff1'), paymentMethod: 'gcash', paymentReference: '' }));
await t('staff: Maya order with a reference but no claim (both stages)', 'deny', () => payEwallet(as('staff1'), { cashier: 'staff1', method: 'maya', ref: 'MAYA123456', withRef: false }));
await t('staff: reference not normalized (lowercase)', 'deny', () => payEwallet(as('staff1'), { cashier: 'staff1', ref: 'abc123456' }));
await t('staff: reference too short', 'deny', () => payEwallet(as('staff1'), { cashier: 'staff1', ref: 'AB12' }));
await t('staff: verifiedBy someone else', 'deny', () => payEwallet(as('staff1'), { cashier: 'staff1', orderOver: { verifiedBy: 'admin1' } }));
await t('staff: paymentVerification not manual', 'deny', () => payEwallet(as('staff1'), { cashier: 'staff1', orderOver: { paymentVerification: 'auto' } }));
await t('staff: claim doc says another cashier', 'deny', () => payEwallet(as('staff1'), { cashier: 'staff1', refOver: { cashierId: 'admin1' } }));
await t('staff: claim doc points at another order', 'deny', () => payEwallet(as('staff1'), { cashier: 'staff1', refOver: { orderId: 'o1' } }));
await t('staff: claim a reference for an existing CASH order', 'deny', () => setDoc(doc(as('staff1'), 'paymentRefs/gcash_NEWREF000001'), refDoc('o1', 'staff1', 'gcash', 'NEWREF000001')));
await t('staff: claim doc with an extra field', 'deny', () => payEwallet(as('staff1'), { cashier: 'staff1', refOver: { amount: 1 } }));
await t('staff: claim doc createdAt is not a string', 'deny', () => payEwallet(as('staff1'), { cashier: 'staff1', refOver: { createdAt: 12345 } }));
await t('staff: claim doc createdAt is not an ISO time', 'deny', () => payEwallet(as('staff1'), { cashier: 'staff1', refOver: { createdAt: 'yesterday' } }));
await t('staff: claim doc createdAt is too long', 'deny', () => payEwallet(as('staff1'), { cashier: 'staff1', refOver: { createdAt: '2026-10-22T07:30:00.000' + '0'.repeat(20) + 'Z' } }));
await t('staff: claim doc orderNumber too long', 'deny', () => payEwallet(as('staff1'), { cashier: 'staff1', refOver: { orderNumber: 'O'.repeat(65) } }));
await t('staff: re-point an existing claim (update)', 'deny', () => updateDoc(doc(as('staff1'), 'paymentRefs/gcash_USEDREF0001'), { orderId: 'o1' }));
await t('staff: delete a claim', 'deny', () => deleteDoc(doc(as('staff1'), 'paymentRefs/gcash_USEDREF0001')));
await t('admin: delete a claim (correction)', 'allow', () => deleteDoc(doc(as('admin1'), 'paymentRefs/gcash_USEDREF0001')));
await t('staff: get a claim ("already used for ORD-…")', 'allow', () => getDoc(doc(as('staff1'), 'paymentRefs/gcash_USEDREF0001')));
await t('anon: get a claim', 'deny', () => getDoc(doc(anon(), 'paymentRefs/gcash_USEDREF0001')));
await t('staff: list claims', 'deny', () => getDocs(collection(as('staff1'), 'paymentRefs')));
await t('admin: list claims (reconciliation)', 'allow', () => getDocs(collection(as('admin1'), 'paymentRefs')));
await t('staff: cash order without a reference', 'allow', () => setDoc(doc(as('staff1'), 'orders/oC'), order('staff1')));
await t('staff: card order without an approval code', 'allow', () => setDoc(doc(as('staff1'), 'orders/oK'), { ...order('staff1'), paymentMethod: 'card' }));
await t('staff: card order with an approval code', 'allow', () => setDoc(doc(as('staff1'), 'orders/oK'), { ...order('staff1'), paymentMethod: 'card', paymentReference: 'APPR12' }));
await t('staff: card order with a 31-char code', 'deny', () => setDoc(doc(as('staff1'), 'orders/oK'), { ...order('staff1'), paymentMethod: 'card', paymentReference: 'X'.repeat(31) }));
await t(`OLD app: GCash order with no reference (stage ${STAGE_A ? 'A: keeps working' : 'B: denied, deploy the app first!'})`, noRef, () => setDoc(doc(collection(as('staff1'), 'orders')), { ...order('staff1'), paymentMethod: 'gcash' }));

await env.cleanup();
for (const [s, e, n] of results) console.log(`${s}  [${e.padEnd(5)}]  ${n}`);
const failed = results.filter(r => r[0] === 'FAIL').length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
