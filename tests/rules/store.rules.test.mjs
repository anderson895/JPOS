// Store Settings Firestore rules: what the shop sells (chosen at sign-up), its
// name, logo and colors (public, for its sign-in page), and its receipt details.
// Also the store's saved discounts and voiding a sale, and which package has
// them: own logo/colors, saved discounts and void are Business and up.
// Run with the emulator (see package.json test:rules).
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import {
  doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, collection, writeBatch, Timestamp, serverTimestamp, increment,
} from 'firebase/firestore';

const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8085').split(':');
const env = await initializeTestEnvironment({
  // RULES_PROJECT: run beside the local test app (npm run dev) without touching its data
  projectId: process.env.RULES_PROJECT ?? 'demo-jpos',
  firestore: { rules: readFileSync(process.env.RULES_FILE ?? 'firestore.rules', 'utf8'), host, port: Number(port) },
});

const DAY = 24 * 60 * 60 * 1000;
const now = Date.now();
const iso = new Date().toISOString();
const ts = (ms) => Timestamp.fromMillis(ms);
const STARTER = { plan: 'starter', staffLimit: 3, rfid: false, fullReports: false, pdfExport: false, trends: false };
const shopDoc = (ownerUid, extra = {}) => ({
  name: 'Shop', slug: 'x', ownerUid, plan: 'starter', desiredPlan: 'starter', status: 'trial', suspended: false,
  trialUsed: true, trialStartedAt: ts(now - DAY), trialDays: 7, createdAt: ts(now - DAY), updatedAt: ts(now - DAY),
  entitlements: STARTER, staffCount: 2, lastStaffChange: ownerUid, pendingRequestId: null, ...extra,
});
const user = (tenantId, role = 'staff') => ({
  tenantId, email: `${role}@x.com`, displayName: role, role, isActive: true, rfidTag: '', photoURL: '', createdAt: iso, updatedAt: iso,
});
const RECEIPT = { vatRegistered: true, tin: '123-456-789-000', address: '12 Rizal St.', phone: '0917 123 4567', footer: 'Thank you!' };

// Shops: A (trial running), S (setup: can't sell yet), X (suspended)
async function seed() {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'platform/settings'), {
      plans: { starter: { name: 'Starter', price: 499, entitlements: STARTER } }, trialDays: 7,
      paymentChannels: {}, messengerUrl: 'https://m.me/x', contactPhone: '', lastAuditId: 'a0',
    });
    // A: Business, saved before the new package features (no flags: the package decides)
    await setDoc(doc(db, 'tenants/A'), shopDoc('adminA', { plan: 'business', entitlements: { ...STARTER, plan: 'business', staffLimit: 10 } }));
    // B: Starter trial running; C: Business with those features turned off; G: Starter given its own look
    await setDoc(doc(db, 'tenants/B'), shopDoc('adminB'));
    await setDoc(doc(db, 'tenants/C'), shopDoc('adminC', { plan: 'business', entitlements: { ...STARTER, plan: 'business', branding: false, discounts: false, voidSales: false } }));
    await setDoc(doc(db, 'tenants/G'), shopDoc('adminG', { entitlements: { ...STARTER, branding: true } }));
    // Inventory: a counted and an uncounted product in A (Business) and B (Starter)
    for (const id of ['A', 'B']) {
      await setDoc(doc(db, `tenants/${id}/products/p1`), { name: 'Water', price: 20, trackStock: true, stock: 10 });
      await setDoc(doc(db, `tenants/${id}/products/p2`), { name: 'Bread', price: 10, trackStock: false, stock: 10 });
    }
    await setDoc(doc(db, 'users/staffB'), user('B'));
    for (const id of ['B', 'C', 'G']) {
      await setDoc(doc(db, `users/admin${id}`), user(id, 'admin'));
      await setDoc(doc(db, `tenants/${id}/orders/o1`), { orderNumber: 'ORD-1', status: 'completed', total: 100, cashierId: `admin${id}`, createdAt: iso, updatedAt: iso });
    }
    await setDoc(doc(db, 'tenants/S'), shopDoc('adminS', { status: 'setup', trialUsed: false, trialStartedAt: null }));
    await setDoc(doc(db, 'tenants/X'), shopDoc('adminX', { suspended: true }));
    for (const id of ['A', 'S', 'X']) await setDoc(doc(db, `users/admin${id}`), user(id, 'admin'));
    await setDoc(doc(db, 'users/staffA'), user('A'));
    await setDoc(doc(db, 'users/adminE'), user('E', 'admin'));
    await setDoc(doc(db, 'tenants/E'), shopDoc('adminE', { status: 'active', currentPeriodEnd: ts(now - DAY) }));
    await setDoc(doc(db, 'tenants/A/orders/o1'), { orderNumber: 'ORD-1', status: 'completed', total: 100, cashierId: 'staffA', createdAt: iso, updatedAt: iso });
    await setDoc(doc(db, 'tenants/A/orders/v1'), { orderNumber: 'ORD-2', status: 'voided', total: 50, cashierId: 'staffA', createdAt: iso, updatedAt: iso, voidReason: 'mistake' });
    await setDoc(doc(db, 'tenants/E/orders/o1'), { orderNumber: 'ORD-1', status: 'completed', total: 100, cashierId: 'adminE', createdAt: iso, updatedAt: iso });
    await setDoc(doc(db, 'tenants/A/discounts/d1'), { name: 'Employee', kind: 'percent', value: 10, active: true, createdAt: iso, updatedAt: iso });
    await setDoc(doc(db, 'tenants/A/settings/branding'), { name: 'Shop', logoUrl: '', theme: 'espresso', updatedAt: ts(now - DAY), updatedBy: 'adminA' });
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
const as = (uid) => env.authenticatedContext(uid, { email: `${uid}@x.com`, email_verified: true }).firestore();

