// Unit tests for the money of a sale: discounts, Senior/PWD and VAT. Run with: npm run test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { amountOff, discountValueLabel, price, savedDiscountProblem, seniorProblem } from '@/lib/pricing';

const senior = { type: 'senior' as const, idNumber: 'OSCA-123', name: 'Lola Nena' };

test('no discounts, store not VAT-registered: total = subtotal, no VAT lines', () => {
  const r = price({ lines: [{ price: 100, quantity: 2 }, { price: 0.1, quantity: 3 }], vatRegistered: false });
  assert.equal(r.subtotal, 200.3);
  assert.equal(r.total, 200.3);
  assert.equal(r.discount, 0);
  assert.equal(r.vat, null);
});

test('VAT-registered: VATable sales and 12% VAT are inside the price', () => {
  const r = price({ lines: [{ price: 112, quantity: 1 }], vatRegistered: true });
  assert.equal(r.total, 112);
  assert.deepEqual(r.vat, { vatable: 100, vat: 12, exempt: 0 });
  const odd = price({ lines: [{ price: 100, quantity: 1 }], vatRegistered: true });
  assert.deepEqual(odd.vat, { vatable: 89.29, vat: 10.71, exempt: 0 });
  assert.equal(odd.vat!.vatable + odd.vat!.vat, odd.total);
});

test('Senior citizen in a VAT-registered store: VAT off, then 20% off', () => {
  // ₱112 → ₱100 without VAT → ₱20 off → ₱80
  const r = price({ lines: [{ price: 112, quantity: 1 }], senior, vatRegistered: true });
  assert.equal(r.lessVat, 12);
  assert.equal(r.seniorDiscount, 20);
  assert.equal(r.total, 80);
  assert.equal(r.discount, 20);
  assert.deepEqual(r.vat, { vatable: 0, vat: 0, exempt: 100 });
  assert.equal(r.subtotal - r.discount - r.lessVat, r.total);
});

test('Senior citizen with centavos: every step rounds to the centavo and adds up', () => {
  const r = price({ lines: [{ price: 145, quantity: 3 }], senior, vatRegistered: true });   // 435
  assert.equal(r.vat!.exempt, 388.39);
  assert.equal(r.lessVat, 46.61);
  assert.equal(r.seniorDiscount, 77.68);
  assert.equal(r.total, 310.71);
  assert.equal(Math.round((r.subtotal - r.discount - r.lessVat) * 100) / 100, r.total);
});

test('PWD in a store that is not VAT-registered: 20% off the price', () => {
  const r = price({ lines: [{ price: 250, quantity: 1 }], senior: { ...senior, type: 'pwd' }, vatRegistered: false });
  assert.equal(r.lessVat, 0);
  assert.equal(r.seniorDiscount, 50);
  assert.equal(r.total, 200);
  assert.equal(r.vat, null);
});

test('Senior/PWD replaces other discounts (no double discounts)', () => {
  const r = price({
    lines: [{ price: 112, quantity: 1, discount: { name: 'Promo', kind: 'percent', value: 50 } }],
    orderDiscount: { name: 'Employee', kind: 'fixed', value: 10 },
    senior, vatRegistered: true,
  });
  assert.equal(r.itemDiscounts, 0);
  assert.equal(r.orderDiscount, 0);
  assert.equal(r.total, 80);
});

test('item discount, then an order discount on what is left', () => {
  const r = price({
    lines: [
      { price: 100, quantity: 2, discount: { name: 'Promo', kind: 'percent', value: 10 } },   // 200 → 180
      { price: 50, quantity: 1, discount: { name: 'Less 5', kind: 'fixed', value: 5 } },       // 50 → 45
      { price: 30, quantity: 1 },                                                               // 30
    ],
    orderDiscount: { name: 'Employee 10%', kind: 'percent', value: 10 },                      // 255 → 25.50 off
    vatRegistered: false,
  });
  assert.deepEqual(r.lines.map(l => [l.gross, l.discount, l.net]), [[200, 20, 180], [50, 5, 45], [30, 0, 30]]);
  assert.equal(r.itemDiscounts, 25);
  assert.equal(r.orderDiscount, 25.5);
  assert.equal(r.discount, 50.5);
  assert.equal(r.total, 229.5);
});

test('a peso discount never goes below zero; a percent never above 100', () => {
  assert.equal(amountOff({ kind: 'fixed', value: 500 }, 120), 120);
  assert.equal(amountOff({ kind: 'percent', value: 150 }, 80), 80);
  assert.equal(amountOff({ kind: 'percent', value: -5 }, 80), 0);
  assert.equal(amountOff({ kind: 'fixed', value: NaN }, 80), 0);
  assert.equal(amountOff(null, 80), 0);
  const r = price({ lines: [{ price: 40, quantity: 1 }], orderDiscount: { name: 'X', kind: 'fixed', value: 100 }, vatRegistered: true });
  assert.equal(r.total, 0);
  assert.deepEqual(r.vat, { vatable: 0, vat: 0, exempt: 0 });
});

test('discount labels', () => {
  assert.equal(discountValueLabel({ kind: 'percent', value: 10 }), '10%');
  assert.equal(discountValueLabel({ kind: 'fixed', value: 50 }), '₱50');
  assert.equal(discountValueLabel({ kind: 'fixed', value: 1250.5 }), '₱1,250.5');
});

test('saved discount checks', () => {
  assert.equal(savedDiscountProblem({ name: 'Employee', kind: 'percent', value: 10 }), null);
  assert.match(savedDiscountProblem({ name: ' ', kind: 'percent', value: 10 })!, /name/);
  assert.match(savedDiscountProblem({ name: 'X', kind: 'percent', value: 120 })!, /100%/);
  assert.match(savedDiscountProblem({ name: 'X', kind: 'fixed', value: 0 })!, /above 0/);
});

test('Senior/PWD needs the ID number and name', () => {
  assert.equal(seniorProblem({ idNumber: '123', name: 'Lola' }), null);
  assert.match(seniorProblem({ idNumber: '', name: 'Lola' })!, /ID number/);
  assert.match(seniorProblem({ idNumber: '123', name: '' })!, /name/);
});
