// Feedback Firestore rules: people in a shop send problems and ideas, the Super
// Admin reads and handles them. Run with the emulator (see package.json test:rules).
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import {
  addDoc, collection, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp, setDoc, updateDoc, where, Timestamp,
} from 'firebase/firestore';

const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8085').split(':');
const env = await initializeTestEnvironment({
  projectId: process.env.RULES_PROJECT ?? 'demo-jpos',
  firestore: { rules: readFileSync(process.env.RULES_FILE ?? 'firestore.rules', 'utf8'), host, port: Number(port) },
});

const DAY = 24 * 60 * 60 * 1000;
const now = Date.now();
const iso = new Date().toISOString();
const ts = (ms) => Timestamp.fromMillis(ms);
const shopDoc = (ownerUid, extra = {}) => ({
  name: 'Shop', slug: 'x', ownerUid, plan: 'starter', desiredPlan: 'starter', status: 'active', suspended: false,
  trialUsed: true, trialDays: 7, currentPeriodEnd: ts(now + 10 * DAY), createdAt: ts(now - DAY), updatedAt: ts(now - DAY),
  entitlements: { plan: 'starter', staffLimit: 3 }, staffCount: 2, lastStaffChange: ownerUid, pendingRequestId: null, ...extra,
});
const user = (tenantId, role = 'staff', extra = {}) => ({
  tenantId, email: `${role}@x.com`, displayName: role, role, isActive: true, rfidTag: '', photoURL: '', createdAt: iso, updatedAt: iso, ...extra,
});

// Shops: A active, E expired (view-only). staffOff is switched off.
async function seed() {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'platformAdmins/super'), { name: 'Owner' });
    await setDoc(doc(db, 'tenants/A'), shopDoc('adminA'));
    await setDoc(doc(db, 'tenants/E'), shopDoc('adminE', { currentPeriodEnd: ts(now - DAY) }));
    await setDoc(doc(db, 'users/adminA'), user('A', 'admin'));
    await setDoc(doc(db, 'users/staffA'), user('A'));
    await setDoc(doc(db, 'users/staffOff'), user('A', 'staff', { isActive: false }));
    await setDoc(doc(db, 'users/adminE'), user('E', 'admin'));
    await setDoc(doc(db, 'users/super'), user('A', 'admin'));
    const sent = { kind: 'bug', message: 'Printer stopped', tenantId: 'A', shopName: 'Shop', name: 'staff', email: 'staff@x.com', role: 'staff', status: 'new', createdAt: ts(now - 1000) };
    await setDoc(doc(db, 'feedback/f1'), { ...sent, uid: 'staffA' });
    await setDoc(doc(db, 'feedback/f2'), { ...sent, uid: 'adminE', tenantId: 'E', role: 'admin' });
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

const note = (uid, extra = {}) => ({
  kind: 'idea', message: 'Add a note to each sale', tenantId: 'A', shopName: 'Shop', uid, name: 'Maria', email: 'm@x.com',
  role: 'staff', status: 'new', createdAt: serverTimestamp(), ...extra,
});
const send = (uid, extra) => addDoc(collection(as(uid), 'feedback'), note(uid, extra));

// ── Sending ────────────────────────────────────────────────────────────────
await t('staff sends an idea', 'allow', () => send('staffA'));
await t('admin sends a problem', 'allow', () => send('adminA', { kind: 'bug', role: 'admin' }));
await t('a view-only (expired) shop still sends', 'allow', () => send('adminE', { tenantId: 'E', role: 'admin' }));
await t('a switched-off account sends', 'deny', () => send('staffOff'));
await t('signed out sends', 'deny', () => addDoc(collection(anon(), 'feedback'), note('x')));
await t('sends for another shop', 'deny', () => send('staffA', { tenantId: 'E' }));
await t('sends as someone else', 'deny', () => addDoc(collection(as('staffA'), 'feedback'), note('adminA')));
await t('staff claims to be an admin', 'deny', () => send('staffA', { role: 'admin' }));
await t('an empty message', 'deny', () => send('staffA', { message: '' }));
await t('a message that is too long', 'deny', () => send('staffA', { message: 'x'.repeat(2001) }));
await t('another kind', 'deny', () => send('staffA', { kind: 'spam' }));
await t('already marked done', 'deny', () => send('staffA', { status: 'done' }));
await t('a made-up date', 'deny', () => send('staffA', { createdAt: ts(now - DAY) }));
await t('an extra field', 'deny', () => send('staffA', { priority: 'high' }));

// ── Screenshots and files ──────────────────────────────────────────────────
const file = (extra = {}) => ({ url: 'https://res.cloudinary.com/veduldxa/image/upload/v1/shot.jpg', name: 'shot.png', type: 'image/png', bytes: 250000, ...extra });
await t('a problem with two screenshots', 'allow', () => send('staffA', { kind: 'bug', attachments: [file(), file({ name: 'log.pdf', type: 'application/pdf' })] }));
await t('the local test placeholder', 'allow', () => send('staffA', { attachments: [file({ url: 'https://placehold.co/600x400/png?text=x' })] }));
await t('four files', 'deny', () => send('staffA', { attachments: [file(), file(), file(), file()] }));
await t('an empty list of files', 'deny', () => send('staffA', { attachments: [] }));
await t("another Cloudinary account's file", 'deny', () => send('staffA', { attachments: [file({ url: 'https://res.cloudinary.com/someone/raw/upload/page.html' })] }));
await t('a link to another website', 'deny', () => send('staffA', { attachments: [file({ url: 'https://evil.example/login' })] }));
await t('a third file that is a link elsewhere', 'deny', () => send('staffA', { attachments: [file(), file(), file({ url: 'http://res.cloudinary.com/x' })] }));
await t('a file over 10 MB', 'deny', () => send('staffA', { attachments: [file({ bytes: 10485761 })] }));
await t('a file with an extra field', 'deny', () => send('staffA', { attachments: [{ ...file(), owner: 'me' }] }));
await t('a file with no name', 'deny', () => send('staffA', { attachments: [file({ name: '' })] }));

// ── Reading ────────────────────────────────────────────────────────────────
await t('reads own message', 'allow', () => getDoc(doc(as('staffA'), 'feedback/f1')));
await t('lists own messages', 'allow', () => getDocs(query(collection(as('staffA'), 'feedback'), where('uid', '==', 'staffA'))));
await t("reads someone else's message", 'deny', () => getDoc(doc(as('adminA'), 'feedback/f1')));
await t('lists every message', 'deny', () => getDocs(collection(as('adminA'), 'feedback')));
await t('signed out reads', 'deny', () => getDoc(doc(anon(), 'feedback/f1')));
await t('Super Admin lists every message', 'allow', () => getDocs(collection(as('super'), 'feedback')));

// ── Handling ───────────────────────────────────────────────────────────────
await t('Super Admin marks it done', 'allow', () => updateDoc(doc(as('super'), 'feedback/f1'), { status: 'done' }));
await t('Super Admin changes the message', 'deny', () => updateDoc(doc(as('super'), 'feedback/f1'), { message: 'x' }));
await t('the sender marks it done', 'deny', () => updateDoc(doc(as('staffA'), 'feedback/f1'), { status: 'done' }));
await t('the sender deletes it', 'deny', () => deleteDoc(doc(as('staffA'), 'feedback/f1')));
await t('Super Admin deletes it', 'allow', () => deleteDoc(doc(as('super'), 'feedback/f1')));

await env.cleanup();
for (const [s, e, n] of results) console.log(`${s}  [${e.padEnd(5)}]  ${n}`);
const failed = results.filter(r => r[0] === 'FAIL').length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
