// Unit tests for the store-QR e-wallet helpers and order building.
// Run with: npm run test:unit
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_PAYMENT_SETTINGS, approvalCodeProblem, normalizeReference, paymentRefKey,
  paymentSettingsProblem, referenceProblem, walletReady, withPaymentDefaults,
} from '@/lib/eWallet';
import { buildOrder, type OrderSnapshot } from '@/lib/orders';
import type { PaymentSettings } from '@/types';

const QR = 'https://res.cloudinary.com/demo/image/upload/qr.png';
const wallet = (enabled: boolean, qrImageUrl = enabled ? QR : '') => ({ enabled, qrImageUrl, accountName: 'JPOS Coffee', accountHint: '0917•••1234' });

describe('reference numbers', () => {
  test('normalize: uppercase, separators dropped', () => {
    assert.equal(normalizeReference(' 1234 567-890 123 '), '1234567890123');
    assert.equal(normalizeReference('ab-12 cd.34'), 'AB12CD34');
  });

  test('valid GCash and Maya references', () => {
    assert.equal(referenceProblem('1234567890123', 'gcash'), null);
    assert.equal(referenceProblem('MAYA12AB', 'maya'), null);
  });

  test('missing, too short, too long, or not normalized → a hint', () => {
    assert.match(referenceProblem('', 'gcash')!, /Enter the GCash reference/);
    assert.match(referenceProblem('12345', 'gcash')!, /13 digits/);
    assert.match(referenceProblem('A'.repeat(31), 'maya')!, /6–30/);
    assert.ok(referenceProblem('abc123', 'gcash'), 'lowercase is rejected, so always normalize first');
  });

  test('card approval code is optional, ≤ 30 characters', () => {
    assert.equal(approvalCodeProblem(''), null);
    assert.equal(approvalCodeProblem('APPR12'), null);
    assert.ok(approvalCodeProblem('X'.repeat(31)));
  });

  test('claim key only for GCash/Maya with a reference', () => {
    assert.equal(paymentRefKey({ paymentMethod: 'gcash', paymentReference: 'REF1234567' }), 'gcash_REF1234567');
    assert.equal(paymentRefKey({ paymentMethod: 'maya', paymentReference: 'REF1234567' }), 'maya_REF1234567');
    assert.equal(paymentRefKey({ paymentMethod: 'card', paymentReference: 'APPR12' }), null);
    assert.equal(paymentRefKey({ paymentMethod: 'cash' }), null);
  });
});

describe('payment settings', () => {
  test('a missing doc means no e-wallets and card on (today\'s behaviour)', () => {
    assert.deepEqual(withPaymentDefaults(undefined), DEFAULT_PAYMENT_SETTINGS);
    assert.equal(walletReady(withPaymentDefaults(undefined), 'gcash'), false);
    assert.equal(withPaymentDefaults({}).card.enabled, true);
  });

  test('stored values survive; junk falls back to defaults', () => {
    const s = withPaymentDefaults({ gcash: wallet(true), maya: { enabled: 'yes' }, card: { enabled: false }, updatedBy: 'admin1' });
    assert.deepEqual(s.gcash, wallet(true));
    assert.equal(s.maya.enabled, false);
    assert.equal(s.card.enabled, false);
    assert.equal(s.updatedBy, 'admin1');
  });

  test('a wallet is ready only when on AND it has a QR', () => {
    const s: PaymentSettings = { gcash: wallet(true), maya: { ...wallet(false), enabled: true }, card: { enabled: true } };
    assert.equal(walletReady(s, 'gcash'), true);
    assert.equal(walletReady(s, 'maya'), false);
  });

  test('settings validation mirrors the rules', () => {
    assert.equal(paymentSettingsProblem({ gcash: wallet(true), maya: wallet(false) }), null);
    assert.match(paymentSettingsProblem({ gcash: { ...wallet(false), enabled: true }, maya: wallet(false) })!, /Upload the GCash QR/);
    assert.match(paymentSettingsProblem({ gcash: wallet(true, 'http://x.com/qr.png'), maya: wallet(false) })!, /https/);
    assert.match(paymentSettingsProblem({ gcash: wallet(true), maya: { ...wallet(false), accountName: 'x'.repeat(61) } })!, /60 characters/);
    assert.match(paymentSettingsProblem({ gcash: { ...wallet(true), accountHint: 'x'.repeat(31) }, maya: wallet(false) })!, /30 characters/);
  });
});

describe('buildOrder with a manual payment', () => {
  const snapshot = (paymentMethod: OrderSnapshot['paymentMethod']): OrderSnapshot => ({
    items: [{ productId: 'p1', productName: 'Latte', price: 140, quantity: 2 }],
    subtotal: 280, discountAmount: 0, discountType: 'percent', total: 280,
    paymentMethod, amountTendered: 280, change: 0,
    cashierId: 'staff1', cashierName: 'Juan',
  });

  test('GCash: reference + manual verification by the cashier (what the rules require)', () => {
    const o = buildOrder(snapshot('gcash'), 'ORD-1', { verification: 'manual', reference: '1234567890123', verifiedBy: 'staff1' });
    assert.equal(o.paymentReference, '1234567890123');
    assert.equal(o.paymentVerification, 'manual');
    assert.equal(o.verifiedBy, 'staff1');
    assert.equal(o.total, 280);
    assert.equal(o.items[0].subtotal, 280);
  });

  test('card with an approval code: reference only, no verification fields', () => {
    const o = buildOrder(snapshot('card'), 'ORD-2', { verification: 'manual', reference: 'APPR12', verifiedBy: 'staff1' });
    assert.equal(o.paymentReference, 'APPR12');
    assert.ok(!('paymentVerification' in o) && !('verifiedBy' in o));
  });

  test('card without a code: no reference field at all (Firestore rejects undefined)', () => {
    const o = buildOrder(snapshot('card'), 'ORD-3', { verification: 'manual', reference: '', verifiedBy: 'staff1' });
    assert.ok(!('paymentReference' in o));
    assert.ok(!Object.values(o).some(v => v === undefined));
  });

  test('cash: unchanged', () => {
    const o = buildOrder(snapshot('cash'), 'ORD-4');
    assert.ok(!('paymentReference' in o) && !('paymentVerification' in o));
  });
});
