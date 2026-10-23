// Unit tests for the order a sale saves: discounts, Senior/PWD and VAT. Run with: npm run test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildOrder, type OrderSnapshot } from '@/lib/orders';
import { price, type DiscountPick, type SeniorInfo } from '@/lib/pricing';
import type { CartItem } from '@/types';

const snap = (items: CartItem[], o: { orderDiscount?: DiscountPick | null; senior?: SeniorInfo | null; vat?: boolean } = {}): OrderSnapshot => {
  const pricing = price({ lines: items, orderDiscount: o.orderDiscount, senior: o.senior, vatRegistered: !!o.vat });
  return {
    items, pricing, orderDiscount: o.orderDiscount ?? null, senior: o.senior ?? null,
    paymentMethod: 'cash', amountTendered: pricing.total, change: 0, cashierId: 'staff1', cashierName: 'Juan',
  };
};
const latte: CartItem = { productId: 'p1', productName: 'Latte', price: 120, quantity: 1 };
const water: CartItem = { productId: 'p2', productName: 'Water', price: 20, quantity: 2, details: 'Wilkins · 500 mL', unit: 'bottle' };
const noUndefined = (o: object) => assert.ok(!JSON.stringify(o, (_k, v) => (v === undefined ? '__UNDEFINED__' : v)).includes('__UNDEFINED__'));

test('item discount and order discount are saved for the receipt', () => {
  const o = buildOrder(snap(
    [{ ...latte, discount: { name: 'Promo', kind: 'fixed', value: 20 } }, water],
    { orderDiscount: { name: 'Employee 10%', kind: 'percent', value: 10, savedId: 'd1' } },
  ), 'ORD-1');
  assert.equal(o.subtotal, 160);
  assert.deepEqual([o.items[0].discount, o.items[0].discountName], [20, 'Promo']);
  assert.ok(!('discount' in o.items[1]));
  assert.deepEqual(o.discounts, [{ name: 'Employee 10%', amount: 14 }]);
  assert.equal(o.discount, 34);
  assert.equal(o.total, 126);
  assert.equal(o.discountType, 'percent');
  assert.equal(o.tax, 0);
  assert.ok(!('vat' in o) && !('senior' in o) && !('lessVat' in o));
  assert.deepEqual([o.items[1].details, o.items[1].unit], ['Wilkins · 500 mL', 'bottle']);
  noUndefined(o);
});

test('Senior citizen in a VAT-registered store: VAT-exempt, ID on the order', () => {
  const o = buildOrder(snap([{ ...latte, price: 112 }], { senior: { type: 'senior', idNumber: ' OSCA-1 ', name: ' Lola ' }, vat: true }), 'ORD-2');
  assert.equal(o.lessVat, 12);
  assert.deepEqual(o.discounts, [{ name: 'Senior citizen 20%', amount: 20 }]);
  assert.equal(o.total, 80);
  assert.equal(o.tax, 0);
  assert.deepEqual(o.vat, { vatable: 0, vat: 0, exempt: 100 });
  assert.deepEqual(o.senior, { type: 'senior', idNumber: 'OSCA-1', name: 'Lola' });
  assert.equal(o.subtotal - o.discount - (o.lessVat ?? 0), o.total);
  noUndefined(o);
});

test('PWD label', () => {
  const o = buildOrder(snap([latte], { senior: { type: 'pwd', idNumber: 'PWD-9', name: 'Ana' } }), 'ORD-3');
  assert.deepEqual(o.discounts, [{ name: 'PWD 20%', amount: 24 }]);
  assert.equal(o.total, 96);
});

test('VAT-registered, no discount: the VAT is on the order (tax) and in the breakdown', () => {
  const o = buildOrder(snap([{ ...latte, price: 112 }], { vat: true }), 'ORD-4');
  assert.equal(o.tax, 12);
  assert.deepEqual(o.vat, { vatable: 100, vat: 12, exempt: 0 });
  assert.ok(!('discounts' in o));
  noUndefined(o);
});
