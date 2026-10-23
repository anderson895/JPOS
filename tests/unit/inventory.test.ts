// Unit tests for inventory (stock counts). Run with: npm run test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isLow, isOut, roomInStock, runningLow, stockLabel, stockLeft } from '@/lib/inventory';

test('a product that keeps no count: no stock, no limits', () => {
  assert.equal(stockLeft({ trackStock: false, stock: 3 }), null);
  assert.equal(stockLabel({}), '');
  assert.equal(roomInStock({}, 99), Infinity);
  assert.ok(!isOut({}) && !isLow({}));
});

test('stock left, low and out (default alert at 5)', () => {
  assert.equal(stockLabel({ trackStock: true, stock: 12 }), '12 left');
  assert.equal(stockLabel({ trackStock: true, stock: 5 }), 'Only 5 left');
  assert.equal(stockLabel({ trackStock: true, stock: 0 }), 'Out of stock');
  assert.equal(stockLabel({ trackStock: true, stock: -2 }), 'Out of stock');   // two counters sold the last one
  assert.equal(stockLabel({ trackStock: true, stock: 8, lowStockAt: 10 }), 'Only 8 left');
  assert.equal(stockLeft({ trackStock: true, stock: 2.7 }), 2);
});

test("the cart can't take more than what's left", () => {
  assert.equal(roomInStock({ trackStock: true, stock: 3 }, 1), 2);
  assert.equal(roomInStock({ trackStock: true, stock: 3 }, 3), 0);
  assert.equal(roomInStock({ trackStock: true, stock: 3 }, 5), 0);
});

test('running low: out first, then the fewest left; others left out', () => {
  const list = runningLow([
    { name: 'Water', trackStock: true, stock: 4 },
    { name: 'Bread', trackStock: true, stock: 0 },
    { name: 'Rice', trackStock: true, stock: 40 },
    { name: 'Eggs', trackStock: false, stock: 0 },
    { name: 'Milk', trackStock: true, stock: 1 },
  ]);
  assert.deepEqual(list.map(p => p.name), ['Bread', 'Milk', 'Water']);
});
