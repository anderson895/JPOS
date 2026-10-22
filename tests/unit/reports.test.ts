// Unit tests for the Reports reconciliation helpers. Run with: npm run test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { paymentBreakdown, paymentRefLabel } from '@/lib/reports';
import type { Order } from '@/types';

type Row = Pick<Order, 'status' | 'paymentMethod' | 'total'>;
const o = (paymentMethod: Order['paymentMethod'], total: number, status: Order['status'] = 'completed'): Row =>
  ({ paymentMethod, total, status });

test('every method listed in a fixed order, zeros included', () => {
  assert.deepEqual(paymentBreakdown([]).map(r => [r.label, r.count, r.total]), [
    ['Cash', 0, 0], ['GCash', 0, 0], ['Maya', 0, 0], ['Card', 0, 0],
  ]);
});

test('counts and totals per method, completed orders only, rounded to centavos', () => {
  const rows = paymentBreakdown([
    o('cash', 100), o('cash', 0.1), o('cash', 0.2),
    o('gcash', 280), o('gcash', 155.5),
    o('maya', 90, 'pending'),
    o('card', 120),
  ]);
  assert.deepEqual(rows.map(r => [r.method, r.count, r.total]), [
    ['cash', 3, 100.3], ['gcash', 2, 435.5], ['maya', 0, 0], ['card', 1, 120],
  ]);
});

test('an unexpected method from old data gets its own row (money never disappears)', () => {
  const rows = paymentBreakdown([o('paypal' as Order['paymentMethod'], 50)]);
  assert.equal(rows.length, 5);
  assert.deepEqual(rows[4], { method: 'paypal', label: 'PAYPAL', count: 1, total: 50 });
});

test('Ref column: the reference, or a dash', () => {
  assert.equal(paymentRefLabel({ paymentReference: '1234567890123' }), '1234567890123');
  assert.equal(paymentRefLabel({}), '—');
  assert.equal(paymentRefLabel({ paymentReference: '' }), '—');
  assert.equal(paymentRefLabel({}, '-'), '-', 'PDF-safe dash');
});
