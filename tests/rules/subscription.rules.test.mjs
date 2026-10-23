// Subscriptions (Phase 2) Firestore rules: sign-up in setup mode, the one-time
// trial, the account limit per package, manual payments, Super Admin review,
// platform settings with audit. Run with the emulator (see package.json test:rules).
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import {
  doc, getDoc, getDocs, setDoc, updateDoc, collection, query, where, writeBatch, Timestamp,
  serverTimestamp, increment,
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
const ENT = {
  starter:    { plan: 'starter', staffLimit: 3, rfid: false, fullReports: false, pdfExport: false, trends: false },
  business:   { plan: 'business', staffLimit: 10, rfid: true, fullReports: true, pdfExport: true, trends: true },
  enterprise: { plan: 'enterprise', staffLimit: null, rfid: true, fullReports: true, pdfExport: true, trends: true },
};
const SETTINGS = {
  plans: {
    starter: { name: 'Starter', price: 499, entitlements: ENT.starter },
    business: { name: 'Business', price: 999, entitlements: ENT.business },
    enterprise: { name: 'Enterprise', price: 1999, entitlements: ENT.enterprise },
  },
  trialDays: 7,
  paymentChannels: {
    gcash: { label: 'GCash', qrImageUrl: 'https://x/g.png', accountName: 'JPOS', accountHint: '0945', enabled: true, order: 1 },
    maya: { label: 'Maya', qrImageUrl: 'https://x/m.png', accountName: 'JPOS', accountHint: '0945', enabled: false, order: 2 },
  },
  messengerUrl: 'https://m.me/joshuapadilla895', contactPhone: '09454454744', lastAuditId: 'a0',
};
const shopDoc = (ownerUid, extra = {}) => ({
  name: 'Shop', slug: 'x', ownerUid, plan: 'starter', desiredPlan: 'business', status: 'setup', suspended: false,
  trialUsed: false, trialDays: 7, createdAt: ts(now - DAY), updatedAt: ts(now - DAY),
  entitlements: ENT.starter, staffCount: 1, lastStaffChange: ownerUid, pendingRequestId: null, ...extra,
});
const user = (tenantId, role = 'staff') => ({
  tenantId, email: `${role}@x.com`, displayName: role, role, isActive: true, rfidTag: '', photoURL: '', createdAt: iso, updatedAt: iso,
});

// Shops: S setup, T trial running, A active, E expired, F Starter shop with 3/3 accounts, P setup with a pending request
async function seed() {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'platform/settings'), SETTINGS);
    await setDoc(doc(db, 'platformAudit/a0'), { action: 'settings.update', by: 'super', at: ts(now - DAY), details: {} });
    await setDoc(doc(db, 'platformAdmins/super'), { name: 'Owner' });
    const shops = {
      S: shopDoc('adminS'),
      T: shopDoc('adminT', { status: 'trial', trialUsed: true, trialStartedAt: ts(now - DAY) }),
      A: shopDoc('adminA', { status: 'active', plan: 'business', entitlements: ENT.business, currentPeriodEnd: ts(now + 10 * DAY) }),
      E: shopDoc('adminE', { status: 'active', currentPeriodEnd: ts(now - DAY) }),
      F: shopDoc('adminF', { staffCount: 3, status: 'trial', trialUsed: true, trialStartedAt: ts(now - DAY) }),
      P: shopDoc('adminP', { pendingRequestId: 'r1' }),
    };
    for (const [id, data] of Object.entries(shops)) await setDoc(doc(db, `tenants/${id}`), data);
    for (const id of Object.keys(shops)) await setDoc(doc(db, `users/admin${id}`), user(id, 'admin'));
    await setDoc(doc(db, 'users/staffS'), user('S'));
    await setDoc(doc(db, 'users/super'), user('A', 'admin'));
    await setDoc(doc(db, 'slugs/taken'), { tenantId: 'A' });
    await setDoc(doc(db, 'subscriptionRequests/r1'), {
      tenantId: 'P', tenantName: 'Shop', uid: 'adminP', requesterName: 'P', plan: 'business', amount: 999, months: 1,
      channelId: 'gcash', channelLabel: 'GCash', channelAccountHint: '0945', reference: 'REF1234567', proofUrl: 'https://x/p.png',
      status: 'pending', createdAt: ts(now - 1000),
    });
    await setDoc(doc(db, 'subscriptionRefs/gcash_REF1234567'), { requestId: 'r1', uid: 'adminP', createdAt: ts(now - 1000) });
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
const as = (uid, verified = true) => env.authenticatedContext(uid, { email: `${uid}@x.com`, email_verified: verified }).firestore();

