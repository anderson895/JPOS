import { format } from 'date-fns';
import {
  bestSheet, cellOf, fingerprint, guessColumns, guessDayOrder, hasAmbiguousDates, normalizeName, parseDate, parseNumber,
  parseTime, roundMoney2, textOf, withTime, type Cell, type Columns, type DayOrder, type FieldDef, type Table,
} from '@/lib/importTable';
import type { OrderItem, PaymentMethod, Product } from '@/types';

/**
 * Transaction history → Import: past sales from another POS or a spreadsheet,
 * so reports and the dashboard include them. One row per item; rows with the
 * same receipt number are one sale (no receipt column: each row is a sale).
 * Imported sales are marked `imported`, recorded under the person who imports
 * them, and never change today's stock. Planning is pure
 * (tests/unit/importSales.test.ts); importSave.ts writes it.
 */
export const SALE_FIELDS: FieldDef[] = [
  { key: 'date', label: 'Date', required: true, names: ['date', 'transaction date', 'order date', 'sale date', 'sales date', 'date time', 'datetime', 'timestamp', 'created at', 'created', 'invoice date', 'petsa'] },
  { key: 'time', label: 'Time', names: ['time', 'transaction time', 'order time', 'sale time', 'oras'] },
  { key: 'orderId', label: 'Receipt number', names: ['transaction id', 'transaction no', 'transaction number', 'order id', 'order no', 'order number', 'receipt no', 'receipt number', 'receipt', 'invoice', 'invoice no', 'invoice number', 'or number', 'or no', 'txn id', 'sale id', 'ticket', 'ticket no'] },
  { key: 'product', label: 'Product', names: ['product', 'product name', 'item', 'item name', 'item description', 'menu item', 'description', 'produkto'] },
  { key: 'quantity', label: 'Quantity', names: ['qty', 'quantity', 'units', 'units sold', 'qty sold', 'quantity sold', 'pcs', 'dami'] },
  { key: 'price', label: 'Price', names: ['price', 'unit price', 'price per unit', 'selling price', 'srp', 'rate', 'presyo'] },
  { key: 'total', label: 'Amount', names: ['total', 'amount', 'line total', 'total amount', 'total price', 'total sales', 'sales', 'net sales', 'gross sales', 'revenue', 'net amount', 'subtotal', 'halaga'] },
  { key: 'payment', label: 'Payment', names: ['payment', 'payment method', 'payment type', 'payment mode', 'mode of payment', 'mop', 'tender', 'tender type', 'paid by', 'paid with'] },
  { key: 'cashier', label: 'Cashier', names: ['cashier', 'cashier name', 'staff', 'employee', 'served by', 'salesperson', 'sales person', 'crew', 'user'] },
  { key: 'status', label: 'Status', names: ['status', 'order status', 'transaction status', 'state'] },
];

const RECEIPT = SALE_FIELDS.find(f => f.key === 'orderId')!;

/**
 * Two sheets, one sale per row on the first and its items on the second
 * (joined by the receipt number), as many POS exports do. The sales sheet:
 */
export const SALE_MAIN_FIELDS: FieldDef[] = [
  SALE_FIELDS.find(f => f.key === 'date')!,
  SALE_FIELDS.find(f => f.key === 'time')!,
  { ...RECEIPT, required: true },
  { key: 'total', label: 'Sale total', names: ['total amount', 'total', 'amount', 'grand total', 'net total', 'net amount', 'amount due', 'total sales', 'amount paid'] },
  SALE_FIELDS.find(f => f.key === 'payment')!,
  SALE_FIELDS.find(f => f.key === 'cashier')!,
  SALE_FIELDS.find(f => f.key === 'status')!,
];

/** ...and the items sheet. */
export const SALE_ITEM_FIELDS: FieldDef[] = [
  { ...RECEIPT, required: true },
  { ...SALE_FIELDS.find(f => f.key === 'product')!, required: true },
  SALE_FIELDS.find(f => f.key === 'quantity')!,
  SALE_FIELDS.find(f => f.key === 'price')!,
  { key: 'total', label: 'Line amount', names: ['line total', 'total', 'amount', 'line amount', 'total price', 'subtotal', 'net amount'] },
  // Only for items whose sale isn't on the sales sheet
  { ...SALE_FIELDS.find(f => f.key === 'date')!, required: false },
];