// ── Sign-up: the kind of store, and its public name, in the same batch ──────
const signup = (db, uid, { shop = {}, branding = {}, withBranding = true, oldApp = false } = {}) => {
  const b = writeBatch(db);
  const shopRef = doc(collection(db, 'tenants'));
  const shopData = {
    name: 'Kape ni Juan', slug: 'kape-ni-juan', ownerUid: uid, businessType: 'food', plan: 'starter', desiredPlan: 'starter',
    status: 'setup', suspended: false, trialUsed: false, trialDays: 7, entitlements: STARTER, staffCount: 1,
    lastStaffChange: uid, pendingRequestId: null, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), ...shop,
  };
  if (oldApp) delete shopData.businessType;
  b.set(shopRef, shopData);
  b.set(doc(db, 'slugs/kape-ni-juan'), { tenantId: shopRef.id });
  b.set(doc(db, `users/${uid}`), {
    tenantId: shopRef.id, email: `${uid}@x.com`, displayName: 'Juan', role: 'admin', isActive: true, rfidTag: '', photoURL: '',
    createdAt: iso, updatedAt: iso,
  });
  if (withBranding) {
    b.set(doc(db, `tenants/${shopRef.id}/settings/branding`), {
      name: 'Kape ni Juan', logoUrl: '', theme: 'espresso', updatedAt: serverTimestamp(), updatedBy: uid, ...branding,
    });
  }
  return b.commit();
};
await t('signup: with what it sells and its public name', 'allow', () => signup(as('new1'), 'new1'));
// The app before Store Settings must keep working until the new one is deployed
await t('signup: the old way (no kind of store, no public name)', 'allow', () => signup(as('new1'), 'new1', { oldApp: true, withBranding: false }));
await t('signup: an unknown kind of store', 'deny', () => signup(as('new1'), 'new1', { shop: { businessType: 'casino' } }));
await t('signup: public name differs from the shop name', 'deny', () => signup(as('new1'), 'new1', { branding: { name: 'Fake Bank' } }));
await t('signup: public look with a non-https logo', 'deny', () => signup(as('new1'), 'new1', { branding: { logoUrl: 'http://x/logo.png' } }));

