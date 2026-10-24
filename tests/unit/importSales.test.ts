// Unit tests for Transaction History → Import: rows become sales (grouped by
// receipt number), with the right amounts, dates, payment and steady ids.
// Run with: npm run test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { guessColumns, tableFrom, type Cell } from '@/lib/importTable';
import { SALE_FIELDS, paymentFrom, planSales } from '@/lib/importSales';

const NOW = new Date(2026, 9, 25, 12, 0);
const plan = (rows: Cell[][], extra: { dayOrder?: 'mdy' | 'dmy' } = {}) => {
  const table = tableFrom(rows);
  return planSales(table, guessColumns(table.headers, SALE_FIELDS), {
    products: [{ id: 'p-coke', name: 'Coke 1.5L' }], cashierName: 'Owner', now: NOW, ...extra,
  });
};

test('rows with the same receipt number are one sale; the earliest time is the sale time', () => {
  const p = plan([
    ['Date', 'Time', 'Receipt No', 'Product', 'Qty', 'Price', 'Total', 'Payment', 'Cashier'],
    ['10/20/2026', '9:15 AM', 'OR-1001', 'Coke 1.5L', 2, 85, 170, 'Cash', 'Maria'],
    ['10/20/2026', '9:14 AM', 'OR-1001', 'Pandesal', 10, 5, 50, '', ''],
    ['10/20/2026', '2:40 PM', 'OR-1002', 'Rice', 3, 62, 186, 'G-Cash', 'Juan'],
  ]);
  assert.equal(p.sales.length, 2);
  const [a, b] = p.sales;
  assert.equal(a.orderNumber, 'OR-1001');
  assert.equal(a.createdAt, new Date(2026, 9, 20, 9, 14).toISOString());
  assert.equal(a.total, 220);
  assert.equal(a.paymentMethod, 'cash');
  assert.equal(a.cashierName, 'Maria');
  assert.deepEqual(a.items.map(i => [i.productId, i.productName, i.quantity, i.price, i.subtotal]), [
    ['p-coke', 'Coke 1.5L', 2, 85, 170],
    ['imported:pandesal', 'Pandesal', 10, 5, 50],
  ]);
  assert.equal(b.paymentMethod, 'gcash');
  assert.deepEqual(a.lines, [2, 3]);
  assert.equal(a.id, plan([
    ['Date', 'Receipt No', 'Total'], ['10/20/2026', 'OR-1001', 1],
  ]).sales[0].id, 'the id comes from the receipt number, so a second import finds it');
});

test('no receipt column: each row is a sale with its own steady number; the same row twice stays two sales', () => {
  const rows: Cell[][] = [
    ['Date', 'Item', 'Amount'],
    ['2026-10-21 10:00', 'Coffee', 120],
    ['2026-10-21 10:00', 'Coffee', 120],
    ['2026-10-22 08:30', 'Tea', 90],
  ];
  const p = plan(rows);
  assert.equal(p.sales.length, 3);
  assert.match(p.sales[0].orderNumber, /^IMP-20261021-[0-9A-F]{6}$/);
  assert.notEqual(p.sales[0].id, p.sales[1].id);
  assert.deepEqual(plan(rows).sales.map(s => s.id), p.sales.map(s => s.id));
  assert.equal(p.sales[0].cashierName, 'Owner');
  assert.equal(p.first!.getDate(), 21);
  assert.equal(p.last!.getDate(), 22);
});

test('a lower amount than price × qty is a discount; a higher one is the price', () => {
  const p = plan([
    ['Date', 'Receipt', 'Product', 'Qty', 'Price', 'Total'],
    ['10/20/2026', 'A', 'Shirt', 2, 100, 180],
    ['10/20/2026', 'B', 'Meal', 1, 100, 110],
    ['10/20/2026', 'C', 'Rice', 1.5, 62, ''],
  ]);
  const [a, b, c] = p.sales;
  assert.deepEqual([a.subtotal, a.discount, a.total, a.items[0].discount], [200, 20, 180, 20]);
  assert.deepEqual([b.subtotal, b.discount, b.total, b.items[0].price], [110, 0, 110, 110]);
  assert.deepEqual([c.total, c.items[0].quantity], [93, 1.5]);
});

test('payment types: GCash, Maya, cards and cash; others are saved as cash and counted', () => {
  assert.equal(paymentFrom('G-Cash'), 'gcash');
  assert.equal(paymentFrom('PayMaya'), 'maya');
  assert.equal(paymentFrom('Credit Card'), 'card');
  assert.equal(paymentFrom('VISA'), 'card');
  assert.equal(paymentFrom(''), 'cash');
  assert.equal(paymentFrom('Bank transfer'), null);
  const p = plan([
    ['Date', 'Total', 'Payment'],
    ['10/20/2026', 100, 'Bank transfer'], ['10/20/2026', 50, 'Bank transfer'], ['10/20/2026', 70, 'Cheque'],
  ]);
  assert.deepEqual(p.sales.map(s => s.paymentMethod), ['cash', 'cash', 'cash']);
  assert.deepEqual(p.otherPayments, { 'Bank transfer': 2, Cheque: 1 });
});

test('voided, refunded, future, unreadable, zero and negative rows are skipped with the reason', () => {
  const p = plan([
    ['Date', 'Qty', 'Total', 'Status'],
    ['10/20/2026', 1, 100, 'Voided'],
    ['10/20/2026', 1, 100, 'Refunded'],
    ['12/25/2026', 1, 100, 'Paid'],
    ['someday', 1, 100, ''],
    ['10/20/2026', 0, 100, ''],
    ['10/20/2026', 1, -50, ''],
    ['10/20/2026', 1, '', ''],
    ['10/20/2026', 1, 0, ''],
    ['10/20/2026', 1, 100, 'Completed'],
  ]);
  assert.deepEqual(p.skipped, [
    { line: 2, reason: 'voided or refunded' },
    { line: 3, reason: 'voided or refunded' },
    { line: 4, reason: 'date is in the future' },
    { line: 5, reason: 'date not readable' },
    { line: 6, reason: 'quantity must be above 0' },
    { line: 7, reason: 'amount below ₱0 (a refund)' },
    { line: 8, reason: 'no amount' },
    { line: 9, reason: 'the sale adds up to ₱0' },
  ]);
  assert.equal(p.sales.length, 1);
});

test('dates written day first are found on their own; 03/04 alone could be either, so the person is asked', () => {
  const dayFirst = plan([['Date', 'Total'], ['20/10/2026', 10], ['03/04/2026', 10]]);
  assert.equal(dayFirst.dayOrder, 'dmy');
  assert.equal(new Date(dayFirst.sales[0].createdAt).getMonth(), 3);   // 3 April
  const unsure = plan([['Date', 'Total'], ['03/04/2026', 10]]);
  assert.equal(unsure.dayOrder, 'mdy');
  assert.equal(unsure.ambiguousDates, true);
  assert.equal(new Date(plan([['Date', 'Total'], ['03/04/2026', 10]], { dayOrder: 'dmy' }).sales[0].createdAt).getMonth(), 3);
});