/**
 * Which sheets to read: a sales sheet (receipt and date, no products) plus an
 * items sheet (receipt and product) when the file has both; otherwise the
 * sheet that fits sales best.
 */
export function pickSalesSheets(tables: Table[]): { main: number; items: number } {
  const cols = tables.map(t => guessColumns(t.headers, SALE_FIELDS));
  const items = cols.findIndex(c => c.orderId >= 0 && c.product >= 0);
  const main = cols.findIndex((c, i) => i !== items && c.orderId >= 0 && c.date >= 0 && c.product < 0);
  if (items >= 0 && main >= 0) return { main, items };
  return { main: bestSheet(tables, SALE_FIELDS), items: -1 };
}

const JOINED: Columns = { date: 0, time: 1, orderId: 2, product: 3, quantity: 4, price: 5, total: 6, payment: 7, cashier: 8, status: 9 };

/**
 * The two sheets as one list of item rows: each item gets its sale's date,
 * payment, cashier and status; a sale with no items becomes one row of its
 * total. `saleTotals`: what each receipt really came to (after its discount).
 */
export function joinSales(main: Table, mainCols: Columns, items: Table, itemCols: Columns):
  { table: Table; sheets: (string | undefined)[]; saleTotals: Map<string, number> } {
  const receiptOf = (r: Cell[], c: Columns) => textOf(cellOf(r, c, 'orderId')).slice(0, 64);
  const sale = new Map<string, Cell[]>();
  const saleTotals = new Map<string, number>();
  main.rows.forEach(r => {
    const receipt = receiptOf(r, mainCols);
    if (!receipt || sale.has(receipt)) return;
    sale.set(receipt, r);
    const total = parseNumber(cellOf(r, mainCols, 'total'));
    if (total != null) saleTotals.set(receipt, total);
  });
  const rows: Cell[][] = [];
  const lines: number[] = [];
  const sheets: (string | undefined)[] = [];
  const withItems = new Set<string>();
  items.rows.forEach((r, i) => {
    const receipt = receiptOf(r, itemCols);
    const m = sale.get(receipt);
    if (m) withItems.add(receipt);
    rows.push([
      m ? cellOf(m, mainCols, 'date') : cellOf(r, itemCols, 'date'), m ? cellOf(m, mainCols, 'time') : null, receipt,
      cellOf(r, itemCols, 'product'), cellOf(r, itemCols, 'quantity'), cellOf(r, itemCols, 'price'), cellOf(r, itemCols, 'total'),
      m ? cellOf(m, mainCols, 'payment') : null, m ? cellOf(m, mainCols, 'cashier') : null, m ? cellOf(m, mainCols, 'status') : null,
    ]);
    lines.push(items.lines[i]);
    sheets.push(items.name);
  });
  main.rows.forEach((r, i) => {
    const receipt = receiptOf(r, mainCols);
    if (receipt && withItems.has(receipt)) return;
    rows.push([
      cellOf(r, mainCols, 'date'), cellOf(r, mainCols, 'time'), receipt, null, null, null, cellOf(r, mainCols, 'total'),
      cellOf(r, mainCols, 'payment'), cellOf(r, mainCols, 'cashier'), cellOf(r, mainCols, 'status'),
    ]);
    lines.push(main.lines[i]);
    sheets.push(main.name);
  });
  return { table: { headers: Object.keys(JOINED), rows, lines }, sheets, saleTotals };
}

export const SALE_SAMPLE: (string | number)[][] = [
  ['Date', 'Time', 'Receipt No', 'Product', 'Qty', 'Price', 'Total', 'Payment', 'Cashier'],
  ['10/20/2026', '9:15 AM', 'OR-1001', 'Coke 1.5L', 2, 85, 170, 'Cash', 'Maria'],
  ['10/20/2026', '9:15 AM', 'OR-1001', 'Pandesal', 10, 5, 50, 'Cash', 'Maria'],
  ['10/20/2026', '2:40 PM', 'OR-1002', 'Rice (Dinorado)', 3, 62, 186, 'GCash', 'Juan'],
];

