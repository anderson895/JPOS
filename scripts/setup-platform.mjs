#!/usr/bin/env node
/**
 * One-time setup for going live with subscriptions (run on YOUR computer; never commit the key).
 *
 *   PowerShell:
 *     $env:GOOGLE_APPLICATION_CREDENTIALS="D:\Downloads\<your-service-account>.json"
 *     node scripts/setup-platform.mjs --project jpos-f801b            # dry run: shows what it would do
 *     node scripts/setup-platform.mjs --project jpos-f801b --apply    # writes
 *
 * What it writes (only what's missing; it never overwrites):
 *   - platform/settings: packages and prices, 7-day trial, Messenger link and phone.
 *     No payment QR yet: upload yours in Super Admin → Settings.
 *   - platformAdmins/{owner}: makes the owner of the main shop the Super Admin.
 * It also checks the main shop (tenants/main) is ready: active, Enterprise, never ends.
 */
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';

const args = process.argv.slice(2);
const arg = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const PROJECT = arg('--project');
const APPLY = args.includes('--apply');
const SHOP = arg('--shop') ?? 'main';
const die = (msg) => { console.error(`\n${msg}\n`); process.exit(1); };

if (!PROJECT) die('Add --project <your Firebase project id>, e.g. --project jpos-f801b');
if (process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST) die('Emulator settings are set in this terminal. Open a new one.');
if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) die('Set GOOGLE_APPLICATION_CREDENTIALS to your service-account key file (kept OUTSIDE the repo).');

initializeApp({ projectId: PROJECT, credential: applicationDefault() });
const db = getFirestore();
const auth = getAuth();

const ENT = {
  starter: { plan: 'starter', staffLimit: 3, rfid: false, fullReports: false, pdfExport: false, trends: false },
  business: { plan: 'business', staffLimit: 10, rfid: true, fullReports: true, pdfExport: true, trends: true },
  enterprise: { plan: 'enterprise', staffLimit: null, rfid: true, fullReports: true, pdfExport: true, trends: true },
};
const SETTINGS = {
  plans: {
    starter: { name: 'Starter', price: 499, entitlements: ENT.starter },
    business: { name: 'Business', price: 999, entitlements: ENT.business },
    enterprise: { name: 'Enterprise', price: 1999, entitlements: ENT.enterprise },
  },
  trialDays: 7,
  paymentChannels: {},
  messengerUrl: 'https://m.me/joshuapadilla895',
  contactPhone: '09454454744',
  lastAuditId: '',
};

console.log(`\nProject: ${PROJECT}   Mode: ${APPLY ? 'APPLY (writes)' : 'DRY RUN (no changes)'}\n`);
const plan = [];

// 1. Platform settings
const settingsRef = db.doc('platform/settings');
const settings = await settingsRef.get();
if (settings.exists) console.log('platform/settings: already there (left as is).');
else { console.log('platform/settings: missing -> will create Starter 499 / Business 999 / Enterprise 1,999, 7-day trial.'); plan.push(() => settingsRef.set({ ...SETTINGS, updatedAt: FieldValue.serverTimestamp(), updatedBy: 'setup-script' })); }

// 2. The main shop and its owner
const shopRef = db.doc(`tenants/${SHOP}`);
const shop = await shopRef.get();
if (!shop.exists) die(`tenants/${SHOP} not found. Run the multi-store migration first.`);
const t = shop.data();
const owner = await auth.getUser(t.ownerUid).catch(() => null);
if (!owner) die(`The owner of tenants/${SHOP} (uid ${t.ownerUid}) has no login.`);
console.log(`Main shop: "${t.name}" (/s/${t.slug}), owner ${owner.email}`);
const end = t.currentPeriodEnd instanceof Timestamp ? t.currentPeriodEnd.toDate() : null;
const ok = t.status === 'active' && t.plan === 'enterprise' && t.suspended === false && end && end.getFullYear() >= 2099;
console.log(`  status ${t.status}, package ${t.plan}, ends ${end?.toISOString().slice(0, 10) ?? '?'}, accounts ${t.staffCount}: ${ok ? 'ready' : 'NOT READY'}`);
if (!ok) die('The main shop must be active Enterprise until 2099. Fix it in the Firebase console, then run this again.');

// 3. Super Admin
const adminRef = db.doc(`platformAdmins/${t.ownerUid}`);
if ((await adminRef.get()).exists) console.log(`Super Admin: ${owner.email} already is one.`);
else { console.log(`Super Admin: will make ${owner.email} the Super Admin.`); plan.push(() => adminRef.set({ name: owner.displayName || owner.email, createdAt: FieldValue.serverTimestamp() })); }

if (!plan.length) { console.log('\nNothing to do. All set.\n'); process.exit(0); }
if (!APPLY) { console.log(`\nDry run: ${plan.length} change(s) above. Run again with --apply to write them.\n`); process.exit(0); }
for (const step of plan) await step();
console.log(`\nDone: ${plan.length} change(s) written.\n`);
process.exit(0);
