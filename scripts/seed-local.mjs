#!/usr/bin/env node
/**
 * Fills the LOCAL Firebase emulators with test data (never production).
 * Run by scripts/dev-local.mjs; safe to run again (it starts from empty).
 */
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8085';
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9099';
const PROJECT = 'demo-jpos';
if (!PROJECT.startsWith('demo-')) throw new Error('local seed only');

await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' });
await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });

initializeApp({ projectId: PROJECT });
const auth = getAuth();
const db = getFirestore();
const iso = new Date().toISOString();
const ENT = {
  starter: { plan: 'starter', staffLimit: 3, fullReports: false, pdfExport: false, trends: false, branding: false, discounts: false, voidSales: true, inventory: false, auditTrail: false, emailSummary: false, backup: false, imports: false, storageMB: 500 },
  business: { plan: 'business', staffLimit: 10, fullReports: true, pdfExport: true, trends: true, branding: true, discounts: true, voidSales: true, inventory: true, auditTrail: true, emailSummary: true, backup: true, imports: true, storageMB: 2048 },
  enterprise: { plan: 'enterprise', staffLimit: 100, fullReports: true, pdfExport: true, trends: true, branding: true, discounts: true, voidSales: true, inventory: true, auditTrail: true, emailSummary: true, backup: true, imports: true, storageMB: 10240 },
};
const qr = (text) => `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(text)}`;

await db.doc('platform/settings').set({
  plans: {
    starter: { name: 'Starter', price: 499, entitlements: ENT.starter },
    business: { name: 'Business', price: 999, entitlements: ENT.business },
    enterprise: { name: 'Enterprise', price: 1999, entitlements: ENT.enterprise },
  },
  trialDays: 7,
  paymentChannels: {
    gcash: { label: 'GCash', qrImageUrl: qr('JPOS LOCAL TEST GCASH'), accountName: 'JPOS (test)', accountHint: '0945•••4744', enabled: true, order: 1 },
    maya: { label: 'Maya', qrImageUrl: qr('JPOS LOCAL TEST MAYA'), accountName: 'JPOS (test)', accountHint: '0945•••4744', enabled: true, order: 2 },
  },
  messengerUrl: 'https://m.me/joshuapadilla895', contactPhone: '09454454744', lastAuditId: '',
});

// The platform owner: Super Admin + owner of a demo shop
const owner = await auth.createUser({ email: 'owner@jpos.test', password: 'owner123', displayName: 'Shop Owner (Super Admin)', emailVerified: true });
const staff = await auth.createUser({ email: 'staff@jpos.test', password: 'staff123', displayName: 'Maria Cashier', emailVerified: true });
await db.doc(`platformAdmins/${owner.uid}`).set({ name: 'JPOS owner', createdAt: Timestamp.now() });
await db.doc('tenants/demo').set({
  name: 'JPOS Coffee Shop (test)', slug: 'jpos-coffee', ownerUid: owner.uid, plan: 'enterprise', desiredPlan: 'enterprise',
  status: 'active', suspended: false, trialUsed: true, trialDays: 7, createdAt: Timestamp.now(), updatedAt: Timestamp.now(),
  currentPeriodEnd: Timestamp.fromDate(new Date('2099-12-31T00:00:00Z')), entitlements: ENT.enterprise,
  staffCount: 2, lastStaffChange: staff.uid, pendingRequestId: null,
});
await db.doc('slugs/jpos-coffee').set({ tenantId: 'demo' });
const person = (name, role, email) => ({ tenantId: 'demo', email, displayName: name, role, isActive: true, rfidTag: '', photoURL: '', createdAt: iso, updatedAt: iso });
await db.doc(`users/${owner.uid}`).set(person('Shop Owner', 'admin', 'owner@jpos.test'));
await db.doc(`users/${staff.uid}`).set(person('Maria Cashier', 'staff', 'staff@jpos.test'));
await db.doc('tenants/demo/categories/c1').set({ name: 'Coffee', color: '#6b3e1f', icon: 'coffee', createdAt: iso });
for (const [id, name, price] of [['p1', 'Americano', 100], ['p2', 'Latte', 120], ['p3', 'Spanish Latte', 140]]) {
  await db.doc(`tenants/demo/products/${id}`).set({ name, price, cost: 40, categoryId: 'c1', categoryName: 'Coffee', isAvailable: true, description: '', imageUrl: '', createdAt: iso, updatedAt: iso });
}

console.log(`
  LOCAL TEST DATA READY (fake, on this computer only)
  ----------------------------------------------------
  Super Admin + demo shop owner : owner@jpos.test / owner123
  Demo shop cashier             : staff@jpos.test / staff123
  Demo shop staff sign-in page  : /s/jpos-coffee
  New shop sign-up              : /subscribe
                                  Real addresses get a real email (if
                                  VITE_LOCAL_REAL_EMAIL=true in .env). Fake ones
                                  (like @shop.test): "Local test: open the email here"
`);
process.exit(0);
