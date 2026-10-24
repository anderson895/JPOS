// Unit tests for Products → Import: which rows are added, updated or skipped,
// and the categories and units that come with them. Run with: npm run test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { guessColumns, tableFrom, type Cell } from '@/lib/importTable';
import { PRODUCT_FIELDS, PRODUCTS_MAX, planProducts } from '@/lib/importProducts';

const plan = (rows: Cell[][], existing = [{ id: 'p1', name: 'Coke 1.5L', sku: '' }, { id: 'p2', name: 'Bread', sku: '4800001' }]) => {
  const table = tableFrom(rows);
  return planProducts(table, guessColumns(table.headers, PRODUCT_FIELDS), existing, [{ id: 'c1', name: 'Drinks' }]);
};

test('new products are added, ones already in JPOS (same name or barcode) are updated', () => {
  const p = plan([
    ['Name', 'Price', 'Cost', 'Category', 'Stock', 'Barcode', 'Unit'],
    ['Sprite 1.5L', '₱80', '65', 'Drinks', '12', '', 'bottle'],
    ['coke 1.5l', 90, '', 'drinks', '', '', ''],
    ['Pandesal Special', 6, 3, 'Bread & Pastry', 100, '4800001', 'pcs'],
  ]);
  assert.deepEqual(p.add.map(r => r.name), ['Sprite 1.5L']);
  assert.deepEqual(p.add[0], { line: 2, name: 'Sprite 1.5L', price: 80, cost: 65, category: 'Drinks', stock: 12, unit: 'bottle' });
  assert.deepEqual(p.update.map(u => [u.id, u.row.name, u.row.price]), [['p1', 'coke 1.5l', 90], ['p2', 'Pandesal Special', 6]]);
  // An empty cost cell doesn't change the product's cost
  assert.equal('cost' in p.update[0].row, false);
  assert.equal(p.update[1].row.unit, 'pc');
  assert.deepEqual(p.newCategories, ['Bread & Pastry']);
  assert.equal(p.skipped.length, 0);
  assert.equal(p.has.stock, true);
  assert.equal(p.has.brand, false);
});

test('rows without a name or a price above ₱0, bad numbers, and repeats are skipped with the reason', () => {
  const p = plan([
    ['Name', 'Price', 'Cost', 'Stock'],
    ['', 10, '', ''],
    ['Candy', '', '', ''],
    ['Gum', 0, '', ''],
    ['Chips', 'free', '', ''],
    ['Juice', 30, '-5', ''],
    ['Water', 15, '', 'many'],
    ['Soap', 25, '', ''],
    ['soap', 26, '', ''],
  ]);
  assert.deepEqual(p.skipped, [
    { line: 2, reason: 'no name' },
    { line: 3, reason: 'no price' },
    { line: 4, reason: 'price must be above ₱0' },
    { line: 5, reason: 'no price' },
    { line: 6, reason: 'cost is not a number of ₱0 or more' },
    { line: 7, reason: 'stock is not a number' },
    { line: 9, reason: 'listed twice in the file' },
  ]);
  assert.deepEqual(p.add.map(r => r.name), ['Soap']);
});

test('units JPOS knows are read in common spellings; others stay by the piece and are counted', () => {
  const p = plan([
    ['Name', 'Price', 'Unit'],
    ['Rice', 50, 'Kilo'], ['Oil', 60, 'Liter'], ['Eggs', 8, 'tray'], ['Tissue', 20, 'tray'], ['Sugar', 45, 'KG'],
  ]);
  assert.deepEqual(p.add.map(r => r.unit), ['kg', 'L', '', '', 'kg']);
  assert.deepEqual(p.otherUnits, { tray: 2 });
});

test('the same name with two different barcodes: one updates the product, the other is new', () => {
  const p = plan([
    ['Name', 'Price', 'Barcode'],
    ['Coke 1.5L', 85, 'A1'],
    ['Coke 1.5L', 86, 'B2'],
  ]);
  assert.deepEqual(p.update.map(u => [u.id, u.row.sku]), [['p1', 'A1']]);
  assert.deepEqual(p.add.map(r => r.sku), ['B2']);
});

test('too many rows: split the file', () => {
  const rows: Cell[][] = [['Name', 'Price'], ...Array.from({ length: PRODUCTS_MAX + 1 }, (_, i) => [`P${i}`, 1])];
  assert.throws(() => plan(rows), /more than 5,000 rows/);
});