// ── Sign-up: a new verified owner creates their shop in setup mode ─────────────
const signup = (db, uid, { shop = {}, slug = 'kape-ni-juan', profile = {} } = {}) => {
  const b = writeBatch(db);
  const shopRef = doc(collection(db, 'tenants'));
  b.set(shopRef, {
    name: 'Kape ni Juan', slug, ownerUid: uid, plan: 'starter', desiredPlan: 'business', status: 'setup', suspended: false,
    trialUsed: false, trialDays: 7, entitlements: ENT.starter, staffCount: 1, lastStaffChange: uid, pendingRequestId: null,
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(), ...shop,
  });
  b.set(doc(db, `slugs/${slug}`), { tenantId: shopRef.id });
  b.set(doc(db, `users/${uid}`), {
    tenantId: shopRef.id, email: `${uid}@x.com`, displayName: 'Juan', role: 'admin', isActive: true, rfidTag: '', photoURL: '',
    createdAt: iso, updatedAt: iso, ...profile,
  });
  return b.commit();
};
await t('signup: verified owner creates a setup shop', 'allow', () => signup(as('new1'), 'new1'));
await t('signup: email not verified', 'deny', () => signup(as('new1', false), 'new1'));
await t('signup: shop created as ACTIVE', 'deny', () => signup(as('new1'), 'new1', { shop: { status: 'active' } }));
await t('signup: Business entitlements', 'deny', () => signup(as('new1'), 'new1', { shop: { entitlements: ENT.business } }));
await t('signup: 30-day trial', 'deny', () => signup(as('new1'), 'new1', { shop: { trialDays: 30 } }));
await t('signup: trial already marked used', 'deny', () => signup(as('new1'), 'new1', { shop: { trialUsed: true } }));
await t('signup: 5 accounts already counted', 'deny', () => signup(as('new1'), 'new1', { shop: { staffCount: 5 } }));
await t('signup: shop owned by someone else', 'deny', () => signup(as('new1'), 'new1', { shop: { ownerUid: 'adminA' } }));
await t('signup: link already taken', 'deny', () => signup(as('new1'), 'new1', { slug: 'taken' }));
await t('signup: reserved link', 'deny', () => signup(as('new1'), 'new1', { slug: 'admin' }));
await t('signup: link with capital letters', 'deny', () => signup(as('new1'), 'new1', { slug: 'Kape' }));
await t('signup: already has a shop', 'deny', () => signup(as('adminS'), 'adminS'));
await t('signup: owner profile as STAFF', 'deny', () => signup(as('new1'), 'new1', { profile: { role: 'staff' } }));
await t('signup: owner profile with an RFID tag', 'deny', () => signup(as('new1'), 'new1', { profile: { rfidTag: 'TAG' } }));
await t('signup: owner profile with an extra field', 'deny', () => signup(as('new1'), 'new1', { profile: { superAdmin: true } }));
await t('self-join an EXISTING shop', 'deny', () => setDoc(doc(as('new1'), 'users/new1'), user('A', 'admin')));
await t('point a new link at an existing shop', 'deny', () => setDoc(doc(as('new1'), 'slugs/mine'), { tenantId: 'A' }));
await t('anyone reads platform settings (prices, QR)', 'allow', () => getDoc(doc(anon(), 'platform/settings')));

// ── The one-time free trial ───────────────────────────────────────────────
const startTrial = (db, id, extra = {}) => updateDoc(doc(db, `tenants/${id}`), { status: 'trial', trialUsed: true, trialStartedAt: serverTimestamp(), updatedAt: serverTimestamp(), ...extra });
await t('trial: setup shop admin starts it', 'allow', () => startTrial(as('adminS'), 'S'));
await t('trial: second time', 'deny', () => startTrial(as('adminT'), 'T'));
await t('trial: backdated start', 'deny', () => startTrial(as('adminS'), 'S', { trialStartedAt: ts(now + 30 * DAY) }));
await t('trial: started by staff', 'deny', () => startTrial(as('staffS'), 'S'));
await t('admin makes own shop ACTIVE', 'deny', () => updateDoc(doc(as('adminS'), 'tenants/S'), { status: 'active', currentPeriodEnd: ts(now + 365 * DAY) }));
await t('admin upgrades own package', 'deny', () => updateDoc(doc(as('adminS'), 'tenants/S'), { entitlements: ENT.enterprise }));

