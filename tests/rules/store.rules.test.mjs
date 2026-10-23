// Store Settings Firestore rules: what the shop sells (chosen at sign-up), its
// name, logo and colors (public, for its sign-in page), and its receipt details.
// Run with the emulator (see package.json test:rules).
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import {
  doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, collection, writeBatch, Timestamp, serverTimestamp,
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
    await setDoc(doc(db, 'tenants/A'), shopDoc('adminA'));
    await setDoc(doc(db, 'tenants/S'), shopDoc('adminS', { status: 'setup', trialUsed: false, trialStartedAt: null }));
    await setDoc(doc(db, 'tenants/X'), shopDoc('adminX', { suspended: true }));
    for (const id of ['A', 'S', 'X']) await setDoc(doc(db, `users/admin${id}`), user(id, 'admin'));
    await setDoc(doc(db, 'users/staffA'), user('A'));
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
await t('admin of a shop that can\'t sell yet sets it up', 'allow', () => save('adminS', 'S'));
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

await env.cleanup();
for (const [s, e, n] of results) console.log(`${s}  [${e.padEnd(5)}]  ${n}`);
const failed = results.filter(r => r[0] === 'FAIL').length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
