// Unit tests for product details (brand, size, barcode…). Run with: npm run test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findByCode, mainDetailFields, matchesSearch, productDetails } from '@/lib/productDetails';

test('details line: brand, size and color, skipping empty ones', () => {
  assert.equal(productDetails({ brand: 'Nestlé', size: '300 g', color: '' }), 'Nestlé · 300 g');
  assert.equal(productDetails({ brand: '  ', size: undefined, color: 'Red' }), 'Red');
  assert.equal(productDetails({}), '');
});

test('each kind of store has its own first details; no kind = none first', () => {
  assert.deepEqual(mainDetailFields('food'), ['size']);
  assert.deepEqual(mainDetailFields('clothing'), ['brand', 'size', 'color', 'sku']);
  assert.deepEqual(mainDetailFields(undefined), []);
});

test('a scanned code finds exactly one product (case and spaces ignored)', () => {
  const products = [{ id: 'a', sku: '4800016644283' }, { id: 'b', sku: 'abc-1' }, { id: 'c' }];
  assert.equal(findByCode(products, ' 4800016644283 ')?.id, 'a');
  assert.equal(findByCode(products, 'ABC-1')?.id, 'b');
  assert.equal(findByCode(products, '480001664428'), null);   // a partial code is not a match
  assert.equal(findByCode(products, ''), null);
});

test('two products with the same code: no guessing', () => {
  assert.equal(findByCode([{ sku: 'X1' }, { sku: 'x1' }], 'X1'), null);
});

test('search looks at name, brand, size, color and code', () => {
  const p = { name: 'Evaporated milk', brand: 'Alaska', size: '370 mL', color: '', sku: '4800' };
  assert.ok(matchesSearch(p, 'alaska'));
  assert.ok(matchesSearch(p, '370'));
  assert.ok(matchesSearch(p, 'MILK'));
  assert.ok(matchesSearch(p, ''));
  assert.ok(!matchesSearch(p, 'bear brand'));
});
