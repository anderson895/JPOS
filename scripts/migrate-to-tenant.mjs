#!/usr/bin/env node
/**
 * One-time migration: the current single store becomes tenant #1 (multi-store, Phase 1).
 * Runbook: docs/backend/CUTOVER.md. Run it on YOUR computer; never commit the key.
 *
 *   Rehearsal (emulator):  FIRESTORE_EMULATOR_HOST=127.0.0.1:8085 node scripts/migrate-to-tenant.mjs --project demo-jpos ...
 *   Production:            GOOGLE_APPLICATION_CREDENTIALS=C:\keys\jpos-sa.json node scripts/migrate-to-tenant.mjs --project jpos-f801b ... --yes-production
 *
 * Options:
 *   --project <id>        Firebase project id (required)
 *   --tenant <id>         shop id to create/use (default: main)
 *   --slug <slug>         terminal link, e.g. kape-ni-juan → /s/kape-ni-juan (required)
 *   --name "<shop name>"  shop name (required)
 *   --owner <uid>         the shop owner's user id (an existing admin) (required)
 *   --apply               write. Without it: DRY RUN (reads + backup + plan only)
 *   --verify              compare old vs new (counts + checksums), no writes
 *   --yes-production      required to write when not on the emulator
 *
 * Safe to run more than once: a copy is written only when the target is missing or
 * different (so a second run after the app deploy picks up the orders made in
 * between). The old collections are never changed or deleted.
 */
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

// ── args ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback;
};
const PROJECT = opt('project');
const TENANT = opt('tenant', 'main');
const SLUG = (opt('slug') ?? '').toLowerCase();
const NAME = opt('name');
const OWNER = opt('owner');
const APPLY = flag('apply');
const VERIFY = flag('verify');
const EMULATOR = !!process.env.FIRESTORE_EMULATOR_HOST;

function die(msg) { console.error(`\nERROR: ${msg}\n`); process.exit(1); }
if (!PROJECT) die('--project is required (e.g. jpos-f801b, or demo-jpos on the emulator)');
if (!/^[a-zA-Z0-9_-]{1,40}$/.test(TENANT)) die('--tenant must be letters, digits, - or _');
if (!VERIFY) {
  if (!/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(SLUG)) die('--slug must be 3–40 lowercase letters, digits or dashes (e.g. kape-ni-juan)');
  if (!NAME || NAME.length > 60) die('--name is required (max 60 characters)');
  if (!OWNER) die('--owner <uid of the shop owner> is required');
}
if (APPLY && !EMULATOR && !flag('yes-production')) die('Writing to production needs --yes-production (rehearse on the emulator first: docs/backend/CUTOVER.md)');
if (!EMULATOR && !process.env.GOOGLE_APPLICATION_CREDENTIALS) die('Set GOOGLE_APPLICATION_CREDENTIALS to your service-account key file (kept OUTSIDE the repo)');

initializeApp({ projectId: PROJECT, ...(EMULATOR ? {} : { credential: applicationDefault() }) });
const db = getFirestore();

// The single-store collections that move under tenants/{TENANT}
const COLLECTIONS = ['products', 'categories', 'orders', 'rfidCards', 'paymentRefs'];
const SINGLE_DOCS = ['settings/payments'];
const ENTERPRISE = { plan: 'enterprise', staffLimit: null, rfid: true, fullReports: true, pdfExport: true, trends: true };

// Stable JSON for checksums/compare (Timestamps → millis, keys sorted)
function stable(v) {
  if (v instanceof Timestamp) return { __ts: v.toMillis() };
  if (Array.isArray(v)) return v.map(stable);
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map(k => [k, stable(v[k])]));
  return v;
}
const same = (a, b) => JSON.stringify(stable(a)) === JSON.stringify(stable(b));
const checksum = (docs) => createHash('sha256').update(JSON.stringify(docs.map(d => [d.id, stable(d.data)]).sort((x, y) => (x[0] < y[0] ? -1 : 1)))).digest('hex').slice(0, 16);

async function readAll(path) {
  const snap = await db.collection(path).get();
  return snap.docs.map(d => ({ id: d.id, data: d.data() }));
}
async function readDoc(path) {
  const snap = await db.doc(path).get();
  return snap.exists ? snap.data() : null;
}

// Batched writer (≤ 400 per commit)
let batch = db.batch(), pending = 0, written = 0;
async function put(ref, data, opts) {
  batch.set(ref, data, opts ?? {});
  pending++; written++;
  if (pending >= 400) { await batch.commit(); batch = db.batch(); pending = 0; }
}
async function flush() { if (pending) { await batch.commit(); batch = db.batch(); pending = 0; } }

// ── read everything (old layout) ────────────────────────────────────────
console.log(`\nProject ${PROJECT} ${EMULATOR ? '(EMULATOR)' : '(PRODUCTION)'} · tenant "${TENANT}" · ${APPLY ? 'APPLY' : VERIFY ? 'VERIFY' : 'DRY RUN'}\n`);
const old = {};
for (const c of COLLECTIONS) old[c] = await readAll(c);
for (const d of SINGLE_DOCS) old[d] = await readDoc(d);
const users = await readAll('users');