/** At most this many sales per file (more: split the file). */
export const SALES_MAX = 10000;

export interface SaleDraft {
  /** The sale's id in JPOS: the same rows always get the same id. */
  id: string;
  orderNumber: string;
  createdAt: string;
  items: OrderItem[];
  subtotal: number;
  discount: number;
  total: number;
  paymentMethod: PaymentMethod;
  cashierName: string;
  lines: number[];
}

export interface SalesPlan {
  sales: SaleDraft[];
  /** `sheet`: which sheet the row is on, when the file has more than one. */
  skipped: { line: number; reason: string; sheet?: string }[];
  /** Payment types JPOS doesn't have (saved as cash), and how many rows had each. */
  otherPayments: Record<string, number>;
  dayOrder: DayOrder;
  /** Some dates could be read either way (03/04/2026): the person picks. */
  ambiguousDates: boolean;
  first?: Date;
  last?: Date;
}

/** "GCash", "G-Cash", "PayMaya", "Credit Card", "Cash" → JPOS's payment types; '' → cash; null: not one of them. */
export function paymentFrom(text: string): PaymentMethod | null {
  const t = text.toLowerCase();
  if (!t.trim()) return 'cash';
  if (/g\s*-?\s*cash/.test(t)) return 'gcash';
  if (/maya/.test(t)) return 'maya';
  if (/card|credit|debit|visa|master|amex|jcb/.test(t)) return 'card';
  if (/cash|cod\b/.test(t)) return 'cash';
  return null;
}

const VOIDED = /void|cancel|refund|return|deleted/i;
const MAX_FUTURE_MS = 24 * 60 * 60 * 1000;

interface Line { line: number; sheet?: string; date: Date; item: OrderItem; amount: number; gross: number; discount: number; payment: string; cashier: string }

/**
 * `items`: a second sheet with each sale's items (see joinSales); then `table`
 * is the sales sheet, one sale per row.
 */