// ── The public look: anyone can read one, nobody can list them ──────────────
await t('anyone reads a shop\'s name, logo and colors', 'allow', () => getDoc(doc(anon(), 'tenants/A/settings/branding')));
await t('anyone lists every shop\'s look', 'deny', () => getDocs(collection(anon(), 'tenants/A/settings')));
await t('anyone reads the shop\'s payment settings', 'deny', () => getDoc(doc(anon(), 'tenants/A/settings/payments')));

// ── Store Settings ───────────────────────────────────────────────────────────
const saveStore = (db, tenantId, { shop = {}, branding = {}, withShop = true, withBranding = true } = {}) => {
  const b = writeBatch(db);
  const name = shop.name ?? 'Aling Nena Store';
  if (withShop) b.update(doc(db, `tenants/${tenantId}`), { name, businessType: 'grocery', receipt: RECEIPT, updatedAt: serverTimestamp(), ...shop });
  if (withBranding) {
    b.set(doc(db, `tenants/${tenantId}/settings/branding`), {
      name, logoUrl: 'https://res.cloudinary.com/x/logo.png', theme: 'matcha', updatedAt: serverTimestamp(), ...branding,
    });
  }
  return b.commit();
};
// updatedBy is the signed-in admin unless a test says otherwise
const save = (uid, tenantId, opts = {}) => saveStore(as(uid), tenantId, { ...opts, branding: { updatedBy: uid, ...(opts.branding ?? {}) } });

await t('admin renames the store, picks a logo, colors and receipt', 'allow', () => save('adminA', 'A'));
await t('a shop that can\'t sell yet saves its name and receipt (JPOS look)', 'allow', () => save('adminS', 'S', { branding: { logoUrl: '', theme: 'espresso' } }));
await t('admin changes only the logo and colors', 'allow', () => save('adminA', 'A', { withShop: false, branding: { name: 'Shop' } }));
await t('admin keeps the name, changes the receipt only', 'allow', () => save('adminA', 'A', { withBranding: false, shop: { name: 'Shop' } }));
await t('rename without the public name', 'deny', () => save('adminA', 'A', { withBranding: false }));
await t('public name that isn\'t the shop\'s', 'deny', () => save('adminA', 'A', { withShop: false, branding: { name: 'Other' } }));
await t('a cashier changes the store', 'deny', () => save('staffA', 'A'));
await t('another shop\'s admin changes it', 'deny', () => save('adminS', 'A'));
await t('a paused (suspended) shop changes it', 'deny', () => save('adminX', 'X'));
await t('admin sneaks in a status change', 'deny', () => save('adminA', 'A', { shop: { status: 'active' } }));
await t('admin gives itself more accounts', 'deny', () => save('adminA', 'A', { shop: { staffCount: 99 } }));
await t('an unknown kind of store', 'deny', () => save('adminA', 'A', { shop: { businessType: 'casino' } }));
await t('a one-letter store name', 'deny', () => save('adminA', 'A', { shop: { name: 'A' } }));
await t('a TIN with letters', 'deny', () => save('adminA', 'A', { shop: { receipt: { ...RECEIPT, tin: 'ABC-123' } } }));
await t('a receipt with an extra field', 'deny', () => save('adminA', 'A', { shop: { receipt: { ...RECEIPT, logo: 'x' } } }));
await t('a receipt missing a field', 'deny', () => save('adminA', 'A', { shop: { receipt: { vatRegistered: true } } }));
await t('a very long thank-you line', 'deny', () => save('adminA', 'A', { shop: { receipt: { ...RECEIPT, footer: 'x'.repeat(201) } } }));
await t('an unknown color theme', 'deny', () => save('adminA', 'A', { branding: { theme: 'neon' } }));
await t('a logo that isn\'t https', 'deny', () => save('adminA', 'A', { branding: { logoUrl: 'javascript:alert(1)' } }));
await t('an extra field in the public look', 'deny', () => save('adminA', 'A', { branding: { ownerEmail: 'x@x.com' } }));
await t('saved as someone else', 'deny', () => saveStore(as('adminA'), 'A', { branding: { updatedBy: 'adminS' } }));
await t('anyone changes a shop\'s look', 'deny', () => setDoc(doc(anon(), 'tenants/A/settings/branding'), { name: 'Shop', logoUrl: '', theme: 'berry', updatedAt: serverTimestamp(), updatedBy: 'x' }));
await t('admin deletes the public look', 'deny', () => deleteDoc(doc(as('adminA'), 'tenants/A/settings/branding')));
await t('admin of a shop with no look yet adds it', 'allow', () => setDoc(doc(as('adminS'), 'tenants/S/settings/branding'), { name: 'Shop', logoUrl: '', theme: 'espresso', updatedAt: serverTimestamp(), updatedBy: 'adminS' }));
await t('cashier reads the receipt details', 'allow', () => getDoc(doc(as('staffA'), 'tenants/A')));
await t('a rename without the time it was saved', 'deny', () => updateDoc(doc(as('adminA'), 'tenants/A'), { name: 'New Name' }));