// ── Account limit per package (Starter = 3) ─────────────────────────────────
const addPerson = (db, shopId, uid) => {
  const b = writeBatch(db);
  b.set(doc(db, `users/${uid}`), user(shopId));
  b.update(doc(db, `tenants/${shopId}`), { staffCount: increment(1), lastStaffChange: uid, updatedAt: serverTimestamp() });
  return b.commit();
};
await t('Starter (trial): 2nd account', 'allow', () => addPerson(as('adminT'), 'T', 'p2'));
await t('SETUP (view-only): add an account', 'deny', () => addPerson(as('adminS'), 'S', 'p2'));
await t('Starter (trial): 4th account (limit 3)', 'deny', () => addPerson(as('adminF'), 'F', 'p4'));
await t('counter +1 with no new person', 'deny', () => updateDoc(doc(as('adminT'), 'tenants/T'), { staffCount: increment(1), lastStaffChange: 'ghost', updatedAt: serverTimestamp() }));
await t('counter -1 with nobody removed', 'deny', () => updateDoc(doc(as('adminF'), 'tenants/F'), { staffCount: increment(-1), lastStaffChange: 'staffS', updatedAt: serverTimestamp() }));
await t('counter set to 0 directly', 'deny', () => updateDoc(doc(as('adminF'), 'tenants/F'), { staffCount: 0, lastStaffChange: 'x', updatedAt: serverTimestamp() }));

// ── Manual payments ─────────────────────────────────────────────────────────
const pay = (db, uid, shopId, extra = {}, ref = 'GC12345678') => {
  const b = writeBatch(db);
  const reqRef = doc(collection(db, 'subscriptionRequests'));
  const data = {
    tenantId: shopId, tenantName: 'Shop', uid, requesterName: 'Owner', plan: 'business', amount: 999, months: 1,
    channelId: 'gcash', channelLabel: 'GCash', channelAccountHint: '0945', reference: ref, proofUrl: 'https://x/proof.png',
    status: 'pending', createdAt: serverTimestamp(), ...extra,
  };
  b.set(reqRef, data);
  b.set(doc(db, `subscriptionRefs/${data.channelId}_${data.reference}`), { requestId: reqRef.id, uid, createdAt: serverTimestamp() });
  b.update(doc(db, `tenants/${shopId}`), { pendingRequestId: reqRef.id, updatedAt: serverTimestamp() });
  return b.commit();
};
await t('pay: setup shop sends a payment', 'allow', () => pay(as('adminS'), 'adminS', 'S'));
await t('pay: EXPIRED shop can still pay to reopen', 'allow', () => pay(as('adminE'), 'adminE', 'E'));
await t('pay: wrong amount', 'deny', () => pay(as('adminS'), 'adminS', 'S', { amount: 1 }));
await t('pay: disabled QR (Maya)', 'deny', () => pay(as('adminS'), 'adminS', 'S', { channelId: 'maya', channelLabel: 'Maya' }));
await t('pay: unknown QR', 'deny', () => pay(as('adminS'), 'adminS', 'S', { channelId: 'bank', channelLabel: 'Bank' }));
await t('pay: fake account hint', 'deny', () => pay(as('adminS'), 'adminS', 'S', { channelAccountHint: '9999' }));
await t('pay: reference used before', 'deny', () => pay(as('adminS'), 'adminS', 'S', {}, 'REF1234567'));
await t('pay: second open payment', 'deny', () => pay(as('adminP'), 'adminP', 'P', {}, 'GC99999999'));
await t('pay: for another shop', 'deny', () => pay(as('adminS'), 'adminS', 'A'));
await t('pay: by staff', 'deny', () => pay(as('staffS'), 'staffS', 'S'));
await t('pay: proof not a web link', 'deny', () => pay(as('adminS'), 'adminS', 'S', { proofUrl: 'javascript:alert(1)' }));
await t('pay: already approved', 'deny', () => pay(as('adminS'), 'adminS', 'S', { status: 'approved' }));
await t('shop admin lists own payments', 'allow', () => getDocs(query(collection(as('adminP'), 'subscriptionRequests'), where('tenantId', '==', 'P'))));
await t("shop admin lists another shop's payments", 'deny', () => getDocs(query(collection(as('adminS'), 'subscriptionRequests'), where('tenantId', '==', 'P'))));
await t('shop admin lists ALL pending payments', 'deny', () => getDocs(query(collection(as('adminS'), 'subscriptionRequests'), where('status', '==', 'pending'))));
const cancel = (db) => {
  const b = writeBatch(db);
  b.update(doc(db, 'subscriptionRequests/r1'), { status: 'cancelled' });
  b.update(doc(db, 'tenants/P'), { pendingRequestId: null, updatedAt: serverTimestamp() });
  return b.commit();
};
await t('shop cancels its own waiting payment', 'allow', () => cancel(as('adminP')));
await t('another shop cancels it', 'deny', () => cancel(as('adminS')));