if (VERIFY) {
  let bad = 0;
  console.log('collection      old   new   old-sum           new-sum           ok');
  for (const c of COLLECTIONS) {
    const now = await readAll(`tenants/${TENANT}/${c}`);
    // new may have MORE (sales made after the switch); every old doc must match
    const byId = new Map(now.map(d => [d.id, d.data]));
    const missing = old[c].filter(d => !byId.has(d.id) || !same(d.data, byId.get(d.id))).length;
    const ok = missing === 0;
    if (!ok) bad++;
    console.log(`${c.padEnd(14)} ${String(old[c].length).padStart(5)} ${String(now.length).padStart(5)}   ${checksum(old[c])}  ${checksum(now)}  ${ok ? 'yes' : `NO (${missing} missing/different)`}`);
  }
  for (const d of SINGLE_DOCS) {
    const now = await readDoc(`tenants/${TENANT}/${d}`);
    const ok = !old[d] || same(old[d], now);
    if (!ok) bad++;
    console.log(`${d.padEnd(14)} ${old[d] ? 1 : 0}     ${now ? 1 : 0}     ${ok ? 'yes' : 'NO'}`);
  }
  const unlinked = users.filter(u => u.data.tenantId !== TENANT);
  if (unlinked.length) { bad++; console.log(`users without tenantId "${TENANT}": ${unlinked.map(u => u.id).join(', ')}`); }
  else console.log(`users          all ${users.length} linked to "${TENANT}"`);
  console.log(bad ? `\nERROR: ${bad} problem(s)\n` : '\nOK: verified\n');
  process.exit(bad ? 1 : 0);
}

// ── checks ──────────────────────────────────────────────────────────────
const owner = users.find(u => u.id === OWNER);
if (!owner) die(`--owner ${OWNER} is not a user`);
if (owner.data.role !== 'admin') die(`--owner ${OWNER} is not an admin`);
const otherShop = users.filter(u => u.data.tenantId && u.data.tenantId !== TENANT);
if (otherShop.length) die(`these users already belong to another shop: ${otherShop.map(u => u.id).join(', ')}`);
const slugDoc = await readDoc(`slugs/${SLUG}`);
if (slugDoc && slugDoc.tenantId !== TENANT) die(`slug "${SLUG}" is taken by shop ${slugDoc.tenantId}`);

// ── backup (always) ─────────────────────────────────────────────────────
mkdirSync('backups', { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupFile = `backups/${PROJECT}-${stamp}.json`;
writeFileSync(backupFile, JSON.stringify({ project: PROJECT, at: new Date().toISOString(), users: users.map(u => ({ id: u.id, data: stable(u.data) })), ...Object.fromEntries(Object.entries(old).map(([k, v]) => [k, Array.isArray(v) ? v.map(d => ({ id: d.id, data: stable(d.data) })) : stable(v)])) }, null, 1));
console.log(`Backup written: ${backupFile} (gitignored; keep it safe, it has staff data)\n`);

// ── plan ────────────────────────────────────────────────────────────────
const plan = [];
for (const c of COLLECTIONS) {
  const target = new Map((await readAll(`tenants/${TENANT}/${c}`)).map(d => [d.id, d.data]));
  const todo = old[c].filter(d => !target.has(d.id) || !same(d.data, target.get(d.id)));
  plan.push([c, old[c].length, todo]);
}
const singleTodo = [];
for (const d of SINGLE_DOCS) {
  if (!old[d]) continue;
  const target = await readDoc(`tenants/${TENANT}/${d}`);
  if (!target || !same(old[d], target)) singleTodo.push(d);
}
const usersTodo = users.filter(u => u.data.tenantId !== TENANT);
const shop = await readDoc(`tenants/${TENANT}`);

console.log('collection      source  to copy');
for (const [c, n, todo] of plan) console.log(`${c.padEnd(14)} ${String(n).padStart(7)}  ${String(todo.length).padStart(7)}`);
for (const d of SINGLE_DOCS) console.log(`${d.padEnd(14)} ${old[d] ? '      1' : '      0'}  ${String(singleTodo.includes(d) ? 1 : 0).padStart(7)}`);
console.log(`users (link)   ${String(users.length).padStart(7)}  ${String(usersTodo.length).padStart(7)}`);
console.log(`shop doc       ${shop ? 'exists (staffCount refreshed)' : 'will be created'} · slug ${slugDoc ? 'exists' : `"${SLUG}" will be created`}`);
const writes = plan.reduce((n, [, , t]) => n + t.length, 0) + singleTodo.length + usersTodo.length + 2;
console.log(`\nWrites needed: ~${writes}${writes > 18000 ? '  (more than Spark allows per day: run again tomorrow; it resumes)' : ''}`);

if (!APPLY) { console.log('\nDRY RUN: nothing was written. Add --apply to migrate.\n'); process.exit(0); }

// ── apply ───────────────────────────────────────────────────────────────
const nowTs = Timestamp.now();
await put(db.doc(`tenants/${TENANT}`), shop ? { staffCount: users.length, updatedAt: nowTs } : {
  name: NAME, slug: SLUG, ownerUid: OWNER, plan: 'enterprise', desiredPlan: 'enterprise',
  status: 'active', suspended: false, trialUsed: true, trialDays: 7,
  createdAt: nowTs, updatedAt: nowTs,
  // The platform owner's own shop: paid far ahead
  currentPeriodEnd: Timestamp.fromDate(new Date('2099-12-31T23:59:59Z')),
  entitlements: ENTERPRISE, staffCount: users.length, lastStaffChange: '', pendingRequestId: null,
}, shop ? { merge: true } : undefined);
if (!slugDoc) await put(db.doc(`slugs/${SLUG}`), { tenantId: TENANT });
for (const [c, , todo] of plan) for (const d of todo) await put(db.doc(`tenants/${TENANT}/${c}/${d.id}`), d.data);
for (const d of singleTodo) await put(db.doc(`tenants/${TENANT}/${d}`), old[d]);
for (const u of usersTodo) await put(db.doc(`users/${u.id}`), { tenantId: TENANT }, { merge: true });
await flush();
console.log(`\nOK: ${written} writes done. Now run with --verify.\n`);
