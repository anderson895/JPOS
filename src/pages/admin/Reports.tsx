import { useState, useEffect } from 'react';
import { getDocs, query, where, orderBy } from 'firebase/firestore';
import { tenantCol } from '@/lib/tenant';
import { formatCurrency, formatDateTime } from '@/lib/utils';
import type { Order } from '@/types';
import {
  format, startOfDay, endOfDay,
  startOfWeek, endOfWeek,
  startOfMonth, endOfMonth, subDays,
  parseISO, isValid
} from 'date-fns';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts';
import { TrendingUp, ShoppingBag, CreditCard, Download, Calendar, Loader2, Lock } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import toast from 'react-hot-toast';
import PageHeader from '@/components/shared/PageHeader';
import StatCard from '@/components/shared/StatCard';
import { useChartTheme } from '@/components/shared/chartTheme';
import { themeRgb } from '@/components/shared/theme';
import { paymentBreakdown, paymentRefLabel } from '@/lib/reports';

type Range = 'today' | 'week' | 'month' | 'custom';

// PDF colours, read from the active color theme when the report is generated
function pdfPalette() {
  return {
    ESPRESSO:  themeRgb('espresso-800'),
    AMBER:     themeRgb('caramel-600'),
    CREAM:     themeRgb('cream-100'),
    LIGHT_ROW: themeRgb('cream-200'),
    WHITE:     [255, 255, 255] as [number, number, number],
  };
}

