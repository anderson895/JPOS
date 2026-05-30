import { useState, useEffect } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { formatCurrency, formatDateTime } from '@/lib/utils';
import type { Order } from '@/types';
import {
  format, startOfDay, endOfDay,
  startOfWeek, endOfWeek,
  startOfMonth, endOfMonth, subDays
} from 'date-fns';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts';
import { TrendingUp, ShoppingBag, CreditCard, Download, Calendar, Loader2 } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

type Range = 'today' | 'week' | 'month' | 'custom';
const COLORS = ['#c46820', '#e09d4d', '#f5c07a', '#a73c12', '#6a3714', '#3c1209'];

// Brand colours
const ESPRESSO  = [74,  41,  18]  as [number, number, number];
const AMBER     = [196, 104, 32]  as [number, number, number];
const CREAM     = [253, 246, 238] as [number, number, number];
const LIGHT_ROW = [245, 238, 228] as [number, number, number];
const WHITE     = [255, 255, 255] as [number, number, number];

function peso(v: number) { return `\u20b1${v.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`; }

function toIso(v: any): string {
  return typeof v === 'string' ? v : v?.toDate?.().toISOString() ?? '';
}

export default function AdminReports() {
  const [range, setRange]           = useState<Range>('week');
  const [orders, setOrders]         = useState<Order[]>([]);
  const [loading, setLoading]       = useState(true);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [customStart, setCustomStart] = useState(format(subDays(new Date(), 7), 'yyyy-MM-dd'));
  const [customEnd,   setCustomEnd]   = useState(format(new Date(), 'yyyy-MM-dd'));

  useEffect(() => { fetchOrders(); }, [range, customStart, customEnd]);

  function getDateRange() {
    const now = new Date();
    switch (range) {
      case 'today':  return { start: startOfDay(now),              end: endOfDay(now) };
      case 'week':   return { start: startOfWeek(now),             end: endOfWeek(now) };
      case 'month':  return { start: startOfMonth(now),            end: endOfMonth(now) };
      case 'custom': return {
        start: startOfDay(new Date(customStart)),
        end:   endOfDay(new Date(customEnd)),
      };
    }
  }

  async function fetchOrders() {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, 'orders'));
      const all  = snap.docs.map(d => ({ id: d.id, ...d.data() } as Order));
      const { start, end } = getDateRange();
      const s = start.toISOString(), e = end.toISOString();
      const filtered = all
        .filter(o => { const iso = toIso(o.createdAt); return iso >= s && iso <= e; })
        .sort((a, b) => (toIso(b.createdAt) > toIso(a.createdAt) ? 1 : -1));
      setOrders(filtered);
    } catch (err) {
      console.error('[Reports]', err);
    } finally {
      setLoading(false);
    }
  }

  // ── Derived stats ────────────────────────────────────────────────────────
  const completed      = orders.filter(o => o.status === 'completed');
  const totalSales     = completed.reduce((s, o) => s + o.total, 0);
  const totalOrders    = completed.length;
  const avgOrder       = totalOrders ? totalSales / totalOrders : 0;

  const dailyMap: Record<string, { sales: number; orders: number }> = {};
  completed.forEach(o => {
    const day = format(new Date(toIso(o.createdAt)), 'MM/dd');
    if (!dailyMap[day]) dailyMap[day] = { sales: 0, orders: 0 };
    dailyMap[day].sales  += o.total;
    dailyMap[day].orders += 1;
  });
  const dailyData = Object.entries(dailyMap)
    .map(([date, d]) => ({ date, ...d }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const paymentMap: Record<string, number> = {};
  completed.forEach(o => { paymentMap[o.paymentMethod] = (paymentMap[o.paymentMethod] || 0) + o.total; });
  const paymentData = Object.entries(paymentMap).map(([name, value]) => ({ name: name.toUpperCase(), value }));

  const productMap: Record<string, { name: string; qty: number; revenue: number }> = {};
  completed.forEach(o => {
    o.items.forEach(item => {
      if (!productMap[item.productId]) productMap[item.productId] = { name: item.productName, qty: 0, revenue: 0 };
      productMap[item.productId].qty     += item.quantity;
      productMap[item.productId].revenue += item.subtotal;
    });
  });
  const topProducts = Object.values(productMap).sort((a, b) => b.revenue - a.revenue).slice(0, 10);

  const rangeLabel = range === 'custom'
    ? `${customStart} to ${customEnd}`
    : { today: 'Today', week: 'This Week', month: 'This Month' }[range]!;

  // ── PDF generation (client-side, no server needed) ───────────────────────
  function downloadPDF() {
    setPdfLoading(true);
    try {
      const doc  = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const W    = doc.internal.pageSize.getWidth();
      const H    = doc.internal.pageSize.getHeight();
      const ML   = 14, MR = 14;
      const CW   = W - ML - MR;
      const now  = new Date();

      // ── Helper: add page footer ──────────────────────────────────────────
      const addFooter = () => {
        const pages = (doc as any).internal.getNumberOfPages();
        for (let i = 1; i <= pages; i++) {
          doc.setPage(i);
          doc.setFontSize(7);
          doc.setTextColor(160, 130, 110);
          doc.text(
            `JPOS Coffee Shop  ·  Confidential  ·  ${format(now, 'MMMM d, yyyy  h:mm a')}`,
            W / 2, H - 6, { align: 'center' }
          );
          doc.text(`Page ${i} of ${pages}`, W - MR, H - 6, { align: 'right' });
        }
      };

      // ── PAGE 1 ───────────────────────────────────────────────────────────

      // Header band
      doc.setFillColor(...ESPRESSO);
      doc.rect(0, 0, W, 28, 'F');
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...WHITE);
      doc.text('JPOS Coffee Shop', ML, 12);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text('Sales Report', ML, 19);

      doc.setFontSize(9);
      doc.setTextColor(253, 220, 170);
      doc.text(rangeLabel, W - MR, 12, { align: 'right' });
      doc.setFontSize(7);
      doc.setTextColor(210, 190, 170);
      doc.text(`Generated: ${format(now, 'MMMM d, yyyy  h:mm a')}`, W - MR, 19, { align: 'right' });

      // Amber rule
      doc.setDrawColor(...AMBER);
      doc.setLineWidth(0.6);
      doc.line(ML, 30, W - MR, 30);

      // ── KPI cards (4-up) ─────────────────────────────────────────────────
      let y = 34;
      const kpis = [
        { label: 'TOTAL REVENUE',    value: peso(totalSales) },
        { label: 'COMPLETED ORDERS', value: String(totalOrders) },
        { label: 'AVERAGE ORDER',    value: peso(avgOrder) },
      ];
      const cardW = CW / 3 - 2;
      kpis.forEach((k, i) => {
        const x = ML + i * (cardW + 3);
        doc.setFillColor(...CREAM);
        doc.roundedRect(x, y, cardW, 20, 2, 2, 'F');
        doc.setDrawColor(220, 195, 170);
        doc.setLineWidth(0.3);
        doc.roundedRect(x, y, cardW, 20, 2, 2, 'S');
        doc.setFontSize(6.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(120, 80, 50);
        doc.text(k.label, x + cardW / 2, y + 6, { align: 'center' });
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...ESPRESSO);
        doc.text(k.value, x + cardW / 2, y + 15, { align: 'center' });
      });

      y += 26;

      // ── Daily breakdown table ────────────────────────────────────────────
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...ESPRESSO);
      doc.text('Daily Sales Breakdown', ML, y);
      y += 4;

      autoTable(doc, {
        startY: y,
        margin: { left: ML, right: MR },
        head: [['Date', 'Orders', 'Revenue']],
        body: dailyData.map(d => [d.date, d.orders.toString(), peso(d.sales)]),
        foot: [['TOTAL', String(totalOrders), peso(totalSales)]],
        styles:     { fontSize: 8, cellPadding: 3 },
        headStyles: { fillColor: ESPRESSO, textColor: WHITE, fontStyle: 'bold', lineWidth: 0 },
        footStyles: { fillColor: ESPRESSO, textColor: [253,220,170], fontStyle: 'bold' },
        alternateRowStyles: { fillColor: LIGHT_ROW },
        columnStyles: {
          0: { cellWidth: 30 },
          1: { cellWidth: 30, halign: 'right' },
          2: { halign: 'right' },
        },
        didDrawCell: (data) => {
          if (data.section === 'head' && data.column.index === 0) {
            // Amber underline on header
            const { x, y: cy, width, height } = data.cell;
            doc.setDrawColor(...AMBER);
            doc.setLineWidth(0.5);
            doc.line(x, cy + height, x + width * 3, cy + height); // spans all cols
          }
        },
      });

      y = (doc as any).lastAutoTable.finalY + 8;

      // ── Payment methods table ────────────────────────────────────────────
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...ESPRESSO);
      doc.text('Payment Method Breakdown', ML, y);
      y += 4;

      autoTable(doc, {
        startY: y,
        margin: { left: ML, right: MR },
        head: [['Method', 'Revenue', 'Share']],
        body: paymentData.map(p => [
          p.name,
          peso(p.value),
          `${((p.value / (totalSales || 1)) * 100).toFixed(1)}%`,
        ]),
        styles:     { fontSize: 8, cellPadding: 3 },
        headStyles: { fillColor: ESPRESSO, textColor: WHITE, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: LIGHT_ROW },
        columnStyles: {
          1: { halign: 'right' },
          2: { halign: 'right', cellWidth: 25 },
        },
      });

      y = (doc as any).lastAutoTable.finalY + 8;

      // ── Top products table ───────────────────────────────────────────────
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...ESPRESSO);
      doc.text('Top Products by Revenue', ML, y);
      y += 4;

      autoTable(doc, {
        startY: y,
        margin: { left: ML, right: MR },
        head: [['#', 'Product', 'Qty Sold', 'Revenue', 'Share']],
        body: topProducts.map((p, i) => [
          String(i + 1),
          p.name,
          String(p.qty),
          peso(p.revenue),
          `${((p.revenue / (totalSales || 1)) * 100).toFixed(1)}%`,
        ]),
        styles:     { fontSize: 8, cellPadding: 3 },
        headStyles: { fillColor: ESPRESSO, textColor: WHITE, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: LIGHT_ROW },
        columnStyles: {
          0: { cellWidth: 8,  halign: 'center' },
          2: { cellWidth: 22, halign: 'right' },
          3: { cellWidth: 32, halign: 'right' },
          4: { cellWidth: 20, halign: 'right' },
        },
      });

      // ── PAGE 2 — Order Details ───────────────────────────────────────────
      doc.addPage();

      // Page 2 header band
      doc.setFillColor(...ESPRESSO);
      doc.rect(0, 0, W, 18, 'F');
      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...WHITE);
      doc.text('Order Details', ML, 12);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(210, 190, 170);
      doc.text(rangeLabel, W - MR, 12, { align: 'right' });

      doc.setDrawColor(...AMBER);
      doc.setLineWidth(0.6);
      doc.line(ML, 20, W - MR, 20);

      autoTable(doc, {
        startY: 24,
        margin: { left: ML, right: MR },
        head: [['Order #', 'Date & Time', 'Cashier', 'Items', 'Total', 'Payment']],
        body: orders.slice(0, 300).map(o => [
          o.orderNumber,
          toIso(o.createdAt).slice(0, 16).replace('T', ' '),
          o.cashierName,
          String(o.items.reduce((s, i) => s + i.quantity, 0)),
          peso(o.total),
          o.paymentMethod.toUpperCase(),
        ]),
        styles:     { fontSize: 7.5, cellPadding: 2.5, overflow: 'ellipsize' },
        headStyles: { fillColor: ESPRESSO, textColor: WHITE, fontStyle: 'bold', fontSize: 8 },
        alternateRowStyles: { fillColor: LIGHT_ROW },
        columnStyles: {
          0: { cellWidth: 22, fontStyle: 'bold' },
          1: { cellWidth: 32 },
          2: { cellWidth: 30 },
          3: { cellWidth: 12, halign: 'center' },
          4: { cellWidth: 26, halign: 'right' },
          5: { cellWidth: 20, halign: 'center' },
          6: { cellWidth: 22, halign: 'center' },
        },
      });

      addFooter();

      doc.save(`sales-report-${format(now, 'yyyy-MM-dd')}.pdf`);
    } catch (err) {
      console.error('[PDF]', err);
      alert('PDF generation failed. Make sure jspdf and jspdf-autotable are installed.');
    } finally {
      setPdfLoading(false);
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 animate-fade-in">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl text-espresso-900">Reports</h1>
          <p className="text-bark-500 text-sm mt-0.5">Sales analytics & insights</p>
        </div>
        <button
          onClick={downloadPDF}
          disabled={pdfLoading || loading}
          className="btn-primary flex items-center justify-center gap-2 disabled:opacity-60"
        >
          {pdfLoading
            ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating…</>
            : <><Download className="w-4 h-4" /> Download PDF Report</>}
        </button>
      </div>

      {/* Date Range Selector */}
      <div className="card p-4 flex flex-wrap items-center gap-3">
        <Calendar className="w-4 h-4 text-bark-500" />
        <div className="flex gap-1 bg-cream-100 p-1 rounded-xl">
          {(['today', 'week', 'month', 'custom'] as Range[]).map(r => (
            <button key={r} onClick={() => setRange(r)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium capitalize transition-all ${range === r ? 'bg-white text-espresso-800 shadow-sm' : 'text-bark-500 hover:text-bark-700'}`}>
              {r}
            </button>
          ))}
        </div>
        {range === 'custom' && (
          <div className="flex items-center gap-2">
            <input type="date" className="input py-1.5 text-sm" value={customStart} onChange={e => setCustomStart(e.target.value)} />
            <span className="text-bark-400">→</span>
            <input type="date" className="input py-1.5 text-sm" value={customEnd} onChange={e => setCustomEnd(e.target.value)} />
          </div>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: 'Total Revenue',  value: formatCurrency(totalSales), icon: TrendingUp, color: 'bg-espresso-600' },
          { label: 'Total Orders',   value: totalOrders.toString(),     icon: ShoppingBag, color: 'bg-amber-500' },
          { label: 'Average Order',  value: formatCurrency(avgOrder),   icon: CreditCard,  color: 'bg-bark-600' },
        ].map(s => (
          <div key={s.label} className="card p-5">
            <div className={`${s.color} w-10 h-10 rounded-xl flex items-center justify-center mb-3`}>
              <s.icon className="w-5 h-5 text-white" />
            </div>
            <p className="text-2xl font-display font-semibold text-espresso-900">{loading ? '—' : s.value}</p>
            <p className="text-sm text-bark-500 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 card p-6">
          <h2 className="font-display text-lg text-espresso-800 mb-6">Sales Over Time</h2>
          {dailyData.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-bark-400 text-sm">No data available</div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={dailyData}>
                <defs>
                  <linearGradient id="reportGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#c46820" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#c46820" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3d9be" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#8f5e4b' }} />
                <YAxis tick={{ fontSize: 11, fill: '#8f5e4b' }} tickFormatter={v => `₱${v}`} />
                <Tooltip formatter={(v: number) => [formatCurrency(v)]} contentStyle={{ borderRadius: 12, border: '1px solid #f3d9be' }} />
                <Area type="monotone" dataKey="sales" stroke="#c46820" strokeWidth={2.5} fill="url(#reportGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
        <div className="card p-6">
          <h2 className="font-display text-lg text-espresso-800 mb-6">Payment Methods</h2>
          {paymentData.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-bark-400 text-sm">No data</div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={paymentData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                  {paymentData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ borderRadius: 12, border: '1px solid #f3d9be' }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Top Products */}
      <div className="card p-6">
        <h2 className="font-display text-lg text-espresso-800 mb-4">Top Products</h2>
        {topProducts.length === 0 ? (
          <p className="text-center py-8 text-bark-400 text-sm">No product data available</p>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full min-w-[480px]">
            <thead><tr>
              <th className="table-header">#</th>
              <th className="table-header">Product</th>
              <th className="table-header">Qty Sold</th>
              <th className="table-header">Revenue</th>
              <th className="table-header">Share</th>
            </tr></thead>
            <tbody>
              {topProducts.map((p, i) => (
                <tr key={i} className="table-row">
                  <td className="table-cell text-bark-400">{i + 1}</td>
                  <td className="table-cell font-medium text-espresso-800">{p.name}</td>
                  <td className="table-cell font-mono">{p.qty}</td>
                  <td className="table-cell font-semibold text-espresso-700">{formatCurrency(p.revenue)}</td>
                  <td className="table-cell w-40">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 bg-cream-200 rounded-full">
                        <div className="h-2 bg-espresso-500 rounded-full" style={{ width: `${(p.revenue / totalSales) * 100}%` }} />
                      </div>
                      <span className="text-xs text-bark-400">{((p.revenue / totalSales) * 100).toFixed(1)}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>

      {/* Orders Table */}
      <div className="card p-6">
        <h2 className="font-display text-lg text-espresso-800 mb-4">Order Details</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead><tr>
              <th className="table-header">Order #</th>
              <th className="table-header">Date</th>
              <th className="table-header">Cashier</th>
              <th className="table-header">Items</th>
              <th className="table-header">Total</th>
              <th className="table-header">Payment</th>
            </tr></thead>
            <tbody>
              {orders.slice(0, 50).map(o => (
                <tr key={o.id} className="table-row">
                  <td className="table-cell font-mono text-xs text-bark-600">{o.orderNumber}</td>
                  <td className="table-cell text-xs text-bark-500">{formatDateTime(o.createdAt)}</td>
                  <td className="table-cell">{o.cashierName}</td>
                  <td className="table-cell">{o.items.reduce((s, i) => s + i.quantity, 0)} items</td>
                  <td className="table-cell font-semibold">{formatCurrency(o.total)}</td>
                  <td className="table-cell uppercase text-xs">{o.paymentMethod}</td>
                </tr>
              ))}
              {orders.length === 0 && (
                <tr><td colSpan={6} className="text-center py-8 text-bark-400 text-sm">No orders in selected period</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}