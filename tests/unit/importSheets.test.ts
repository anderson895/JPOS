// Unit tests for Excel files with several sheets: picking the right sheet,
// sales on one sheet and their items on another, and the extra product
// columns (status, reorder level). Run with: npm run test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bestSheet, guessColumns, parseDate, parseTime, tableFrom, type Cell, type Table } from '@/lib/importTable';
import { PRODUCT_FIELDS, availableFrom, planProducts } from '@/lib/importProducts';
import { SALE_FIELDS, SALE_ITEM_FIELDS, SALE_MAIN_FIELDS, pickSalesSheets, planSales } from '@/lib/importSales';

const sheet = (name: string, rows: Cell[][]): Table => ({ ...tableFrom(rows), name });

const products = sheet('Products', [
  ['Product ID', 'Barcode', 'Product Name', 'Category', 'Unit', 'Cost Price', 'Selling Price', 'Opening Stock', 'Reorder Level', 'Status'],
  ['PRD-1', '480001', 'Coca-Cola 1.5L', 'Beverages', 'pcs', 54.02, 75, 60, 20, 'Active'],
  ['PRD-2', '480002', 'Old Candy', 'Snacks', 'pcs', 1, 2, 0, 5, 'Inactive'],
]);
const sales = sheet('Transactions', [
  ['Transaction ID', 'Date & Time', 'Cashier', 'Payment Method', 'Subtotal', 'Discount', 'Total Amount', 'Status'],
  ['TXN-1', '2026-10-19 14:26', 'CASHIER-01', 'Cash', 731, 36.55, 694.45, 'Completed'],
  ['TXN-2', '2026-10-20 09:00', 'CASHIER-02', 'GCash', 100, 0, 100, 'Completed'],
  ['TXN-3', '2026-10-20 10:00', 'CASHIER-01', 'Maya', 50, 0, 50, 'Voided'],
  ['TXN-4', '2026-10-21 11:00', 'CASHIER-01', 'Card', 80, 0, 80, 'Completed'],
]);
const items = sheet('Transaction Items', [
  ['Transaction ID', 'Date & Time', 'Product ID', 'Product Name', 'Category', 'Quantity', 'Unit Price', 'Line Total'],
  ['TXN-1', '2026-10-19 14:26', 'PRD-1', 'Coca-Cola 1.5L', 'Beverages', 5, 75, 375],
  ['TXN-1', '2026-10-19 14:26', 'PRD-9', 'Rice 5kg', 'Grocery', 1, 356, 356],
  ['TXN-2', '2026-10-20 09:00', 'PRD-1', 'Coca-Cola 1.5L', 'Beverages', 1, 100, 100],
  ['TXN-3', '2026-10-20 10:00', 'PRD-1', 'Coca-Cola 1.5L', 'Beverages', 1, 50, 50],
  ['TXN-9', '2026-10-22 08:00', 'PRD-1', 'Coca-Cola 1.5L', 'Beverages', 2, 75, 150],
]);
const summary = sheet('Summary', [['POS SAMPLE DATA SUMMARY', ''], ['Metric', 'Value'], ['Total Products', 2]]);
const book = [products, sales, items, summary];

test('each import finds its own sheet in a workbook', () => {
  assert.equal(book[bestSheet(book, PRODUCT_FIELDS)].name, 'Products');
  assert.deepEqual(pickSalesSheets(book), { main: 1, items: 2 });
  // Only a sheet of item rows: it is the sales sheet, each receipt one sale
  assert.deepEqual(pickSalesSheets([summary, items]), { main: 1, items: -1 });
});

test('a field takes its first usual name: Total Amount, not Subtotal; the longest name inside a column wins', () => {
  assert.equal(sales.headers[guessColumns(sales.headers, SALE_FIELDS).total], 'Total Amount');
  assert.equal(sales.headers[guessColumns(sales.headers, SALE_MAIN_FIELDS).total], 'Total Amount');
  const cols = guessColumns(['Item', 'Price', 'Minimum Stock Level', 'Stock Count'], PRODUCT_FIELDS);
  assert.deepEqual([cols.lowStock, cols.stock], [2, 3]);
});

test('Excel times a hair before the minute come out on the minute', () => {
  const d = parseDate(new Date(2026, 9, 14, 17, 32, 59, 999))!;
  assert.deepEqual([d.getHours(), d.getMinutes(), d.getSeconds()], [17, 33, 0]);
  assert.deepEqual(parseTime(new Date(1899, 11, 30, 9, 4, 59, 998)), { h: 9, m: 5, s: 0 });
});

test('products: status and reorder level are read; inactive products are kept but off sale', () => {
  const p = planProducts(products, guessColumns(products.headers, PRODUCT_FIELDS), [], []);
  assert.deepEqual(p.add.map(r => [r.name, r.price, r.cost, r.stock, r.lowStockAt, r.available, r.unit, r.sku]), [
    ['Coca-Cola 1.5L', 75, 54.02, 60, 20, true, 'pc', '480001'],
    ['Old Candy', 2, 1, 0, 5, false, 'pc', '480002'],
  ]);
  assert.equal(availableFrom('Discontinued'), false);
  assert.equal(availableFrom('Yes'), true);
  assert.equal(availableFrom(''), undefined);
});

test('sales on one sheet and their items on another: one sale per receipt, with its own discount', () => {
  const plan = planSales(sales, guessColumns(sales.headers, SALE_MAIN_FIELDS), {
    products: [{ id: 'p-coke', name: 'Coca-Cola 1.5L' }], cashierName: 'Owner', now: new Date(2026, 9, 25),
    items: { table: items, cols: guessColumns(items.headers, SALE_ITEM_FIELDS) },
  });
  const by = Object.fromEntries(plan.sales.map(s => [s.orderNumber, s]));
  // TXN-1: two items, the sales sheet's ₱36.55 discount, 2:26 PM, cash
  assert.deepEqual(
    [by['TXN-1'].items.length, by['TXN-1'].subtotal, by['TXN-1'].discount, by['TXN-1'].total, by['TXN-1'].paymentMethod, by['TXN-1'].cashierName],
    [2, 731, 36.55, 694.45, 'cash', 'CASHIER-01'],
  );
  assert.equal(new Date(by['TXN-1'].createdAt).getHours(), 14);
  assert.equal(by['TXN-1'].items[0].productId, 'p-coke');
  assert.equal(by['TXN-2'].paymentMethod, 'gcash');
  // TXN-4 has no items: one line of its total, still card
  assert.deepEqual([by['TXN-4'].items.length, by['TXN-4'].items[0].productName, by['TXN-4'].total, by['TXN-4'].paymentMethod], [1, 'Sale', 80, 'card']);
  // TXN-9 is only on the items sheet: kept, with its own date
  assert.equal(by['TXN-9'].total, 150);
  // TXN-3 was voided on the sales sheet: its item is skipped, and the row says which sheet
  assert.equal(by['TXN-3'], undefined);
  assert.deepEqual(plan.skipped, [{ line: 5, reason: 'voided or refunded', sheet: 'Transaction Items' }]);
  assert.equal(plan.sales.length, 4);
});
