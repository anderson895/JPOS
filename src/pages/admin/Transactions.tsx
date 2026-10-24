import { useEffect, useRef, useState } from 'react';
import {
  getDocs, limit, orderBy, query, startAfter, where, type QueryConstraint, type QueryDocumentSnapshot,
} from 'firebase/firestore';
import {
  endOfDay, endOfMonth, endOfWeek, format, startOfDay, startOfMonth, startOfWeek, subDays,
} from 'date-fns';
import { Ban, FileSpreadsheet, Loader2, Lock, Receipt as ReceiptText, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '@/contexts/AuthContext';
import PageHeader from '@/components/shared/PageHeader';
import ReceiptModal from '@/components/pos/ReceiptModal';
import VoidOrderModal from '@/components/admin/VoidOrderModal';
import ImportModal, { type ImportSetup } from '@/components/admin/ImportModal';
import { tenantCol } from '@/lib/tenant';
import { BUSINESS_UP, hasAccess, hasFeature } from '@/lib/entitlements';
import { logActivity } from '@/lib/activity';
import { SALE_FIELDS, SALE_ITEM_FIELDS, SALE_MAIN_FIELDS, SALE_SAMPLE, pickSalesSheets, planSales, type SalesPlan } from '@/lib/importSales';
import { applySales } from '@/lib/importSave';
import type { DayOrder } from '@/lib/importTable';
import { cn, formatCurrency, formatDateTime } from '@/lib/utils';
import type { Order, PaymentMethod, Product } from '@/types';

type Range = 'today' | 'week' | 'month' | 'all' | 'custom';
// `short`: the label on phones, so all five fit
const RANGES: { id: Range; label: string; short: string }[] = [
  { id: 'today', label: 'Today', short: 'Today' }, { id: 'week', label: 'This week', short: 'Week' },
  { id: 'month', label: 'This month', short: 'Month' }, { id: 'all', label: 'All', short: 'All' },
  { id: 'custom', label: 'Pick dates', short: 'Dates' },
];
const METHODS: { id: PaymentMethod; label: string }[] = [
  { id: 'cash', label: 'Cash' }, { id: 'card', label: 'Card' }, { id: 'gcash', label: 'GCash' }, { id: 'maya', label: 'Maya' },
];
const PAGE = 50;

const itemsLine = (o: Order) => o.items.map(i => `${i.quantity}× ${i.productName}`).join(', ');

/**
 * Admin → Transaction History: every sale, newest first, 50 at a time, with
 * search and filters, the receipt, void, and importing past sales from a file
 * (Business and up).
 * Starter shows today and this week (like its reports); Business and up, every date.
 * Filters work on the sales loaded so far (no extra database indexes needed).
 */
export default function Transactions() {
  const { tenant, currentUser } = useAuth();
  const fullHistory = hasFeature(tenant, 'fullReports');
  const canVoid = hasFeature(tenant, 'voidSales');
  const canImport = hasFeature(tenant, 'imports');
  const locked = (r: Range) => !fullHistory && r !== 'today' && r !== 'week';

  const [range, setRange] = useState<Range>(fullHistory ? 'all' : 'week');
  const [customStart, setCustomStart] = useState(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
  const [customEnd, setCustomEnd] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [rows, setRows] = useState<Order[]>([]);
  const [last, setLast] = useState<QueryDocumentSnapshot | null>(null);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [failed, setFailed] = useState(false);
  const [search, setSearch] = useState('');
  const [method, setMethod] = useState<PaymentMethod | ''>('');
  const [status, setStatus] = useState<'' | 'completed' | 'voided'>('');
  // A receipt number looked up in all sales (when it's not in the loaded ones)
  const [found, setFound] = useState<Order[] | null>(null);
  const [finding, setFinding] = useState(false);
  const [viewing, setViewing] = useState<Order | null>(null);
  const [voiding, setVoiding] = useState<Order | null>(null);
  const [importProducts, setImportProducts] = useState<Pick<Product, 'id' | 'name'>[] | null>(null);
  const [openingImport, setOpeningImport] = useState(false);
  const loadId = useRef(0);

  // Starter shops that moved down keep only the dates their package shows
  useEffect(() => { if (locked(range)) setRange('week'); }, [fullHistory]); // eslint-disable-line react-hooks/exhaustive-deps

  function bounds(): { start: Date; end: Date } | null {
    const now = new Date();
    switch (range) {
      case 'today': return { start: startOfDay(now), end: endOfDay(now) };
      case 'week': return { start: startOfWeek(now), end: endOfWeek(now) };
      case 'month': return { start: startOfMonth(now), end: endOfMonth(now) };
      case 'custom': {
        const start = new Date(`${customStart}T00:00:00`);
        const end = new Date(`${customEnd}T00:00:00`);
        return isNaN(+start) || isNaN(+end) || start > end ? null : { start: startOfDay(start), end: endOfDay(end) };
      }
      default: return null;
    }
  }

  async function fetchPage(after: QueryDocumentSnapshot | null) {
    const b = bounds();
    const parts: QueryConstraint[] = [];
    if (b) parts.push(where('createdAt', '>=', b.start.toISOString()), where('createdAt', '<=', b.end.toISOString()));
    parts.push(orderBy('createdAt', 'desc'));
    if (after) parts.push(startAfter(after));
    parts.push(limit(PAGE));
    const snap = await getDocs(query(tenantCol('orders'), ...parts));
    return {
      orders: snap.docs.map(d => ({ id: d.id, ...d.data() } as Order)),
      last: snap.docs[snap.docs.length - 1] ?? null,
      more: snap.size === PAGE,
    };
  }

  async function reload() {
    const id = ++loadId.current;
    setLoading(true);
    setFailed(false);
    setFound(null);
    try {
      const page = await fetchPage(null);
      if (id !== loadId.current) return;
      setRows(page.orders);
      setLast(page.last);
      setMore(page.more);
    } catch (err) {
      console.error('[Transactions]', err);
      if (id === loadId.current) { setRows([]); setMore(false); setFailed(true); }
    } finally {
      if (id === loadId.current) setLoading(false);
    }
  }

  useEffect(() => { if (!locked(range)) reload(); }, [range, customStart, customEnd]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadMore() {
    if (!last) return;
    const id = loadId.current;
    setLoadingMore(true);
    try {
      const page = await fetchPage(last);
      if (id !== loadId.current) return;
      setRows(prev => [...prev, ...page.orders]);
      setLast(page.last);
      setMore(page.more);
    } catch {
      toast.error("Couldn't load more. Please try again.");
    } finally {
      setLoadingMore(false);
    }
  }

  const q = search.trim().toLowerCase();
  const matches = (o: Order) =>
    (!method || o.paymentMethod === method)
    && (!status || o.status === status)
    && (!q || o.orderNumber.toLowerCase().includes(q) || (o.cashierName ?? '').toLowerCase().includes(q)
      || o.items.some(i => i.productName.toLowerCase().includes(q)));
  const shown = (found ?? rows).filter(matches);
  const filtering = !!(q || method || status);
  const sales = shown.filter(o => o.status !== 'voided');
  const total = sales.reduce((s, o) => s + o.total, 0);

  // Exact receipt number in all sales (Starter: still only this week)
  async function findReceipt() {
    const number = search.trim();
    if (!number) return;
    setFinding(true);
    try {
      const snap = await getDocs(query(tenantCol('orders'), where('orderNumber', '==', number), limit(10)));
      const week = { start: startOfWeek(new Date()).toISOString(), end: endOfWeek(new Date()).toISOString() };
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as Order))
        .filter(o => fullHistory || (o.createdAt >= week.start && o.createdAt <= week.end));
      setFound(list);
      if (!list.length) toast(`No sale with receipt number ${number}${fullHistory ? '' : ' this week'}.`);
    } catch {
      toast.error("Couldn't search right now. Please try again.");
    } finally {
      setFinding(false);
    }
  }

  function pickRange(r: Range) {
    if (locked(r)) {
      toast(`Older sales: ${BUSINESS_UP.charAt(0).toLowerCase()}${BUSINESS_UP.slice(1)}`, { icon: <Lock className="w-4 h-4 text-caramel-600" aria-hidden="true" /> });
      return;
    }
    setRange(r);
  }

  async function openImport() {
    if (!canImport) {
      toast(`Import: ${BUSINESS_UP.charAt(0).toLowerCase()}${BUSINESS_UP.slice(1)}`, { icon: <Lock className="w-4 h-4 text-caramel-600" aria-hidden="true" /> });
      return;
    }
    if (!hasAccess(tenant)) { toast.error('Start your free trial or subscribe to import sales.'); return; }
    setOpeningImport(true);
    try {
      // The file's product names are matched to the shop's products (top products in Reports)
      const snap = await getDocs(tenantCol('products'));
      setImportProducts(snap.docs.map(d => ({ id: d.id, name: String(d.data().name ?? '') })));
    } catch {
      toast.error("Couldn't open the import. Please try again.");
    } finally {
      setOpeningImport(false);
    }
  }

  const salesImport: ImportSetup<SalesPlan> = {
    title: 'Import past sales',
    what: 'sales',
    fields: SALE_FIELDS,
    sample: { file: 'jpos-sales-sample.csv', rows: SALE_SAMPLE },
    // Many POS exports: one sheet of sales, another of each sale's items
    items: { label: 'Items of each sale', mainFields: SALE_MAIN_FIELDS, fields: SALE_ITEM_FIELDS },
    pickSheets: pickSalesSheets,
    plan: (table, cols, choices, items) => planSales(table, cols, {
      products: importProducts ?? [],
      cashierName: currentUser?.displayName || 'Imported',
      dayOrder: choices.dayOrder as DayOrder | undefined,
      items,
    }),
    choices: plan => (plan.ambiguousDates ? [{
      key: 'dayOrder', label: 'How are the dates written in the file?', value: plan.dayOrder,
      options: [{ value: 'mdy', label: 'Month/Day/Year' }, { value: 'dmy', label: 'Day/Month/Year' }],
    }] : []),
    summary: plan => {
      const others = Object.entries(plan.otherPayments);
      return {
        ready: plan.sales.length,
        skipped: plan.skipped,
        notes: [
          plan.first && plan.last ? `From ${format(plan.first, 'MMM d, yyyy')} to ${format(plan.last, 'MMM d, yyyy')}, ${plan.sales.reduce((s, x) => s + x.items.length, 0).toLocaleString()} items, ${formatCurrency(plan.sales.reduce((s, x) => s + x.total, 0))} in all.` : '',
          others.length ? `Saved as Cash (JPOS doesn't have these payment types): ${others.slice(0, 4).map(([p]) => p).join(', ')}.` : '',
          'Past sales count in reports and the dashboard. They don\'t change your stock.',
          'Sales already brought in from this file before are skipped.',
        ].filter(Boolean),
        preview: {
          headers: ['Date', 'Receipt', 'Items', 'Amount', 'Payment', 'Cashier'],
          rows: plan.sales.slice(0, 5).map(s => [
            formatDateTime(s.createdAt), s.orderNumber, s.items.map(i => `${i.quantity}× ${i.productName}`).join(', '),
            formatCurrency(s.total), METHODS.find(m => m.id === s.paymentMethod)?.label ?? s.paymentMethod, s.cashierName,
          ]),
        },
      };
    },
    save: async (plan, onProgress) => {
      const r = await applySales(plan, { uid: currentUser!.id, onProgress });
      if (r.added) logActivity('sale.import', '', `${r.added} sales`);
      return [
        `${r.added.toLocaleString()} ${r.added === 1 ? 'sale' : 'sales'} added.`,
        r.alreadyThere ? `${r.alreadyThere.toLocaleString()} ${r.alreadyThere === 1 ? 'was' : 'were'} already in JPOS.` : '',
      ].filter(Boolean).join(' ');
    },
  };

  const methodLabel = (m: PaymentMethod) => METHODS.find(x => x.id === m)?.label ?? m;
  const voidButton = (o: Order) => o.status === 'completed' && (
    <button
      onClick={() => canVoid
        ? setVoiding(o)
        : toast(`Void: ${BUSINESS_UP.charAt(0).toLowerCase()}${BUSINESS_UP.slice(1)}`, { icon: <Lock className="w-4 h-4 text-caramel-600" aria-hidden="true" /> })}
      className={cn('icon-btn w-8 h-8', canVoid ? 'hover:text-red-600' : 'opacity-60')}
      title={canVoid ? 'Void this sale' : 'Void: Business and Enterprise packages'}
      aria-label={`Void ${o.orderNumber}`}
    >
      {canVoid ? <Ban className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
    </button>
  );
  const receiptButton = (o: Order) => (
    <button onClick={() => setViewing(o)} className="icon-btn w-8 h-8" title="See the receipt" aria-label={`See the receipt of ${o.orderNumber}`}>
      <ReceiptText className="w-4 h-4" />
    </button>
  );
  const badges = (o: Order) => (
    <>
      {o.status === 'voided' && (
        <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700" title={o.voidReason}>VOID</span>
      )}
      {o.imported && <span className="badge-info normal-case text-[10px]">Imported</span>}
    </>
  );

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-[1400px] mx-auto animate-fade-in">
      <PageHeader
        eyebrow="Every sale"
        title="Transaction History"
        subtitle="Sales, newest first."
        actions={
          <button onClick={openImport} disabled={openingImport} title={canImport ? undefined : 'Business and Enterprise packages'}
            className={cn('btn-secondary flex-1 sm:flex-none', !canImport && 'opacity-70')}>
            {openingImport ? <Loader2 className="w-4 h-4 animate-spin" /> : canImport ? <FileSpreadsheet className="w-4 h-4" /> : <Lock className="w-4 h-4" />} Import past sales
          </button>
        }
      />

      {/* Dates, search and filters */}
      <div className="card p-3 space-y-3">
        <div className="segmented overflow-x-auto scrollbar-none">
          {RANGES.map(r => (
            <button key={r.id} onClick={() => pickRange(r.id)} title={locked(r.id) ? 'Business and Enterprise packages' : undefined}
              className={cn('segmented-item gap-1 px-2 sm:gap-2 sm:px-4', range === r.id && 'active', locked(r.id) && 'opacity-60')}>
              {locked(r.id) && <Lock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />}
              <span className="sm:hidden">{r.short}</span><span className="hidden sm:inline">{r.label}</span>
            </button>
          ))}
        </div>
        {range === 'custom' && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <label className="sr-only" htmlFor="tx-from">From</label>
            <input id="tx-from" type="date" className="input w-auto py-2" value={customStart} max={customEnd} onChange={e => setCustomStart(e.target.value)} />
            <span className="text-bark-500">to</span>
            <label className="sr-only" htmlFor="tx-to">To</label>
            <input id="tx-to" type="date" className="input w-auto py-2" value={customEnd} min={customStart} onChange={e => setCustomEnd(e.target.value)} />
          </div>
        )}
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-bark-400" aria-hidden="true" />
            <input className="input pl-11" placeholder="Search receipt number, product or cashier..." value={search}
              onChange={e => { setSearch(e.target.value); setFound(null); }}
              onKeyDown={e => { if (e.key === 'Enter' && shown.length === 0 && search.trim()) findReceipt(); }} />
          </div>
          <select className="input sm:max-w-[180px]" value={method} onChange={e => setMethod(e.target.value as PaymentMethod | '')} aria-label="Payment">
            <option value="">All payments</option>
            {METHODS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
          <select className="input sm:max-w-[180px]" value={status} onChange={e => setStatus(e.target.value as '' | 'completed' | 'voided')} aria-label="Status">
            <option value="">All sales</option>
            <option value="completed">Completed</option>
            <option value="voided">Voided</option>
          </select>
        </div>
      </div>

      {/* The list */}
      <div className="card p-4 sm:p-5">
        {loading ? (
          <div className="flex justify-center py-12" role="status" aria-label="Loading"><Loader2 className="w-7 h-7 animate-spin text-caramel-600" /></div>
        ) : failed ? (
          <div className="py-10 text-center space-y-3">
            <p className="text-sm text-espresso-800">Couldn't load the sales.</p>
            <button onClick={reload} className="btn-secondary">Try again</button>
          </div>
        ) : (
          <>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-bark-600">
                {found ? 'Found in all sales: ' : ''}{shown.length.toLocaleString()} {shown.length === 1 ? 'sale' : 'sales'}
                {sales.length > 0 && <> · <span className="font-semibold text-espresso-900">{formatCurrency(total)}</span></>}
                {shown.some(o => o.status === 'voided') && <span className="text-bark-400"> (voided not counted)</span>}
              </p>
              {found && <button onClick={() => { setFound(null); setSearch(''); }} className="btn-ghost text-sm">Back to the list</button>}
            </div>

            {shown.length === 0 ? (
              <div className="py-10 text-center space-y-3">
                <p className="text-sm text-bark-500">{filtering ? 'No sales match.' : 'No sales in these dates.'}</p>
                {q && !found && (
                  <button onClick={findReceipt} disabled={finding} className="btn-secondary">
                    {finding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />} Find receipt "{search.trim()}" in all sales
                  </button>
                )}
              </div>
            ) : (
              <>
                {/* Phones: one card per sale */}
                <ul className="space-y-3 md:hidden">
                  {shown.map(o => (
                    <li key={o.id} className={cn('rounded-3xl border border-cream-300 bg-white/70 p-4', o.status === 'voided' && 'bg-red-50/40')}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-mono text-xs text-bark-600">{o.orderNumber}</p>
                          <p className="text-xs text-bark-500">{formatDateTime(o.createdAt)} · {o.cashierName}</p>
                        </div>
                        <p className={cn('shrink-0 font-semibold text-espresso-900', o.status === 'voided' && 'text-bark-400 line-through')}>{formatCurrency(o.total)}</p>
                      </div>
                      <p className="mt-2 truncate text-sm text-espresso-800">{itemsLine(o)}</p>
                      <div className="mt-3 flex items-center gap-2">
                        <span className="badge-info uppercase text-[10px]">{methodLabel(o.paymentMethod)}</span>
                        {badges(o)}
                        <div className="ml-auto flex gap-1">{receiptButton(o)}{voidButton(o)}</div>
                      </div>
                    </li>
                  ))}
                </ul>

                {/* Wider screens: a table */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full min-w-[760px]">
                    <thead><tr>
                      <th className="table-header">Receipt</th>
                      <th className="table-header">Date</th>
                      <th className="table-header">Items</th>
                      <th className="table-header">Cashier</th>
                      <th className="table-header">Payment</th>
                      <th className="table-header text-right">Total</th>
                      <th className="table-header"><span className="sr-only">Actions</span></th>
                    </tr></thead>
                    <tbody>
                      {shown.map(o => (
                        <tr key={o.id} className={cn('table-row', o.status === 'voided' && 'bg-red-50/40')}>
                          <td className="table-cell text-xs text-bark-600">
                            <span className="block font-mono">{o.orderNumber}</span>
                            <span className="mt-1 flex gap-1">{badges(o)}</span>
                          </td>
                          <td className="table-cell whitespace-nowrap text-xs text-bark-500">{formatDateTime(o.createdAt)}</td>
                          <td className="table-cell max-w-[320px] truncate text-sm" title={itemsLine(o)}>{itemsLine(o)}</td>
                          <td className="table-cell text-sm">{o.cashierName}</td>
                          <td className="table-cell"><span className="badge-info uppercase text-[10px]">{methodLabel(o.paymentMethod)}</span></td>
                          <td className={cn('table-cell text-right font-semibold', o.status === 'voided' && 'text-bark-400 line-through')}>{formatCurrency(o.total)}</td>
                          <td className="table-cell"><div className="flex justify-end gap-1">{receiptButton(o)}{voidButton(o)}</div></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {!found && more && (
              <div className="mt-4 flex flex-col items-center gap-1">
                <button onClick={loadMore} disabled={loadingMore} className="btn-secondary">
                  {loadingMore && <Loader2 className="w-4 h-4 animate-spin" />} Show more
                </button>
                {filtering && <p className="text-xs text-bark-500">Search and filters look at the sales shown so far.</p>}
              </div>
            )}
          </>
        )}
      </div>

      {viewing && <ReceiptModal order={viewing} onClose={() => setViewing(null)} />}
      {voiding && (
        <VoidOrderModal
          order={voiding}
          onClose={() => setVoiding(null)}
          onVoided={change => {
            const apply = (list: Order[]) => list.map(o => (o.id === voiding.id ? { ...o, ...change } : o));
            setRows(apply);
            setFound(f => (f ? apply(f) : f));
          }}
        />
      )}
      {importProducts && (
        <ImportModal setup={salesImport} onClose={() => setImportProducts(null)} onDone={reload} />
      )}
    </div>
  );
}