export function planSales(
  sheet: Table, sheetCols: Columns,
  opts: {
    products: Pick<Product, 'id' | 'name'>[]; cashierName: string; dayOrder?: DayOrder; now?: Date;
    items?: { table: Table; cols: Columns } | null;
  },
): SalesPlan {
  const joined = opts.items ? joinSales(sheet, sheetCols, opts.items.table, opts.items.cols) : null;
  const table = joined?.table ?? sheet;
  const cols = joined ? JOINED : sheetCols;
  const sheetOf = (i: number) => (joined ? joined.sheets[i] : sheet.name);
  const dateCells = table.rows.map(r => cellOf(r, cols, 'date'));
  const dayOrder = opts.dayOrder ?? guessDayOrder(dateCells);
  const plan: SalesPlan = { sales: [], skipped: [], otherPayments: {}, dayOrder, ambiguousDates: hasAmbiguousDates(dateCells) };
  const now = (opts.now ?? new Date()).getTime();
  const productId = new Map(opts.products.map(p => [normalizeName(p.name), p.id]));
  const groups = new Map<string, Line[]>();

  table.rows.forEach((r, i) => {
    const line = table.lines[i];
    const skip = (reason: string) => plan.skipped.push({ line, reason, ...(sheetOf(i) ? { sheet: sheetOf(i) } : {}) });
    if (VOIDED.test(textOf(cellOf(r, cols, 'status')))) return skip('voided or refunded');
    const day = parseDate(cellOf(r, cols, 'date'), dayOrder);
    if (!day) return skip('date not readable');
    const date = cols.time >= 0 ? withTime(day, parseTime(cellOf(r, cols, 'time'))) : day;
    if (date.getTime() > now + MAX_FUTURE_MS) return skip('date is in the future');

    const qtyCell = cellOf(r, cols, 'quantity');
    const quantity = textOf(qtyCell) ? parseNumber(qtyCell) : 1;
    if (quantity == null || !(quantity > 0)) return skip('quantity must be above 0');
    const price = parseNumber(cellOf(r, cols, 'price'));
    const total = parseNumber(cellOf(r, cols, 'total'));
    const amount = total ?? (price != null ? price * quantity : null);
    if (amount == null) return skip('no amount');
    if (amount < 0 || (price != null && price < 0)) return skip('amount below ₱0 (a refund)');

    // The price × quantity before any discount; a lower amount means the line had a discount
    const listed = price != null ? roundMoney2(price * quantity) : roundMoney2(amount);
    const gross = Math.max(listed, roundMoney2(amount));
    const unitPrice = gross === listed && price != null ? roundMoney2(price) : roundMoney2(gross / quantity);
    const discount = roundMoney2(gross - amount);
    const name = textOf(cellOf(r, cols, 'product')).slice(0, 100) || 'Sale';
    const item: OrderItem = {
      productId: productId.get(normalizeName(name)) ?? `imported:${normalizeName(name) || 'sale'}`,
      productName: name,
      price: unitPrice,
      quantity: roundMoney2(quantity),
      subtotal: gross,
      ...(discount > 0 ? { discount, discountName: 'Discount' } : {}),
    };
    const receipt = textOf(cellOf(r, cols, 'orderId')).slice(0, 64);
    const key = receipt ? `receipt:${receipt}` : `row:${i}`;
    const list = groups.get(key) ?? [];
    list.push({
      line, sheet: sheetOf(i), date, item, amount: roundMoney2(amount), gross, discount,
      payment: textOf(cellOf(r, cols, 'payment')), cashier: textOf(cellOf(r, cols, 'cashier')).slice(0, 60),
    });
    groups.set(key, list);
  });

  // Rows without a receipt number: the same sale written twice gets its own id (#2)
  const repeats = new Map<string, number>();
  for (const [key, lines] of groups) {
    const date = new Date(Math.min(...lines.map(l => l.date.getTime())));
    const receipt = key.startsWith('receipt:') ? key.slice(8) : '';
    const itemsTotal = roundMoney2(lines.reduce((s, l) => s + l.amount, 0));
    // The sales sheet's total wins when it's lower: the difference is the sale's own discount
    const saleTotal = receipt ? joined?.saleTotals.get(receipt) : undefined;
    const saleDiscount = saleTotal != null && saleTotal >= 0 && saleTotal < itemsTotal ? roundMoney2(itemsTotal - saleTotal) : 0;
    const total = roundMoney2(itemsTotal - saleDiscount);
    if (!(total > 0)) {
      lines.forEach(l => plan.skipped.push({ line: l.line, reason: 'the sale adds up to ₱0', ...(l.sheet ? { sheet: l.sheet } : {}) }));
      continue;
    }
    let signature = receipt ? `receipt|${receipt}` : `row|${date.toISOString()}|${lines.map(l => `${l.item.productName}|${l.item.quantity}|${l.amount}`).join(';')}`;
    if (!receipt) {
      const n = (repeats.get(signature) ?? 0) + 1;
      repeats.set(signature, n);
      if (n > 1) signature += `|#${n}`;
    }
    const hash = fingerprint(signature);
    const paymentText = lines.find(l => l.payment)?.payment ?? '';
    const method = paymentFrom(paymentText);
    if (!method) plan.otherPayments[paymentText] = (plan.otherPayments[paymentText] ?? 0) + 1;
    plan.sales.push({
      id: `imp-${hash}`,
      orderNumber: receipt || `IMP-${format(date, 'yyyyMMdd')}-${hash.slice(0, 6).toUpperCase()}`,
      createdAt: date.toISOString(),
      items: lines.map(l => l.item),
      subtotal: roundMoney2(lines.reduce((s, l) => s + l.gross, 0)),
      discount: roundMoney2(lines.reduce((s, l) => s + l.discount, 0) + saleDiscount),
      total,
      paymentMethod: method ?? 'cash',
      cashierName: lines.find(l => l.cashier)?.cashier || opts.cashierName,
      lines: lines.map(l => l.line),
    });
  }
  if (plan.sales.length > SALES_MAX) throw new Error(`This file has more than ${SALES_MAX.toLocaleString()} sales. Split it into smaller files.`);
  plan.sales.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  if (plan.sales.length) {
    plan.first = new Date(plan.sales[0].createdAt);
    plan.last = new Date(plan.sales[plan.sales.length - 1].createdAt);
  }
  return plan;
}
