// Unit tests for reading import files: the header row, which column is which,
// and the numbers, dates and times people write. Run with: npm run test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  fingerprint, guessColumns, guessDayOrder, hasAmbiguousDates, parseDate, parseNumber, parseTime, tableFrom, withTime,
} from '@/lib/importTable';
import { PRODUCT_FIELDS } from '@/lib/importProducts';
import { SALE_FIELDS } from '@/lib/importSales';

test('the header row is found under a title, empty rows are left out, and rows keep their line numbers', () => {
  const t = tableFrom([
    ['My Store Price List', null, null],
    [null, null, null],
    ['Name', 'Price', null],
    ['Coke', 85, null],
    [null, '', null],
    ['  Sprite  ', '80', null],
  ]);
  assert.deepEqual(t.headers, ['Name', 'Price', 'Column 3']);
  assert.deepEqual(t.rows, [['Coke', 85, null], ['Sprite', '80', null]]);
  assert.deepEqual(t.lines, [4, 6]);
  assert.deepEqual(tableFrom([['just one'], ['x']]), { headers: [], rows: [], lines: [] });
});

test('columns are matched by their usual names, exact names first', () => {
  const products = guessColumns(['Product Code', 'Item Description', 'Selling Price (PHP)', 'Puhunan', 'Category', 'Stocks', 'UOM'], PRODUCT_FIELDS);
  assert.equal(products.sku, 0);
  assert.equal(products.name, 1);
  assert.equal(products.price, 2);
  assert.equal(products.cost, 3);
  assert.equal(products.category, 4);
  assert.equal(products.stock, 5);
  assert.equal(products.unit, 6);
  assert.equal(products.brand, -1);

  const sales = guessColumns(['Date/Time', 'Receipt No.', 'Item', 'Qty', 'Unit Price', 'Line Total', 'Mode of Payment', 'Cashier'], SALE_FIELDS);
  assert.deepEqual(
    [sales.date, sales.orderId, sales.product, sales.quantity, sales.price, sales.total, sales.payment, sales.cashier, sales.time],
    [0, 1, 2, 3, 4, 5, 6, 7, -1],
  );
});

test('numbers: pesos, commas, PHP and accounting brackets', () => {
  assert.equal(parseNumber('₱1,234.50'), 1234.5);
  assert.equal(parseNumber('PHP 85'), 85);
  assert.equal(parseNumber('P25'), 25);
  assert.equal(parseNumber('(25.00)'), -25);
  assert.equal(parseNumber(' 1.5 '), 1.5);
  assert.equal(parseNumber(12), 12);
  assert.equal(parseNumber('abc'), null);
  assert.equal(parseNumber(''), null);
  assert.equal(parseNumber(null), null);
});

test('which way dates are written: day first only when a first number is over 12', () => {
  assert.equal(guessDayOrder(['10/20/2026', '03/04/2026']), 'mdy');
  assert.equal(guessDayOrder(['03/04/2026', '20/10/2026']), 'dmy');
  assert.equal(hasAmbiguousDates(['03/04/2026']), true);
  assert.equal(hasAmbiguousDates(['10/20/2026', '05/05/2026']), false);
});

test('times: 24-hour, AM/PM, Excel fractions', () => {
  assert.deepEqual(parseTime('14:30'), { h: 14, m: 30, s: 0 });
  assert.deepEqual(parseTime('2:30 PM'), { h: 14, m: 30, s: 0 });
  assert.deepEqual(parseTime('12:05 a.m.'), { h: 0, m: 5, s: 0 });
  assert.deepEqual(parseTime('2PM'), { h: 14, m: 0, s: 0 });
  assert.deepEqual(parseTime('09:15:30'), { h: 9, m: 15, s: 30 });
  assert.deepEqual(parseTime(0.5), { h: 12, m: 0, s: 0 });
  assert.deepEqual(parseTime(new Date(1899, 11, 30, 9, 5)), { h: 9, m: 5, s: 0 });
  assert.equal(parseTime('25:00'), null);
  assert.equal(parseTime('14'), null);
  assert.equal(parseTime('13:00 PM'), null);
});

test('dates in this device time zone: ISO, month-first, day-first, Excel numbers, month names', () => {
  const same = (d: Date | null, y: number, mo: number, day: number, h = 0, mi = 0) =>
    assert.deepEqual(d && [d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes()], [y, mo, day, h, mi]);
  same(parseDate('2026-10-20'), 2026, 10, 20);
  same(parseDate('2026/10/20 14:30'), 2026, 10, 20, 14, 30);
  same(parseDate('10/20/2026 2:30 PM'), 2026, 10, 20, 14, 30);
  same(parseDate('20/10/2026', 'dmy'), 2026, 10, 20);
  same(parseDate('03/04/2026'), 2026, 3, 4);
  same(parseDate('03/04/2026', 'dmy'), 2026, 4, 3);
  same(parseDate('20/10/26', 'dmy'), 2026, 10, 20);
  same(parseDate('Oct 20, 2026'), 2026, 10, 20);
  same(parseDate('20 October 2026 2:30PM'), 2026, 10, 20, 14, 30);
  same(parseDate(46023), 2026, 1, 1);
  same(parseDate(46023.5), 2026, 1, 1, 12, 0);
  same(parseDate('46023'), 2026, 1, 1);
  same(parseDate(20261020), 2026, 10, 20);
  same(parseDate(new Date(2026, 9, 20, 9, 0)), 2026, 10, 20, 9, 0);
  assert.equal(parseDate('2026-10-20T06:30:00Z')!.toISOString(), '2026-10-20T06:30:00.000Z');
  assert.equal(parseDate('02/30/2026'), null);
  assert.equal(parseDate('13/13/2026'), null);
  assert.equal(parseDate('2026-10-20 25:00'), null);
  assert.equal(parseDate(85), null);
  assert.equal(parseDate('soon'), null);
  same(withTime(new Date(2026, 9, 20), parseTime('5:45 PM')), 2026, 10, 20, 17, 45);
});

test('fingerprints are steady and differ for different text', () => {
  assert.equal(fingerprint('receipt|OR-1'), fingerprint('receipt|OR-1'));
  assert.notEqual(fingerprint('receipt|OR-1'), fingerprint('receipt|OR-2'));
  assert.match(fingerprint('x'), /^[0-9a-f]{28}$/);
});
