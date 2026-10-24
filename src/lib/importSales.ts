import { format } from 'date-fns';
import {
  cellOf, fingerprint, guessDayOrder, hasAmbiguousDates, normalizeName, parseDate, parseNumber, parseTime,
  roundMoney2, textOf, withTime, type Columns, type DayOrder, type FieldDef, type Table,
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
  skipped: { line: number; reason: string }[];
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

interface Line { line: number; date: Date; item: OrderItem; amount: number; gross: number; discount: number; payment: string; cashier: string }

export function planSales(
  table: Table, cols: Columns,
  opts: { products: Pick<Product, 'id' | 'name'>[]; cashierName: string; dayOrder?: DayOrder; now?: Date },
): SalesPlan {
  const dateCells = table.rows.map(r => cellOf(r, cols, 'date'));
  const dayOrder = opts.dayOrder ?? guessDayOrder(dateCells);
  const plan: SalesPlan = { sales: [], skipped: [], otherPayments: {}, dayOrder, ambiguousDates: hasAmbiguousDates(dateCells) };
  const now = (opts.now ?? new Date()).getTime();
  const productId = new Map(opts.products.map(p => [normalizeName(p.name), p.id]));
  const groups = new Map<string, Line[]>();

  table.rows.forEach((r, i) => {
    const line = table.lines[i];
    if (VOIDED.test(textOf(cellOf(r, cols, 'status')))) return plan.skipped.push({ line, reason: 'voided or refunded' });
    const day = parseDate(cellOf(r, cols, 'date'), dayOrder);
    if (!day) return plan.skipped.push({ line, reason: 'date not readable' });
    const date = cols.time >= 0 ? withTime(day, parseTime(cellOf(r, cols, 'time'))) : day;
    if (date.getTime() > now + MAX_FUTURE_MS) return plan.skipped.push({ line, reason: 'date is in the future' });

    const qtyCell = cellOf(r, cols, 'quantity');
    const quantity = textOf(qtyCell) ? parseNumber(qtyCell) : 1;
    if (quantity == null || !(quantity > 0)) return plan.skipped.push({ line, reason: 'quantity must be above 0' });
    const price = parseNumber(cellOf(r, cols, 'price'));
    const total = parseNumber(cellOf(r, cols, 'total'));
    const amount = total ?? (price != null ? price * quantity : null);
    if (amount == null) return plan.skipped.push({ line, reason: 'no amount' });
    if (amount < 0 || (price != null && price < 0)) return plan.skipped.push({ line, reason: 'amount below ₱0 (a refund)' });

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
      line, date, item, amount: roundMoney2(amount), gross, discount,
      payment: textOf(cellOf(r, cols, 'payment')), cashier: textOf(cellOf(r, cols, 'cashier')).slice(0, 60),
    });
    groups.set(key, list);
  });

  // Rows without a receipt number: the same sale written twice gets its own id (#2)
  const repeats = new Map<string, number>();
  for (const [key, lines] of groups) {
    const date = new Date(Math.min(...lines.map(l => l.date.getTime())));
    const total = roundMoney2(lines.reduce((s, l) => s + l.amount, 0));
    if (!(total > 0)) {
      lines.forEach(l => plan.skipped.push({ line: l.line, reason: 'the sale adds up to ₱0' }));
      continue;
    }
    const receipt = key.startsWith('receipt:') ? key.slice(8) : '';
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
      discount: roundMoney2(lines.reduce((s, l) => s + l.discount, 0)),
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