// ── Saved discounts ──────────────────────────────────────────────────────────
const disc = (extra = {}) => ({ name: 'Promo', kind: 'fixed', value: 50, active: true, createdAt: iso, updatedAt: iso, ...extra });
await t('admin adds a saved discount', 'allow', () => setDoc(doc(as('adminA'), 'tenants/A/discounts/d2'), disc()));
await t('admin adds 12.5%', 'allow', () => setDoc(doc(as('adminA'), 'tenants/A/discounts/d2'), disc({ kind: 'percent', value: 12.5 })));
await t('admin switches a discount off', 'allow', () => updateDoc(doc(as('adminA'), 'tenants/A/discounts/d1'), { active: false, updatedAt: iso }));
await t('cashier reads the discounts', 'allow', () => getDocs(collection(as('staffA'), 'tenants/A/discounts')));
await t('cashier adds a discount', 'deny', () => setDoc(doc(as('staffA'), 'tenants/A/discounts/d2'), disc()));
await t('another shop reads the discounts', 'deny', () => getDocs(collection(as('adminS'), 'tenants/A/discounts')));
await t('a 150% discount', 'deny', () => setDoc(doc(as('adminA'), 'tenants/A/discounts/d2'), disc({ kind: 'percent', value: 150 })));
await t('a zero discount', 'deny', () => setDoc(doc(as('adminA'), 'tenants/A/discounts/d2'), disc({ value: 0 })));
await t('an unknown kind of discount', 'deny', () => setDoc(doc(as('adminA'), 'tenants/A/discounts/d2'), disc({ kind: 'free' })));
await t('a discount with an extra field', 'deny', () => setDoc(doc(as('adminA'), 'tenants/A/discounts/d2'), disc({ cashierOnly: true })));
await t('a discount with no name', 'deny', () => setDoc(doc(as('adminA'), 'tenants/A/discounts/d2'), disc({ name: '' })));
await t('admin deletes a discount', 'allow', () => deleteDoc(doc(as('adminA'), 'tenants/A/discounts/d1')));

// ── Void a sale ──────────────────────────────────────────────────────────────
const voidIt = (uid, path = 'tenants/A/orders/o1', extra = {}) => updateDoc(doc(as(uid), path), {
  status: 'voided', voidedBy: uid, voidedByName: 'Owner', voidedAt: new Date().toISOString(), voidReason: 'Wrong item', updatedAt: iso, ...extra,
});
await t('admin voids a sale with a reason', 'allow', () => voidIt('adminA'));
await t('cashier voids a sale', 'deny', () => voidIt('staffA'));
await t('another shop\'s admin voids it', 'deny', () => voidIt('adminS'));
await t('void without a reason', 'deny', () => voidIt('adminA', undefined, { voidReason: '' }));
await t('void in someone else\'s name', 'deny', () => voidIt('adminA', undefined, { voidedBy: 'staffA' }));
await t('void and change the total', 'deny', () => voidIt('adminA', undefined, { total: 0 }));
await t('void an already voided sale', 'deny', () => voidIt('adminA', 'tenants/A/orders/v1'));
await t('un-void a sale', 'deny', () => updateDoc(doc(as('adminA'), 'tenants/A/orders/v1'), { status: 'completed', updatedAt: iso }));
await t('admin edits a sale\'s total', 'deny', () => updateDoc(doc(as('adminA'), 'tenants/A/orders/o1'), { total: 1, updatedAt: iso }));
await t('admin deletes a sale', 'deny', () => deleteDoc(doc(as('adminA'), 'tenants/A/orders/o1')));
await t('void after the subscription ended', 'deny', () => voidIt('adminE', 'tenants/E/orders/o1'));

