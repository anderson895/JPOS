#!/usr/bin/env node
/**
 * Loads a backup made by migrate-to-tenant.mjs (dry run) into the Firestore
 * EMULATOR, so the migration can be rehearsed on a copy of the real data.
 * Refuses to run against anything but the emulator.
 *
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8085 node scripts/load-backup-into-emulator.mjs backups/<file>.json --project demo-jpos
 */
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { readFileSync } from 'node:fs';

const file = process.argv[2];
const pi = process.argv.indexOf('--project');
const project = pi > 0 ? process.argv[pi + 1] : 'demo-jpos';
if (!process.env.FIRESTORE_EMULATOR_HOST) { console.error('ERROR: emulator only (set FIRESTORE_EMULATOR_HOST)'); process.exit(1); }
if (!file) { console.error('ERROR: pass the backup file'); process.exit(1); }

initializeApp({ projectId: project });
const db = getFirestore();
const revive = (v) => {
  if (v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 1 && '__ts' in v) return Timestamp.fromMillis(v.__ts);
  if (Array.isArray(v)) return v.map(revive);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, revive(x)]));
  return v;
};

const backup = JSON.parse(readFileSync(file, 'utf8'));
let n = 0;
for (const [key, value] of Object.entries(backup)) {
  if (key === 'project' || key === 'at') continue;
  if (Array.isArray(value)) {
    for (const d of value) { await db.doc(`${key}/${d.id}`).set(revive(d.data)); n++; }
  } else if (value) {
    await db.doc(key).set(revive(value)); n++;   // single docs, e.g. settings/payments
  }
}
console.log(`OK: loaded ${n} documents from ${file} into the emulator (${project})`);