// jsPDF's built-in fonts have no \u20b1 glyph (it prints as "\u00b1"), so spell the currency out.
function peso(v: number) { return `PHP ${v.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }

function toIso(v: any): string {
  return typeof v === 'string' ? v : v?.toDate?.().toISOString() ?? '';
}

export default function AdminReports() {
  const { CHART, CHART_SERIES: COLORS, TOOLTIP_STYLE, surface } = useChartTheme();
  const [range, setRange]           = useState<Range>('week');
  // Package features: month/custom ranges and the PDF are Business and up
  const { tenant } = useAuth();
  const fullReports = !!tenant?.entitlements?.fullReports;
  const pdfExport = !!tenant?.entitlements?.pdfExport;
  const locked = (r: Range) => !fullReports && (r === 'month' || r === 'custom');
  const [orders, setOrders]         = useState<Order[]>([]);
  const [loading, setLoading]       = useState(true);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [customStart, setCustomStart] = useState(format(subDays(new Date(), 7), 'yyyy-MM-dd'));
  const [customEnd,   setCustomEnd]   = useState(format(new Date(), 'yyyy-MM-dd'));

  useEffect(() => {
    const dateRange = getDateRange();
    if (!dateRange) { setOrders([]); setLoading(false); return; }

    // Ignore a slow response for a range the user has already switched away from.
    let cancelled = false;
    setLoading(true);
    // Fetch only the selected period. Reading the whole collection on every
    // visit gets slower and eats the daily Firestore read quota as orders pile up.
    getDocs(query(
      tenantCol('orders'),
      where('createdAt', '>=', dateRange.start.toISOString()),
      where('createdAt', '<=', dateRange.end.toISOString()),
      orderBy('createdAt', 'desc'),
    ))
      .then(snap => {
        if (!cancelled) setOrders(snap.docs.map(d => ({ id: d.id, ...d.data() } as Order)));
      })
      .catch(err => {
        console.error('[Reports]', err);
        if (!cancelled) {
          setOrders([]);
          // An empty report would read as "no sales"; say it failed instead
          toast.error('Failed to load report');
        }
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [range, customStart, customEnd]);

  function getDateRange() {
    const now = new Date();
    switch (range) {
      case 'today':  return { start: startOfDay(now),              end: endOfDay(now) };
      case 'week':   return { start: startOfWeek(now),             end: endOfWeek(now) };
      case 'month':  return { start: startOfMonth(now),            end: endOfMonth(now) };
      case 'custom': {
        // parseISO reads 'yyyy-MM-dd' as local midnight; new Date() would read it as UTC.
        const start = parseISO(customStart), end = parseISO(customEnd);
        if (!isValid(start) || !isValid(end)) return null; // a date field was cleared
        return { start: startOfDay(start), end: endOfDay(end) };
      }
    }
  }

  // ── Derived stats ────────────────────────────────────────────────────────
  const completed      = orders.filter(o => o.status === 'completed');
  const totalSales     = completed.reduce((s, o) => s + o.total, 0);
  const totalOrders    = completed.length;
  const avgOrder       = totalOrders ? totalSales / totalOrders : 0;

  const dailyMap: Record<string, { sales: number; orders: number }> = {};
  completed.forEach(o => {
    // Key by the full date so a range crossing New Year still sorts in order
    const day = format(new Date(toIso(o.createdAt)), 'yyyy-MM-dd');
    if (!dailyMap[day]) dailyMap[day] = { sales: 0, orders: 0 };
    dailyMap[day].sales  += o.total;
    dailyMap[day].orders += 1;
  });
  const dailyData = Object.entries(dailyMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, d]) => ({ date: format(parseISO(day), 'MM/dd'), ...d }));

  // Per-method totals for reconciliation (completed orders; every method, zeros included)
  const breakdown = paymentBreakdown(orders);
  const paymentData = breakdown.filter(m => m.total > 0).map(m => ({ name: m.label, value: m.total }));

  const productMap: Record<string, { name: string; qty: number; revenue: number }> = {};
  completed.forEach(o => {
    o.items.forEach(item => {
      if (!productMap[item.productId]) productMap[item.productId] = { name: item.productName, qty: 0, revenue: 0 };
      productMap[item.productId].qty     += item.quantity;
      productMap[item.productId].revenue += item.subtotal;
    });
  });
  const topProducts = Object.values(productMap).sort((a, b) => b.revenue - a.revenue).slice(0, 10);
  // Share of item sales. Item revenue is before discounts, so dividing by the
  // discounted total sales could go past 100% (or divide by zero).
  const itemRevenue = Object.values(productMap).reduce((s, p) => s + p.revenue, 0);
  const sharePct = (revenue: number) => (itemRevenue ? (revenue / itemRevenue) * 100 : 0);

  const rangeLabel = range === 'custom'
    ? `${customStart} to ${customEnd}`
    : { today: 'Today', week: 'This Week', month: 'This Month' }[range]!;

  // ── PDF generation (client-side, no server needed) ───────────────────────
  async function downloadPDF() {
    setPdfLoading(true);
    try {
      // The PDF libraries load only when a report is downloaded (keeps ~400 kB off the Reports page)
      const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
      const { ESPRESSO, AMBER, CREAM, LIGHT_ROW, WHITE } = pdfPalette();
      const doc  = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const W    = doc.internal.pageSize.getWidth();
      const H    = doc.internal.pageSize.getHeight();
      const ML   = 14, MR = 14;
      const CW   = W - ML - MR;
      const now  = new Date();
      // The shop's own name on its report (every shop has its own)
      const shopName = (tenant?.name || 'JPOS').slice(0, 60);

      // ── Helper: add page footer ──────────────────────────────────────────
      const addFooter = () => {
        const pages = (doc as any).internal.getNumberOfPages();
        for (let i = 1; i <= pages; i++) {
          doc.setPage(i);
          doc.setFontSize(7);
          doc.setTextColor(160, 130, 110);
          doc.text(
            `${shopName}  ·  Confidential  ·  ${format(now, 'MMMM d, yyyy  h:mm a')}`,
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
      doc.text(shopName, ML, 12);
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
          // Amber underline on header — drawn after the last header cell so it
          // isn't painted over, and across the full table width
          if (data.section === 'head' && data.column.index === data.table.columns.length - 1) {
            const { y: cy, height } = data.cell;
            doc.setDrawColor(...AMBER);
            doc.setLineWidth(0.5);
            doc.line(ML, cy + height, W - MR, cy + height);
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
        head: [['Method', 'Orders', 'Revenue', 'Share']],
        body: breakdown.map(m => [
          m.label,
          String(m.count),
          peso(m.total),
          `${((m.total / (totalSales || 1)) * 100).toFixed(1)}%`,
        ]),
        styles:     { fontSize: 8, cellPadding: 3 },
        headStyles: { fillColor: ESPRESSO, textColor: WHITE, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: LIGHT_ROW },
        columnStyles: {
          1: { halign: 'right', cellWidth: 18 },
          2: { halign: 'right' },
          3: { halign: 'right', cellWidth: 25 },
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
          `${sharePct(p.revenue).toFixed(1)}%`,
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
        head: [['Order #', 'Date & Time', 'Cashier', 'Qty', 'Total', 'Payment', 'Ref']],
        body: orders.slice(0, 300).map(o => [
          o.orderNumber,
          // Local time — the stored ISO string is UTC (8 hours behind in PH)
          format(new Date(toIso(o.createdAt)), 'yyyy-MM-dd HH:mm'),
          o.cashierName,
          String(o.items.reduce((s, i) => s + i.quantity, 0)),
          peso(o.total),
          o.paymentMethod.toUpperCase(),
          paymentRefLabel(o, '-'),
        ]),
        styles:     { fontSize: 7.5, cellPadding: 2.5, overflow: 'ellipsize' },
        headStyles: { fillColor: ESPRESSO, textColor: WHITE, fontStyle: 'bold', fontSize: 8 },
        alternateRowStyles: { fillColor: LIGHT_ROW },
        // Fixed widths sum to 151 mm, so Cashier gets about 31 mm
        columnStyles: {
          0: { cellWidth: 40, fontStyle: 'bold' },
          1: { cellWidth: 27 },
          3: { cellWidth: 12, halign: 'center' },
          4: { cellWidth: 26, halign: 'right' },
          5: { cellWidth: 18, halign: 'center' },
          6: { cellWidth: 28 },
        },
      });

      addFooter();

      doc.save(`sales-report-${format(now, 'yyyy-MM-dd')}.pdf`);
    } catch (err) {
      console.error('[PDF]', err);
      alert('PDF generation failed. Check your connection and try again.');
    } finally {
      setPdfLoading(false);
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 animate-fade-in max-w-[1400px] mx-auto">
      <PageHeader
        eyebrow="Insights"
        title="Reports"
        subtitle="Sales analytics & insights"
        actions={
          <button
            onClick={() => pdfExport ? downloadPDF() : toast('PDF reports are included in the Business and Enterprise packages.', { icon: <Lock className="w-4 h-4 text-caramel-600" aria-hidden="true" /> })}
            disabled={pdfLoading || loading}
            className="btn-primary"
            title={pdfExport ? undefined : 'Business and Enterprise packages'}
          >
            {pdfLoading
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating…</>
              : <><Download className="w-4 h-4" /> Download PDF Report</>}
          </button>
        }
      />

      {/* Date Range Selector */}
      <div className="card p-3 flex flex-wrap items-center gap-3">
        <span className="hidden sm:flex w-10 h-10 rounded-full bg-cream-200 text-caramel-700 items-center justify-center">
          <Calendar className="w-4 h-4" />
        </span>
        <div className="segmented w-full sm:w-auto overflow-x-auto scrollbar-none">
          {(['today', 'week', 'month', 'custom'] as Range[]).map(r => (
            <button key={r}
              onClick={() => locked(r) ? toast('Monthly and custom reports are included in the Business and Enterprise packages.', { icon: <Lock className="w-4 h-4 text-caramel-600" aria-hidden="true" /> }) : setRange(r)}
              className={`segmented-item capitalize ${range === r ? 'active' : ''} ${locked(r) ? 'opacity-60' : ''}`}>
              {locked(r) && <Lock className="w-3 h-3" aria-hidden="true" />}{r}
            </button>
          ))}
        </div>
        {range === 'custom' && (
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <input type="date" className="input py-2 text-sm" value={customStart} onChange={e => setCustomStart(e.target.value)} />
            <span className="text-caramel-500">→</span>
            <input type="date" className="input py-2 text-sm" value={customEnd} onChange={e => setCustomEnd(e.target.value)} />
          </div>
        )}
        <span className="sm:ml-auto badge-info">{rangeLabel}</span>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: 'Total Revenue',  value: formatCurrency(totalSales), icon: TrendingUp,  tone: 'espresso' as const },
          { label: 'Total Orders',   value: totalOrders.toString(),     icon: ShoppingBag, tone: 'caramel' as const },
          { label: 'Average Order',  value: formatCurrency(avgOrder),   icon: CreditCard,  tone: 'cream' as const },
        ].map(s => (
          <StatCard key={s.label} icon={s.icon} label={s.label} value={s.value} tone={s.tone} loading={loading} />
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 card p-6">
          <h2 className="font-display text-xl text-espresso-900 mb-6">Sales Over Time</h2>
          {dailyData.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-bark-400 text-sm">No data available</div>
          ) : (
            <ResponsiveContainer width="100%" height={320}>
              <AreaChart data={dailyData}>
                <defs>
                  <linearGradient id="reportGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={CHART.accent} stopOpacity={0.35} />
                    <stop offset="95%" stopColor={CHART.accent} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 4" stroke={CHART.grid} vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: CHART.tick }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: CHART.tick }} tickFormatter={v => `₱${v}`} axisLine={false} tickLine={false} width={60} />
                <Tooltip formatter={(v: number) => [formatCurrency(v)]} contentStyle={TOOLTIP_STYLE} />
                <Area type="monotone" dataKey="sales" stroke={CHART.line} strokeWidth={2.5} fill="url(#reportGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
        <div className="card p-6">
          <h2 className="font-display text-xl text-espresso-900 mb-4">Payment Methods</h2>
          {paymentData.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-bark-400 text-sm">No data</div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={paymentData} dataKey="value" nameKey="name" cx="50%" cy="50%"
                    innerRadius={52} outerRadius={84} paddingAngle={2} stroke={surface} strokeWidth={2}>
                    {paymentData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={TOOLTIP_STYLE} />
                </PieChart>
              </ResponsiveContainer>
              <ul className="mt-3 space-y-2">
                {paymentData.map((p, i) => (
                  <li key={p.name} className="flex items-center gap-2 text-sm">
                    <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                    <span className="flex-1 text-espresso-800">{p.name}</span>
                    <span className="text-bark-500 text-xs">{((p.value / (totalSales || 1)) * 100).toFixed(0)}%</span>
                    <span className="font-semibold text-espresso-800">{formatCurrency(p.value)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}

          {/* Reconciliation: every method, zeros included */}
          <div className="mt-5 pt-4 border-t border-cream-300/70">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wider text-bark-500">
                  <th className="text-left font-semibold pb-2">Method</th>
                  <th className="text-right font-semibold pb-2">Orders</th>
                  <th className="text-right font-semibold pb-2">Total</th>
                </tr>
              </thead>
              <tbody>
                {breakdown.map(m => (
                  <tr key={m.method} className="border-t border-cream-300/50">
                    <td className="py-1.5 text-espresso-800">{m.label}</td>
                    <td className="py-1.5 text-right font-mono text-bark-600">{m.count}</td>
                    <td className="py-1.5 text-right font-semibold text-espresso-800">{formatCurrency(m.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-[11px] text-bark-400">Match these with the cash drawer and the GCash/Maya statements.</p>
          </div>
        </div>
      </div>

      {/* Top Products */}
      <div className="card p-6">
        <h2 className="font-display text-xl text-espresso-900 mb-4">Top Products</h2>
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
                  <td className="table-cell">
                    <span className={`w-7 h-7 rounded-full inline-flex items-center justify-center text-xs font-semibold ${i < 3 ? 'bg-espresso-800 text-caramel-200' : 'bg-cream-200 text-bark-500'}`}>{i + 1}</span>
                  </td>
                  <td className="table-cell font-semibold text-espresso-800">{p.name}</td>
                  <td className="table-cell font-mono">{p.qty}</td>
                  <td className="table-cell font-semibold text-espresso-800">{formatCurrency(p.revenue)}</td>
                  <td className="table-cell w-44">
                    <div className="flex items-center gap-2">
                      <div className="meter flex-1"><span style={{ width: `${sharePct(p.revenue)}%` }} /></div>
                      <span className="text-xs text-bark-500 w-10 text-right">{sharePct(p.revenue).toFixed(1)}%</span>
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
        <h2 className="font-display text-xl text-espresso-900 mb-4">Order Details</h2>
        {/* No orders: a plain message (inside the wide table it was cut off on phones) */}
        {orders.length === 0 ? (
          <p className="py-8 text-center text-sm text-bark-400">No orders in selected period</p>
        ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px]">
            <thead><tr>
              <th className="table-header">Order #</th>
              <th className="table-header">Date</th>
              <th className="table-header">Cashier</th>
              <th className="table-header">Items</th>
              <th className="table-header">Total</th>
              <th className="table-header">Payment</th>
              <th className="table-header">Ref</th>
            </tr></thead>
            <tbody>
              {orders.slice(0, 50).map(o => (
                <tr key={o.id} className="table-row">
                  <td className="table-cell font-mono text-xs text-bark-600">{o.orderNumber}</td>
                  <td className="table-cell text-xs text-bark-500">{formatDateTime(o.createdAt)}</td>
                  <td className="table-cell">{o.cashierName}</td>
                  <td className="table-cell">{o.items.reduce((s, i) => s + i.quantity, 0)} items</td>
                  <td className="table-cell font-semibold">{formatCurrency(o.total)}</td>
                  <td className="table-cell"><span className="badge-info uppercase text-[10px]">{o.paymentMethod}</span></td>
                  <td className="table-cell font-mono text-xs">{paymentRefLabel(o)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )}
      </div>
    </div>
  );
}