// ── Which package has what ──────────────────────────────────────────────────
await t('Starter: its own logo', 'deny', () => save('adminB', 'B'));
await t('Starter: its own colors only', 'deny', () => save('adminB', 'B', { branding: { logoUrl: '' } }));
await t('Starter: name and receipt with the JPOS look', 'allow', () => save('adminB', 'B', { branding: { logoUrl: '', theme: 'espresso' } }));
await t('Starter given its own look by the Super Admin', 'allow', () => save('adminG', 'G'));
await t('Starter: a saved discount', 'deny', () => setDoc(doc(as('adminB'), 'tenants/B/discounts/d2'), disc()));
await t('Starter: void a sale', 'deny', () => voidIt('adminB', 'tenants/B/orders/o1'));
await t('Business with those turned off: own logo', 'deny', () => save('adminC', 'C'));
await t('Business with those turned off: a saved discount', 'deny', () => setDoc(doc(as('adminC'), 'tenants/C/discounts/d2'), disc()));
await t('Business with those turned off: void', 'deny', () => voidIt('adminC', 'tenants/C/orders/o1'));
await t('Business saved before the new features: all three work', 'allow', async () => {
  await save('adminA', 'A');
  await setDoc(doc(as('adminA'), 'tenants/A/discounts/d9'), disc());
  await voidIt('adminA');
});

// ── Inventory: a sale takes stock off ──────────────────────────────────────────
const sell = (uid, shop, product = 'p1', qty = 2, extra = {}) => {
  const db = as(uid);
  const b = writeBatch(db);
  b.set(doc(collection(db, `tenants/${shop}/orders`)), { orderNumber: 'ORD-9', status: 'completed', total: 40, paymentMethod: 'cash', cashierId: uid, createdAt: iso, updatedAt: iso, items: [] });
  b.update(doc(db, `tenants/${shop}/products/${product}`), { stock: increment(-qty), ...extra });
  return b.commit();
};
await t('cashier sells: the stock comes off', 'allow', () => sell('staffA', 'A'));
await t('cashier sells more than is left (two counters): still allowed', 'allow', () => sell('staffA', 'A', 'p1', 15));
await t('cashier adds stock', 'deny', () => sell('staffA', 'A', 'p1', -5));
await t('cashier changes the price with the stock', 'deny', () => sell('staffA', 'A', 'p1', 1, { price: 1 }));
await t('cashier takes stock off a product that keeps no count', 'deny', () => sell('staffA', 'A', 'p2'));
await t('Starter: a sale takes stock off', 'deny', () => sell('staffB', 'B'));
await t('cashier sets the stock directly', 'deny', () => updateDoc(doc(as('staffA'), 'tenants/A/products/p1'), { stock: 3, trackStock: false }));
await t('admin restocks', 'allow', () => updateDoc(doc(as('adminA'), 'tenants/A/products/p1'), { stock: 50, lowStockAt: 5 }));
await t('admin voids a sale and puts the stock back', 'allow', () => {
  const db = as('adminA');
  const b = writeBatch(db);
  b.update(doc(db, 'tenants/A/orders/o1'), { status: 'voided', voidedBy: 'adminA', voidedByName: 'Owner', voidedAt: new Date().toISOString(), voidReason: 'Wrong item', updatedAt: iso });
  b.update(doc(db, 'tenants/A/products/p1'), { stock: increment(2) });
  return b.commit();
});

await env.cleanup();
for (const [s, e, n] of results) console.log(`${s}  [${e.padEnd(5)}]  ${n}`);
const failed = results.filter(r => r[0] === 'FAIL').length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