// ── Super Admin review ──────────────────────────────────────────────────────
const review = (db, { status = 'approved', end = now + 30 * DAY, shop = {}, req = {} } = {}) => {
  const b = writeBatch(db);
  b.update(doc(db, 'subscriptionRequests/r1'), { status, reviewedBy: 'super', reviewedAt: serverTimestamp(), ...(status === 'rejected' ? { reason: 'Unclear receipt' } : {}), ...req });
  b.update(doc(db, 'tenants/P'), status === 'approved'
    ? { status: 'active', plan: 'business', entitlements: ENT.business, currentPeriodEnd: ts(end), pendingRequestId: null, updatedAt: serverTimestamp(), ...shop }
    : { pendingRequestId: null, updatedAt: serverTimestamp(), ...shop });
  return b.commit();
};
await t('Super Admin approves (about 1 month)', 'allow', () => review(as('super')));
await t('Super Admin approves 3 months', 'deny', () => review(as('super'), { end: now + 90 * DAY }));
await t('Super Admin approves with Enterprise features', 'deny', () => review(as('super'), { shop: { entitlements: ENT.enterprise } }));
await t('approval also changes suspended', 'deny', () => review(as('super'), { shop: { suspended: true } }));
await t('shop admin approves own payment', 'deny', () => review(as('adminP')));
await t('Super Admin rejects with a reason', 'allow', () => review(as('super'), { status: 'rejected' }));
await t('reject without a reason', 'deny', () => review(as('super'), { status: 'rejected', req: { reason: '' } }));
await t('Super Admin lists pending payments', 'allow', () => getDocs(query(collection(as('super'), 'subscriptionRequests'), where('status', '==', 'pending'))));

// ── Platform settings + audit ────────────────────────────────────────────────
const saveSettings = (db, { withAudit = true, auditId = 'a1', extra = {} } = {}) => {
  const b = writeBatch(db);
  if (withAudit) b.set(doc(db, `platformAudit/${auditId}`), { action: 'channel.update', by: 'super', at: serverTimestamp(), details: { channel: 'gcash' } });
  b.set(doc(db, 'platform/settings'), { ...SETTINGS, lastAuditId: auditId, updatedAt: serverTimestamp(), updatedBy: 'super', ...extra });
  return b.commit();
};
await t('Super Admin changes the QR codes (with audit)', 'allow', () => saveSettings(as('super')));
await t('settings change without an audit entry', 'deny', () => saveSettings(as('super'), { withAudit: false }));
await t('settings change reusing an old audit entry', 'deny', () => saveSettings(as('super'), { withAudit: false, auditId: 'a0' }));
await t('shop admin changes the platform settings', 'deny', () => saveSettings(as('adminS')));
await t('edit the audit log', 'deny', () => updateDoc(doc(as('super'), 'platformAudit/a0'), { by: 'x' }));
const suspend = (db, withAudit = true) => {
  const b = writeBatch(db);
  if (withAudit) b.set(doc(db, 'platformAudit/s1'), { action: 'tenant.suspend', by: 'super', at: serverTimestamp(), details: { tenantId: 'A', reason: 'abuse' } });
  b.update(doc(db, 'tenants/A'), { suspended: true, lastAuditId: 's1', updatedAt: serverTimestamp() });
  return b.commit();
};
await t('Super Admin suspends a shop (with audit)', 'allow', () => suspend(as('super')));
await t('suspend without an audit entry', 'deny', () => suspend(as('super'), false));
await t('anyone makes themselves Super Admin', 'deny', () => setDoc(doc(as('adminS'), 'platformAdmins/adminS'), { name: 'me' }));

// ── Email counters: the server's only (Admin SDK), never the app ────────────
await t('a shop admin reads the email counters', 'deny', () => getDoc(doc(as('adminS'), 'mailLog/verify_adminS')));
await t('a shop admin resets their email limit', 'deny', () => setDoc(doc(as('adminS'), 'mailLog/verify_adminS'), { count: 0, windowStart: 0, lastSentAt: 0 }));
await t('the Super Admin edits the email counters', 'deny', () => setDoc(doc(as('super'), 'mailLog/day_2026-10-23'), { count: 0 }));
await t('a stranger lists the email counters', 'deny', () => getDocs(collection(anon(), 'mailLog')));

await env.cleanup();
for (const [s, e, n] of results) console.log(`${s}  [${e.padEnd(5)}]  ${n}`);
const failed = results.filter(r => r[0] === 'FAIL').length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
